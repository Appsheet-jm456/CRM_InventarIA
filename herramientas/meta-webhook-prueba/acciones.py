"""
Acciones «Cuando → Hacer» (F4·24, docs/AGENTE.md, RAG-23 a RAG-26).

Reglas que arma el administrador en Configuración → Agente → Acciones: cuando el cliente escribe algo, hacer algo.
Se revisan antes que el menú y que el agente, no usan IA y responden al instante. Gana la primera acción activa que
coincide (por prioridad); «Pasar a asesor» es siempre la primera.

Pasos que se ejecutan hoy: texto, conocimiento (fichas activas de una categoría), cuentas (texto aprobado), ir a otro
bot, etiqueta, pasar a asesor, iniciar los flujos de compra (F4·25) y cotización (F4·26) y la ficha del equipo (F4·42).

F4·42 (RAG-43 a RAG-48): el «Cuando» puede ser «el mensaje nombra un equipo del inventario» (código o modelo, sin IA) y el
paso «ficha_equipo» responde con la ficha de ese equipo (encabezado, renglones por atributo y cierre editables), una lista si
coinciden varios, o el aviso de agotado.

F4·43 (RAG-49 a RAG-53): pasos «catalogo» (uno de la lista, el de la marca del equipo o el Unificado; PDF como documento o enlace de
Drive) y «archivo» (PDF o imagen subido en la acción, bucket conocimiento/acciones/), y la casilla «catalogo» de la ficha del equipo.
"""

import re

import agente
import compra
import interprete
import cotizacion
import db
import flujo

PASOS_LISTOS = {"texto", "conocimiento", "cuentas", "bot", "etiqueta", "asesor", "flujo", "ficha_equipo", "catalogo", "archivo"}

# Textos por defecto de la ficha (F4·42). La pantalla los muestra y el dueño los cambia.
FICHA = {
    "encabezado": "¡Hola {nombre}! 👋🔥\nGracias por tu interés en nuestro *{equipo}*.",
    "plantilla": "🎮 {procesador}\n🚀 {grafica}\n🧠 {ram}\n💾 {disco}\n🌈 {teclado}\n✨ Estado estético {estado_estetico}\n💰 *{precio}*",
    "cierre": "¿Te lo separo? Escribe *quiero comprar {codigo}* o pregúntame lo que necesites.",
    "varios": "Tenemos estas opciones de *{modelo}* 👇",
    "cierre_varios": "¿Cuál te interesa? Escríbeme su *código*.",
    "agotado": "😕 El *{modelo}* no está disponible en este momento.",
    "si_agotado": "parecidos",  # parecidos | asesor | nada
    "foto": True,
    "catalogo": False,  # F4·43 (RAG-51): el catálogo de la marca al final
}
CATALOGO_TEXTO = "Te envío el catálogo de {marca} 📚"
FLUJOS_LISTOS = {"compra", "cotizacion"}


def normalizar(s):
    """Igual que las condiciones del lienzo (RF-10): minúsculas, sin tildes, sin signos y con un solo espacio."""
    return flujo.normalizar_condicion(s)


def cumple(condicion, n):
    """RAG-23. «contiene» busca la frase al inicio de una palabra: «devolucion» también encuentra «devoluciones», pero
    «cambio» no se dispara con «intercambio»."""
    texto = normalizar(condicion.get("texto", ""))
    if not texto:
        return False
    forma = condicion.get("forma", "contiene")
    if forma == "igual":
        return n == texto
    if forma == "empieza":
        return n == texto or n.startswith(texto + " ")
    return re.search(rf"(?:^|\s){re.escape(texto)}\w*(?:\s|$)", n) is not None


def detectar_equipo(texto, condicion=None):
    """RAG-43: el equipo que nombra el mensaje, sin IA. Devuelve {"equipos": [...], "modelo": "…"} con los que tienen stock,
    {"equipos": [], "agotado": "…", "marcas": {...}} si lo que nombra está en stock 0 o es un código que no existe, o None.
    `condicion` puede exigir una palabra de interés («cuánto», «precio»…) y aceptar la marca sola («tienen Lenovo»)."""
    c = condicion or {}
    n = normalizar(texto)
    if not n:
        return None
    if c.get("exigir") and not any(cumple({"texto": p}, n) for p in c.get("palabras") or []):
        return None
    p = flujo.buscar_codigo(texto)
    if p:
        return {"equipos": [p], "modelo": f"{p['marca']} {p['modelo']}".strip()}
    falta = flujo.codigo_sin_stock(texto)
    if falta:
        return {"equipos": [], "agotado": falta, "marcas": set()}
    inv = flujo.inventario()
    m = interprete.por_modelo(texto, inv)
    agotados = [{"cod": a["codigo"], "marca": a.get("marca") or "", "modelo": a.get("modelo") or ""} for a in db.productos_agotados()]
    m0 = interprete.por_modelo(texto, agotados)
    # «latitude 5410» nombra mejor al agotado LATITUDE 5410 que al LATITUDE 5420 con stock: gana el que coincide en más palabras.
    if m0 and (not m or len(m0["modelo"].split()) > len(m["modelo"].split())):
        return {"equipos": [], "agotado": m0["modelo"], "marcas": m0["marcas"]}
    if m:
        por_cod = {x["cod"]: x for x in inv}
        cods = m["cods"] or m["parecidos"]
        return {"equipos": [por_cod[k] for k in cods if k in por_cod], "modelo": m["modelo"]}
    if c.get("marca"):
        for marca in sorted({x["marca"] for x in inv if x.get("marca")}, key=len, reverse=True):
            if re.search(rf"(?:^|\s){re.escape(normalizar(marca))}(?:\s|$)", n):
                return {"equipos": [x for x in inv if x["marca"] == marca], "modelo": marca}
    return None


def lista(accion):
    """Una acción se ejecuta solo si todos sus pasos ya existen."""
    pasos = accion.get("hacer") or []
    return bool(pasos) and all(p.get("tipo") in PASOS_LISTOS and (p.get("tipo") != "flujo" or p.get("flujo") in FLUJOS_LISTOS)
                               for p in pasos)


def ganadora(texto, acciones=None):
    """La primera acción activa (por prioridad) que coincide con lo que escribió el cliente, o None."""
    n = normalizar(texto)
    if not n:
        return None
    for a in acciones if acciones is not None else db.acciones_activas():
        if not lista(a):
            continue
        for c in a.get("cuando") or []:
            if c.get("forma") == "equipo":  # F4·42: lo que encontró viaja con la acción hasta el paso de la ficha
                hallado = detectar_equipo(texto, c)
                if hallado:
                    return {**a, "_equipo": hallado}
            elif cumple(c, n):
                return a
    return None


def _texto(plantilla, lead):
    nombre = ((lead or {}).get("nombre") or "").split(" ")[0]
    # Sin nombre, «¡Hola {nombre}!» queda «¡Hola!» y no «¡Hola !».
    return _limpio(plantilla.replace("{horario}", flujo.texto_horario()).replace("{nombre}", nombre or ""))


def _limpio(s):
    """Sin el nombre del cliente, «¡Hola !» queda «¡Hola!»."""
    return re.sub(r"[ \t]+([!?,.])", r"\1", re.sub(r"[ \t]{2,}", " ", s)).strip()


def ficha_equipo(paso, accion, st, lead, texto, fresco=False):
    """RAG-44 a RAG-48: la ficha del equipo que nombró el cliente, la lista si son varios o el aviso de agotado."""
    f = {**FICHA, **{k: v for k, v in paso.items() if v is not None and k != "tipo"}}
    hallado = accion.get("_equipo") or detectar_equipo(texto)
    if not hallado:
        return []
    nombre = ((lead or {}).get("nombre") or "").split(" ")[0]
    extra = {"nombre": nombre, "modelo": hallado.get("modelo") or hallado.get("agotado") or ""}
    equipos = hallado["equipos"]
    config = db.agente_config(fresco)
    if len(equipos) == 1:  # una ficha completa (RAG-44)
        p = equipos[0]
        # {nombre} se pone antes: sin nombre, «¡Hola {nombre}!» queda «¡Hola!» y no se borra el renglón entero.
        partes = [agente.armar_equipo(f[k].replace("{nombre}", nombre), p, extra) for k in ("encabezado", "plantilla", "cierre")]
        cuerpo = _limpio("\n\n".join(x for x in partes if x.strip()))
        # RAG-48: queda como el último equipo que vio, para «Lo quiero» o «quiero comprar» sin repetir el código.
        st.setdefault("campos", {}).update({"Código producto": p["cod"], "Valor estimado": flujo.cop(p["precio"])})
        st["valor"] = p["precio"]
        al_final = mensajes_catalogo({"modo": "marca"}, accion, st, lead) if f.get("catalogo") else []  # RAG-51
        if f.get("foto") and p.get("foto") and len(cuerpo) <= 1024:
            return [flujo.m_imagen(p["foto"], cuerpo)] + al_final
        return [flujo.m_texto(cuerpo)] + al_final
    if equipos:  # varios: la lista de Avi (F4·37 / F4·40) con su plantilla y su máximo (RAG-45)
        maximo = int(config.get("max_equipos") or 3)
        antes = _limpio(f["varios"].replace("{modelo}", extra["modelo"]).replace("{nombre}", nombre))
        despues = _limpio(f["cierre_varios"].replace("{nombre}", nombre))
        al_final = mensajes_catalogo({"modo": "marca"}, accion, st, lead) if f.get("catalogo") else []
        return [flujo.m_texto(t) for t in agente.textos_con_equipos(antes, equipos[:maximo], despues, config)] + al_final
    # Agotado o código que no existe (RAG-46): nunca se ofrece un equipo sin stock.
    mensajes = [flujo.m_texto(_limpio(f["agotado"].replace("{modelo}", extra["modelo"]).replace("{nombre}", nombre)))]
    if f.get("si_agotado") == "asesor":
        mensajes += flujo.asesor(st)
    elif f.get("si_agotado") == "parecidos" and hallado.get("marcas"):
        parecidos = [x for x in flujo.inventario() if x["marca"].upper() in hallado["marcas"]]
        if parecidos:
            maximo = int(config.get("max_equipos") or 3)
            mensajes += [flujo.m_texto(t) for t in agente.textos_con_equipos(
                "Te puede interesar uno de estos 👇", parecidos[:maximo], _limpio(f["cierre_varios"].replace("{nombre}", nombre)), config)]
    return mensajes


def _marca_de(accion, st):
    """La marca del equipo que encontró el disparador (F4·42) o del último equipo que vio el cliente (RAG-49). "" si no hay o son varias."""
    hallado = accion.get("_equipo") or {}
    marcas = {e["marca"].upper() for e in hallado.get("equipos") or [] if e.get("marca")} or set(hallado.get("marcas") or ())
    if not marcas:
        cod = ((st.get("campos") or {}).get("Código producto") or "").split(",")[0].strip()  # con carrito (F4·44) pueden ser varios
        p = next((x for x in flujo.inventario() if cod and x["cod"] == cod), None)
        marcas = {p["marca"].upper()} if p and p.get("marca") else set()
    return marcas.pop() if len(marcas) == 1 else ""


def catalogo_elegido(paso, accion, st):
    """(catálogo, marca) según el modo del paso: «lista» (uno fijo), «marca» (el de la marca; si no tiene, el Unificado) o «unificado»."""
    modo = paso.get("modo") or "marca"
    if modo == "lista":
        return db.catalogo(paso.get("catalogo_id")), ""
    marca = _marca_de(accion, st) if modo == "marca" else ""
    elegido, _ = db.catalogo_para("Portátiles", marca)
    return elegido, marca


def mensajes_catalogo(paso, accion, st, lead):
    """RAG-49: el texto y el catálogo (PDF como documento, Drive como enlace). Sin catálogo activo, nada (RAG-52)."""
    c, marca = catalogo_elegido(paso, accion, st)
    if not c:
        return []
    texto = _limpio(_texto((paso.get("texto") or CATALOGO_TEXTO).replace("{marca}", marca.title() or "nuestros equipos"), lead))
    if c["tipo"] == "pdf":
        return ([flujo.m_texto(texto)] if texto else []) + [{"_pdf": c}]
    return [flujo.m_texto(f"{texto}\n📚 *{c['nombre']}*\n{c['url']}".strip())]


def mensajes_archivo(paso, lead):
    """RAG-50: el PDF o la imagen subidos en la acción, con su texto antes. Sin archivo, nada."""
    if not paso.get("archivo"):
        return []
    texto = _texto(paso.get("texto") or "", lead)
    nombre = (paso.get("nombre") or "").strip() or "Archivo"
    return ([flujo.m_texto(texto)] if texto else []) + [{"_conocimiento": {"archivo": paso["archivo"], "titulo": nombre}}]


def ejecutar(accion, st, lead=None, fresco=False, texto=""):
    """Corre los pasos de la acción. Devuelve (mensajes, st, etiquetas) o None si no hubo nada que enviar (por ejemplo,
    la categoría no tiene fichas activas): entonces el mensaje sigue su camino normal por el menú.

    `fresco` lee conocimiento y configuración sin caché (para «Probar» desde la pantalla)."""
    st.setdefault("bot", None)
    if st["bot"] is None:
        st["bot"] = db.principal()
    # Los pasos «asesor» e «ir a otro bot» usan los cuadros del bot en el que va el cliente, como flujo.responder.
    flujo._hilo.bot, flujo._hilo.saltos = st["bot"], 0
    try:
        return _ejecutar(accion, st, lead, fresco, texto)
    finally:
        flujo._hilo.bot, flujo._hilo.saltos = None, 0


def _ejecutar(accion, st, lead, fresco, texto):
    mensajes, etiquetas = [], []
    for paso in accion.get("hacer") or []:
        tipo = paso.get("tipo")
        if tipo == "texto" and paso.get("texto", "").strip():
            mensajes.append(flujo.m_texto(_texto(paso["texto"], lead)))
        elif tipo == "conocimiento":
            for f in db.conocimiento(paso.get("categoria", ""), fresco):
                if f.get("respuesta", "").strip():
                    mensajes.append(flujo.m_texto(_texto(f["respuesta"], lead)))
                if f.get("archivo"):
                    mensajes.append({"_conocimiento": {"archivo": f["archivo"], "titulo": f["titulo"]}})
        elif tipo == "cuentas":
            cuentas = (db.agente_config(fresco).get("texto_cuentas") or "").strip()
            if cuentas:  # sin texto aprobado no se inventa nada (RAG-09)
                mensajes += compra.mensajes_cuentas(cuentas, fresco)  # F4·49: imagen de los medios de pago y luego el texto
        elif tipo == "etiqueta" and paso.get("etiqueta", "").strip():
            etiquetas.append(paso["etiqueta"].strip())
        elif tipo == "bot" and paso.get("bot_id"):
            mensajes += flujo.cambiar_de_bot(st, int(paso["bot_id"]))
        elif tipo == "flujo" and paso.get("flujo") == "compra":  # F4·25: el flujo sigue con los próximos mensajes
            mensajes += compra.iniciar(st, texto, lead)
        elif tipo == "flujo" and paso.get("flujo") == "cotizacion":  # F4·26
            mensajes += cotizacion.iniciar(st, texto, lead)
        elif tipo == "ficha_equipo":
            mensajes += ficha_equipo(paso, accion, st, lead, texto, fresco)
        elif tipo == "catalogo":  # F4·43
            mensajes += mensajes_catalogo(paso, accion, st, lead)
        elif tipo == "archivo":
            mensajes += mensajes_archivo(paso, lead)
        elif tipo == "asesor":
            mensajes += flujo.asesor(st, etiqueta="Escalado-Asesor", motivo=(paso.get("texto") or "").strip() or None)
    if not mensajes and not st.get("pausa"):
        return None
    return mensajes, st, etiquetas


def responder(st, texto, lead=None):
    """Para el receptor: (accion, mensajes, st, etiquetas) si una acción atendió el mensaje; None si no.
    No corre con el chat en manos de un asesor (RAG-25): el asesor manda."""
    if st.get("pausa"):
        return None
    a = ganadora(texto)
    if not a:
        return None
    r = ejecutar(a, st, lead, texto=texto)
    if r is None:
        return None
    mensajes, st, etiquetas = r
    return a, mensajes, st, etiquetas


def _para_pantalla(m):
    """Cómo se ve en «Probar con una frase» un archivo del conocimiento o de la acción, o un catálogo PDF (RAG-52)."""
    if "_conocimiento" in m:
        return {"type": "archivo", "archivo": m["_conocimiento"]["archivo"], "titulo": m["_conocimiento"]["titulo"]}
    if "_pdf" in m:
        return {"type": "archivo", "archivo": m["_pdf"].get("archivo") or "catalogo.pdf", "titulo": m["_pdf"].get("nombre") or "Catálogo"}
    return m


def _resumen_hallado(h):
    """Qué equipo encontró el disparador, para la pantalla de prueba."""
    if not h:
        return None
    return {"modelo": h.get("modelo") or h.get("agotado") or "", "codigos": [e["cod"] for e in h["equipos"]], "agotado": not h["equipos"]}


def probar(texto, acciones=None):
    """«Probar con una frase» de la pantalla (RAG-26): qué acción gana y qué se enviaría, sin escribir ni enviar.
    Revisa también las apagadas para decir cuál ganaría si estuviera activa."""
    todas = acciones if acciones is not None else db.acciones_todas()
    activas = [a for a in todas if a.get("activa")]
    a = ganadora(texto, activas)
    if not a:
        apagada = ganadora(texto, [x for x in todas if not x.get("activa")])
        return {"accion": None, "apagada": apagada and {"id": apagada["id"], "nombre": apagada["nombre"]}, "mensajes": []}
    st = flujo.estado_vacio()
    r = ejecutar(a, st, None, fresco=True, texto=texto)
    mensajes = r[0] if r else []
    return {"accion": {"id": a["id"], "nombre": a["nombre"]}, "apagada": None, "vacia": r is None,
            "equipo": _resumen_hallado(a.get("_equipo")),
            "mensajes": [_para_pantalla(m) for m in mensajes],
            "etiquetas": r[2] if r else []}

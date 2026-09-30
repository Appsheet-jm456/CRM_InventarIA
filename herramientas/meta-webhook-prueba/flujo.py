"""
Árbol de respuesta de PRUEBA sobre WhatsApp real (docs/ARBOL-DE-RESPUESTA.md), con el inventario de la
Supabase del CRM (decisión 0014). Es la simulación (docs/simulacion/simulacion-chat.html) llevada al número
de prueba de Meta. No es el motor definitivo (F3·4).

- El estado de cada cliente (nodo, datos, pausa) lo carga y guarda el receptor en la tabla leads: un
  reinicio del servidor no lo borra.
- Los menús van como lista interactiva o botones (P-01): el cliente toca la opción o escribe el número.
- Si escribe libre ("¿qué equipos tienes i5 10 en Dell?"), el intérprete saca filtros con reglas o IA y la
  respuesta sale de la base (decisión 0016).
- Los catálogos PDF y el enlace de Drive salen de la tabla catalogos (decisión 0015).
- "reiniciar" quita la pausa de asesor para seguir probando.
"""

import re
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import db
import interprete

RAIZ = Path(__file__).resolve().parents[2]

RANGOS = [
    (0, 1_000_000, "Menos de $1.000.000", "< $1 M"),
    (1_000_000, 1_500_000, "$1.000.000 – $1.500.000", "$1 M – $1,5 M"),
    (1_500_000, 2_000_000, "$1.500.000 – $2.000.000", "$1,5 M – $2 M"),
    (2_000_000, 10**12, "Más de $2.000.000", "> $2 M"),
]
# Etapas que mueve el bot; las demás (Negociación en adelante, Perdido) solo las mueve un asesor.
ETAPAS = ["Nuevo", "En Conversación", "Cotización"]
BOGOTA = ZoneInfo("America/Bogota")
DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]  # 0 = domingo, como extract(dow)


# --------------------------------------------------------------------------- #
# Horario de atención (tabla horario_atencion, RBOT-06) y textos editables (bot_nodos, RBOT-01)
# --------------------------------------------------------------------------- #

def _hora(t):
    """'08:00:00' → '8:00 am'."""
    h, m = int(t[:2]), int(t[3:5])
    return f"{(h % 12) or 12}:{m:02d} {'am' if h < 12 else 'pm'}"


def texto_horario():
    """El horario del cliente, armado con la misma tabla que usa el SLA. Une los días con las mismas franjas."""
    por_dia = {}
    for f in db.horario():
        por_dia.setdefault(f["dia"], []).append(f"{_hora(f['abre'])} – {_hora(f['cierra'])}")
    if not por_dia:
        return "Horario por confirmar."
    grupos = []  # [(franjas, [dias])] en orden de lunes a domingo
    for d in [1, 2, 3, 4, 5, 6, 0]:
        if d in por_dia:
            if grupos and grupos[-1][0] == por_dia[d] and grupos[-1][1][-1] == (d - 1) % 7:
                grupos[-1][1].append(d)
            else:
                grupos.append((por_dia[d], [d]))
    lineas = []
    for franjas, dias in grupos:
        nombre = (f"{DIAS[dias[0]].capitalize()} a {DIAS[dias[-1]]}" if len(dias) > 1 else DIAS[dias[0]].capitalize() + "s"
                  if dias[0] != 6 else "Sábados")
        lineas.append(f"🕗 {nombre}: {' y '.join(franjas)}")
    return "\n".join(lineas) + "\nFestivos: cerrado."


def proxima_apertura(ahora=None):
    """(abierto_ahora, cuándo abre) con la hora de Colombia. `cuándo` sirve para 'te responde ...'."""
    ahora = (ahora or datetime.now(BOGOTA)).astimezone(BOGOTA).replace(tzinfo=None)
    franjas, festivos = db.horario(), db.festivos()
    if not franjas:
        return True, ""
    for salto in range(0, 15):
        dia = ahora.date() + timedelta(days=salto)
        if dia.isoformat() in festivos:
            continue
        for f in sorted((f for f in franjas if f["dia"] == (dia.weekday() + 1) % 7), key=lambda f: f["abre"]):
            abre = datetime.combine(dia, datetime.strptime(f["abre"][:5], "%H:%M").time())
            cierra = datetime.combine(dia, datetime.strptime(f["cierra"][:5], "%H:%M").time())
            if abre <= ahora < cierra:
                return True, ""
            if ahora < abre:
                if salto == 0:
                    cuando = f"hoy a las {_hora(f['abre'])}"
                elif salto == 1:
                    cuando = f"mañana a las {_hora(f['abre'])}"
                else:
                    cuando = f"el {DIAS[(dia.weekday() + 1) % 7]} a las {_hora(f['abre'])}"
                return False, cuando
    return True, ""


def texto_nodo(clave, defecto, **marcas):
    """Texto del nodo desde bot_nodos; si falta, el del código. Las marcas {x} sin valor desaparecen."""
    fila = db.nodos().get(clave)
    texto = (fila or {}).get("texto") or defecto
    for k, v in marcas.items():
        texto = texto.replace("{" + k + "}", str(v))
    return texto


def opciones_nodo(clave, defecto):
    """[(id, título, descripción)] con los títulos editados; los ids y el orden siempre son los del código."""
    fila = db.nodos().get(clave)
    editados = {o["id"]: o["titulo"] for o in (fila or {}).get("opciones") or []}
    return [(i, editados.get(i) or t, d) for i, t, d in defecto]


def estado_vacio():
    return {"nodo": None, "etapa": "Nuevo", "campos": {}, "errores": 0, "pausa": False}


# --------------------------------------------------------------------------- #
# Inventario
# --------------------------------------------------------------------------- #

def _env_local():
    env = {}
    for linea in (RAIZ / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.strip().startswith("#"):
            k, _, v = linea.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _foto(campo):
    """Primera URL del campo foto; los enlaces de Google Drive pasan a miniatura directa (lib/media.js)."""
    url = (str(campo or "").split(",")[0]).strip()
    m = re.search(r"/d/([\w-]+)|[?&]id=([\w-]+)", url)
    if m and re.search(r"drive\.google\.com|docs\.google\.com", url):
        return f"https://drive.google.com/thumbnail?id={m.group(1) or m.group(2)}&sz=w1600"
    return url or None


def _foto_de(p):
    """La foto subida a la app (RI-03) la resuelve el receptor subiéndola a Meta; si no hay, el enlace."""
    if p.get("foto_ruta"):
        return {"_producto": {k: p.get(k) for k in ("id", "foto_ruta", "foto_meta_id", "foto_meta_en")}}
    return _foto(p["foto"])


def inventario():
    """Portátiles con stock, de la tabla productos de Supabase."""
    return [{
        "cod": p["codigo"], "marca": p["marca"], "modelo": p["modelo"], "cpu": p["procesador"],
        "gen": interprete.generacion(p["procesador"], p["generacion"]), "ram": p["ram"],
        "disco": p["almacenamiento"], "estado": p["estado"], "precio": int(float(p["precio"])),
        "stock": p["stock"], "foto": _foto_de(p),
    } for p in db.productos_con_stock() if "portatil" in normalizar(p["categoria"])]


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #

def normalizar(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


def cop(n):
    return "$" + f"{n:,.0f}".replace(",", ".")


def buscar_codigo(texto):
    """El código se valida contra la base (formatos 100-102-1041, 100-102-1007-3 y PU-23)."""
    limpio = re.sub(r"\s", "", texto.upper())
    for p in sorted(inventario(), key=lambda p: -len(p["cod"])):
        if p["cod"] and p["cod"].upper() in limpio:
            return p
    return None


def es_diseno(p):
    """Provisional hasta F1·8: 16 GB de RAM o procesador serie H/HQ."""
    sufijo = p["cpu"].split("-")[-1] if "-" in p["cpu"] else ""
    return "16" in p["ram"] or bool(re.search(r"H", sufijo))


def rango_de_monto(monto):
    for r in RANGOS:
        if r[0] <= monto < r[1]:
            return r
    return RANGOS[-1]


# --------------------------------------------------------------------------- #
# Mensajes (se devuelven como cuerpos de la API; el receptor los envía)
# --------------------------------------------------------------------------- #

def m_texto(texto):
    return {"type": "text", "text": {"body": texto}}


def m_lista(texto, opciones, boton="Ver opciones"):
    """Lista interactiva: hasta 10 filas; título ≤ 24 caracteres, descripción ≤ 72."""
    filas = [{"id": i, "title": t[:24], **({"description": d[:72]} if d else {})} for i, t, d in opciones[:10]]
    return {"type": "interactive", "interactive": {
        "type": "list", "body": {"text": texto[:4096]},
        "action": {"button": boton[:20], "sections": [{"title": "Opciones", "rows": filas}]}}}


def m_botones(texto, opciones, imagen=None):
    """Hasta 3 botones de respuesta; título ≤ 20 caracteres. Imagen opcional en la cabecera."""
    interactivo = {"type": "button", "body": {"text": texto[:1024]}, "action": {"buttons": [
        {"type": "reply", "reply": {"id": i, "title": t[:20]}} for i, t in opciones[:3]]}}
    if imagen:  # enlace, o {"_producto": …} que el receptor cambia por el id del medio en Meta
        interactivo["header"] = {"type": "image", "image": imagen if isinstance(imagen, dict) else {"link": imagen}}
    return {"type": "interactive", "interactive": interactivo}


def menu(texto, opciones):
    """Texto con las opciones numeradas (por si escribe) + lista o botones para tocar."""
    numeradas = "\n".join(f"{i}️⃣ {t}" for i, t, _ in opciones)
    cuerpo = f"{texto}\n\n{numeradas}"
    if len(opciones) <= 3 and all(len(t) <= 20 for _, t, _ in opciones):
        return m_botones(cuerpo, [(i, t) for i, t, _ in opciones])
    return m_lista(cuerpo, opciones)


def lista_equipos(titulo, equipos, pie="Toca un equipo en la lista o escríbenos su *código*. 0️⃣ Menú principal"):
    texto = (f"{titulo}\n\n"
             + "\n".join(f"• {p['cod']} · {p['modelo']} · {p['cpu']} · {p['ram']} · {cop(p['precio'])}" for p in equipos)
             + f"\n\n{pie}")
    filas = [(p["cod"], p["cod"], f"{p['modelo']} · {p['ram']} · {cop(p['precio'])}") for p in equipos[:9]]
    filas.append(("0", "Menú principal", ""))
    return m_lista(texto, filas, "Ver equipos")


def mensajes_catalogo(categoria, marca):
    """El catálogo más específico (PDF o enlace) y el enlace de Drive con todos (decisión 0015)."""
    elegido, todos = db.catalogo_para(categoria, marca)
    salida = []
    if elegido and elegido["tipo"] == "pdf":
        salida.append({"_pdf": elegido})  # el receptor lo sube a Meta y lo envía como documento
    elif elegido:
        salida.append(m_texto(f"📚 *{elegido['nombre']}*\n{elegido['url']}"))
    if todos and (not elegido or todos["id"] != elegido["id"]):
        salida.append(m_texto(f"🗂 Todos nuestros catálogos en Drive:\n{todos['url']}"))
    return salida


# --------------------------------------------------------------------------- #
# Nodos del árbol
# --------------------------------------------------------------------------- #

def etapa(st, nueva):
    """El embudo solo avanza (decisión 0006), y el bot no toca etapas que ya movió un asesor."""
    actual = st.get("etapa") or "Nuevo"
    if actual in ETAPAS and ETAPAS.index(nueva) > ETAPAS.index(actual):
        st["etapa"] = nueva


def ir(st, nodo):
    st["nodo"], st["errores"] = nodo, 0
    st["campos"].pop("Errores bot", None)
    return NODOS[nodo](st)


def b00(st):
    etapa(st, "Nuevo")
    st["campos"]["Etiqueta"] = "WhatsApp-Bot"
    return [menu(texto_nodo("B00", "¡Hola! 👋 Bienvenido a *Ventas Virtuales Colombia*, distribuidores al por mayor "
                            "y detal de equipos de cómputo en Cali.\nSoy el *Bot Ventas Virtuales* 🤖 ¿En qué te "
                            "podemos ayudar hoy?\n\n_También puedes escribirme lo que buscas, por ejemplo: "
                            "\"Dell i5 de décima\"._"),
                 opciones_nodo("B00", [("1", "Productos", ""), ("2", "Distribuidores", ""),
                                       ("3", "Servicio al cliente", "")]))]


def b001a(st):
    return [menu(texto_nodo("B001A", "¡Perfecto! ¿Qué producto estás buscando?"),
                 opciones_nodo("B001A", [("1", "Portátiles corporativos", ""), ("2", "Torres Tiny", ""),
                                         ("3", "Torres SFF", ""), ("4", "Partes", ""), ("0", "Volver al menú", "")]))]


def b001a1(st):
    return [menu(texto_nodo("B001A1", "¿Para qué tipo de trabajo necesitas el portátil?"),
                 opciones_nodo("B001A1", [("1", "Hogar / estudio", ""), ("2", "Ejecutivo / oficina", ""),
                                          ("3", "Diseño / edición", ""), ("0", "Volver", "")]))]


def b001a2(st):
    return [menu(texto_nodo("B001A2", "¿Cuál es tu presupuesto aproximado?\n_(también puedes escribir el monto, "
                            "por ejemplo 1.5 millones)_"),
                 [(str(i + 1), r[3], r[2]) for i, r in enumerate(RANGOS)])]


def b001a3(st):
    return [menu(texto_nodo("B001A3", "¿Deseas que te enviemos el catálogo de portátiles disponibles para *{uso}* "
                            "y así revises cuál te interesa?", uso=st["campos"]["Uso equipo"]),
                 opciones_nodo("B001A3", [("1", "Sí, el catálogo", ""), ("2", "Hablar con asesor", ""),
                                          ("3", "Volver", "")]))]


def b001a4(st):
    marcas = sorted({p["marca"] for p in inventario() if p["marca"]})
    st["marcas"] = marcas
    opciones = [(str(i + 1), m.title(), "") for i, m in enumerate(marcas)]
    opciones.append((str(len(marcas) + 1), "Todas las marcas", ""))
    return [menu(texto_nodo("B001A4", "¿De qué marca quieres ver los portátiles?\n_(solo aparecen las marcas con "
                            "stock)_"), opciones)]


def filtrar(st):
    lo, hi = st["rango"][:2]
    r = [p for p in inventario() if lo <= p["precio"] < hi]
    if st["campos"].get("Marca interés", "Todas") != "Todas":
        r = [p for p in r if p["marca"].upper() == st["campos"]["Marca interés"].upper()]
    if st["campos"].get("Uso equipo") == "Diseño":
        r = [p for p in r if es_diseno(p)]
    return sorted(r, key=lambda p: p["precio"])


def b001a5(st):
    st["campos"]["Etiqueta"] = "Catalogo-Enviado"
    marca = st["campos"].get("Marca interés", "Todas")
    catalogos = mensajes_catalogo("Portátiles", "" if marca == "Todas" else marca)
    r = filtrar(st)
    if not r:
        st["nodo"] = "B001A5-vacio"
        return catalogos + [menu("😕 No tenemos equipos con stock en ese rango ahora mismo.",
                                 [("1", "Cambiar presupuesto", ""), ("9", "Hablar con asesor", "")])]
    titulo = (f"📎 Equipos *{marca}* con stock en tu rango, desde el inventario "
              f"({len(r)} {'equipo' if len(r) == 1 else 'equipos'}):")
    return catalogos + [lista_equipos(titulo, r)]


def r11(st, p):
    st["nodo"], st["errores"] = "R11", 0
    st["campos"].pop("Errores bot", None)
    st["campos"].update({"Código producto": p["cod"], "Valor estimado": cop(p["precio"])})
    st["valor"] = p["precio"]
    etapa(st, "Cotización")
    ficha = (f"💻 *{p['marca']} {p['modelo']}* · Código {p['cod']}\n{p['cpu']} · {p['ram']} · {p['disco']}"
             f"{' · ' + p['estado'] if p['estado'] else ''}\n💰 {cop(p['precio'])} · ✅ Disponible")
    botones = opciones_nodo("R11", [("1", "Lo quiero", ""), ("2", "Ver otro código", ""), ("0", "Menú principal", "")])
    return [m_botones(ficha, [(i, t) for i, t, _ in botones], p["foto"])]


def asesor(st, etiqueta="Escalado-Asesor", motivo=None):
    """Pasa el chat a la cola. Fuera de horario avisa cuándo lo atienden (RBOT-05); el chat entra igual."""
    st["campos"]["Etiqueta"] = etiqueta
    st["pausa"], st["nodo"] = True, "B-ASESOR"
    aviso = f"_{motivo}_\n\n" if motivo else ""
    abierto, cuando = proxima_apertura()
    if abierto:
        texto = texto_nodo("B-ASESOR", "{motivo}¡Entendido! 🙌 En breve un asesor de *Ventas Virtuales Colombia* te "
                           "atenderá personalmente.\n\n{horario}", motivo=aviso, horario=texto_horario())
    else:
        texto = texto_nodo("B-CERRADO", "{motivo}¡Entendido! 🙌 Ahora estamos fuera de horario, pero tu chat ya quedó "
                           "en la fila: un asesor te responde {proxima}.\n\n{horario}",
                           motivo=aviso, horario=texto_horario(), proxima=cuando)
    return [m_texto(texto)]


def error(st):
    st["errores"] += 1
    st["campos"]["Errores bot"] = st["errores"]
    if st["errores"] >= 3:
        return asesor(st, motivo=texto_nodo("ERROR-3", "Tres respuestas no reconocidas: te paso con un asesor."))
    return [m_texto(texto_nodo("ERROR", "🤔 No entendí tu respuesta. Toca una opción o escribe el *número*, o *MENU* "
                               "para volver al inicio."))]


def busqueda(st, filtros):
    """Respuesta a texto libre: filtra productos con lo que entendió el intérprete (decisión 0016)."""
    todos = inventario()
    r = interprete.filtrar(todos, filtros, es_diseno)
    st["nodo"], st["errores"] = "BUSQUEDA", 0
    st["campos"].pop("Errores bot", None)
    st["campos"]["Búsqueda"] = interprete.describir(filtros)
    etapa(st, "En Conversación")
    if filtros.get("marca"):
        st["campos"]["Marca interés"] = filtros["marca"].upper()
    if filtros.get("precio_max"):
        st["campos"]["Presupuesto"] = f"hasta {cop(filtros['precio_max'])}"
    if not r:
        cercanos = interprete.cercanos(todos, filtros)
        texto = f"😕 No tengo equipos con *{interprete.describir(filtros)}* en este momento."
        if cercanos:
            return [lista_equipos(texto + "\nLo más parecido que hay:", cercanos,
                                  "Toca uno para ver la ficha, 9️⃣ para hablar con un asesor o 0️⃣ menú.")]
        return [menu(texto, [("9", "Hablar con asesor", ""), ("0", "Menú principal", "")])]
    return [lista_equipos(f"🔎 Encontré {len(r)} {'equipo' if len(r) == 1 else 'equipos'} con "
                          f"*{interprete.describir(filtros)}*:", r)]


NODOS = {"B00": b00, "B001A": b001a, "B001A1": b001a1, "B001A2": b001a2,
         "B001A3": b001a3, "B001A4": b001a4, "B001A5": b001a5}


# --------------------------------------------------------------------------- #
# Entrada
# --------------------------------------------------------------------------- #

SALUDOS = ("hola", "menu", "inicio", "buenas", "buenos dias", "buenas tardes", "buenas noches")


def responder(st, texto, avisar=None):
    """Devuelve (mensajes, estado) para lo que escribió o tocó el cliente. st viene de leads.

    avisar(texto) envía un aviso inmediato ("Estoy buscando…") cuando la respuesta va a tardar.
    """
    n = normalizar(texto)

    if n == "reiniciar":
        etapa_actual = st.get("etapa") or "Nuevo"  # reiniciar la charla no devuelve el embudo
        st.clear()
        st.update(estado_vacio(), etapa=etapa_actual)
        return ir(st, "B00"), st
    if st["pausa"]:
        return [], st
    if not st["nodo"] or n in SALUDOS:
        return ir(st, "B00"), st

    p = buscar_codigo(texto) if st["nodo"] != "B001A2" else None
    if p:
        return r11(st, p), st
    if n == "9" or "asesor" in n:
        return asesor(st), st
    if n == "0" and st["nodo"] in ("BUSQUEDA", "B001A5", "R11"):
        return ir(st, "B00"), st

    k = st["nodo"]
    if k == "B00":
        if n == "1" or re.fullmatch(r"productos?|portatil(es)?|torres?", n):
            return ir(st, "B001A"), st
        # Cada opción deja al cliente en su embudo por la etiqueta (decisión 0022); el detalle lo lleva un asesor (F1·7).
        if n == "2" or re.fullmatch(r"distribuidor(es)?|mayorista|al por mayor", n):
            return asesor(st, etiqueta="Interes-Distribuidor", motivo="Esta opción aún no está en el bot (F1·7)."), st
        if n == "3" or re.fullmatch(r"servicio( al cliente)?|garantia|soporte( tecnico)?", n):
            return asesor(st, etiqueta="Interes-Soporte", motivo="Esta opción aún no está en el bot (F1·7)."), st
    elif k == "B001A":
        if n == "1" or re.fullmatch(r"portatil(es)?( corporativos)?|laptops?", n):
            st["campos"].update({"Categoría interés": "Portátiles", "Etiqueta": "Interes-Productos"})
            return ir(st, "B001A1"), st
        if n in ("2", "3", "4"):
            return asesor(st, motivo="Esa categoría aún no está en el bot (F1·7)."), st
        if n in ("0", "volver"):
            return ir(st, "B00"), st
    elif k == "B001A1":
        uso = {"1": "Hogar", "2": "Ejecutivo", "3": "Diseño"}.get(n) or interprete.uso(n)
        if uso:
            st["campos"].update({"Uso equipo": uso, "Etiqueta": "Interes-Portatil"})
            return ir(st, "B001A2"), st
        if n == "0":
            return ir(st, "B001A"), st
    elif k == "B001A2":
        monto = interprete.monto(n, contexto_presupuesto=True) if n not in ("1", "2", "3", "4") else None
        if n in ("1", "2", "3", "4") or monto:
            st["rango"] = RANGOS[int(n) - 1] if not monto else rango_de_monto(monto)
            st["campos"]["Presupuesto"] = st["rango"][2]
            etapa(st, "En Conversación")
            return ir(st, "B001A3"), st
    elif k == "B001A3":
        if n == "1" or re.match(r"^si\b|catalogo", n):
            return ir(st, "B001A4"), st
        if n == "2" or "cotizacion" in n:
            return asesor(st, "Cotizacion-Personalizada"), st
        if n in ("3", "volver"):
            return ir(st, "B001A"), st
    elif k == "B001A4":
        marcas = st.get("marcas", [])
        if n.isdigit() and 1 <= int(n) <= len(marcas):
            st["campos"]["Marca interés"] = marcas[int(n) - 1]
            return ir(st, "B001A5"), st
        if n == str(len(marcas) + 1) or n == "todas":
            st["campos"]["Marca interés"] = "Todas"
            return ir(st, "B001A5"), st
        if normalizar(n).upper() in [m.upper() for m in marcas]:
            st["campos"]["Marca interés"] = n.upper()
            return ir(st, "B001A5"), st
        if re.search(r"lenovo|hp|asus|acer|apple|mac", n):
            return [m_texto("Por ahora no tenemos esa marca en stock. Te muestro las que sí hay 👇")] + ir(st, "B001A4"), st
    elif k == "B001A5-vacio":
        if n == "1":
            return ir(st, "B001A2"), st
    elif k == "R11":
        if n == "1" or interprete.quiere_comprar(n):
            return asesor(st), st
        if n in ("2", "ver otro codigo"):
            st["nodo"] = "B001A5"
            return [m_texto("Envíame el código del equipo 👇")], st
        if n in ("0", "menu principal"):
            return ir(st, "B00"), st

    # Texto libre: reglas primero; si no alcanzan, IA (Gemini o qwen3). La respuesta sale de la base.
    if not re.fullmatch(r"\d{1,2}", n):
        filtros = interprete.reglas(texto, [p["marca"] for p in inventario()])
        if not filtros and interprete.vale_la_pena_ia(n):
            if avisar:
                avisar("🔎 Estoy buscando en el inventario…")
            filtros = interprete.con_ia(texto)
        if filtros:
            return busqueda(st, filtros), st
    return error(st), st

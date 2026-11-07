"""
Flujo de compra sin IA (F4·25, docs/AGENTE.md tramo 2, RAG-19 a RAG-22).

«Quiero comprar <código>» (acción con el paso «Iniciar flujo de compra») → el equipo (el código escrito o el de la última
ficha) → distribuidor o cliente final → resumen con el total → cuentas con el texto aprobado → Esperando pago →
comprobante (foto, PDF o «ya pagué») → Pago por confirmar y el chat pasa al asesor. Cancelar con «ya no quiero».
Si en 12 h no hay respuesta, el reloj manda «¿Sigues interesado?».

Carrito (F4·44, docs/AGENTE.md §4f, RAG-54 a RAG-62): con Agente → Compra → Carrito encendido (o si la compra empieza en un cuadro
🛒 Carrito del lienzo) la compra pregunta «¿Quieres agregar otro equipo?», arma una lista en st["compra"]["equipos"] y el resumen,
las cuentas, la nota del asesor y la cotización llevan todos. Apagado, todo sigue con un solo equipo, como antes.

El estado va en st["compra"] (se guarda en leads.estado_bot). Mientras hay compra, st["nodo"] es "COMPRA".
Precios: siempre los de la tabla productos; el cargo de configuración y los textos salen de agente_config.
"""

import re
from datetime import datetime, timedelta, timezone

import cotizacion
import db
import flujo

NODO = "COMPRA"
PAGO = re.compile(r"\b(ya (te )?(pague|transferi|consigne|hice (el|la) (pago|transferencia))|listo el pago|pago (hecho|realizado)|"
                  r"comprobante|te (envio|mando) el (pago|comprobante)|transferencia (hecha|realizada|lista))\b")
CANCELA = re.compile(r"\b(no (lo )?quiero|ya no|cancel\w*|no me interesa|mejor no|desisto)\b")
SALIR = ("0", "menu", "menú", "inicio")


def _cfg():
    return db.agente_config() or {}


def _n(texto):
    return flujo.normalizar_condicion(texto)


def activa(st):
    return bool((st.get("compra") or {}).get("paso"))


def _limpiar(st):
    st.pop("compra", None)
    st.pop("espera_hasta", None)
    if st.get("nodo") == NODO:
        st["nodo"] = None


def _es_distribuidor(lead):
    etiquetas = (lead or {}).get("etiquetas") or []
    return "Interes-Distribuidor" in etiquetas


def _producto_por_codigo(cod):
    return next((p for p in flujo.inventario() if p["cod"] and p["cod"].upper() == str(cod).upper()), None)


def _items(c):
    """Los equipos del pedido: la lista del carrito o, en una compra de un equipo (o de antes de F4·44), ese solo."""
    if c.get("equipos"):
        return c["equipos"]
    return [{"codigo": c["codigo"], "equipo": c.get("equipo") or "", "precio": c.get("precio") or 0}] if c.get("codigo") else []


def _carrito(c):
    return bool(c.get("carrito"))


def _maximo():
    return max(2, min(10, int(_cfg().get("carrito_max") or 5)))


def _que_lleva(c):
    """Para las notas del asesor: «Dell Latitude 5420 (100-102-1030-1) + HP 840 (100-101-1050)»."""
    return " + ".join(f"{i['equipo']} ({i['codigo']})" for i in _items(c)) or "equipo sin elegir"


def _marcas(texto, c, nombre=""):
    """{n} equipos en el pedido, {max} el máximo y {nombre} el del cliente (sin nombre, «¡Hola !» queda «¡Hola!»)."""
    t = texto.replace("{n}", str(len(_items(c)))).replace("{max}", str(_maximo())).replace("{nombre}", nombre)
    return re.sub(r" +([!,.?])", r"\1", t)


def _resumen(c):
    if _carrito(c):
        items = _items(c)
        cab = (_cfg().get("carrito_encabezado") or "🛒 *Resumen de tu pedido*").strip()
        lineas = [cab] + [f"{k}. 💻 {i['equipo']} · Código {i['codigo']}\n     💰 {flujo.cop(i['precio'])}" for k, i in enumerate(items, 1)]
        if c["tipo"] == "cliente_final" and c["cargo"]:
            lineas.append(f"🔧 Configuración: {len(items)} × {flujo.cop(c['cargo'])} = {flujo.cop(c['cargo'] * len(items))}")
        lineas += [f"*Total ({len(items)} {'equipo' if len(items) == 1 else 'equipos'}): {flujo.cop(c['total'])}*"]
        return "\n".join(lineas)
    lineas = [f"🛒 *Resumen de tu compra*", f"💻 {c['equipo']} · Código {c['codigo']}", f"💰 Precio: {flujo.cop(c['precio'])}"]
    if c["tipo"] == "cliente_final" and c["cargo"]:
        lineas.append(f"🔧 Configuración: {flujo.cop(c['cargo'])}")
    lineas += [f"*Total: {flujo.cop(c['total'])}*", "", "¿Te envío los datos para pagar?"]
    return "\n".join(lineas)


def _pedir_tipo(st):
    st["compra"]["paso"] = "tipo"
    return [flujo.m_botones("¿Compras como *distribuidor* o como *cliente final*?",
                            [("compra-distribuidor", "Distribuidor"), ("compra-final", "Cliente final")])]


# Opciones del resumen con carrito (RAG-58 y RAG-60): lista, porque WhatsApp deja solo 3 botones.
OPCIONES_RESUMEN = [("compra-si", "Confirmar pedido", "Te envío los datos para pagar"),
                    ("compra-agregar", "Agregar otro equipo", ""),
                    ("compra-quitar", "Quitar un equipo", ""),
                    ("compra-cotizar", "Cotizar este pedido", "Te envío la cotización en PDF"),
                    ("compra-asesor", "Hablar con asesor", ""),
                    ("compra-cancelar", "Cancelar", "")]


def _menu(texto, opciones):
    """Texto con las opciones numeradas por su lugar (por si escribe «2») y la lista para tocar con sus ids."""
    numeros = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]
    cuerpo = texto + "\n\n" + "\n".join(f"{numeros[k]} {t}" for k, (_, t, _) in enumerate(opciones))
    if len(opciones) <= 3 and all(len(t) <= 20 for _, t, _ in opciones):
        return flujo.m_botones(cuerpo, [(i, t) for i, t, _ in opciones])
    return flujo.m_lista(cuerpo, opciones)


def _opciones_resumen(c):
    items = _items(c)
    return [o for o in OPCIONES_RESUMEN
            if not (o[0] == "compra-agregar" and len(items) >= _maximo()) and not (o[0] == "compra-quitar" and len(items) < 2)]


def _confirmar(st):
    c = st["compra"]
    aviso = []
    if _carrito(c):  # RAG-57: precios de la base al armar el resumen; un equipo agotado se quita con aviso
        vigentes, idos = [], []
        for i in _items(c):
            p = _producto_por_codigo(i["codigo"])
            if p:
                vigentes.append({"codigo": p["cod"], "equipo": f"{p['marca']} {p['modelo']}".strip(), "precio": p["precio"]})
            else:
                idos.append(i)
        if idos:
            aviso = [flujo.m_texto("😕 " + ", ".join(f"*{i['equipo']}* ({i['codigo']})" for i in idos)
                                   + (" ya no está disponible" if len(idos) == 1 else " ya no están disponibles")
                                   + (", lo quité de tu pedido." if len(idos) == 1 else ", los quité de tu pedido."))]
        if not vigentes:
            _limpiar(st)
            return aviso + [flujo.m_botones("Tu pedido quedó vacío. ¿Te muestro otros equipos o prefieres un asesor?",
                                            [("0", "Ver equipos"), ("9", "Hablar con asesor")])]
        c["equipos"] = vigentes
        c.update(codigo=vigentes[0]["codigo"], equipo=vigentes[0]["equipo"], precio=vigentes[0]["precio"])
    items = _items(c)
    cargo = int(float(_cfg().get("cargo_configuracion") or 0)) if c["tipo"] == "cliente_final" else 0
    c.update(cargo=cargo, total=sum(int(i["precio"]) for i in items) + cargo * len(items), paso="confirmar")
    st["valor"] = c["total"]
    st["campos"].update({"Código producto": ", ".join(i["codigo"] for i in items), "Valor estimado": flujo.cop(c["total"])})
    if _carrito(c):
        opciones = _opciones_resumen(c)
        c["opciones"] = [i for i, _, _ in opciones]
        return aviso + [_menu(_resumen(c), opciones)]
    return [flujo.m_botones(_resumen(c), [("compra-si", "Sí, enviar cuentas"), ("compra-asesor", "Hablar con asesor"),
                                          ("compra-cancelar", "Cancelar")])]


def _seguir(st, lead=None):
    """Terminó de elegir equipos: el tipo de cliente si falta y el resumen."""
    if not st["compra"].get("tipo"):
        return _pedir_tipo(st)
    return _confirmar(st)


def _preguntar_otro(st, lead=None):
    """RAG-56: «¿Quieres agregar otro equipo?» o, en el máximo, el aviso y el resumen."""
    c = st["compra"]
    nombre = ((lead or {}).get("nombre") or "").split(" ")[0]
    if len(_items(c)) >= _maximo():
        texto = _marcas((_cfg().get("carrito_texto_maximo") or "Llegaste al máximo de {max} equipos por pedido 🙌").strip(), c, nombre)
        return [flujo.m_texto(texto)] + _seguir(st, lead)
    c["paso"] = "otro"
    texto = _marcas((_cfg().get("carrito_texto_otro") or "¿Quieres agregar otro equipo a tu pedido? 🛒 Llevas {n}.").strip(), c, nombre)
    return [flujo.m_botones(texto, [("compra-otro-si", "Sí, agregar otro"), ("compra-otro-no", "No, continuar")])]


def _pedir_otro(st, lead=None):
    c = st["compra"]
    c["paso"] = "agregar"
    c.pop("candidato", None)
    nombre = ((lead or {}).get("nombre") or "").split(" ")[0]
    return [flujo.m_texto(_marcas((_cfg().get("carrito_texto_pedir") or "Escríbeme el *código* o el *modelo* del otro equipo 👇").strip(), c, nombre))]


def _agregar(st, p, lead=None):
    """Suma el equipo al pedido (sin repetir el código) y pregunta si quiere otro."""
    c = st["compra"]
    items = c.setdefault("equipos", [])
    if not any(i["codigo"].upper() == p["cod"].upper() for i in items):
        items.append({"codigo": p["cod"], "equipo": f"{p['marca']} {p['modelo']}".strip(), "precio": p["precio"]})
    c.update(codigo=items[0]["codigo"], equipo=items[0]["equipo"], precio=items[0]["precio"])
    c.pop("candidato", None)
    return _preguntar_otro(st, lead)


def _ficha_candidato(st, p):
    """La ficha del equipo que nombró, con «Agregar este» (RAG-56)."""
    st["compra"]["candidato"] = p["cod"]
    st["compra"]["paso"] = "agregar"
    ficha = (f"💻 *{p['marca']} {p['modelo']}* · Código {p['cod']}\n{p['cpu']} · {p['ram']} · {p['disco']}"
             f"{' · ' + p['estado'] if p.get('estado') else ''}\n💰 {flujo.cop(p['precio'])} · ✅ Disponible")
    return [flujo.m_botones(ficha, [("compra-agregar-este", "Agregar este"), ("compra-ver-otro", "Ver otro código"),
                                    ("compra-resumen", "Ver mi pedido")], p.get("foto"))]


def _buscar_para_agregar(st, entrada, lead=None):
    """El cliente escribió un código o un modelo para sumar al pedido: la ficha, la lista si son varios o el aviso (sin IA)."""
    import acciones  # aquí y no arriba: acciones importa compra
    c = st["compra"]
    hallado = acciones.detectar_equipo(entrada)
    seguir = [("compra-ver-otro", "Ver otro código"), ("compra-resumen", "Ver mi pedido")]
    if hallado and len(hallado["equipos"]) == 1:
        p = hallado["equipos"][0]
        if any(i["codigo"].upper() == p["cod"].upper() for i in _items(c)):
            return [flujo.m_botones(f"✅ El *{p['marca']} {p['modelo']}* ({p['cod']}) ya está en tu pedido.", seguir)]
        if not c.get("equipos") and not _items(c):  # el primero (la compra empezó sin equipo): entra directo
            return _agregar(st, p, lead)
        return _ficha_candidato(st, p)
    if hallado and hallado["equipos"]:
        c["paso"] = "agregar"
        ya = {i["codigo"].upper() for i in _items(c)}
        libres = [p for p in hallado["equipos"] if p["cod"].upper() not in ya]  # los que ya están en el pedido no se ofrecen
        if len(libres) == 1:
            return _ficha_candidato(st, libres[0])
        if not libres:
            return [flujo.m_botones(f"✅ Los *{hallado.get('modelo')}* disponibles ya están en tu pedido.", seguir)]
        return [flujo.lista_equipos(f"Tenemos estas opciones de *{hallado.get('modelo') or 'ese equipo'}* 👇", libres[:9],
                                    "Toca uno o escríbeme su *código*.")]
    if hallado:  # agotado o código que no existe: nunca se agrega un equipo sin stock
        return [flujo.m_botones(f"😕 El *{hallado.get('agotado')}* no está disponible en este momento.", seguir)]
    return [flujo.m_botones("No encuentro ese equipo en el inventario. Escríbeme el *código* como sale en la ficha "
                            "(por ejemplo 100-102-1030-1) o el *modelo*.", seguir if _items(c) else seguir[:1])]


def _con_equipo(st, p, lead):
    """Ya se sabe el equipo: comprueba stock y sigue con el tipo de cliente o el resumen (con carrito, «¿otro equipo?»)."""
    if _carrito(st["compra"]):
        if _es_distribuidor(lead):
            st["compra"]["tipo"] = "distribuidor"
        return _agregar(st, p, lead)
    st["compra"].update(codigo=p["cod"], equipo=f"{p['marca']} {p['modelo']}".strip(), precio=p["precio"])
    if _es_distribuidor(lead):
        st["compra"]["tipo"] = "distribuidor"
    if not st["compra"].get("tipo"):
        return _pedir_tipo(st)
    return _confirmar(st)


def _asesor(st, motivo=None):
    """Pasa al asesor con el aviso de horario del cuadro asesor; la compra queda anotada para el asesor."""
    return flujo.asesor(st, etiqueta="Escalado-Asesor", motivo=motivo)


def iniciar(st, texto, lead=None, cuadro=None):
    """Lo llama la acción «Quiero comprar» (RAG-19) o el cuadro 🛒 Carrito del lienzo (`cuadro`, RAG-55).
    Devuelve los mensajes."""
    st["compra"] = {"paso": "codigo", "desde": datetime.now(timezone.utc).isoformat()}
    if cuadro or _cfg().get("carrito_activo"):
        st["compra"]["carrito"] = True
    if cuadro:  # las flechas del cuadro: después del comprobante y si pide asesor
        st["compra"]["salidas"] = {k: v for k, v in (cuadro.get("salidas") or {}).items() if v}
        st["compra"]["bot"] = getattr(flujo._hilo, "bot", None) or st.get("bot")
    st["nodo"] = NODO
    st.pop("espera_hasta", None)
    p = flujo.buscar_codigo(texto)
    if not p and _carrito(st["compra"]):  # viene de cotizar un pedido con varios equipos: entran todos, no solo el primero
        codigos = [k.strip() for k in ((st.get("campos") or {}).get("Código producto") or "").split(",") if k.strip()]
        vigentes = [q for q in (_producto_por_codigo(k) for k in codigos) if q]
        if len(vigentes) > 1:
            st["compra"]["equipos"] = [{"codigo": q["cod"], "equipo": f"{q['marca']} {q['modelo']}".strip(), "precio": q["precio"]}
                                       for q in vigentes[:_maximo()]]
            first = st["compra"]["equipos"][0]
            st["compra"].update(codigo=first["codigo"], equipo=first["equipo"], precio=first["precio"])
            if _es_distribuidor(lead):
                st["compra"]["tipo"] = "distribuidor"
            return _seguir(st, lead)
    if not p and (st.get("campos") or {}).get("Código producto"):  # el de la última ficha que vio
        p = _producto_por_codigo(st["campos"]["Código producto"].split(",")[0].strip())
    if not p and (lead or {}).get("cotiz_producto"):
        p = _producto_por_codigo(lead["cotiz_producto"])
    if p:
        return _con_equipo(st, p, lead)
    if re.search(r"\d{3}-\d{3}", texto) or re.search(r"\bpu-?\d+", texto.lower()):
        _limpiar(st)  # escribió un código que ya no está disponible
        return [flujo.m_botones("😕 Ese equipo ya no está disponible. ¿Te muestro otros o prefieres hablar con un asesor?",
                                [("0", "Ver equipos"), ("9", "Hablar con asesor")])]
    if _carrito(st["compra"]):
        return [flujo.m_texto("🛒 ¡Perfecto! ¿Qué equipo quieres? Escríbeme su *código* (por ejemplo 100-102-1030-1) o su *modelo*.")]
    return [flujo.m_texto("🛒 ¡Perfecto! ¿Cuál es el *código* del equipo que quieres comprar? Lo ves en la ficha "
                          "(por ejemplo 100-102-1030-1).")]


def _salida(st, c, nombre):
    """La flecha del cuadro 🛒 Carrito (RAG-55) o None si no está unida o la compra no empezó en el lienzo."""
    return (c.get("salidas") or {}).get(nombre)


def _ir_a_salida(st, c, destino):
    """Sigue la flecha del cuadro Carrito en su bot."""
    if c.get("bot"):
        st["bot"] = c["bot"]
        flujo._hilo.bot = c["bot"]
    return flujo.ir(st, destino)


def responder(st, entrada, tipo="text", lead=None):
    """Mensaje del cliente con una compra en curso. Devuelve (mensajes, etiquetas, paso_embudo, nota) o None si el mensaje
    debe seguir por el menú (el cliente salió de la compra). `tipo` es "media" si mandó foto, PDF u otro archivo."""
    st.setdefault("bot", None)
    if st["bot"] is None:
        st["bot"] = db.principal()
    flujo._hilo.bot, flujo._hilo.saltos = st["bot"], 0  # el paso a asesor usa los cuadros del bot del cliente
    try:
        return _responder(st, entrada, tipo, lead)
    finally:
        flujo._hilo.bot, flujo._hilo.saltos = None, 0


def _responder(st, entrada, tipo, lead):
    c = st["compra"]
    paso = c.get("paso")
    n = _n(entrada) if tipo != "media" else ""
    cfg = _cfg()

    # «asesor» en cualquier paso: al asesor, con la compra anotada (RAG-04).
    if entrada in ("9", "compra-asesor") or re.search(r"\basesor\b", n):
        nota = (f"🛒 Compra en curso ({paso}): {_que_lleva(c)}"
                + (f" · total {flujo.cop(c['total'])}" if c.get("total") else "") + ". El cliente pidió asesor.")
        destino = _salida(st, c, "asesor")
        _limpiar(st)
        if destino:  # RAG-55: «Pidió asesor o no avanza» unida en el cuadro Carrito
            return _ir_a_salida(st, c, destino), [], None, nota
        return _asesor(st), [], None, nota

    if tipo == "media" and paso != "esperando_pago":  # una foto o audio antes de las cuentas: al asesor, como siempre
        nota = f"🛒 Compra en curso ({paso}): el cliente mandó un archivo antes de recibir las cuentas."
        _limpiar(st)
        return _asesor(st), [], None, nota

    if paso == "esperando_pago" and cfg.get("validar_comprobante", True) and (tipo == "media" or PAGO.search(n)):
        return _soporte_recibido(st, c, tipo, cfg)

    if paso == "esperando_pago":
        # RAG-20: comprobante → Pago por confirmar y al asesor (sin IA, nadie confirma el pago solo).
        if tipo == "media" or PAGO.search(n):
            nota = (f"🛒 Compra: {_que_lleva(c)} · "
                    f"{'distribuidor' if c.get('tipo') == 'distribuidor' else 'cliente final'} · total {flujo.cop(c.get('total', 0))} · "
                    f"comprobante recibido {datetime.now(flujo.BOGOTA):%d/%m %H:%M}. Verificar transferencia y datos de envío.")
            _limpiar(st)
            st["campos"]["Etiqueta"] = "Pago-Por-Confirmar"
            listo = _salida(st, c, "listo")
            if listo:  # RAG-55: «Pedido pagado» unida en el cuadro Carrito (por ejemplo, los datos de despacho de ese bot)
                return _ir_a_salida(st, c, listo), ["Pago-Por-Confirmar"], "pago_por_confirmar", nota
            despues = cfg.get("compra_bot_despues")
            if despues and db.flujo(despues):  # RF-28 (F4·34): sigue en un bot del lienzo (datos de despacho) y ese termina en el asesor
                return flujo.cambiar_de_bot(st, despues), ["Pago-Por-Confirmar"], "pago_por_confirmar", nota
            st["pausa"], st["nodo"] = True, flujo.del_tipo("asesor")
            texto = flujo.con_horario((cfg.get("texto_comprobante") or "✅ Recibimos tu comprobante. Un asesor valida tu pago y te confirma por aquí.").strip())
            return [flujo.m_texto(texto)], ["Pago-Por-Confirmar"], "pago_por_confirmar", nota
        if CANCELA.search(n):
            _limpiar(st)
            texto = (cfg.get("texto_cancelacion") or "Entendido. Si cambias de opinión, escríbenos.").strip()
            return [flujo.m_texto(texto)], ["Compra-Cancelada"], "cancelada", f"🛒 Compra cancelada por el cliente: {_que_lleva(c)}."
        # Otra cosa (datos de envío, una pregunta): se anota para el asesor y se recuerda el comprobante una sola vez.
        st["espera_hasta"] = (datetime.now(timezone.utc) + timedelta(hours=int(cfg.get("horas_sin_respuesta") or 12))).isoformat()
        nota = f"🛒 Mientras espera el pago, el cliente escribió: {entrada[:300]}"
        if c.get("recordado"):
            return [], [], None, nota
        c["recordado"] = True
        return [flujo.m_texto("✅ Anotado. Cuando hagas el pago, envíanos el *comprobante* por aquí. Si tienes una duda, escribe *asesor*.")], [], None, nota

    # Antes de enviar las cuentas el cliente puede salir de la compra.
    if n in SALIR or entrada in ("0", "compra-cancelar") or CANCELA.search(n):
        _limpiar(st)
        if entrada == "compra-cancelar" or CANCELA.search(n):
            return [flujo.m_texto((cfg.get("texto_cancelacion") or "Entendido.").strip())], ["Compra-Cancelada"], None, None
        return None  # «0» o «menú»: sigue por el menú
    if _carrito(c):
        r = _responder_carrito(st, c, paso, entrada, n, lead)
        if r is not None:
            return r, [], None, None
    if paso == "codigo":
        p = flujo.buscar_codigo(entrada)
        if p:
            return _con_equipo(st, p, lead), [], None, None
        return [flujo.m_texto("No encuentro ese código en los equipos disponibles. Escríbelo como sale en la ficha "
                              "(por ejemplo 100-102-1030-1), o escribe *asesor*.")], [], None, None

    if paso == "tipo":
        if entrada == "compra-distribuidor" or "distribuidor" in n:
            c["tipo"] = "distribuidor"
        elif entrada == "compra-final" or "final" in n or "cliente" in n:
            c["tipo"] = "cliente_final"
        else:
            return _pedir_tipo(st), [], None, None
        return _confirmar(st), [], None, None

    if paso == "confirmar":
        if entrada == "compra-si" or n in ("si", "1", "dale", "listo", "ok", "de una") or n.startswith("si "):
            if _carrito(c):  # RAG-57: antes de las cuentas, cada equipo sigue con stock
                antes = len(_items(c))
                r = _confirmar(st)
                if not activa(st) or len(_items(c)) != antes:
                    return r, [], None, None
            cuentas = (cfg.get("texto_cuentas") or "").strip()
            if not cuentas:  # RAG-09: sin texto aprobado, las cuentas las envía un asesor
                nota = f"🛒 Confirmó la compra de {_que_lleva(c)} por {flujo.cop(c['total'])}. Falta enviarle las cuentas."
                _limpiar(st)
                return _asesor(st, motivo="Un asesor te envía los datos para pagar."), ["Compra-Iniciada"], "esperando_pago", nota
            c["paso"] = "esperando_pago"
            c["cuentas_en"] = datetime.now(timezone.utc).isoformat()
            st["espera_hasta"] = (datetime.now(timezone.utc) + timedelta(hours=int(cfg.get("horas_sin_respuesta") or 12))).isoformat()
            nota = f"🛒 Cuentas enviadas: {_que_lleva(c)} · total {flujo.cop(c['total'])}. Esperando comprobante."
            return [flujo.m_texto(cuentas)], ["Compra-Iniciada"], "esperando_pago", nota
        return _confirmar(st), [], None, None

    _limpiar(st)  # estado desconocido: se sale sin romper nada
    return None


def _responder_carrito(st, c, paso, entrada, n, lead):
    """Los pasos del carrito (RAG-56 a RAG-58 y RAG-60). None: el paso no es del carrito y sigue el flujo de un equipo."""
    if paso == "otro":
        if entrada == "compra-otro-si" or n in ("si", "1", "dale", "otro", "agregar") or n.startswith("si "):
            return _pedir_otro(st, lead)
        if entrada == "compra-otro-no" or n in ("no", "2", "continuar", "listo", "ya", "no gracias") or n.startswith("no "):
            return _seguir(st, lead)
        if flujo.buscar_codigo(entrada) or len(n) > 3:  # escribió directo otro código o modelo
            return _buscar_para_agregar(st, entrada, lead)
        return _preguntar_otro(st, lead)
    if paso in ("agregar", "codigo"):
        if entrada == "compra-agregar-este" and c.get("candidato"):
            p = _producto_por_codigo(c["candidato"])
            if not p:
                c.pop("candidato", None)
                return [flujo.m_botones("😕 Ese equipo se acaba de agotar.", [("compra-ver-otro", "Ver otro código"),
                                                                              ("compra-resumen", "Ver mi pedido")])]
            return _agregar(st, p, lead)
        if entrada == "compra-ver-otro":
            return _pedir_otro(st, lead)
        if entrada in ("compra-resumen", "compra-otro-no") or (_items(c) and n in ("no", "listo", "ya", "continuar", "resumen", "mi pedido")):
            return _seguir(st, lead) if _items(c) else _pedir_otro(st, lead)
        return _buscar_para_agregar(st, entrada, lead)
    if paso == "confirmar":
        opciones = c.get("opciones") or []
        if n.isdigit() and 1 <= int(n) <= len(opciones):  # escribió el número de la opción
            entrada = opciones[int(n) - 1]
            if entrada == "compra-si":
                return None  # lo atiende el paso «confirmar» de siempre (cuentas)
        if entrada == "compra-agregar":
            if len(_items(c)) >= _maximo():
                return _preguntar_otro(st, lead)
            return _pedir_otro(st, lead)
        if entrada == "compra-quitar":
            items = _items(c)
            c["paso"] = "quitar"
            return [_menu("¿Cuál quito del pedido?", [(f"quitar-{k}", i["equipo"][:20], f"{i['codigo']} · {flujo.cop(i['precio'])}")
                                                           for k, i in enumerate(items, 1)])]
        if entrada == "compra-cotizar":  # RAG-60: un solo PDF con todos los equipos
            codigos = [i["codigo"] for i in _items(c)]
            tipo = c.get("tipo")
            _limpiar(st)
            return cotizacion.iniciar(st, "", lead, pedido=codigos, tipo=tipo)
        return None
    if paso == "quitar":
        items = _items(c)
        m = re.fullmatch(r"(?:quitar-)?(\d+)", entrada.strip()) or re.fullmatch(r"(\d+)", n)
        if m and 1 <= int(m.group(1)) <= len(items):
            quitado = items.pop(int(m.group(1)) - 1)
            c["equipos"] = items
            return [flujo.m_texto(f"🗑 Quité el *{quitado['equipo']}* ({quitado['codigo']}) de tu pedido.")] + _confirmar(st)
        return _confirmar(st)
    return None


# --------------------------------------------------------------------------- #
# F4·46: el asesor valida el comprobante (decisión 0036, RAG-63 a RAG-70)
# --------------------------------------------------------------------------- #

def espera_soporte(st, tipo):
    """El cliente manda un archivo con la compra esperando el pago: lo atiende la compra aunque el chat esté con un asesor (tras dos
    rechazos el chat queda con él y el siguiente soporte también debe llegar a la tarjeta de la Bandeja)."""
    return (st.get("compra") or {}).get("paso") == "esperando_pago" and tipo not in ("text", "button", "interactive")


def _con_total(texto, c):
    return texto.replace("{total}", flujo.cop(c.get("total") or 0))


def _soporte_recibido(st, c, tipo, cfg):
    """RAG-63: solo acusa recibo (no confirma el pago), deja la compra en «pago por confirmar» y el chat en la cola. «Ya pagué» sin
    foto ni PDF pide el soporte."""
    if tipo != "media":
        return [flujo.m_texto("📎 Envíanos la *foto o el PDF* del comprobante para que un asesor valide el pago.")], [], None, None
    ahora = datetime.now(flujo.BOGOTA)
    c.update(paso="pago_por_confirmar", comprobante_en=datetime.now(timezone.utc).isoformat())
    c.pop("validacion", None)
    c.pop("motivo", None)
    st.pop("espera_hasta", None)
    st["pausa"], st["nodo"] = True, flujo.del_tipo("asesor")
    st["campos"]["Etiqueta"] = "Comprobante-Por-Validar"
    nota = (f"💳 Comprobante por validar: {_que_lleva(c)} · "
            f"{'distribuidor' if c.get('tipo') == 'distribuidor' else 'cliente final'} · total {flujo.cop(c.get('total', 0))} · "
            f"llegó {ahora:%d/%m %H:%M}. Revisa la cuenta bancaria y pulsa ✅ Comprobante validado o ❌ No es válido en la Bandeja.")
    texto = flujo.con_horario(_con_total((cfg.get("texto_soporte") or "📄 Recibimos tu soporte. Un asesor está validando el pago "
                                                                    "y te confirma por aquí {proxima}.").strip(), c))
    return [flujo.m_texto(texto)], ["Pago-Por-Confirmar", "Comprobante-Por-Validar"], "pago_por_confirmar", nota


def resolver_validacion(st, lead=None):
    """Lo llama el receptor cuando una persona pulsó «Comprobante validado» o «No es válido» (la base ya lo registró).
    Devuelve (mensajes, resultado) o None si no hay una validación pendiente. Con el bot del cliente en el hilo."""
    c = st.get("compra") or {}
    v = c.get("validacion")
    if c.get("paso") != "pago_por_confirmar" or v not in ("validado", "rechazado"):
        return None
    st.setdefault("bot", None)
    if st["bot"] is None:
        st["bot"] = db.principal()
    flujo._hilo.bot, flujo._hilo.saltos = st["bot"], 0
    try:
        return (_validado(st, c) if v == "validado" else _rechazado(st, c)), v
    finally:
        flujo._hilo.bot, flujo._hilo.saltos = None, 0


def _validado(st, c):
    """RAG-65: «✅ Recibimos tu comprobante.» y sigue el despacho: la flecha «Pedido pagado» del cuadro Carrito, el bot de después
    del comprobante (Agente → Compra) o, sin ninguno, el asesor."""
    cfg = _cfg()
    primero = [flujo.m_texto(_con_total((cfg.get("texto_validado") or "✅ Recibimos tu comprobante.").strip(), c))]
    _limpiar(st)
    st["pausa"] = False
    st["campos"]["Etiqueta"] = "Pago-Validado"
    listo = _salida(st, c, "listo")
    if listo:
        return primero + _ir_a_salida(st, c, listo)
    despues = cfg.get("compra_bot_despues")
    if despues and db.flujo(despues):
        return primero + flujo.cambiar_de_bot(st, despues)
    st["pausa"], st["nodo"] = True, flujo.del_tipo("asesor")  # sin bot de despacho: sigue el asesor
    return primero


def _rechazado(st, c):
    """RAG-66: el motivo al cliente y la compra vuelve a esperar el pago. Tras el segundo rechazo el chat se queda con el asesor."""
    cfg = _cfg()
    texto = _con_total((cfg.get("texto_rechazado") or "😕 No pudimos validar tu pago: {motivo}. Envíanos de nuevo el comprobante.")
                       .strip(), c).replace("{motivo}", (c.get("motivo") or "no lo pudimos verificar").rstrip(". ").lower())
    c["paso"] = "esperando_pago"
    for k in ("validacion", "comprobante_en"):
        c.pop(k, None)
    if int(c.get("rechazos") or 0) >= 2:
        st["pausa"], st["nodo"] = True, flujo.del_tipo("asesor")
    else:
        st["pausa"], st["nodo"] = False, NODO
        st["espera_hasta"] = (datetime.now(timezone.utc) + timedelta(hours=int(cfg.get("horas_sin_respuesta") or 12))).isoformat()
    return [flujo.m_texto(texto)]


def tiempo_cumplido(st):
    """RAG-22: pasaron las horas sin respuesta esperando el pago. Un solo recordatorio; la compra sigue abierta."""
    st.pop("espera_hasta", None)
    texto = (_cfg().get("texto_sigue_interesado") or "👋 ¿Sigues interesado en el equipo?").strip()
    items = _items(st.get("compra") or {})
    if len(items) > 1:  # RAG-61: con varios equipos, recuerda cuáles eran
        texto += "\n\n" + "\n".join(f"💻 {i['equipo']} · {i['codigo']}" for i in items)
    return [flujo.m_texto(texto)]

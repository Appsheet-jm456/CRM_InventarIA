"""
Flujo de compra sin IA (F4·25, docs/AGENTE.md tramo 2, RAG-19 a RAG-22).

«Quiero comprar <código>» (acción con el paso «Iniciar flujo de compra») → el equipo (el código escrito o el de la última
ficha) → distribuidor o cliente final → resumen con el total → cuentas con el texto aprobado → Esperando pago →
comprobante (foto, PDF o «ya pagué») → Pago por confirmar y el chat pasa al asesor. Cancelar con «ya no quiero».
Si en 12 h no hay respuesta, el reloj manda «¿Sigues interesado?».

Carrito del asesor (F4·72, docs/CARRITO-DEL-ASESOR.md, RCA-01 a RCA-10): el asesor arma el pedido en la Ficha y lo envía; la
compra arranca en «confirmar» con sus renglones (c["asesor"]). Sus precios se respetan y los renglones libres (c["equipos"][k]["libre"],
código LIBRE-n) no cuentan para stock, video ni «Código producto».

Carrito (F4·44, docs/AGENTE.md §4f, RAG-54 a RAG-62): con Agente → Compra → Carrito encendido (o si la compra empieza en un cuadro
🛒 Carrito del lienzo) la compra pregunta «¿Quieres agregar otro equipo?», arma una lista en st["compra"]["equipos"] y el resumen,
las cuentas, la nota del asesor y la cotización llevan todos. Apagado, todo sigue con un solo equipo, como antes.

Aumentar RAM o disco (F4·73, docs/AMPLIACIONES-RAM-DISCO.md, RAM-01 a RAM-08): opción del resumen del carrito; el aumento entra como
renglón libre con la marca «ampliacion» (de qué equipo es) y sigue a su equipo: si el equipo se quita o se vende, sale con él.

El estado va en st["compra"] (se guarda en leads.estado_bot). Mientras hay compra, st["nodo"] es "COMPRA".
Precios: siempre los de la tabla productos; el cargo de configuración y los textos salen de agente_config.
"""

import re
from datetime import datetime, timedelta, timezone

import ampliacion
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
    c = st.get("compra") or {}
    # F4·73b (RAM-09): el pedido armado (con sus aumentos) se guarda 24 h por si el asesor vuelve a iniciar la compra.
    if _carrito(c) and c.get("equipos") and c.get("paso") not in ("esperando_pago", "pago_por_confirmar"):
        st["pedido_previo"] = {"equipos": c["equipos"], "tipo": c.get("tipo"), "en": datetime.now(timezone.utc).isoformat()}
    st.pop("compra", None)
    st.pop("espera_hasta", None)
    if st.get("nodo") == NODO:
        st["nodo"] = None


def _aplicar_tipo(st, lead):
    """F4·48: si ya se sabe si compra como distribuidor o como cliente final (menú, respuesta anterior o ficha), no se pregunta."""
    tipo = flujo.tipo_cliente(st, lead)
    if tipo:
        st["compra"]["tipo"] = tipo


def _producto_por_codigo(cod):
    return next((p for p in flujo.inventario() if p["cod"] and p["cod"].upper() == str(cod).upper()), None)


def _items(c):
    """Los equipos del pedido: la lista del carrito o, en una compra de un equipo (o de antes de F4·44), ese solo."""
    if c.get("equipos"):
        return c["equipos"]
    return [{"codigo": c["codigo"], "equipo": c.get("equipo") or "", "precio": c.get("precio") or 0}] if c.get("codigo") else []


def _equipos(c):
    """Los renglones que no son aumentos (F4·73, RAM-08: el máximo del carrito no cuenta los aumentos)."""
    return [i for i in _items(c) if not i.get("ampliacion")]


def _carrito(c):
    return bool(c.get("carrito"))


def _alternativas(vendidos, maximo=3):
    """F4·66 (RPD-54): hasta 3 equipos con stock parecidos a los vendidos: de la misma marca y del precio más cercano; si no hay de la
    marca, los de precio más cercano. Nunca uno de los vendidos."""
    fuera = {str(i.get("codigo", "")).upper() for i in vendidos}
    libres = [p for p in flujo.inventario() if p["cod"].upper() not in fuera]
    precio = next((int(i.get("precio") or 0) for i in vendidos if i.get("precio")), 0)
    marcas = {str(i.get("marca") or i.get("equipo", "").split(" ")[0]).upper() for i in vendidos} - {""}
    cerca = (lambda p: abs(p["precio"] - precio)) if precio else (lambda p: p["precio"])
    misma = sorted((p for p in libres if p["marca"].upper() in marcas), key=cerca)
    return (misma or sorted(libres, key=cerca))[:maximo]


def _vendidos(c):
    """F4·66 (RPD-53): los equipos del pedido que ya no tienen stock, según la base en este momento (no la copia de 30 s).
    Los renglones libres del carrito del asesor (F4·72) no son del inventario: nunca cuentan."""
    items = [i for i in _items(c) if not i.get("libre")]
    try:
        agotados = db.sin_stock([i["codigo"] for i in items])
    except Exception:  # si la base no responde, sigue con la copia del inventario como antes
        agotados = {i["codigo"].upper() for i in items if not _producto_por_codigo(i["codigo"])}
    return [i for i in items if i["codigo"].upper() in agotados]


def _texto_vendidos(idos, accion):
    nombres = ", ".join(f"*{i['equipo']}* ({i['codigo']})" for i in idos)
    uno = len(idos) == 1
    return f"😕 {nombres} {'se acaba de vender y ya no está disponible' if uno else 'se acaban de vender y ya no están disponibles'}{accion}"


def _mensajes_agotado(idos, alternativas=True):
    """RPD-54: el aviso, las alternativas (si hay) y «Ver equipos · Hablar con asesor». La compra ya terminó."""
    mensajes = [flujo.m_texto(_texto_vendidos(idos, "."))]
    otros = _alternativas(idos) if alternativas else []
    if otros:
        mensajes.append(flujo.lista_equipos("Te puede interesar uno de estos 👇", otros, "Toca uno o escríbeme su *código*."))
    mensajes.append(flujo.m_botones("¿Qué prefieres?", [("0", "Ver equipos"), ("9", "Hablar con asesor")]))
    return mensajes


def _maximo():
    return max(2, min(10, int(_cfg().get("carrito_max") or 5)))


def _que_lleva(c):
    """Para las notas del asesor: «Dell Latitude 5420 (100-102-1030-1) + HP 840 (100-101-1050)»."""
    return " + ".join(i["equipo"] if i.get("libre") else f"{i['equipo']} ({i['codigo']})" for i in _items(c)) or "equipo sin elegir"


def _marcas(texto, c, nombre=""):
    """{n} equipos en el pedido, {max} el máximo y {nombre} el del cliente (sin nombre, «¡Hola !» queda «¡Hola!»)."""
    t = texto.replace("{n}", str(len(_equipos(c)))).replace("{max}", str(_maximo())).replace("{nombre}", nombre)
    return re.sub(r" +([!,.?])", r"\1", t)


def _renglon(k, i):
    if i.get("ampliacion"):  # F4·73 (RAM-06)
        return f"{k}. ⚡ {i['equipo']}\n     💰 {flujo.cop(i['precio'])}"
    if i.get("libre"):  # F4·72 (RCA-03): fuera del inventario, sin código
        return f"{k}. 📦 {i['equipo']}\n     💰 {flujo.cop(i['precio'])}"
    return f"{k}. 💻 {i['equipo']} · Código {i['codigo']}\n     💰 {flujo.cop(i['precio'])}"


def _resumen(c):
    if _carrito(c) or c.get("asesor"):
        items = _items(c)
        cab = (_cfg().get("carrito_encabezado") or "🛒 *Resumen de tu pedido*").strip()
        lineas = [cab] + [_renglon(k, i) for k, i in enumerate(items, 1)]
        if c["tipo"] == "cliente_final" and c["cargo"]:  # F4·48: una sola vez por pedido, sea cual sea el número de equipos
            lineas.append(f"🔧 Configuración (Windows, programas base, navegadores y Office · 1 sola vez por pedido): {flujo.cop(c['cargo'])}")
        if c.get("asesor"):  # F4·72: el asesor arma el pedido; el cliente solo confirma
            return "\n".join(lineas + [f"*Total ({len(items)} {'producto' if len(items) == 1 else 'productos'}): {flujo.cop(c['total'])}*",
                                        "", "¿Confirmas tu pedido? Te envío los datos para pagar."])
        eq, amp = len(_equipos(c)), len(items) - len(_equipos(c))
        cuenta = f"{eq} {'equipo' if eq == 1 else 'equipos'}" + (f" + {amp} {'aumento' if amp == 1 else 'aumentos'}" if amp else "")
        lineas += [f"*Total ({cuenta}): {flujo.cop(c['total'])}*"]
        return "\n".join(lineas)
    lineas = [f"🛒 *Resumen de tu compra*", f"💻 {c['equipo']} · Código {c['codigo']}", f"💰 Precio: {flujo.cop(c['precio'])}"]
    if c["tipo"] == "cliente_final" and c["cargo"]:
        lineas.append(f"🔧 Configuración: {flujo.cop(c['cargo'])}")
    lineas += [f"*Total: {flujo.cop(c['total'])}*", "", "¿Te envío los datos para pagar?"]
    return "\n".join(lineas)


def mensajes_cuentas(cuentas, fresco=False):
    """F4·49: los datos para pagar. Primero la imagen de los medios de pago (la de la ficha activa «Pagos» de Agente → Conocimiento, si
    tiene archivo) y después el texto aprobado. Sin imagen, solo el texto, como antes."""
    imagen = next((f for f in db.conocimiento("Pagos", fresco) if f.get("archivo")), None)
    instructivo = (db.agente_config(fresco).get("texto_instructivo_pago") or "").strip()  # F4·68 (RAG-81): qué hacer después de pagar
    return ([{"_conocimiento": {"archivo": imagen["archivo"], "titulo": imagen.get("titulo") or "Medios de pago"}}] if imagen else []) \
        + [flujo.m_texto(cuentas)] + ([flujo.m_texto(instructivo)] if instructivo else [])


def _pedir_tipo(st):
    st["compra"]["paso"] = "tipo"
    return [flujo.m_botones("¿Compras como *distribuidor* o como *cliente final*?",
                            [("compra-distribuidor", "Distribuidor"), ("compra-final", "Cliente final")])]


# Opciones del resumen con carrito (RAG-58 y RAG-60): lista, porque WhatsApp deja solo 3 botones.
OPCIONES_RESUMEN = [("compra-si", "Confirmar pedido", "Te envío los datos para pagar"),
                    ("compra-agregar", "Agregar otro equipo", ""),
                    ("compra-ampliar", "Aumentar RAM o disco", "Más memoria o más espacio"),  # F4·73
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
            if not (o[0] == "compra-agregar" and len(_equipos(c)) >= _maximo()) and not (o[0] == "compra-quitar" and len(items) < 2)
            and not (o[0] == "compra-ampliar" and not ampliacion.disponible(c, _cfg()))]


def _confirmar(st):
    c = st["compra"]
    aviso = []
    vendidos = {i["codigo"].upper() for i in _vendidos(c)}  # F4·66 (RPD-53): stock en la base en este momento
    if c.get("asesor"):  # F4·72 (RCA-08): precios del asesor; solo se quita lo que se vendió, con aviso
        vigentes, idos = [], []
        for i in _items(c):
            if i.get("libre") or (i["codigo"].upper() not in vendidos and flujo.equipo_por_codigo(i["codigo"])):
                vigentes.append(i)
            else:
                idos.append(i)
        if not vigentes:
            _limpiar(st)
            return _mensajes_agotado(idos)
        if idos:
            aviso = [flujo.m_texto(_texto_vendidos(idos, ", lo quité de tu pedido." if len(idos) == 1 else ", los quité de tu pedido."))]
        c["equipos"] = vigentes
        c.update(codigo=vigentes[0]["codigo"], equipo=vigentes[0]["equipo"], precio=vigentes[0]["precio"])
    elif vendidos and not _carrito(c):  # RPD-54: el único equipo se vendió mientras compraba
        idos = _items(c)
        _limpiar(st)
        return _mensajes_agotado(idos)
    elif _carrito(c):  # RAG-57: precios de la base al armar el resumen; un equipo agotado se quita con aviso
        vigentes, idos = [], []
        for i in _items(c):
            if i.get("ampliacion"):  # F4·73: los aumentos siguen a su equipo (abajo)
                continue
            p = None if i["codigo"].upper() in vendidos else _producto_por_codigo(i["codigo"])
            if p:
                vigentes.append({"codigo": p["cod"], "equipo": f"{p['marca']} {p['modelo']}".strip(), "precio": p["precio"]})
            else:
                idos.append(i)
        if idos and not vigentes:
            _limpiar(st)
            return _mensajes_agotado(idos)
        if idos:
            aviso = [flujo.m_texto(_texto_vendidos(idos, ", lo quité de tu pedido." if len(idos) == 1 else ", los quité de tu pedido."))]
            otros = _alternativas(idos)
            if otros:
                aviso.append(flujo.lista_equipos("Te puede interesar uno de estos 👇", otros, "Toca uno o escríbeme su *código*."))
        c["equipos"] = _con_aumentos(vigentes, _items(c))
        c.update(codigo=vigentes[0]["codigo"], equipo=vigentes[0]["equipo"], precio=vigentes[0]["precio"])
    for k in ("ampliar", "ofertas"):
        c.pop(k, None)
    items = _items(c)
    if c.get("asesor"):  # F4·72 (RCA-05): equipos del inventario de cualquier categoría; los libres no cuentan; el asesor puede quitarla
        usados = not c.get("sin_configuracion") and any(
            flujo.lleva_configuracion((flujo.equipo_por_codigo(i["codigo"]) or {}).get("estado")) for i in items if not i.get("libre"))
    else:
        usados = any(flujo.lleva_configuracion((_producto_por_codigo(i["codigo"]) or {}).get("estado")) for i in items)
    cargo = int(float(_cfg().get("cargo_configuracion") or 0)) if c["tipo"] == "cliente_final" and usados else 0
    c.update(cargo=cargo, total=sum(int(i["precio"]) for i in items) + cargo, paso="confirmar")  # F4·48: una vez por pedido, solo si hay usados
    st["valor"] = c["total"]
    # Los renglones libres no van en «Código producto»: no son del inventario ni pasan por el Servicio técnico (RCA-03).
    st["campos"].update({"Código producto": ", ".join(i["codigo"] for i in items if not i.get("libre")), "Valor estimado": flujo.cop(c["total"])})
    if c.get("asesor"):
        return aviso + [flujo.m_botones(_resumen(c), [("compra-si", "✅ Sí, confirmar"), ("compra-asesor", "Hablar con asesor"),
                                                      ("compra-cancelar", "Cancelar")])]
    if _carrito(c):
        opciones = _opciones_resumen(c)
        c["opciones"] = [i for i, _, _ in opciones]
        return aviso + [_menu(_resumen(c), opciones)]
    return [flujo.m_botones(_resumen(c), [("compra-si", "Sí, enviar cuentas"), ("compra-asesor", "Hablar con asesor"),
                                          ("compra-cancelar", "Cancelar")])]


def _con_aumentos(equipos, antes):
    """F4·73 (RAM-07): cada equipo seguido de sus aumentos; los de un equipo que ya no está, fuera."""
    salida = []
    for e in equipos:
        salida.append(e)
        salida += [a for a in antes if a.get("ampliacion") and a["ampliacion"]["de"].upper() == str(e["codigo"]).upper()]
    return salida


def _seguir(st, lead=None):
    """Terminó de elegir equipos: el tipo de cliente si falta y el resumen."""
    if not st["compra"].get("tipo"):
        return _pedir_tipo(st)
    return _confirmar(st)


def _preguntar_otro(st, lead=None):
    """RAG-56: «¿Quieres agregar otro equipo?» o, en el máximo, el aviso y el resumen."""
    c = st["compra"]
    nombre = ((lead or {}).get("nombre") or "").split(" ")[0]
    if len(_equipos(c)) >= _maximo():
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
        _aplicar_tipo(st, lead)
        return _agregar(st, p, lead)
    st["compra"].update(codigo=p["cod"], equipo=f"{p['marca']} {p['modelo']}".strip(), precio=p["precio"])
    _aplicar_tipo(st, lead)
    if not st["compra"].get("tipo"):
        return _pedir_tipo(st)
    return _confirmar(st)


def desde_asesor(st, carrito, lead=None):
    """F4·72 (RCA-07 y RCA-08): el asesor envió el carrito que armó en la Ficha. La compra arranca en «confirmar» con sus renglones y
    precios; el cliente responde Sí → cuentas. `carrito` es la fila de la tabla carritos. Devuelve los mensajes."""
    items = [{k: v for k, v in i.items() if k in ("codigo", "equipo", "precio", "libre")} for i in (carrito or {}).get("items") or []]
    if not items:
        return []
    for i in items:
        i["precio"] = int(float(i["precio"]))
    tipo = {"Distribuidor": "distribuidor", "Cliente final": "cliente_final"}.get((carrito or {}).get("tipo")) or flujo.tipo_cliente(st, lead)
    st["compra"] = {"paso": "confirmar", "asesor": True, "desde": datetime.now(timezone.utc).isoformat(), "equipos": items,
                    "tipo": tipo or "cliente_final", "sin_configuracion": bool((carrito or {}).get("sin_configuracion")),
                    "codigo": items[0]["codigo"], "equipo": items[0]["equipo"], "precio": items[0]["precio"]}
    st["nodo"] = NODO
    st.pop("espera_hasta", None)
    flujo.recordar_tipo(st, st["compra"]["tipo"])
    return _confirmar(st)


def _asesor(st, motivo=None):
    """Pasa al asesor con el aviso de horario del cuadro asesor; la compra queda anotada para el asesor."""
    return flujo.asesor(st, etiqueta="Escalado-Asesor", motivo=motivo)


def _previo(st, texto):
    """F4·73b (RAM-09): el pedido que el cliente ya tenía armado: el de la compra en curso (antes de las cuentas) o el guardado al salir
    de ella en las últimas 24 h. No vale si el cliente escribió otro código: entonces la compra empieza con ese equipo."""
    c = st.get("compra") or {}
    if _carrito(c) and not c.get("asesor") and c.get("paso") not in ("esperando_pago", "pago_por_confirmar") and c.get("equipos"):
        previo = {"equipos": c["equipos"], "tipo": c.get("tipo")}
    else:
        previo = st.get("pedido_previo") or {}
        try:
            if datetime.now(timezone.utc) - datetime.fromisoformat(previo.get("en")) > timedelta(hours=24):
                previo = {}
        except (TypeError, ValueError):
            previo = {}
    st.pop("pedido_previo", None)
    equipos = [i for i in previo.get("equipos") or [] if i.get("codigo")]
    if not any(not i.get("ampliacion") for i in equipos):
        return None
    p = flujo.buscar_codigo(texto) if texto else None
    if p and not any(i["codigo"].upper() == p["cod"].upper() for i in equipos):
        return None
    return {"equipos": equipos, "tipo": previo.get("tipo")}


def iniciar(st, texto, lead=None, cuadro=None):
    """Lo llama la acción «Quiero comprar» (RAG-19) o el cuadro 🛒 Carrito del lienzo (`cuadro`, RAG-55).
    Devuelve los mensajes."""
    previo = _previo(st, texto)
    st["compra"] = {"paso": "codigo", "desde": datetime.now(timezone.utc).isoformat()}
    if cuadro or _cfg().get("carrito_activo"):
        st["compra"]["carrito"] = True
    if cuadro:  # las flechas del cuadro: después del comprobante y si pide asesor
        st["compra"]["salidas"] = {k: v for k, v in (cuadro.get("salidas") or {}).items() if v}
        st["compra"]["bot"] = getattr(flujo._hilo, "bot", None) or st.get("bot")
    st["nodo"] = NODO
    st.pop("espera_hasta", None)
    if previo and _carrito(st["compra"]):  # F4·73b (RAM-09): vuelve el mismo pedido, con sus aumentos
        st["compra"]["equipos"] = previo["equipos"]
        primero = next(i for i in previo["equipos"] if not i.get("ampliacion"))
        st["compra"].update(codigo=primero["codigo"], equipo=primero["equipo"], precio=primero["precio"])
        if previo.get("tipo"):
            st["compra"]["tipo"] = previo["tipo"]
        _aplicar_tipo(st, lead)
        return _seguir(st, lead)
    p = flujo.buscar_codigo(texto)
    if not p and _carrito(st["compra"]):  # viene de cotizar un pedido con varios equipos: entran todos, no solo el primero
        codigos = [k.strip() for k in ((st.get("campos") or {}).get("Código producto") or "").split(",") if k.strip()]
        vigentes = [q for q in (_producto_por_codigo(k) for k in codigos) if q]
        if len(vigentes) > 1:
            st["compra"]["equipos"] = [{"codigo": q["cod"], "equipo": f"{q['marca']} {q['modelo']}".strip(), "precio": q["precio"]}
                                       for q in vigentes[:_maximo()]]
            first = st["compra"]["equipos"][0]
            st["compra"].update(codigo=first["codigo"], equipo=first["equipo"], precio=first["precio"])
            _aplicar_tipo(st, lead)
            return _seguir(st, lead)
    if not p and (st.get("campos") or {}).get("Código producto"):  # el de la última ficha que vio
        p = _producto_por_codigo(st["campos"]["Código producto"].split(",")[0].strip())
    if not p and (lead or {}).get("cotiz_producto"):
        p = _producto_por_codigo(lead["cotiz_producto"])
    if p:
        return _con_equipo(st, p, lead)
    if re.search(r"\d{3}-\d{3}", texto) or re.search(r"\bpu-?\d+", texto.lower()):
        _limpiar(st)  # escribió un código que ya no está disponible
        limpio = re.sub(r"\s", "", texto.upper())
        ido = next((a for a in sorted(db.productos_agotados(), key=lambda a: -len(a["codigo"])) if a["codigo"].upper() in limpio), None)
        if ido:  # F4·66 (RPD-54): se vendió: dice cuál y ofrece parecidos
            equipo = f"{ido['marca']} {ido['modelo']}".strip()
            return _mensajes_agotado([{"codigo": ido["codigo"], "equipo": equipo, "marca": ido["marca"]}])
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
            st.pop("pedido_previo", None)  # canceló: no se le vuelve a ofrecer
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
        flujo.recordar_tipo(st, c["tipo"])  # F4·48: no se vuelve a preguntar
        return _confirmar(st), [], None, None

    if paso == "confirmar":
        if entrada == "compra-si" or n in ("si", "1", "dale", "listo", "ok", "de una") or n.startswith("si "):
            if True:  # RAG-57 y F4·66 (RPD-53): antes de las cuentas, cada equipo sigue con stock en la base (con o sin carrito)
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
            return mensajes_cuentas(cuentas), ["Compra-Iniciada"], "esperando_pago", nota  # F4·49: imagen y luego el texto
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
        if entrada == "compra-ampliar" and ampliacion.disponible(c, _cfg()):
            return _ampliar(st)
        if entrada == "compra-quitar":
            items = _items(c)
            c["paso"] = "quitar"
            return [_menu("¿Cuál quito del pedido?", [(f"quitar-{k}", i["equipo"][:20], f"{i['codigo']} · {flujo.cop(i['precio'])}")
                                                           for k, i in enumerate(items, 1)])]
        if entrada == "compra-cotizar":  # RAG-60: un solo PDF con todos los equipos
            codigos = [i["codigo"] for i in _items(c) if not i.get("libre")]
            tipo = c.get("tipo")
            _limpiar(st)
            return cotizacion.iniciar(st, "", lead, pedido=codigos, tipo=tipo)
        return None
    if paso and paso.startswith("ampliar"):
        return _responder_ampliar(st, c, paso, entrada, n)
    if paso == "quitar":
        items = _items(c)
        m = re.fullmatch(r"(?:quitar-)?(\d+)", entrada.strip()) or re.fullmatch(r"(\d+)", n)
        if m and 1 <= int(m.group(1)) <= len(items):
            quitado = items.pop(int(m.group(1)) - 1)
            if quitado.get("ampliacion"):
                c["equipos"] = items
                return [flujo.m_texto(f"🗑 Quité el *{quitado['equipo']}* de tu pedido.")] + _confirmar(st)
            # F4·73 (RAM-07): con el equipo salen sus aumentos
            c["equipos"] = [i for i in items if not (i.get("ampliacion") and i["ampliacion"]["de"].upper() == quitado["codigo"].upper())]
            if not _equipos(c):
                c["equipos"] = []
                c.pop("codigo", None)
                return [flujo.m_texto(f"🗑 Quité el *{quitado['equipo']}* de tu pedido.")] + _pedir_otro(st, lead)
            return [flujo.m_texto(f"🗑 Quité el *{quitado['equipo']}* ({quitado['codigo']}) de tu pedido.")] + _confirmar(st)
        return _confirmar(st)
    return None


# --------------------------------------------------------------------------- #
# F4·73: aumentar RAM o disco (docs/AMPLIACIONES-RAM-DISCO.md, RAM-01 a RAM-08)
# --------------------------------------------------------------------------- #

SI = ("si", "sí", "dale", "ok", "claro", "de una")
VER_PEDIDO = ("compra-resumen", "Ver mi pedido")


def _ampliar(st):
    """Con un equipo va directo; con varios pregunta a cuál."""
    c = st["compra"]
    eqs = [i for i in _equipos(c) if not i.get("libre")]
    if len(eqs) == 1:
        return _ampliar_que(st, eqs[0]["codigo"])
    c["paso"] = "ampliar_equipo"
    return [_menu("¿A cuál equipo le quieres aumentar la RAM o el disco?",
                  [(f"ampliar-eq-{k}", i["equipo"][:24], i["codigo"]) for k, i in enumerate(eqs, 1)])]


def _equipo_ampliar(c):
    cod = c.get("ampliar")
    return (_producto_por_codigo(cod) or flujo.equipo_por_codigo(cod)) if cod else None


def _ampliar_que(st, cod):
    c = st["compra"]
    c.update(paso="ampliar_que", ampliar=cod)
    p = _equipo_ampliar(c)
    if not p:
        return _confirmar(st)
    tiene = " y ".join(x for x in (f"{p['ram']} de RAM" if p.get("ram") else "", f"{p['disco']} de disco" if p.get("disco") else "") if x)
    return [flujo.m_botones(f"Tu *{p['marca']} {p['modelo']}*{' tiene ' + tiene if tiene else ''}. ¿Qué quieres aumentar?",
                            [("ampliar-ram", "RAM"), ("ampliar-disco", "Disco"), VER_PEDIDO])]


def _ampliar_ram(st, p):
    c = st["compra"]
    estado = ampliacion.estado_ram(p)
    if estado == "onboard":  # RAM-02
        c["paso"] = "ampliar_onboard"
        return [flujo.m_botones("Este equipo tiene la RAM soldada (onboard) y no tiene ranura adicional: no es posible aumentar la RAM.\n\n"
                                "¿Quieres aumentar el disco?", [("ampliar-disco", "Sí"), ("compra-resumen", "No, continuar")])]
    ops = ampliacion.opciones_ram(p) if estado == "ok" else None
    c["paso"] = "ampliar_que"
    if ops is None:  # RAM-02 y RAM-03: sin datos, lo confirma un asesor
        return [flujo.m_botones("Para este equipo un asesor te confirma si se puede ampliar la RAM.",
                                [("ampliar-disco", "Aumentar disco"), ("compra-asesor", "Hablar con asesor"), VER_PEDIDO])]
    if not ops:  # RAM-05
        return [flujo.m_botones(f"Tu equipo ya tiene {p['ram'] or 'esa RAM'}; un asesor te confirma otras opciones de RAM.",
                                [("ampliar-disco", "Aumentar disco"), ("compra-asesor", "Hablar con asesor"), VER_PEDIDO])]
    return _ofrecer(st, p, "🧠 *Aumentar la RAM*", ops)


def _ampliar_disco(st, p):
    c = st["compra"]
    ops = ampliacion.opciones_disco(p, _cfg())
    c["paso"] = "ampliar_que"
    if not ops:  # RAM-05
        return [flujo.m_botones(f"Tu equipo ya tiene {p['disco'] or 'ese disco'}; un asesor te confirma otras opciones de disco.",
                                [("ampliar-ram", "Aumentar RAM"), ("compra-asesor", "Hablar con asesor"), VER_PEDIDO])]
    return _ofrecer(st, p, "💽 *Aumentar el disco*", ops)


def _ofrecer(st, p, titulo, ops):
    c = st["compra"]
    c.update(paso="ampliar_elegir", ofertas=ops)
    filas = [(f"ampliar-op-{k}", f"{ampliacion.texto_gb(o['desde'])} → {ampliacion.texto_gb(o['hasta'])}",
              f"{flujo.cop(o['precio'])} · {o['detalle']}") for k, o in enumerate(ops, 1)]
    texto = f"{titulo} de tu *{p['marca']} {p['modelo']}*:\n" + "\n".join(f"• {t}: {d}" for _, t, d in filas)
    return [flujo.m_lista(texto + "\n\nToca una opción o escribe su número.", filas[:9] + [("compra-resumen", "Ver mi pedido", "Sin aumento")],
                          "Ver opciones")]


def _elegido(st, op):
    """RAM-06: un aumento de RAM y uno de disco por equipo; elegir otro reemplaza el anterior."""
    c = st["compra"]
    p = _equipo_ampliar(c)
    if not p:
        return _confirmar(st)
    cod = c["ampliar"]
    nuevo = ampliacion.renglon(op, f"{p['marca']} {p['modelo']}".strip(), cod)
    otros = [i for i in _items(c) if not (i.get("ampliacion") and i["ampliacion"]["de"].upper() == cod.upper()
                                          and i["ampliacion"]["tipo"] == op["tipo"])]
    equipos = [i for i in otros if not i.get("ampliacion")]
    c["equipos"] = _con_aumentos(equipos, otros + [nuevo])
    return [flujo.m_texto(f"⚡ Agregué *{nuevo['equipo']}* a tu pedido: {flujo.cop(nuevo['precio'])}.")] + _confirmar(st)


def _responder_ampliar(st, c, paso, entrada, n):
    if entrada == "compra-resumen" or n in ("no", "continuar", "no continuar", "listo", "resumen", "mi pedido", "ver mi pedido"):
        return _confirmar(st)
    if paso == "ampliar_equipo":
        eqs = [i for i in _equipos(c) if not i.get("libre")]
        m = re.fullmatch(r"(?:ampliar-eq-)?(\d+)", entrada.strip()) or re.fullmatch(r"(\d+)", n)
        if m and 1 <= int(m.group(1)) <= len(eqs):
            return _ampliar_que(st, eqs[int(m.group(1)) - 1]["codigo"])
        return _ampliar(st)
    p = _equipo_ampliar(c)
    if not p:
        return _confirmar(st)
    if paso == "ampliar_elegir":
        ops = c.get("ofertas") or []
        m = re.fullmatch(r"(?:ampliar-op-)?(\d+)", entrada.strip()) or re.fullmatch(r"(\d+)", n)
        if m and 1 <= int(m.group(1)) <= len(ops):
            return _elegido(st, ops[int(m.group(1)) - 1])
        if m and int(m.group(1)) == len(ops) + 1:
            return _confirmar(st)
    quiere_ram = entrada == "ampliar-ram" or bool(re.search(r"\b(ram|memoria)\b", n))
    quiere_disco = entrada == "ampliar-disco" or bool(re.search(r"\b(disco|ssd|almacenamiento)\b", n))
    if paso == "ampliar_onboard" and (n in SI or n == "1" or n.startswith("si ")):
        quiere_disco = True
    elif paso == "ampliar_onboard" and n == "2":
        return _confirmar(st)
    if paso == "ampliar_que" and n in ("1", "2"):
        quiere_ram, quiere_disco = n == "1", n == "2"
    if quiere_ram:
        return _ampliar_ram(st, p)
    if quiere_disco:
        return _ampliar_disco(st, p)
    if paso == "ampliar_elegir":
        return _ampliar_ram(st, p) if (c.get("ofertas") or [{}])[0].get("tipo") == "ram" else _ampliar_disco(st, p)
    return _ampliar_que(st, c["ampliar"])


# --------------------------------------------------------------------------- #
# F4·46: el asesor valida el comprobante (decisión 0036, RAG-63 a RAG-70)
# --------------------------------------------------------------------------- #

def espera_soporte(st, tipo):
    """El cliente manda un archivo con la compra esperando el pago: lo atiende la compra aunque el chat esté con un asesor (tras dos
    rechazos el chat queda con él y el siguiente soporte también debe llegar a la tarjeta de la Bandeja)."""
    return (st.get("compra") or {}).get("paso") == "esperando_pago" and tipo not in ("text", "button", "interactive")


def _con_total(texto, c):
    """{total} y, con abonos (F4·59), {abono}, {pagado} y {saldo}."""
    for clave in ("total", "abono", "pagado", "saldo"):
        texto = texto.replace("{" + clave + "}", flujo.cop(c.get(clave) or 0))
    return texto


def _si(v):
    return str(v).strip().lower() in ("true", "si", "sí", "1", "yes")


def aumentos_de(st):
    """F4·73c (RAM-10): los aumentos del pedido para la oportunidad: [{de, tipo, desde, hasta, texto, precio}]. Salen de la compra en curso
    o, si ya se cerró (sin texto de cuentas pasa al asesor), del pedido guardado."""
    c = st.get("compra") or {}
    items = c.get("equipos") or (st.get("pedido_previo") or {}).get("equipos") or []
    salida = []
    for i in items:
        a = i.get("ampliacion")
        if a:
            texto = (f"Aumento {'RAM' if a['tipo'] == 'ram' else 'disco'} {ampliacion.texto_gb(a['desde'])} → {ampliacion.texto_gb(a['hasta'])}"
                     + (" NVMe" if " NVMe (" in i["equipo"] else ""))
            salida.append({**{k: a[k] for k in ("de", "tipo", "desde", "hasta")}, "texto": texto, "precio": int(i["precio"])})
    return salida


def _equipos_con_aumentos(equipos, aumentos):
    """RAM-11: cada equipo con sus aumentos debajo («   ⚡ Aumento RAM 8GB → 16GB»); los que no encuentran su equipo, al final."""
    lineas, usados = [], set()
    for e in equipos:
        lineas.append(f"💻 {e.get('nombre') or 'Equipo'} ({e['codigo']})" if e.get("codigo") else f"💻 {e.get('nombre') or 'Equipo'}")
        for k, a in enumerate(aumentos):
            if str(a.get("de") or "").upper() == str(e.get("codigo") or "").upper():
                lineas.append(f"   ⚡ {a.get('texto') or 'Aumento'}")
                usados.add(k)
    lineas += [f"⚡ {a.get('texto') or 'Aumento'}" for k, a in enumerate(aumentos) if k not in usados]
    return "\n".join(lineas)


def resumen_pedido(lead, st, forzar=False, alistamiento=None):
    """F4·64 (RF-46 a RF-51): el «🧾 Resumen de tu pedido» que sale justo después de la política de despacho. Todo sale de la base: el
    pedido (número y equipos), los pagos validados, el total de la oportunidad y los datos de la ficha. Una sola vez por pedido y solo
    si el cliente tiene un pedido con equipos. Devuelve la lista de mensajes (vacía si no corresponde).
    F4·73c (RAM-12): `forzar` (el asesor pulsó «Reenviar resumen») lo envía aunque ya haya salido; `alistamiento` elige el pedido."""
    cfg = _cfg()
    plantilla = (cfg.get("texto_resumen_pedido") or "").strip()
    if not plantilla or not (forzar or cfg.get("resumen_pedido_activo", True)):
        return []
    cual = f"&id=eq.{int(alistamiento)}" if alistamiento else ""
    filas = db.pedir(f"alistamientos?lead_id=eq.{int(lead['id'])}{cual}&cancelado_en=is.null&order=creado_en.desc&limit=1"
                     "&select=id,numero,equipos,aumentos,oportunidad_id,resumen_enviado_en") or []
    if not filas or (filas[0].get("resumen_enviado_en") and not forzar) or not (filas[0].get("equipos") or []):
        return []
    a = filas[0]
    op = (db.pedir(f"oportunidades?id=eq.{int(a['oportunidad_id'])}&select=valor_estimado") or [{}])[0]
    pagos = db.pedir(f"pagos?oportunidad_id=eq.{int(a['oportunidad_id'])}&anulado_en=is.null&select=valor") or []
    total = float(op.get("valor_estimado") or lead.get("valor_estimado") or 0)
    pagado = sum(float(x["valor"]) for x in pagos)
    saldo = max(total - pagado, 0)
    datos = {**(lead.get("atributos") or {}), **(st.get("atributos") or {})}
    envio = datos.get("venta_online")
    envio = _si(envio) if envio not in (None, "") else bool(str(datos.get("direccion_entrega") or "").strip())
    equipos = _equipos_con_aumentos(a["equipos"], a.get("aumentos") or [])
    lineas = []
    if envio:
        for icono, clave in (("👤", "nombre_completo"), ("📱", "celular"), ("📍", "direccion_entrega")):
            if str(datos.get(clave) or "").strip():
                lineas.append(f"{icono} {str(datos[clave]).strip()}")
    marcas = {
        "pedido": f"PED-{int(a['numero']):04d}" if a.get("numero") else "",
        "equipos": equipos, "total": flujo.cop(total), "pagado": flujo.cop(pagado),
        "saldo": f"\n⏳ Saldo pendiente: *{flujo.cop(saldo)}*" if saldo > 0 else "",
        "entrega": "🚚 Envío por transportadora" if envio else "🏬 Recojo en tienda",
        "datos": "\n".join(lineas), "nombre": ((lead.get("nombre") or "").split(" ")[0] or "").strip(),
    }
    texto = plantilla
    for k, v in marcas.items():
        texto = texto.replace("{" + k + "}", v)
    texto = re.sub(r"[ \t]+\n", "\n", re.sub(r"\n{3,}", "\n\n", texto)).strip()
    db.pedir(f"alistamientos?id=eq.{int(a['id'])}", "PATCH", {"resumen_enviado_en": "now"}, "return=minimal")  # RF-50: una sola vez
    return [flujo.m_texto(texto[:4096])]


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
    sin = [] if c.get("stock_descontado") else _vendidos(c)  # F4·66 (RPD-55): se recibe igual, pero el asesor lo sabe
    nota = (f"💳 Comprobante por validar: {_que_lleva(c)} · "
            f"{'distribuidor' if c.get('tipo') == 'distribuidor' else 'cliente final'} · total {flujo.cop(c.get('total', 0))} · "
            f"{('ya abonó ' + flujo.cop(c['pagado']) + ', saldo ' + flujo.cop(c.get('saldo') or 0) + ' · ') if float(c.get('pagado') or 0) > 0 else ''}"
            f"llegó {ahora:%d/%m %H:%M}. Revisa la cuenta bancaria y pulsa ✅ Comprobante validado o ❌ No es válido en la Bandeja.")
    if sin:
        nota = "⚠ Sin stock: " + ", ".join(f"{i['equipo']} ({i['codigo']})" for i in sin) + " ya se vendió a otro cliente. " + nota
    texto = flujo.con_horario(_con_total((cfg.get("texto_soporte") or "📄 Recibimos tu soporte. Un asesor está validando el pago "
                                                                    "y te confirma por aquí {proxima}.").strip(), c))
    return [flujo.m_texto(texto)], ["Pago-Por-Confirmar", "Comprobante-Por-Validar"], "pago_por_confirmar", nota


def resolver_validacion(st, lead=None):
    """Lo llama el receptor cuando una persona pulsó «Comprobante validado» o «No es válido» (la base ya lo registró).
    Devuelve (mensajes, resultado) o None si no hay una validación pendiente. Con el bot del cliente en el hilo."""
    c = st.get("compra") or {}
    v = c.get("validacion")
    if c.get("paso") != "pago_por_confirmar" or v not in ("validado", "rechazado", "abono"):
        return None
    st.setdefault("bot", None)
    if st["bot"] is None:
        st["bot"] = db.principal()
    flujo._hilo.bot, flujo._hilo.saltos = st["bot"], 0
    try:
        return ({"validado": _validado, "rechazado": _rechazado, "abono": _abono}[v](st, c)), v
    finally:
        flujo._hilo.bot, flujo._hilo.saltos = None, 0


def _validado(st, c):
    """RAG-65: «✅ Recibimos tu comprobante.» y sigue el despacho: la flecha «Pedido pagado» del cuadro Carrito, el bot de después
    del comprobante (Agente → Compra) o, sin ninguno, el asesor."""
    cfg = _cfg()
    texto = _con_total((cfg.get("texto_validado") or "✅ Recibimos tu comprobante.").strip(), c)
    if c.get("con_saldo") and float(c.get("saldo") or 0) > 0:  # F4·59 (RPD-45b): se despacha con saldo pendiente
        texto += f"\n\nQueda pendiente un saldo de *{flujo.cop(c['saldo'])}*."
    primero = [flujo.m_texto(texto)]
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


def _abono(st, c):
    """F4·59 (RPD-44 a RPD-46): una persona validó un abono. Le dice al cliente cuánto abonó y el saldo, y la compra vuelve a esperar
    el siguiente soporte (sin despacho todavía). La compra conserva lo pagado y el saldo para el próximo comprobante."""
    cfg = _cfg()
    texto = _con_total((cfg.get("texto_abono") or "✅ Recibimos tu abono de *{abono}*. Queda pendiente un saldo de *{saldo}*. "
                                                  "Quedamos atentos al soporte faltante. 🙌").strip(), c)
    c["paso"] = "esperando_pago"
    for k in ("validacion", "comprobante_en", "motivo"):
        c.pop(k, None)
    st["pausa"], st["nodo"] = False, NODO
    st["espera_hasta"] = (datetime.now(timezone.utc) + timedelta(hours=int(cfg.get("horas_sin_respuesta") or 12))).isoformat()
    return [flujo.m_texto(texto)]


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

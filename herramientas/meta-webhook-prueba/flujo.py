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
import threading
import unicodedata
from contextlib import contextmanager
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
# Horario de atención (tabla horario_atencion, RBOT-06) y flujo de la versión publicada (bot_cuadros, 0026)
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


_hilo = threading.local()


def bot_actual():
    """El bot en el que va el cliente que se está atendiendo en este hilo (decisión 0028)."""
    return getattr(_hilo, "bot", None)


def cuadros():
    """Los cuadros del bot en el que va el cliente: su versión publicada, o la que el simulador puso para ese bot
    (F4·8). None si ese bot ya no tiene versión publicada o se archivó."""
    if getattr(_hilo, "cuadros", None) is not None and getattr(_hilo, "bot_simulado", None) == bot_actual():
        return _hilo.cuadros
    return db.flujo(bot_actual())


@contextmanager
def con_cuadros(otros, bot=None):
    """Corre el motor sobre otra versión de un bot (el borrador, para el simulador) sin tocar la del bot en vivo.
    Si la charla pasa a otro bot, ese usa su versión publicada."""
    _hilo.cuadros, _hilo.bot_simulado = otros, bot if bot is not None else db.principal()
    try:
        yield
    finally:
        _hilo.cuadros = _hilo.bot_simulado = None


def texto_cuadro(clave, **marcas):
    """Texto del cuadro en la versión publicada. Las marcas {x} se cambian por su valor."""
    texto = cuadros()[clave]["texto"]
    for k, v in marcas.items():
        texto = texto.replace("{" + k + "}", str(v))
    return texto


def inicio():
    return next(c["clave"] for c in cuadros().values() if c["inicio"])


def del_tipo(tipo):
    return next((c["clave"] for c in cuadros().values() if c["tipo"] == tipo), None)


def estado_vacio():
    return {"nodo": None, "etapa": "Nuevo", "campos": {}, "errores": 0, "pausa": False, "bot": None}


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


def aplicar(st, efectos):
    """Lo que anota una opción o un cuadro al llegar: campos del cliente, etiqueta y etapa."""
    efectos = efectos or {}
    st["campos"].update(efectos.get("campos") or {})
    if efectos.get("etiqueta"):
        st["campos"]["Etiqueta"] = efectos["etiqueta"]
    if efectos.get("etapa"):
        etapa(st, efectos["etapa"])


def cambiar_de_bot(st, bot):
    """El cliente pasa al inicio de otro bot (RF-17). Si ese bot no tiene versión publicada o se archivó, al principal."""
    st["bot"] = _hilo.bot = bot
    if bot is None or cuadros() is None:
        st["bot"] = _hilo.bot = db.principal()
    st["nodo"] = None
    return ir(st, inicio())


def ir(st, clave):
    """Lleva al cliente a un cuadro y devuelve lo que ve. Un cuadro que ya no existe lleva al inicio."""
    c = cuadros().get(clave) or cuadros()[inicio()]
    if c["tipo"] == "asesor":
        return asesor(st)
    if c["tipo"] == "ir_bot":
        return cambiar_de_bot(st, (c.get("ajustes") or {}).get("bot_id"))
    st["nodo"], st["errores"] = c["clave"], 0
    st["campos"].pop("Errores bot", None)
    aplicar(st, c["al_entrar"])
    return MOSTRAR[c["tipo"]](st, c)


def seguir(st, op):
    """El cliente eligió la opción `op` de un cuadro: anota sus efectos y va a su destino."""
    efectos = op.get("efectos") or {}
    aplicar(st, {"campos": efectos.get("campos"), "etapa": efectos.get("etapa")})
    destino = cuadros().get(op["destino"])
    if destino and destino["tipo"] == "asesor":
        return asesor(st, efectos.get("etiqueta") or "Escalado-Asesor", efectos.get("motivo"))
    aplicar(st, {"etiqueta": efectos.get("etiqueta")})
    if op["destino"] == "@pedir_codigo":
        st["nodo"] = del_tipo("equipos")
        return [m_texto("Envíame el código del equipo 👇")]
    return ir(st, op["destino"])


def coincide(n, palabra):
    """Palabra de una opción: exacta; "*x" si el texto contiene x; "re:x" expresión desde el inicio."""
    if palabra.startswith("re:"):
        return bool(re.match(palabra[3:], n))
    if palabra.startswith("*"):
        return palabra[1:] in n
    return n == palabra


def reconoce(op, n):
    if op.get("reconocer") == "uso":
        return interprete.uso(n) == (op.get("efectos") or {}).get("campos", {}).get("Uso equipo")
    if op.get("reconocer") == "quiere_comprar":
        return interprete.quiere_comprar(n)
    return False


def elegir(c, n):
    """La primera opción que reconoce lo que escribió o tocó el cliente (número, palabras o reconocedor)."""
    for op in c.get("opciones") or []:
        if n == op["id"] or any(coincide(n, p) for p in op.get("palabras") or []) or reconoce(op, n):
            return op
    return None


def opciones_de(c):
    return [(o["id"], o["titulo"], o.get("descripcion", "")) for o in c.get("opciones") or []]


def mostrar_mensaje(st, c):
    texto = texto_cuadro(c["clave"], uso=st["campos"].get("Uso equipo", ""))
    if not c.get("opciones"):  # sin botones (RF-09): espera lo que el cliente escriba
        return [m_texto(texto)]
    return [menu(texto, opciones_de(c))]


def mostrar_presupuesto(st, c):
    return [menu(texto_cuadro(c["clave"]), [(str(i + 1), r[3], r[2]) for i, r in enumerate(RANGOS)])]


def mostrar_marca(st, c):
    marcas = sorted({p["marca"] for p in inventario() if p["marca"]})
    st["marcas"] = marcas
    opciones = [(str(i + 1), m.title(), "") for i, m in enumerate(marcas)]
    opciones.append((str(len(marcas) + 1), "Todas las marcas", ""))
    return [menu(texto_cuadro(c["clave"]), opciones)]


def filtrar(st):
    lo, hi = (st.get("rango") or (0, 10**12))[:2]  # un flujo puede llegar a la marca sin pasar por el presupuesto
    r = [p for p in inventario() if lo <= p["precio"] < hi]
    if st["campos"].get("Marca interés", "Todas") != "Todas":
        r = [p for p in r if p["marca"].upper() == st["campos"]["Marca interés"].upper()]
    if st["campos"].get("Uso equipo") == "Diseño":
        r = [p for p in r if es_diseno(p)]
    return sorted(r, key=lambda p: p["precio"])


def mostrar_equipos(st, c):
    marca = st["campos"].get("Marca interés", "Todas")
    catalogos = mensajes_catalogo("Portátiles", "" if marca == "Todas" else marca)
    r = filtrar(st)
    if not r:
        st["nodo"] = c["clave"] + "-vacio"
        return catalogos + [menu("😕 No tenemos equipos con stock en ese rango ahora mismo.",
                                 [("1", "Cambiar presupuesto", ""), ("9", "Hablar con asesor", "")])]
    de_marca = "" if marca == "Todas" else f" *{marca}*"  # "Equipos *Todas*" se leía raro
    titulo = (f"📎 Equipos{de_marca} con stock en tu rango, desde el inventario "
              f"({len(r)} {'equipo' if len(r) == 1 else 'equipos'}):")
    return catalogos + [lista_equipos(titulo, r)]


def r11(st, p):
    c = cuadros()[del_tipo("ficha")]
    st["nodo"], st["errores"] = c["clave"], 0
    st["campos"].pop("Errores bot", None)
    st["campos"].update({"Código producto": p["cod"], "Valor estimado": cop(p["precio"])})
    st["valor"] = p["precio"]
    etapa(st, "Cotización")
    ficha = (f"💻 *{p['marca']} {p['modelo']}* · Código {p['cod']}\n{p['cpu']} · {p['ram']} · {p['disco']}"
             f"{' · ' + p['estado'] if p['estado'] else ''}\n💰 {cop(p['precio'])} · ✅ Disponible")
    return [m_botones(ficha, [(i, t) for i, t, _ in opciones_de(c)], p["foto"])]


def asesor(st, etiqueta="Escalado-Asesor", motivo=None):
    """Pasa el chat a la cola. Fuera de horario avisa cuándo lo atienden (RBOT-05); el chat entra igual."""
    st["campos"]["Etiqueta"] = etiqueta
    st["pausa"], st["nodo"] = True, del_tipo("asesor")
    aviso = f"_{motivo}_\n\n" if motivo else ""
    abierto, cuando = proxima_apertura()
    if abierto:
        texto = texto_cuadro(st["nodo"], motivo=aviso, horario=texto_horario())
    else:
        texto = texto_cuadro("B-CERRADO", motivo=aviso, horario=texto_horario(), proxima=cuando)
    return [m_texto(texto)]


def error(st):
    st["errores"] += 1
    st["campos"]["Errores bot"] = st["errores"]
    if st["errores"] >= 3:
        return asesor(st, motivo=texto_cuadro("ERROR-3"))
    return [m_texto(texto_cuadro("ERROR"))]


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


MOSTRAR = {"mensaje": mostrar_mensaje, "presupuesto": mostrar_presupuesto, "marca": mostrar_marca,
           "equipos": mostrar_equipos}


# --------------------------------------------------------------------------- #
# Entrada
# --------------------------------------------------------------------------- #

SALUDOS = ("hola", "menu", "inicio", "buenas", "buenos dias", "buenas tardes", "buenas noches")


def al_principal(st):
    """'hola', 'menú', 0 y 'reiniciar' vuelven siempre al bot principal (RF-17)."""
    st["bot"] = _hilo.bot = db.principal()
    return ir(st, inicio())


def responder(st, texto, avisar=None):
    """Devuelve (mensajes, estado) para lo que escribió o tocó el cliente. st viene de leads.

    avisar(texto) envía un aviso inmediato ("Estoy buscando…") cuando la respuesta va a tardar.
    """
    st.setdefault("bot", None)
    if st["bot"] is None:
        st["bot"] = db.principal()
    _hilo.bot = st["bot"]
    try:
        if cuadros() is None:  # su bot se archivó o ya no tiene versión publicada: vuelve al principal
            st["bot"] = _hilo.bot = db.principal()
            st["nodo"] = None
        return _responder(st, texto, avisar)
    finally:
        _hilo.bot = None


def _responder(st, texto, avisar):
    n = normalizar(texto)

    todos = cuadros()
    if n == "reiniciar":
        etapa_actual = st.get("etapa") or "Nuevo"  # reiniciar la charla no devuelve el embudo
        st.clear()
        st.update(estado_vacio(), etapa=etapa_actual)
        return al_principal(st), st
    if st["pausa"]:
        return [], st
    k = st["nodo"]
    c = todos.get(k)
    vacio = k and k.endswith("-vacio") and todos.get(k[:-6], {}).get("tipo") == "equipos"
    if k and n in SALUDOS:
        return al_principal(st), st
    if not k or not (c or vacio or k == "BUSQUEDA"):  # nuevo, o un cuadro que ya no existe: inicio de su bot
        return ir(st, inicio()), st

    tipo = c["tipo"] if c else None
    p = buscar_codigo(texto) if tipo != "presupuesto" else None
    if p:
        return r11(st, p), st
    if n == "9" or "asesor" in n:
        return asesor(st), st
    if n == "0" and (k == "BUSQUEDA" or tipo in ("equipos", "ficha")):
        return al_principal(st), st

    if tipo == "mensaje" and not c.get("opciones") and (c.get("salidas") or {}).get("respuesta"):
        return ir(st, c["salidas"]["respuesta"]), st  # sin botones (RF-09): lo que escriba sigue la flecha
    if tipo in ("mensaje", "ficha"):
        op = elegir(c, n)
        if op:
            return seguir(st, op), st
    elif tipo == "presupuesto":
        monto = interprete.monto(n, contexto_presupuesto=True) if n not in ("1", "2", "3", "4") else None
        if n in ("1", "2", "3", "4") or monto:
            st["rango"] = RANGOS[int(n) - 1] if not monto else rango_de_monto(monto)
            st["campos"]["Presupuesto"] = st["rango"][2]
            etapa(st, "En Conversación")
            return ir(st, c["salidas"]["siguiente"]), st
    elif tipo == "marca":
        marcas = st.get("marcas", [])
        if n.isdigit() and 1 <= int(n) <= len(marcas):
            st["campos"]["Marca interés"] = marcas[int(n) - 1]
            return ir(st, c["salidas"]["siguiente"]), st
        if n == str(len(marcas) + 1) or n == "todas":
            st["campos"]["Marca interés"] = "Todas"
            return ir(st, c["salidas"]["siguiente"]), st
        if normalizar(n).upper() in [m.upper() for m in marcas]:
            st["campos"]["Marca interés"] = n.upper()
            return ir(st, c["salidas"]["siguiente"]), st
        if re.search(r"lenovo|hp|asus|acer|apple|mac", n):
            return [m_texto("Por ahora no tenemos esa marca en stock. Te muestro las que sí hay 👇")] + ir(st, k), st
    elif vacio:
        if n == "1":
            return ir(st, todos[k[:-6]]["salidas"]["cambiar_presupuesto"]), st

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

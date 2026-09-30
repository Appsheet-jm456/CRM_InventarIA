"""
Árbol de respuesta de PRUEBA sobre WhatsApp real (docs/ARBOL-DE-RESPUESTA.md), con el inventario leído
en vivo de Baserow. Es la simulación (docs/simulacion/simulacion-chat.html) llevada al número de prueba
de Meta. No es el motor definitivo (F3·4): el estado vive en memoria y se pierde al reiniciar.

Los menús van como lista interactiva de WhatsApp o botones (P-01): el cliente toca la opción o escribe
el número, y las dos cosas funcionan igual. "reiniciar" quita la pausa de asesor para seguir probando.
"""

import json
import re
import time
import unicodedata
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]

RANGOS = [
    (0, 1_000_000, "Menos de $1.000.000", "< $1 M"),
    (1_000_000, 1_500_000, "$1.000.000 – $1.500.000", "$1 M – $1,5 M"),
    (1_500_000, 2_000_000, "$1.500.000 – $2.000.000", "$1,5 M – $2 M"),
    (2_000_000, 10**12, "Más de $2.000.000", "> $2 M"),
]
ETAPAS = ["Nuevo", "En Conversación", "Cotización"]
HORARIO = "🕗 Lunes a viernes: 8:00 am – 6:00 pm\n🕘 Sábados: 9:00 am – 2:00 pm\nFestivos: cerrado."

estados = {}          # número → estado del cliente (en memoria: es una prueba)
_cache = {"t": 0, "filas": []}


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


def _numero(v):
    s = re.sub(r"[^\d.]", "", str(v or "").replace(",", ""))
    try:
        return int(float(s)) if s else 0
    except ValueError:
        return 0


def _foto(campo):
    """Primera URL del campo Foto; los enlaces de Google Drive pasan a miniatura directa (lib/media.js)."""
    url = (str(campo or "").split(",")[0]).strip()
    m = re.search(r"/d/([\w-]+)|[?&]id=([\w-]+)", url)
    if m and re.search(r"drive\.google\.com|docs\.google\.com", url):
        return f"https://drive.google.com/thumbnail?id={m.group(1) or m.group(2)}&sz=w1600"
    return url or None


def inventario():
    """Portátiles con stock, leídos de Baserow. Se refresca cada 60 s."""
    if time.time() - _cache["t"] < 60:
        return _cache["filas"]
    env = _env_local()
    base = env.get("BASEROW_API_URL") or "https://api.baserow.io"
    url = f"{base}/api/database/rows/table/{env['BASEROW_TABLE_ID']}/?user_field_names=true&size=200"
    filas = []
    while url:
        # Baserow devuelve 403 al agente por defecto de urllib: se manda uno explícito.
        peticion = urllib.request.Request(url, headers={
            "Authorization": f"Token {env['BASEROW_API_TOKEN']}", "User-Agent": "crm-inventaria-prueba/1.0"})
        datos = json.load(urllib.request.urlopen(peticion, timeout=20))
        filas += datos.get("results", [])
        url = datos.get("next")
    valor = lambda x: (x.get("value") if isinstance(x, dict) else x) or ""
    productos = []
    for r in filas:
        if "portatil" not in normalizar(valor(r.get("Categoría"))) or _numero(r.get("Stock")) <= 0:
            continue
        productos.append({
            "cod": str(valor(r.get("Código"))).strip(), "marca": str(valor(r.get("Marca"))).strip(),
            "modelo": str(valor(r.get("Modelo"))).strip(), "cpu": str(valor(r.get("Procesador"))).strip(),
            "ram": str(valor(r.get("RAM"))).strip(), "disco": str(valor(r.get("Almacenamiento"))).strip(),
            "estado": str(valor(r.get("Estado"))).strip(), "precio": _numero(r.get("Precio")),
            "stock": _numero(r.get("Stock")), "foto": _foto(valor(r.get("Foto"))),
        })
    _cache.update(t=time.time(), filas=productos)
    return productos


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
    if imagen:
        interactivo["header"] = {"type": "image", "image": {"link": imagen}}
    return {"type": "interactive", "interactive": interactivo}


def menu(texto, opciones):
    """Texto con las opciones numeradas (por si escribe) + lista o botones para tocar."""
    numeradas = "\n".join(f"{i}️⃣ {t}" for i, t, _ in opciones)
    cuerpo = f"{texto}\n\n{numeradas}"
    if len(opciones) <= 3 and all(len(t) <= 20 for _, t, _ in opciones):
        return m_botones(cuerpo, [(i, t) for i, t, _ in opciones])
    return m_lista(cuerpo, opciones)


# --------------------------------------------------------------------------- #
# Nodos del árbol
# --------------------------------------------------------------------------- #

def etapa(st, nueva):
    if not st["etapa"] or ETAPAS.index(nueva) > ETAPAS.index(st["etapa"]):
        st["etapa"] = nueva


def ir(st, nodo):
    st["nodo"], st["errores"] = nodo, 0
    return NODOS[nodo](st)


def b00(st):
    etapa(st, "Nuevo")
    st["campos"]["Etiqueta"] = "WhatsApp-Bot"
    return [menu("¡Hola! 👋 Bienvenido a *Ventas Virtuales Colombia*, distribuidores al por mayor y detal de "
                 "equipos de cómputo en Cali.\nSoy el *Bot Ventas Virtuales* 🤖 ¿En qué te podemos ayudar hoy?",
                 [("1", "Productos", ""), ("2", "Distribuidores", ""), ("3", "Servicio al cliente", "")])]


def b001a(st):
    return [menu("¡Perfecto! ¿Qué producto estás buscando?",
                 [("1", "Portátiles corporativos", ""), ("2", "Torres Tiny", ""), ("3", "Torres SFF", ""),
                  ("4", "Partes", ""), ("0", "Volver al menú", "")])]


def b001a1(st):
    return [menu("¿Para qué tipo de trabajo necesitas el portátil?",
                 [("1", "Hogar / estudio", ""), ("2", "Ejecutivo / oficina", ""),
                  ("3", "Diseño / edición", ""), ("0", "Volver", "")])]


def b001a2(st):
    return [menu("¿Cuál es tu presupuesto aproximado?",
                 [(str(i + 1), r[3], r[2]) for i, r in enumerate(RANGOS)])]


def b001a3(st):
    return [menu(f"¿Deseas que te enviemos el catálogo de portátiles disponibles para *{st['campos']['Uso equipo']}* "
                 "y así revises cuál te interesa?",
                 [("1", "Sí, el catálogo", ""), ("2", "Hablar con asesor", ""), ("3", "Volver", "")])]


def b001a4(st):
    marcas = sorted({p["marca"] for p in inventario() if p["marca"]})
    st["marcas"] = marcas
    opciones = [(str(i + 1), m.title(), "") for i, m in enumerate(marcas)]
    opciones.append((str(len(marcas) + 1), "Todas las marcas", ""))
    return [menu("¿De qué marca quieres ver los portátiles?\n_(solo aparecen las marcas con stock)_", opciones)]


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
    r = filtrar(st)
    if not r:
        st["nodo"] = "B001A5-vacio"
        return [menu("😕 No tenemos equipos con stock en ese rango ahora mismo.",
                     [("1", "Cambiar presupuesto", ""), ("9", "Hablar con asesor", "")])]
    texto = (f"📎 Catálogo de *{st['campos']['Marca interés']}* armado desde el inventario "
             f"({len(r)} {'equipo' if len(r) == 1 else 'equipos'} con stock):\n\n"
             + "\n".join(f"• {p['cod']} · {p['modelo']} · {p['cpu']} · {p['ram']} · {cop(p['precio'])}" for p in r)
             + "\n\nToca un equipo en la lista o escríbenos su *código*. 0️⃣ Menú principal")
    filas = [(p["cod"], p["cod"], f"{p['modelo']} · {p['ram']} · {cop(p['precio'])}") for p in r[:9]]
    filas.append(("0", "Menú principal", ""))
    return [m_lista(texto, filas, "Ver equipos")]


def r11(st, p):
    st["nodo"], st["errores"] = "R11", 0
    st["campos"].update({"Código producto": p["cod"], "Valor estimado": cop(p["precio"])})
    st["valor"] = p["precio"]
    etapa(st, "Cotización")
    ficha = (f"💻 *{p['marca']} {p['modelo']}* · Código {p['cod']}\n{p['cpu']} · {p['ram']} · {p['disco']}"
             f"{' · ' + p['estado'] if p['estado'] else ''}\n💰 {cop(p['precio'])} · ✅ Disponible")
    return [m_botones(ficha, [("1", "Lo quiero"), ("2", "Ver otro código"), ("0", "Menú principal")], p["foto"])]


def asesor(st, etiqueta="Escalado-Asesor", motivo=None):
    st["campos"]["Etiqueta"] = etiqueta
    st["pausa"], st["nodo"] = True, "B-ASESOR"
    aviso = f"_{motivo}_\n\n" if motivo else ""
    return [m_texto(f"{aviso}¡Entendido! 🙌 En breve un asesor de *Ventas Virtuales Colombia* te atenderá "
                    f"personalmente.\n\n{HORARIO}\n\nSi nos escribes fuera del horario, te respondemos a primera "
                    "hora del siguiente día hábil.\n\n_(Prueba: escribe *reiniciar* para volver a hablar con el bot)_")]


def error(st):
    st["errores"] += 1
    st["campos"]["Errores bot"] = st["errores"]
    if st["errores"] >= 3:
        return asesor(st, motivo="Tres respuestas no reconocidas: te paso con un asesor.")
    return [m_texto("🤔 No entendí tu respuesta. Toca una opción o escribe el *número*, o *MENU* para volver al inicio.")]


NODOS = {"B00": b00, "B001A": b001a, "B001A1": b001a1, "B001A2": b001a2,
         "B001A3": b001a3, "B001A4": b001a4, "B001A5": b001a5}


# --------------------------------------------------------------------------- #
# Entrada
# --------------------------------------------------------------------------- #

def responder(numero, texto):
    """Devuelve (mensajes a enviar, estado) para lo que escribió o tocó el cliente."""
    st = estados.setdefault(numero, {"nodo": None, "etapa": None, "campos": {}, "errores": 0, "pausa": False})
    n = normalizar(texto)

    if n == "reiniciar":
        estados[numero] = st = {"nodo": None, "etapa": None, "campos": {}, "errores": 0, "pausa": False}
        return ir(st, "B00"), st
    if st["pausa"]:
        return [], st
    if not st["nodo"] or n in ("hola", "menu", "inicio", "buenas", "buenos dias", "buenas tardes"):
        return ir(st, "B00"), st

    p = buscar_codigo(texto) if st["nodo"] != "B001A2" else None
    if p:
        return r11(st, p), st
    if n == "9" or "asesor" in n:
        return asesor(st), st

    k = st["nodo"]
    if k == "B00":
        if n == "1" or re.search(r"producto|portatil|torre", n):
            return ir(st, "B001A"), st
        if n in ("2", "3") or re.search(r"distribuidor|mayor|servicio|garantia|soporte", n):
            return asesor(st, motivo="Esta opción aún no está en el bot (F1·7)."), st
    elif k == "B001A":
        if n == "1" or re.search(r"portatil|laptop", n):
            st["campos"].update({"Categoría interés": "Portátiles", "Etiqueta": "Interes-Productos"})
            return ir(st, "B001A1"), st
        if n in ("2", "3", "4"):
            return asesor(st, motivo="Esa categoría aún no está en el bot (F1·7)."), st
        if n in ("0", "volver"):
            return ir(st, "B00"), st
    elif k == "B001A1":
        uso = {"1": "Hogar", "2": "Ejecutivo", "3": "Diseño"}.get(n) or (
            "Hogar" if re.search(r"hogar|casa|estudio", n) else "Ejecutivo" if re.search(r"ejecutivo|oficina", n)
            else "Diseño" if re.search(r"diseno|edicion", n) else None)
        if uso:
            st["campos"].update({"Uso equipo": uso, "Etiqueta": "Interes-Portatil"})
            return ir(st, "B001A2"), st
        if n == "0":
            return ir(st, "B001A"), st
    elif k == "B001A2":
        if n in ("1", "2", "3", "4"):
            st["rango"] = RANGOS[int(n) - 1]
            st["campos"]["Presupuesto"] = st["rango"][2]
            etapa(st, "En Conversación")
            return ir(st, "B001A3"), st
    elif k == "B001A3":
        if n == "1" or re.match(r"^si|catalogo", n):
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
        if re.search(r"lenovo|hp|asus|acer|apple", n):
            return [m_texto("Por ahora no tenemos esa marca en stock. Te muestro las que sí hay 👇")] + ir(st, "B001A4"), st
    elif k == "B001A5-vacio":
        if n == "1":
            return ir(st, "B001A2"), st
    elif k == "B001A5":
        if n == "0":
            return ir(st, "B00"), st
    elif k == "R11":
        if n in ("1", "lo quiero"):
            return asesor(st), st
        if n in ("2", "ver otro codigo"):
            st["nodo"] = "B001A5"
            return [m_texto("Envíame el código del equipo 👇")], st
        if n in ("0", "menu principal"):
            return ir(st, "B00"), st
    return error(st), st

"""
Intérprete de texto libre del bot de PRUEBA (decisión 0016).

Convierte lo que escribe el cliente ("¿qué equipos tienes i5 10 en Dell?") en filtros de búsqueda:
  1. reglas: marca, i3/i5/i7/i9, generación, RAM, montos, uso — instantáneas y gratis;
  2. si no alcanzan, IA: Gemini (si hay clave de AI Studio) y, si falla, qwen3 local (llama.cpp).
La IA SOLO devuelve filtros en JSON; la búsqueda y la respuesta salen de la base con plantilla.
"""

import json
import re
import unicodedata
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]

MARCAS_CONOCIDAS = {"dell": "DELL", "latitude": "DELL", "precision": "DELL", "inspiron": "DELL", "vostro": "DELL",
                    "lenovo": "LENOVO", "thinkpad": "LENOVO", "hp": "HP", "elitebook": "HP", "probook": "HP",
                    "asus": "ASUS", "acer": "ACER", "apple": "APPLE", "macbook": "APPLE", "mac": "APPLE"}
ORDINALES = {"sexta": 6, "septima": 7, "octava": 8, "novena": 9, "decima": 10, "onceava": 11, "undecima": 11,
             "doceava": 12, "duodecima": 12, "treceava": 13}
PALABRAS_MONTO = {"millon y medio": 1_500_000, "un millon": 1_000_000, "dos millones": 2_000_000,
                  "medio millon": 500_000, "millon": 1_000_000}


def _n(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


# --------------------------------------------------------------------------- #
# Datos de un producto
# --------------------------------------------------------------------------- #

def generacion(cpu, columna=""):
    """Generación Intel desde el modelo: i5-8250U → 8, i7-10610U → 10, i5-1145G7 → 11, i5-1245U → 12."""
    if str(columna).strip().isdigit():
        return int(columna)
    m = re.search(r"i[3579]-(\d{4,5})", cpu or "", re.I)
    if not m:
        return None
    d = m.group(1)
    return int(d[:2]) if d.startswith("1") and d[1] in "01234" and len(d) >= 4 else int(d[0])


def _cpu(p):
    m = re.search(r"i([3579])", p["cpu"], re.I)
    return f"i{m.group(1)}" if m else ""


# --------------------------------------------------------------------------- #
# Reglas
# --------------------------------------------------------------------------- #

def monto(n, contexto_presupuesto=False):
    """"1.5 millones", "1.500.000", "1500000", "millón y medio", "2M"; en la pregunta de presupuesto
    también "1.5" o "2" solos (se entienden como millones)."""
    n = _n(n)
    # Primero los números ("1.5 millones", "1.500.000"); las palabras solas ("millón y medio") al final,
    # porque "millones" contiene "millon" y se leería como un millón.
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(millones|millon|mill|m|palos?|barras?)\b", n)
    if m:
        return int(float(m.group(1).replace(",", ".")) * 1_000_000)
    m = re.search(r"\b(un|uno|dos|tres|cuatro)\s*(palos?|barras?|millones|millon)(\s*y\s*medio)?\b", n)
    if m:  # "un palo y medio" = 1.500.000
        base = {"un": 1, "uno": 1, "dos": 2, "tres": 3, "cuatro": 4}[m.group(1)] * 1_000_000
        return base + (500_000 if m.group(3) else 0)
    m = re.search(r"\b(\d{1,3}(?:[.,]\d{3}){1,2}|\d{6,7})\b", n)
    if m:
        return int(re.sub(r"[.,]", "", m.group(1)))
    for palabras, valor in PALABRAS_MONTO.items():
        if re.search(rf"\b{palabras}\b", n):
            return valor
    if contexto_presupuesto:
        m = re.fullmatch(r"(?:hasta |menos de |como )?(\d(?:[.,]\d{1,2})?)", n)
        if m:
            return int(float(m.group(1).replace(",", ".")) * 1_000_000)
    return None


def uso(n):
    n = _n(n)
    if re.search(r"diseno|edicion|render|autocad|video|photoshop|arquitect", n):
        return "Diseño"
    if re.search(r"ejecutivo|oficina|empresa|trabajo", n):
        return "Ejecutivo"
    if re.search(r"hogar|casa|estudi|colegio|universidad", n):
        return "Hogar"
    return None


def quiere_comprar(n):
    return bool(re.search(r"lo quiero|quiero (comprar|ese|este|el equipo)|me interesa|lo compro|como (lo )?pago|comprar(lo)?\b", _n(n)))


def reglas(texto, marcas_en_stock=()):
    n = _n(texto)
    f = {}
    for palabra, marca in MARCAS_CONOCIDAS.items():
        if re.search(rf"\b{palabra}\b", n):
            f["marca"] = marca
            break
    for m in marcas_en_stock:
        if m and re.search(rf"\b{re.escape(_n(m))}\b", n):
            f["marca"] = m.upper()
    m = re.search(r"\b(?:core\s*)?i\s?([3579])\b", n)
    if m:
        f["procesador"] = f"i{m.group(1)}"
        g = re.search(r"\bi\s?[3579]\s*(?:de\s*)?(\d{1,2})\s*(?:a|va|ta|th|gen|generacion|°|ª)?\b", n)
        if g and 6 <= int(g.group(1)) <= 14:
            f["generacion"] = int(g.group(1))
    g = re.search(r"\b(\d{1,2})\s*(?:a|va|ta|th|°|ª)?\s*(?:gen|generacion)\b|\b(?:generacion|gen)\s*(\d{1,2})\b", n)
    if g:
        f["generacion"] = int(g.group(1) or g.group(2))
    for palabra, num in ORDINALES.items():
        if palabra in n:
            f["generacion"] = num
    r = re.search(r"\b(4|8|12|16|32)\s*(?:gb|g|gigas?)\b|\b(4|8|12|16|32)\s*(?:de\s*)?ram\b", n)
    if r:
        f["ram_gb"] = int(r.group(1) or r.group(2))
    valor = monto(n)
    if valor:
        f["precio_max"] = valor
    u = uso(n)
    if u:
        f["uso"] = u
    if re.search(r"barat|economic|menor precio", n):
        f["orden"] = "precio"
    return f


def vale_la_pena_ia(n):
    """Solo frases con al menos dos palabras que parezcan una consulta; no gasta IA en "ok" o "gracias"."""
    palabras = re.findall(r"[a-z0-9]+", _n(n))
    return len(palabras) >= 2 and not re.fullmatch(r"(ok|gracias|listo|bueno|vale|si|no)( .*)?", _n(n))


# --------------------------------------------------------------------------- #
# IA (solo extrae filtros)
# --------------------------------------------------------------------------- #

INSTRUCCION = ("Extrae filtros de búsqueda de portátiles del mensaje de un cliente. Responde SOLO un objeto JSON "
               "con estas claves (null si no se menciona): marca (str), procesador (\"i3\"|\"i5\"|\"i7\"|\"i9\"), "
               "generacion (int), ram_gb (int), precio_max (int en pesos colombianos), "
               "uso (\"Hogar\"|\"Ejecutivo\"|\"Diseño\"). En Colombia \"palo\" o \"barra\" es un millón de pesos "
               "(\"dos palos\" = 2000000) y los equipos cuestan entre 500000 y 5000000. "
               "Si el mensaje no busca un equipo, responde {}.")


def _env():
    env = {}
    for archivo in (".env.local", ".env.meta"):
        ruta = RAIZ / archivo
        if ruta.exists():
            for linea in ruta.read_text(encoding="utf-8").splitlines():
                if "=" in linea and not linea.strip().startswith("#"):
                    k, _, v = linea.partition("=")
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _post(url, cuerpo, cabeceras, espera):
    peticion = urllib.request.Request(url, data=json.dumps(cuerpo).encode(), method="POST",
                                      headers={"Content-Type": "application/json", **cabeceras})
    with urllib.request.urlopen(peticion, timeout=espera) as r:
        return json.load(r)


def _limpiar(crudo):
    m = re.search(r"\{.*\}", crudo or "", re.S)
    if not m:
        return {}
    datos = json.loads(m.group(0))
    f = {k: v for k, v in datos.items() if v not in (None, "", 0) and k in
         ("marca", "procesador", "generacion", "ram_gb", "precio_max", "uso")}
    if "marca" in f:
        f["marca"] = MARCAS_CONOCIDAS.get(_n(f["marca"]), str(f["marca"]).upper())
    return f


def con_ia(texto):
    """Gemini si hay clave de AI Studio (empieza por AIza); si falla, qwen3 local. {} si nada entiende."""
    env = _env()
    clave = env.get("GEMINI_API_KEY", "")
    if clave.startswith("AIza"):
        try:
            modelo = env.get("GEMINI_MODEL") or "gemini-2.5-flash"
            r = _post(f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent",
                      {"systemInstruction": {"parts": [{"text": INSTRUCCION}]},
                       "contents": [{"role": "user", "parts": [{"text": texto}]}],
                       "generationConfig": {"temperature": 0, "responseMimeType": "application/json",
                                            "thinkingConfig": {"thinkingBudget": 0}}},
                      {"x-goog-api-key": clave}, 10)
            return _limpiar(r["candidates"][0]["content"]["parts"][0]["text"])
        except Exception:
            pass
    try:
        base = env.get("OPENAI_BASE_URL") or "http://localhost:8080/v1"
        r = _post(f"{base}/chat/completions",
                  {"model": env.get("OPENAI_MODEL") or "qwen3", "temperature": 0, "max_tokens": 120,
                   "messages": [{"role": "system", "content": INSTRUCCION + " /no_think"},
                                {"role": "user", "content": texto}]},
                  {"Authorization": f"Bearer {env.get('OPENAI_API_KEY', '')}"}, 40)
        return _limpiar(r["choices"][0]["message"]["content"])
    except Exception:
        return {}


# --------------------------------------------------------------------------- #
# Búsqueda
# --------------------------------------------------------------------------- #

def filtrar(productos, f, es_diseno):
    r = productos
    if f.get("marca"):
        r = [p for p in r if p["marca"].upper() == f["marca"].upper()]
    if f.get("procesador"):
        r = [p for p in r if _cpu(p) == f["procesador"]]
    if f.get("generacion"):
        r = [p for p in r if p["gen"] == f["generacion"]]
    if f.get("ram_gb"):
        r = [p for p in r if re.match(rf"{f['ram_gb']}\s*gb", p["ram"], re.I)]
    if f.get("precio_max"):
        r = [p for p in r if p["precio"] <= f["precio_max"] * 1.05]
    if f.get("uso") == "Diseño":
        r = [p for p in r if es_diseno(p)]
    return sorted(r, key=lambda p: p["precio"])


def cercanos(productos, f):
    """Si nada cumple todo, los 3 que más filtros cumplen (a igual puntaje, el más barato)."""
    def puntos(p):
        return sum([
            bool(f.get("marca")) and p["marca"].upper() == f["marca"].upper(),
            bool(f.get("procesador")) and _cpu(p) == f["procesador"],
            bool(f.get("generacion")) and p["gen"] == f["generacion"],
            bool(f.get("ram_gb")) and bool(re.match(rf"{f.get('ram_gb')}\s*gb", p["ram"], re.I)),
            bool(f.get("precio_max")) and p["precio"] <= f["precio_max"] * 1.05,
        ])
    candidatos = [p for p in productos if puntos(p) > 0]
    return sorted(candidatos, key=lambda p: (-puntos(p), p["precio"]))[:3]


def describir(f):
    partes = []
    if f.get("marca"):
        partes.append(f["marca"].title())
    if f.get("procesador"):
        partes.append(f["procesador"] + (f" de {f['generacion']}.ª generación" if f.get("generacion") else ""))
    elif f.get("generacion"):
        partes.append(f"{f['generacion']}.ª generación")
    if f.get("ram_gb"):
        partes.append(f"{f['ram_gb']} GB de RAM")
    if f.get("uso"):
        partes.append(f"para {f['uso'].lower()}")
    if f.get("precio_max"):
        partes.append(f"hasta ${f['precio_max']:,.0f}".replace(",", "."))
    return ", ".join(partes) or "lo que buscas"

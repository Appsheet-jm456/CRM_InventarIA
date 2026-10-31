"""
Extrae el texto de un documento de conocimiento y lo parte en trozos (F4·32, docs/AGENTE.md).

    python3 herramientas/conocimiento/extraer_documento.py <archivo> [--json]

- PDF con texto: pdftotext (poppler, ya instalado). Un PDF escaneado no trae texto: se avisa (OCR fuera de alcance).
- Excel (.xlsx) y CSV: la primera hoja, fila por fila; cada fila es un trozo con sus encabezados («Pregunta: … · Respuesta: …»).
- Texto (.txt, .md): tal cual.

Trozos de unos 800 caracteres que no cortan a mitad de frase y repiten la última frase del anterior para no perder contexto.
Con --json imprime {"fragmentos": [...]} o {"error": "..."}; la app (pestaña Conocimiento → Documentos) lo llama así.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "carga-inventario"))
from cargar_inventario import _leer_csv, _leer_xlsx  # noqa: E402  (el mismo lector de la carga del inventario)

LARGO = 800
MAXIMO = 4000          # el límite de un trozo en la base
MAX_TROZOS = 2000      # un documento más grande se corta aquí y se avisa


class ErrorDocumento(Exception):
    pass


def texto_pdf(ruta):
    r = subprocess.run(["pdftotext", "-enc", "UTF-8", "-nopgbrk", str(ruta), "-"], capture_output=True, timeout=120)
    if r.returncode != 0:
        raise ErrorDocumento("No se pudo leer el PDF. ¿Está dañado o tiene contraseña?")
    texto = r.stdout.decode("utf-8", errors="replace")
    if len(re.sub(r"\s", "", texto)) < 40:
        raise ErrorDocumento("El PDF no tiene texto que leer (parece escaneado o solo imágenes). Súbelo como texto o Word convertido a PDF.")
    return texto


def texto_plano(ruta):
    datos = Path(ruta).read_bytes()
    for codificacion in ("utf-8-sig", "latin-1"):
        try:
            return datos.decode(codificacion)
        except UnicodeDecodeError:
            continue
    raise ErrorDocumento("No se pudo leer el texto del archivo.")


def _limpio(s):
    return re.sub(r"[ \t]+", " ", str(s or "")).strip()


def trozos_de_tabla(filas):
    """Primera fila con al menos dos celdas = encabezados; cada fila siguiente, un trozo."""
    filas = [[_limpio(c) for c in f] for f in filas]
    filas = [f for f in filas if any(f)]
    if not filas:
        raise ErrorDocumento("La hoja está vacía.")
    inicio = next((i for i, f in enumerate(filas) if sum(1 for c in f if c) >= 2), 0)
    encabezados = filas[inicio]
    trozos = []
    for f in filas[inicio + 1:]:
        partes = []
        for j, valor in enumerate(f):
            if valor:
                titulo = encabezados[j] if j < len(encabezados) and encabezados[j] else f"Columna {j + 1}"
                partes.append(f"{titulo}: {valor}")
        if partes:
            trozos.append(" · ".join(partes)[:MAXIMO])
    if not trozos:
        raise ErrorDocumento("La hoja solo tiene encabezados, sin filas con datos.")
    return trozos


def _frases(parrafo):
    return [f for f in re.split(r"(?<=[.!?…])\s+", parrafo) if f.strip()]


def trozos_de_texto(texto):
    """Párrafos agrupados hasta ~800 caracteres; un párrafo largo se parte por frases."""
    parrafos = [_limpio(p.replace("\n", " ")) for p in re.split(r"\n\s*\n", texto.replace("\r", ""))]
    parrafos = [p for p in parrafos if len(p) > 1]
    if not parrafos:
        raise ErrorDocumento("El documento no tiene texto.")
    trozos, actual = [], ""
    for p in parrafos:
        piezas = _frases(p) if len(p) > LARGO else [p]
        for pieza in piezas:
            pieza = pieza[:MAXIMO]
            if actual and len(actual) + len(pieza) + 1 > LARGO:
                trozos.append(actual)
                ultima = _frases(actual)[-1] if _frases(actual) else ""
                actual = (ultima + " " if len(ultima) < 200 else "") + pieza  # repite la última frase corta
            else:
                actual = (actual + " " + pieza).strip()
    if actual:
        trozos.append(actual)
    return [t[:MAXIMO] for t in trozos]


def extraer(ruta):
    tipo = Path(ruta).suffix.lower().lstrip(".")
    if tipo == "pdf":
        trozos = trozos_de_texto(texto_pdf(ruta))
    elif tipo == "xlsx":
        try:
            trozos = trozos_de_tabla(_leer_xlsx(ruta))
        except ErrorDocumento:
            raise
        except Exception:
            raise ErrorDocumento("No se pudo leer el Excel. ¿Es un .xlsx válido?")
    elif tipo == "csv":
        trozos = trozos_de_tabla(_leer_csv(ruta))
    elif tipo in ("txt", "md"):
        trozos = trozos_de_texto(texto_plano(ruta))
    else:
        raise ErrorDocumento("Formato no admitido: sube .txt, .md, .pdf, .xlsx o .csv.")
    aviso = None
    if len(trozos) > MAX_TROZOS:
        aviso = f"El documento es muy largo: se guardaron los primeros {MAX_TROZOS} trozos."
        trozos = trozos[:MAX_TROZOS]
    return trozos, aviso


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    try:
        trozos, aviso = extraer(sys.argv[1])
        salida = {"fragmentos": trozos, "aviso": aviso}
    except ErrorDocumento as e:
        salida = {"error": str(e)}
    if "--json" in sys.argv:
        print(json.dumps(salida, ensure_ascii=False))
    elif "error" in salida:
        sys.exit("✗ " + salida["error"])
    else:
        for i, t in enumerate(salida["fragmentos"], 1):
            print(f"── {i} ({len(t)} caracteres)\n{t}\n")


if __name__ == "__main__":
    main()

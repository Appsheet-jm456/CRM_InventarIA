#!/usr/bin/env python3
"""
Carga la lista de productos desde una hoja de Excel (.xlsx) o CSV a la Supabase del CRM (decisión 0014).

    python3 herramientas/carga-inventario/cargar_inventario.py lista.xlsx            # muestra qué cambiaría
    python3 herramientas/carga-inventario/cargar_inventario.py lista.xlsx --aplicar  # escribe

Reglas:
  - empareja por CÓDIGO: crea los nuevos y actualiza los existentes;
  - un producto que NO viene en la hoja queda con stock 0 (no se borra);
  - rechaza la hoja entera si hay códigos repetidos o vacíos, o precios/stock que no son números;
  - sin --aplicar no escribe nada.

Columnas que reconoce (en cualquier orden, con o sin tildes y mayúsculas; las demás se ignoran):
  código · categoría · descripción · marca · modelo · procesador · generación · ram · almacenamiento (disco)
  · estado (grado) · precio · stock (cantidad) · foto · video
Solo código y precio son obligatorias. Sin lectura de .xlsx externa: usa la biblioteca estándar.
"""

import csv
import io
import json
import re
import sys
import unicodedata
import urllib.request
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

RAIZ = Path(__file__).resolve().parents[2]

COLUMNAS = {
    "codigo": "codigo", "cod": "codigo", "referencia": "codigo", "sku": "codigo",
    "categoria": "categoria", "descripcion": "descripcion", "nombre": "descripcion", "producto": "descripcion",
    "marca": "marca", "modelo": "modelo", "procesador": "procesador", "cpu": "procesador",
    "generacion": "generacion", "gen": "generacion", "ram": "ram", "memoria": "ram",
    "almacenamiento": "almacenamiento", "disco": "almacenamiento", "ssd": "almacenamiento",
    "estado": "estado", "grado": "estado", "precio": "precio", "precio venta": "precio", "valor": "precio",
    "stock": "stock", "cantidad": "stock", "existencias": "stock", "foto": "foto", "fotos": "foto",
    "video": "video",
}
TEXTO = ["categoria", "descripcion", "marca", "modelo", "procesador", "generacion", "ram",
         "almacenamiento", "estado", "foto", "video"]


def _n(s):
    s = unicodedata.normalize("NFD", str(s or "").strip().lower())
    return re.sub(r"\s+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn"))


# --------------------------------------------------------------------------- #
# Lectura de la hoja
# --------------------------------------------------------------------------- #

def _leer_xlsx(ruta):
    """Primera hoja de un .xlsx como lista de filas (listas de textos)."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(ruta) as z:
        compartidos = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns):
                compartidos.append("".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t")))
        libro = ET.fromstring(z.read("xl/workbook.xml"))
        primera = libro.find("m:sheets/m:sheet", ns)
        rid = primera.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        destino = next(r.get("Target") for r in rels if r.get("Id") == rid)
        hoja = ET.fromstring(z.read("xl/" + destino.lstrip("/").removeprefix("xl/")))
    filas = []
    for fila in hoja.iter(f"{{{ns['m']}}}row"):
        celdas = {}
        for c in fila.findall("m:c", ns):
            columna = re.match(r"[A-Z]+", c.get("r")).group(0)
            indice = 0
            for letra in columna:
                indice = indice * 26 + ord(letra) - 64
            tipo, v = c.get("t"), c.find("m:v", ns)
            if tipo == "s" and v is not None:
                valor = compartidos[int(v.text)]
            elif tipo == "inlineStr":
                valor = "".join(t.text or "" for t in c.iter(f"{{{ns['m']}}}t"))
            else:
                valor = v.text if v is not None else ""
                if valor and re.fullmatch(r"-?\d+\.0+", valor):
                    valor = valor.split(".")[0]
            celdas[indice - 1] = valor or ""
        if celdas:
            filas.append([celdas.get(i, "") for i in range(max(celdas) + 1)])
    return filas


def _leer_csv(ruta):
    texto = Path(ruta).read_bytes().decode("utf-8-sig", errors="replace")
    separador = ";" if texto.count(";") > texto.count(",") else ","
    return [f for f in csv.reader(io.StringIO(texto), delimiter=separador)]


def leer_hoja(ruta):
    filas = _leer_xlsx(ruta) if str(ruta).lower().endswith((".xlsx", ".xlsm")) else _leer_csv(ruta)
    # El encabezado es la primera fila que tenga la columna de código.
    for i, fila in enumerate(filas):
        mapa = {j: COLUMNAS[_n(t)] for j, t in enumerate(fila) if _n(t) in COLUMNAS}
        if "codigo" in mapa.values():
            ignoradas = [t for j, t in enumerate(fila) if t and j not in mapa]
            return mapa, filas[i + 1:], ignoradas, i + 2
    sys.exit("✗ No encontré la columna de código en la hoja (Código, Referencia o SKU).")


def numero(valor, entero=False):
    s = str(valor or "").strip().replace("$", "").replace(" ", "")
    if not s:
        return 0
    if re.fullmatch(r"\d{1,3}([.,]\d{3})+", s):        # 1.450.000 o 1,450,000
        s = re.sub(r"[.,]", "", s)
    elif re.fullmatch(r"\d+,\d{1,2}", s):               # 1450000,50
        s = s.replace(",", ".")
    s = s.replace(",", "")
    v = float(s)
    return int(v) if entero else round(v, 2)


def productos_de(ruta):
    mapa, filas, ignoradas, primera = leer_hoja(ruta)
    if "precio" not in mapa.values():
        sys.exit("✗ La hoja no tiene columna de precio.")
    productos, errores, vistos = [], [], {}
    for k, fila in enumerate(filas, start=primera):
        datos = {destino: (fila[j] if j < len(fila) else "") for j, destino in mapa.items()}
        if not any(str(v).strip() for v in datos.values()):
            continue
        codigo = str(datos.get("codigo", "")).strip()
        if not codigo:
            errores.append(f"fila {k}: sin código")
            continue
        if codigo.upper() in vistos:
            errores.append(f"fila {k}: código {codigo} repetido (ya en la fila {vistos[codigo.upper()]})")
            continue
        vistos[codigo.upper()] = k
        p = {"codigo": codigo, **{c: str(datos.get(c, "")).strip() for c in TEXTO if c in datos}}
        try:
            p["precio"] = numero(datos.get("precio"))
        except ValueError:
            errores.append(f"fila {k} ({codigo}): precio «{datos.get('precio')}» no es un número")
        if "stock" in datos:
            try:
                p["stock"] = numero(datos.get("stock"), entero=True)
            except ValueError:
                errores.append(f"fila {k} ({codigo}): stock «{datos.get('stock')}» no es un número")
        productos.append(p)
    return productos, errores, ignoradas


# --------------------------------------------------------------------------- #
# Supabase
# --------------------------------------------------------------------------- #

def _supa():
    env = {}
    for linea in (RAIZ / "supabase/.env").read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.strip().startswith("#"):
            k, _, v = linea.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    return f"http://localhost:{env.get('KONG_HTTP_PORT', '8020')}/rest/v1", env["SERVICE_ROLE_KEY"]


def pedir(ruta, metodo="GET", cuerpo=None, prefer="return=minimal"):
    rest, clave = _supa()
    peticion = urllib.request.Request(
        f"{rest}/{ruta}", method=metodo, data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers={"apikey": clave, "Authorization": f"Bearer {clave}", "Content-Type": "application/json",
                 "Prefer": prefer})
    with urllib.request.urlopen(peticion, timeout=60) as r:
        texto = r.read().decode()
        return json.loads(texto) if texto else None


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    ruta, aplicar = sys.argv[1], "--aplicar" in sys.argv
    hoja, errores, ignoradas = productos_de(ruta)
    if ignoradas:
        print(f"· columnas que no se usan: {', '.join(ignoradas)}")
    if errores:
        print("✗ La hoja tiene errores; no se cargó nada:\n  " + "\n  ".join(errores))
        sys.exit(1)

    actuales = {p["codigo"].upper(): p for p in pedir("productos?select=*", prefer="")}
    nuevos = [p for p in hoja if p["codigo"].upper() not in actuales]
    cambian = []
    for p in hoja:
        a = actuales.get(p["codigo"].upper())
        if a and any(str(a[c]) != str(v) and not (c == "precio" and float(a[c]) == float(v)) for c, v in p.items()):
            cambian.append(p)
    en_hoja = {p["codigo"].upper() for p in hoja}
    sin_stock = [a for c, a in actuales.items() if c not in en_hoja and a["stock"] != 0]

    print(f"Hoja: {len(hoja)} productos · nuevos: {len(nuevos)} · cambian: {len(cambian)} · "
          f"quedan sin stock (no vienen en la hoja): {len(sin_stock)}")
    for p in nuevos[:15]:
        print(f"  + {p['codigo']}  {p.get('marca', '')} {p.get('modelo', '')}  ${p['precio']:,.0f}".replace(",", "."))
    for p in cambian[:15]:
        a = actuales[p["codigo"].upper()]
        difs = [f"{c}: {a[c]} → {v}" for c, v in p.items() if str(a[c]) != str(v) and c != "codigo"
                and not (c == "precio" and float(a[c]) == float(v))]
        print(f"  ~ {p['codigo']}  " + "; ".join(difs))
    for a in sin_stock[:15]:
        print(f"  0 {a['codigo']}  (stock {a['stock']} → 0)")

    if not aplicar:
        print("\nNo se escribió nada. Para cargar: agrega --aplicar")
        return
    for p in nuevos + cambian:
        p["actualizado_en"] = "now"
    if nuevos or cambian:
        # Upsert por código: se envía cada producto con sus columnas (las que no vienen en la hoja no se tocan).
        for p in nuevos + cambian:
            a = actuales.get(p["codigo"].upper())
            if a:
                pedir(f"productos?id=eq.{a['id']}", "PATCH", {k: v for k, v in p.items() if k != "codigo"})
            else:
                pedir("productos", "POST", p)
    if sin_stock:
        ids = ",".join(str(a["id"]) for a in sin_stock)
        pedir(f"productos?id=in.({ids})", "PATCH", {"stock": 0, "actualizado_en": "now"})
    total = len(pedir("productos?select=id&stock=gt.0", prefer=""))
    print(f"\n✅ Cargado. Productos con stock en Supabase: {total}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Copia el inventario de Baserow a Supabase (tabla productos). Baserow manda mientras la app nueva no
tenga su módulo de Inventario (decisión 0013): aquí solo se lee Baserow y se escribe Supabase.

    python3 herramientas/sync-baserow/sincronizar_inventario.py            # sincroniza
    python3 herramientas/sync-baserow/sincronizar_inventario.py --revisar  # muestra qué cambiaría

Empareja por baserow_id: si en Baserow se cambia un código, se actualiza la misma fila. Solo escribe
las filas que cambiaron y borra las que ya no están en Baserow. Corre cada 5 min con el timer
crm-sync-inventario (systemd de usuario).
"""

import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
REVISAR = "--revisar" in sys.argv
CAMPOS = {  # Baserow → Supabase
    "Código": "codigo", "Categoría": "categoria", "Descripción": "descripcion", "Marca": "marca",
    "Modelo": "modelo", "Procesador": "procesador", "Generación": "generacion", "RAM": "ram",
    "Almacenamiento": "almacenamiento", "Estado": "estado", "Foto": "foto", "Video": "video",
}


def leer_env(ruta):
    env = {}
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.strip().startswith("#"):
            k, _, v = linea.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


LOCAL = leer_env(RAIZ / ".env.local")
SUPA = leer_env(RAIZ / "supabase/.env")
REST = f"http://localhost:{SUPA.get('KONG_HTTP_PORT', '8020')}/rest/v1"
CLAVE = SUPA["SERVICE_ROLE_KEY"]


def pedir(url, metodo="GET", cuerpo=None, cabeceras=None):
    peticion = urllib.request.Request(url, method=metodo, headers=cabeceras or {},
                                      data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
    with urllib.request.urlopen(peticion, timeout=30) as r:
        texto = r.read().decode()
        return json.loads(texto) if texto else None


def numero(v, decimal=False):
    s = str(v or "").replace(",", "").strip()
    s = re.sub(r"[^\d.\-]", "", s)
    if not s:
        return 0
    return round(float(s), 2) if decimal else int(float(s))


def valor(x):
    return ((x.get("value") if isinstance(x, dict) else x) or "").strip() if not isinstance(x, (int, float)) else x


def leer_baserow():
    base = LOCAL.get("BASEROW_API_URL") or "https://api.baserow.io"
    url = f"{base}/api/database/rows/table/{LOCAL['BASEROW_TABLE_ID']}/?user_field_names=true&size=200"
    filas = []
    while url:
        # Baserow responde 403 al agente por defecto de urllib: se manda uno explícito.
        datos = pedir(url, cabeceras={"Authorization": f"Token {LOCAL['BASEROW_API_TOKEN']}",
                                      "User-Agent": "crm-inventaria-sync/1.0"})
        filas += datos["results"]
        url = datos.get("next")
    productos = []
    for r in filas:
        p = {destino: str(valor(r.get(origen)) or "") for origen, destino in CAMPOS.items()}
        p.update(baserow_id=r["id"], precio=numero(r.get("Precio"), decimal=True), stock=numero(r.get("Stock")))
        productos.append(p)
    return productos


def main():
    supa = {"apikey": CLAVE, "Authorization": f"Bearer {CLAVE}", "Content-Type": "application/json"}
    origen = leer_baserow()
    sin_codigo = [p["baserow_id"] for p in origen if not p["codigo"]]
    if sin_codigo:
        print(f"⚠ filas de Baserow sin código (se omiten): {sin_codigo}")
    origen = [p for p in origen if p["codigo"]]

    # Solo las filas que vinieron de Baserow: las cargadas por Excel (sin baserow_id) no se tocan.
    actuales = {p["baserow_id"]: p for p in pedir(f"{REST}/productos?select=*&baserow_id=not.is.null",
                                                   cabeceras=supa)}
    columnas = list(CAMPOS.values()) + ["precio", "stock"]
    cambian = [p for p in origen if p["baserow_id"] not in actuales
               or any(str(actuales[p["baserow_id"]][c]) != str(p[c]) and
                      not (c == "precio" and float(actuales[p["baserow_id"]][c]) == float(p[c])) for c in columnas)]
    vigentes = {p["baserow_id"] for p in origen}
    sobran = [i for i in actuales if i not in vigentes]

    print(f"Baserow: {len(origen)} · Supabase: {len(actuales)} · a escribir: {len(cambian)} · a borrar: {len(sobran)}")
    if REVISAR:
        for p in cambian:
            print(f"  {'nuevo' if p['baserow_id'] not in actuales else 'cambia'}: {p['codigo']}")
        return

    if cambian:
        # actualizado_en lo pone el default al crear; al actualizar se fija con el PATCH de abajo.
        pedir(f"{REST}/productos?on_conflict=baserow_id", "POST", cambian,
              {**supa, "Prefer": "resolution=merge-duplicates,return=minimal"})
        ids = ",".join(str(p["baserow_id"]) for p in cambian)
        pedir(f"{REST}/productos?baserow_id=in.({ids})", "PATCH", {"actualizado_en": "now"},
              {**supa, "Prefer": "return=minimal"})
    if sobran:
        pedir(f"{REST}/productos?baserow_id=in.({','.join(map(str, sobran))})", "DELETE",
              cabeceras={**supa, "Prefer": "return=minimal"})

    total = len(pedir(f"{REST}/productos?select=id&baserow_id=not.is.null", cabeceras=supa))
    estado = "✅" if total == len(origen) else "✗ NO CUADRA"
    print(f"{estado} Supabase queda con {total} productos (Baserow tiene {len(origen)})")
    if total != len(origen):
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as e:
        sys.exit(f"✗ {e.code} {e.url}: {e.read().decode()[:400]}")

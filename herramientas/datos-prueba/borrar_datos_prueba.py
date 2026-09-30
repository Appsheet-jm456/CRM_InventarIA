#!/usr/bin/env python3
"""
Borra los datos de prueba de la Supabase del CRM antes de cargar los reales (decisión 0019).

    python3 herramientas/datos-prueba/borrar_datos_prueba.py            # muestra qué se borraría
    python3 herramientas/datos-prueba/borrar_datos_prueba.py --probar   # borra dentro de una transacción y la deshace
    python3 herramientas/datos-prueba/borrar_datos_prueba.py --borrar   # respalda y borra (pide escribir BORRAR)

Borra: productos, leads, mensajes y catalogos (con sus PDF del bucket), y reinicia sus consecutivos.
No toca: etapas, usuarios, roles ni permisos (son configuración).
Antes de borrar guarda un respaldo de esas tablas en respaldos/ (fuera de git) y archiva el registro del
visor de la demo (conversaciones.jsonl), que tiene teléfonos y mensajes.

Después: cargar la hoja real con
    python3 herramientas/carga-inventario/cargar_inventario.py lista.xlsx [--aplicar]
"""

import json
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CONTENEDOR = "crminventaria-supabase-db"
TABLAS = ["mensajes", "leads", "catalogos", "productos"]
BUCKET = "catalogos"
VISOR = RAIZ / "herramientas/meta-webhook-prueba/conversaciones.jsonl"
RESPALDOS = RAIZ / "respaldos"


def psql(sql, *extra):
    r = subprocess.run(["docker", "exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres",
                        "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", *extra],
                       input=sql, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"✗ {r.stderr.strip()}")
    return r.stdout.strip()


def conteos_sql():
    partes = [f"select '{t}', count(*) from public.{t}" for t in TABLAS]
    partes.append(f"select 'PDF en el bucket', count(*) from storage.objects where bucket_id = '{BUCKET}'")
    return " union all ".join(partes) + ";"


def mostrar(salida, titulo):
    print(titulo)
    for linea in salida.splitlines():
        if "|" in linea:
            tabla, n = linea.split("|")
            print(f"  {tabla:<18} {n}")


BORRADO = f"truncate {', '.join('public.' + t for t in TABLAS)} restart identity;"


def supa():
    env = {}
    for linea in (RAIZ / "supabase/.env").read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.strip().startswith("#"):
            k, _, v = linea.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    return f"http://localhost:{env.get('KONG_HTTP_PORT', '8020')}", env["SERVICE_ROLE_KEY"]


def borrar_pdfs():
    # Storage no deja borrar sus objetos con SQL: se borran por su API.
    nombres = psql(f"select name from storage.objects where bucket_id = '{BUCKET}';").splitlines()
    if not nombres:
        return 0
    url, clave = supa()
    peticion = urllib.request.Request(
        f"{url}/storage/v1/object/{BUCKET}", method="DELETE", data=json.dumps({"prefixes": nombres}).encode(),
        headers={"apikey": clave, "Authorization": f"Bearer {clave}", "Content-Type": "application/json"})
    with urllib.request.urlopen(peticion, timeout=60):
        pass
    return len(nombres)


def main():
    probar, borrar = "--probar" in sys.argv, "--borrar" in sys.argv
    lineas_visor = len(VISOR.read_text(encoding="utf-8").splitlines()) if VISOR.exists() else 0
    mostrar(psql(conteos_sql()), "Datos de prueba en la Supabase del CRM:")
    print(f"  {'visor (jsonl)':<18} {lineas_visor}")
    print("Se conservan: etapas, usuarios, roles y permisos.")

    if probar:
        salida = psql(f"begin; {BORRADO} {conteos_sql()} rollback;")
        mostrar(salida, "\nPrueba (se deshizo, no se borró nada). Así quedaría:")
        return
    if not borrar:
        print("\nNo se borró nada. Para probar sin borrar: --probar · para borrar: --borrar")
        return

    if input("\nEscribe BORRAR para respaldar y borrar los datos de prueba: ").strip() != "BORRAR":
        sys.exit("Cancelado: no se borró nada.")

    RESPALDOS.mkdir(exist_ok=True)
    sello = datetime.now().strftime("%Y%m%d-%H%M%S")
    respaldo = RESPALDOS / f"datos-prueba-{sello}.sql"
    tablas = [a for t in TABLAS for a in ("-t", f"public.{t}")]
    r = subprocess.run(["docker", "exec", CONTENEDOR, "pg_dump", "-U", "postgres", "-d", "postgres",
                        "--data-only", *tablas], capture_output=True, text=True)
    if r.returncode or not r.stdout:
        sys.exit(f"✗ No se pudo respaldar; no se borró nada. {r.stderr.strip()}")
    respaldo.write_text(r.stdout, encoding="utf-8")
    respaldo.chmod(0o600)
    print(f"· respaldo: {respaldo.relative_to(RAIZ)}")

    pdfs = borrar_pdfs()
    psql(BORRADO, "--single-transaction")
    if VISOR.exists():
        destino = RESPALDOS / f"conversaciones-prueba-{sello}.jsonl"
        shutil.move(VISOR, destino)
        destino.chmod(0o600)
        print(f"· registro del visor archivado en {destino.relative_to(RAIZ)}")
    mostrar(psql(conteos_sql()), f"\n✅ Datos de prueba borrados ({pdfs} PDF). Quedó así:")
    print("\nSiguiente: python3 herramientas/carga-inventario/cargar_inventario.py lista.xlsx --aplicar")


if __name__ == "__main__":
    main()

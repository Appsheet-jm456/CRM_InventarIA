#!/usr/bin/env python3
"""
Túnel de PRUEBA hacia el receptor (127.0.0.1:8095) que se repara solo.

La URL de trycloudflare cambia cada vez que arranca el túnel. Este script arranca cloudflared, espera a
que la URL nueva responda y la registra en Meta como callback del webhook (POST /{app}/subscriptions con
el token de la app), así Meta no se queda apuntando a una URL muerta después de un reinicio.

Si cloudflared termina, el script termina con error para que systemd lo vuelva a arrancar.
La definitiva, con dominio propio y URL fija, es la tarea F2·10.
"""

import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import db

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
CLOUDFLARED = Path.home() / ".local/bin/cloudflared"
URL_ACTUAL = AQUI / "tunel-url.txt"


def cargar_env():
    """.env.meta, y encima la conexión guardada en la base (Configuración → Meta, F4·16), que manda si existe."""
    env = {}
    ruta = RAIZ / ".env.meta"
    for linea in (ruta.read_text(encoding="utf-8").splitlines() if ruta.exists() else []):
        if "=" in linea and not linea.strip().startswith("#"):
            k, _, v = linea.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    try:
        config, _ = db.config_meta(forzar=True)
    except Exception:
        config = None
    if config:
        for clave, campo in (("META_APP_ID", "app_id"), ("META_APP_SECRET", "app_secret"), ("META_VERIFY_TOKEN", "verify_token")):
            env[clave] = config.get(campo) or ""
    return env


def log(texto):
    print(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {texto}", flush=True)


def responde(url):
    """El túnel está listo cuando la URL llega al receptor (que contesta 403 sin token)."""
    try:
        urllib.request.urlopen(f"{url}/webhook?hub.mode=prueba", timeout=10)
    except urllib.error.HTTPError as e:
        return e.code == 403
    except Exception:
        return False
    return False


def registrar_en_meta(url, env):
    datos = urllib.parse.urlencode({
        "object": "whatsapp_business_account",
        "callback_url": f"{url}/webhook",
        "verify_token": env["META_VERIFY_TOKEN"],
        "fields": "messages",
        "access_token": f"{env['META_APP_ID']}|{env['META_APP_SECRET']}",
    }).encode()
    peticion = urllib.request.Request(
        f"https://graph.facebook.com/v25.0/{env['META_APP_ID']}/subscriptions", data=datos, method="POST")
    try:
        return json.load(urllib.request.urlopen(peticion, timeout=30)).get("success", False), ""
    except urllib.error.HTTPError as e:
        return False, e.read().decode()[:300]


def main():
    proceso = subprocess.Popen(
        [str(CLOUDFLARED), "tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:8095"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    url = None
    for linea in proceso.stdout:
        if url is None and (m := re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", linea)):
            url = m.group(0)
            log(f"túnel arriba: {url}")
            URL_ACTUAL.write_text(url + "\n", encoding="utf-8")
            # La URL nueva tarda unos segundos en resolver; Meta la verifica en el acto.
            for intento in range(30):
                if responde(url):
                    break
                time.sleep(4)
            for intento in range(5):
                ok, error = registrar_en_meta(url, cargar_env())  # relee: pudo cambiar la conexión
                if ok:
                    log("✅ webhook actualizado en Meta")
                    break
                log(f"✗ Meta rechazó la URL (intento {intento + 1}): {error}")
                time.sleep(10)
        elif re.search(r"ERR|error", linea):
            log(linea.strip()[:200])
    log("cloudflared terminó")
    sys.exit(1)


if __name__ == "__main__":
    main()

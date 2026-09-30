#!/usr/bin/env python3
"""
Receptor de PRUEBA del webhook de WhatsApp (API oficial de Meta). No es la app nueva:
solo comprueba que Meta entrega los mensajes al servidor antes de diseñar F3·3.

    python3 herramientas/meta-webhook-prueba/receptor.py        # escucha en 127.0.0.1:8095
    cloudflared tunnel --url http://127.0.0.1:8095               # dirección HTTPS temporal

Qué hace:
  GET  /webhook  verificación de Meta (hub.verify_token == META_VERIFY_TOKEN)
  POST /webhook  valida la firma X-Hub-Signature-256 con META_APP_SECRET, anota el evento en
                 eventos.log y responde con el árbol de respuesta de prueba (flujo.py)

Lee .env.meta de la raíz del repo. eventos.log tiene teléfonos y mensajes: no se commitea.
"""

import hashlib
import hmac
import json
import sys
import threading
import urllib.error
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import flujo
import kanban
import visor

RAIZ = Path(__file__).resolve().parents[2]
REGISTRO = Path(__file__).with_name("eventos.log")
PUERTO = 8095
API = "https://graph.facebook.com/v25.0"


def cargar_env():
    env = {}
    for linea in (RAIZ / ".env.meta").read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.strip().startswith("#"):
            k, _, v = linea.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    for clave in ("META_TOKEN", "META_PHONE_NUMBER_ID", "META_VERIFY_TOKEN"):
        if not env.get(clave):
            sys.exit(f"✗ Falta {clave} en .env.meta")
    if not env.get("META_APP_SECRET"):
        print("⚠ Falta META_APP_SECRET: la verificación de Meta funciona, pero los mensajes se rechazan.")
    return env


ENV = cargar_env()


def anotar(texto):
    linea = f"{datetime.now():%Y-%m-%d %H:%M:%S}  {texto}"
    print(linea, flush=True)
    with REGISTRO.open("a", encoding="utf-8") as f:
        f.write(linea + "\n")


def enviar(numero, mensaje):
    cuerpo = {"messaging_product": "whatsapp", "to": numero, **mensaje}
    peticion = urllib.request.Request(
        f"{API}/{ENV['META_PHONE_NUMBER_ID']}/messages", method="POST",
        headers={"Authorization": f"Bearer {ENV['META_TOKEN']}", "Content-Type": "application/json"},
        data=json.dumps(cuerpo).encode())
    try:
        urllib.request.urlopen(peticion, timeout=15)
        anotar(f"  → enviado ({mensaje.get('interactive', {}).get('type') or mensaje['type']})")
        return True
    except urllib.error.HTTPError as e:
        anotar(f"  ✗ envío falló: {e.read().decode()[:300]}")
        return False


def contestar(numero, entrada, visible, nombre):
    try:
        mensajes, st = flujo.responder(numero, entrada)
    except Exception as e:  # una falla del árbol no debe tumbar el receptor
        anotar(f"  ✗ el árbol falló: {e!r}")
        return
    for m in mensajes:
        # Si la foto de la cabecera no se puede descargar, la ficha sale igual sin imagen.
        ok = enviar(numero, m)
        if not ok and m.get("interactive", {}).pop("header", None):
            ok = enviar(numero, m)
        if ok:
            visor.registrar(numero, nombre, "bot", visor.texto_saliente(m))
    anotar(f"  · nodo {st['nodo']} · etapa {st['etapa']} · {st['campos']}"
           + (" · BOT PAUSADO" if st["pausa"] else ""))
    try:
        anotar(f"  🗂 kanban v0: {kanban.sincronizar(numero, nombre, visible, st)}")
    except Exception as e:  # el espejo es secundario: si Baserow falla, el bot sigue
        anotar(f"  ✗ kanban v0 falló: {e!r}")


def procesar(evento):
    for entrada in evento.get("entry", []):
        for cambio in entrada.get("changes", []):
            valor = cambio.get("value", {})
            nombres = {c["wa_id"]: c.get("profile", {}).get("name", "") for c in valor.get("contacts", [])}
            for m in valor.get("messages", []):
                de, tipo = m.get("from"), m.get("type")
                if tipo == "text":
                    entrada = m["text"].get("body", "")
                elif tipo == "interactive":  # tocó una opción de la lista o un botón
                    r = m["interactive"].get("list_reply") or m["interactive"].get("button_reply") or {}
                    entrada = r.get("id", "")
                    visible = r.get("title", entrada)
                elif tipo == "button":       # botón de una plantilla
                    entrada = m["button"].get("text", "")
                else:                        # audio, imagen, sticker: pasan a asesor (ARBOL, B-ERR)
                    entrada = "asesor"
                if tipo != "interactive":
                    visible = entrada if tipo in ("text", "button") else f"[{tipo}]"
                anotar(f"📩 {de} ({nombres.get(de, '')}) · {tipo}: {entrada}")
                visor.registrar(de, nombres.get(de, ""), "cliente", visible)
                contestar(de, entrada, visible, nombres.get(de, ""))
            for s in valor.get("statuses", []):
                errores = "; ".join(f"{e.get('code')} {e.get('title')}" for e in s.get("errors", []))
                anotar(f"📬 estado {s.get('status')} · {s.get('recipient_id')}" + (f" · {errores}" if errores else ""))


class Webhook(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def responder(self, codigo, texto=""):
        self.send_response(codigo)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(texto.encode())

    def do_GET(self):
        url = urlparse(self.path)
        if url.path != "/webhook":
            return self.responder(404)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        if q.get("hub.mode") == "subscribe" and hmac.compare_digest(q.get("hub.verify_token", ""), ENV["META_VERIFY_TOKEN"]):
            anotar("✅ Meta verificó el webhook")
            return self.responder(200, q.get("hub.challenge", ""))
        anotar("✗ verificación rechazada: el token no coincide")
        self.responder(403)

    def do_POST(self):
        if urlparse(self.path).path != "/webhook":
            return self.responder(404)
        crudo = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        secreto = ENV.get("META_APP_SECRET", "").encode()
        esperada = "sha256=" + hmac.new(secreto, crudo, hashlib.sha256).hexdigest()
        if not secreto or not hmac.compare_digest(esperada, self.headers.get("X-Hub-Signature-256", "")):
            anotar("✗ POST rechazado: firma inválida o falta META_APP_SECRET")
            return self.responder(401)
        # Meta reintenta si no recibe 200 rápido: se responde primero y se procesa aparte.
        self.responder(200, "ok")
        try:
            threading.Thread(target=procesar, args=(json.loads(crudo),), daemon=True).start()
        except json.JSONDecodeError:
            anotar("✗ cuerpo no es JSON")


if __name__ == "__main__":
    anotar(f"Receptor de prueba escuchando en 127.0.0.1:{PUERTO}/webhook")
    anotar(f"Visor de conversaciones en el puerto {visor.arrancar()} (red local, clave de lectura)")
    ThreadingHTTPServer(("127.0.0.1", PUERTO), Webhook).serve_forever()

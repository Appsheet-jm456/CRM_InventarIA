#!/usr/bin/env python3
"""
Receptor de PRUEBA del webhook de WhatsApp (API oficial de Meta). No es la app nueva:
solo comprueba que Meta entrega los mensajes al servidor antes de diseñar F3·3.

    python3 herramientas/meta-webhook-prueba/receptor.py        # escucha en 127.0.0.1:8095
    cloudflared tunnel --url http://127.0.0.1:8095               # dirección HTTPS temporal

Qué hace:
  GET  /webhook  verificación de Meta (hub.verify_token == META_VERIFY_TOKEN)
  POST /interno/buscar  Chat InventarIA de la app (token CRM_INTERNO_TOKEN; no responde por el túnel)
  POST /webhook  valida la firma X-Hub-Signature-256 con META_APP_SECRET, anota el evento en
                 eventos.log y responde con el árbol de respuesta de prueba (flujo.py)

Lee .env.meta de la raíz del repo. eventos.log tiene teléfonos y mensajes: no se commitea.
"""

import hashlib
import hmac
import json
import secrets
import sys
import threading
import urllib.error
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import db
import flujo
import interprete
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
    """Envía por la API de Meta. Devuelve el id del mensaje (wamid) o None si falló."""
    cuerpo = {"messaging_product": "whatsapp", "to": numero, **mensaje}
    peticion = urllib.request.Request(
        f"{API}/{ENV['META_PHONE_NUMBER_ID']}/messages", method="POST",
        headers={"Authorization": f"Bearer {ENV['META_TOKEN']}", "Content-Type": "application/json"},
        data=json.dumps(cuerpo).encode())
    try:
        respuesta = json.load(urllib.request.urlopen(peticion, timeout=15))
        anotar(f"  → enviado ({mensaje.get('interactive', {}).get('type') or mensaje['type']})")
        return (respuesta.get("messages") or [{}])[0].get("id", "enviado")
    except urllib.error.HTTPError as e:
        anotar(f"  ✗ envío falló: {e.read().decode()[:300]}")
        return None


EXTENSIONES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/ogg": "ogg",
               "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "amr", "video/mp4": "mp4",
               "video/3gpp": "3gp", "application/pdf": "pdf"}
ETIQUETAS_MEDIA = {"image": "📷 Imagen", "audio": "🎤 Audio", "video": "🎬 Video", "document": "📄 Documento",
                   "sticker": "Sticker"}


def guardar_media(lead_id, wamid, media):
    """Baja de Meta el audio, imagen o documento del cliente y lo sube al bucket 'media' (F3·5)."""
    cabecera = {"Authorization": f"Bearer {ENV['META_TOKEN']}"}
    datos = json.load(urllib.request.urlopen(urllib.request.Request(f"{API}/{media['id']}", headers=cabecera),
                                             timeout=30))
    contenido = urllib.request.urlopen(urllib.request.Request(datos["url"], headers=cabecera), timeout=120).read()
    mime = (media.get("mime") or datos.get("mime_type") or "application/octet-stream").split(";")[0].strip()
    extension = EXTENSIONES.get(mime) or Path(media.get("nombre") or "").suffix.lstrip(".") or "bin"
    ruta = f"{lead_id}/{wamid}.{extension}"
    db.subir_media(ruta, contenido, mime)
    return {"ruta": ruta, "mime": mime, "nombre": media.get("nombre", "")}


def subir_a_meta(contenido, mime, nombre):
    """Sube un archivo a Meta y devuelve su id de medio (dura unos 30 días; se reutiliza 25)."""
    limite = f"----crm{secrets.token_hex(8)}"
    cuerpo = (f"--{limite}\r\nContent-Disposition: form-data; name=\"messaging_product\"\r\n\r\nwhatsapp\r\n"
              f"--{limite}\r\nContent-Disposition: form-data; name=\"type\"\r\n\r\n{mime}\r\n"
              f"--{limite}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{nombre}\"\r\n"
              f"Content-Type: {mime}\r\n\r\n").encode() + contenido + f"\r\n--{limite}--\r\n".encode()
    peticion = urllib.request.Request(
        f"{API}/{ENV['META_PHONE_NUMBER_ID']}/media", method="POST", data=cuerpo,
        headers={"Authorization": f"Bearer {ENV['META_TOKEN']}",
                 "Content-Type": f"multipart/form-data; boundary={limite}"})
    return json.load(urllib.request.urlopen(peticion, timeout=60))["id"]


def vigente(media_id, fecha):
    return bool(media_id and fecha and (datetime.now().astimezone() - datetime.fromisoformat(fecha)).days < 25)


def subir_pdf(catalogo):
    """El PDF del bucket catalogos en Meta (decisión 0015)."""
    if vigente(catalogo.get("meta_media_id"), catalogo.get("meta_media_en")):
        return catalogo["meta_media_id"]
    media_id = subir_a_meta(db.descargar_pdf(catalogo["archivo"]), "application/pdf", Path(catalogo["archivo"]).name)
    db.guardar_media_id(catalogo["id"], media_id)
    return media_id


MIME_FOTO = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def subir_foto(p):
    """La foto del bucket productos en Meta (decisión 0025, RI-03)."""
    if vigente(p.get("foto_meta_id"), p.get("foto_meta_en")):
        return p["foto_meta_id"]
    nombre = Path(p["foto_ruta"]).name
    mime = MIME_FOTO.get(nombre.rsplit(".", 1)[-1].lower(), "image/jpeg")
    media_id = subir_a_meta(db.descargar("productos", p["foto_ruta"]), mime, nombre)
    db.guardar_foto_meta(p["id"], media_id)
    return media_id


def resolver(mensaje):
    """Convierte las marcas internas del árbol en mensajes de la API ({'_pdf': catálogo} → documento)."""
    if "_pdf" in mensaje:
        c = mensaje["_pdf"]
        try:
            return {"type": "document", "document": {"id": subir_pdf(c), "filename": Path(c["archivo"]).name,
                                                     "caption": f"📚 {c['nombre']}"}}
        except Exception as e:
            anotar(f"  ✗ no se pudo subir el catálogo {c['nombre']}: {e!r}")
            return None
    imagen = mensaje.get("interactive", {}).get("header", {}).get("image", {})
    if "_producto" in imagen:
        try:
            mensaje["interactive"]["header"]["image"] = {"id": subir_foto(imagen["_producto"])}
        except Exception as e:  # sin foto, la ficha sale igual
            anotar(f"  ✗ no se pudo subir la foto: {e!r}")
            mensaje["interactive"].pop("header")
    return mensaje


# --------------------------------------------------------------------------- #
# Estado del cliente en Supabase (tabla leads, decisión 0014)
# --------------------------------------------------------------------------- #

_candados = {}


def cargar_estado(lead):
    guardado = lead.get("estado_bot") or {}
    st = flujo.estado_vacio()
    st.update({k: v for k, v in guardado.items() if k in ("campos", "rango", "marcas", "valor")})
    st.update(nodo=lead["paso_menu"] or None, etapa=lead["etapa"], errores=lead["errores_bot"],
              pausa=lead["pausar_bot"])
    return st


def guardar_estado(lead, st, visible, nombre):
    campos = st["campos"]
    etiquetas = list(lead.get("etiquetas") or [])
    if campos.get("Etiqueta") and campos["Etiqueta"] not in etiquetas:
        etiquetas.append(campos["Etiqueta"])
    cambios = {
        "paso_menu": st["nodo"] or "", "pausar_bot": bool(st["pausa"]), "errores_bot": st["errores"],
        "etapa": st["etapa"] or lead["etapa"], "etiquetas": etiquetas,
        "categoria_interes": campos.get("Categoría interés", lead["categoria_interes"]),
        "uso_equipo": campos.get("Uso equipo", lead["uso_equipo"]),
        "presupuesto": campos.get("Presupuesto", lead["presupuesto"]),
        "marca_interes": campos.get("Marca interés", lead["marca_interes"]),
        "cotiz_producto": campos.get("Código producto", lead["cotiz_producto"]),
        "ultimo_mensaje": visible[:500], "fecha_ultimo_contacto": datetime.now().astimezone().isoformat(),
        "estado_bot": {k: st[k] for k in ("campos", "rango", "marcas", "valor") if k in st},
    }
    if st.get("valor"):
        cambios["valor_estimado"] = st["valor"]
    if nombre and not lead["nombre"]:
        cambios["nombre"] = nombre
    db.actualizar_lead(lead["id"], cambios)


def contestar(numero, entrada, visible, nombre, tipo, meta_id, media=None):
    # Un cliente que escribe rápido manda mensajes casi a la vez: se atienden en orden, uno por uno.
    with _candados.setdefault(numero, threading.Lock()):
        try:
            lead = db.lead(numero) or db.crear_lead(numero, nombre)
            guardada = None
            if media:
                try:
                    guardada = guardar_media(lead["id"], meta_id, media)
                except Exception as e:  # sin la media, el mensaje queda igual con su etiqueta
                    anotar(f"  ✗ no se pudo guardar la media: {e!r}")
            db.guardar_mensaje(lead["id"], "cliente", visible, tipo, meta_id, guardada)
            st = cargar_estado(lead)

            def avisar(texto):
                wamid = enviar(numero, flujo.m_texto(texto))
                if wamid:
                    db.guardar_mensaje(lead["id"], "bot", texto, meta_id=wamid if wamid != "enviado" else None)

            mensajes, st = flujo.responder(st, entrada, avisar)
        except Exception as e:  # una falla del árbol o de la base no debe tumbar el receptor
            anotar(f"  ✗ el árbol falló: {e!r}")
            return
        for m in mensajes:
            m = resolver(m)
            if not m:
                continue
            # Si la foto de la cabecera no se puede descargar, la ficha sale igual sin imagen.
            wamid = enviar(numero, m)
            if not wamid and m.get("interactive", {}).pop("header", None):
                wamid = enviar(numero, m)
            if wamid:
                db.guardar_mensaje(lead["id"], "bot", visor.texto_saliente(m), m["type"],
                                   wamid if wamid != "enviado" else None)
        try:
            guardar_estado(lead, st, visible, nombre)
        except Exception as e:
            anotar(f"  ✗ no se pudo guardar el estado: {e!r}")
        anotar(f"  · nodo {st['nodo']} · etapa {st['etapa']} · {st['campos']}"
               + (" · BOT PAUSADO" if st["pausa"] else ""))


def procesar(evento):
    for entrada in evento.get("entry", []):
        for cambio in entrada.get("changes", []):
            valor = cambio.get("value", {})
            nombres = {c["wa_id"]: c.get("profile", {}).get("name", "") for c in valor.get("contacts", [])}
            for m in valor.get("messages", []):
                de, tipo = m.get("from"), m.get("type")
                media = None
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
                    datos = m.get(tipo) or {}
                    if datos.get("id"):      # se guarda para que el asesor lo vea en la Bandeja (F3·5)
                        media = {"id": datos["id"], "mime": datos.get("mime_type", ""),
                                 "nombre": datos.get("filename", "")}
                    pie = datos.get("caption") or datos.get("filename") or ""
                    visible = ETIQUETAS_MEDIA.get(tipo, f"[{tipo}]") + (f": {pie}" if pie else "")
                if tipo in ("text", "button"):
                    visible = entrada
                anotar(f"📩 {de} ({nombres.get(de, '')}) · {tipo}: {entrada}")
                contestar(de, entrada, visible, nombres.get(de, ""), tipo, m.get("id"), media)
            for s in valor.get("statuses", []):
                errores = "; ".join(f"{e.get('code')} {e.get('title')}" for e in s.get("errors", []))
                anotar(f"📬 estado {s.get('status')} · {s.get('recipient_id')}" + (f" · {errores}" if errores else ""))
                try:  # entrega, categoría y cobrable para Métricas y la Bandeja (F3·8, RM-07)
                    db.registrar_estado(s, errores)
                except Exception as e:
                    anotar(f"  ✗ no se pudo guardar el estado: {e!r}")


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

    def buscar_interno(self):
        """Solo para la app en este servidor: con token y nunca por el túnel (decisión 0025)."""
        token = ENV.get("CRM_INTERNO_TOKEN", "")
        por_tunel = any(self.headers.get(h) for h in ("Cf-Ray", "Cf-Connecting-Ip", "X-Forwarded-For"))
        if por_tunel or not token or not hmac.compare_digest(token, self.headers.get("X-Interno-Token", "")):
            return self.responder(403)
        try:
            texto = str(json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))["texto"])[:500]
            cuerpo = json.dumps(buscar(texto), ensure_ascii=False)
        except Exception as e:
            anotar(f"✗ búsqueda interna falló: {e!r}")
            return self.responder(500)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(cuerpo.encode())

    def do_POST(self):
        if urlparse(self.path).path == "/interno/buscar":
            return self.buscar_interno()
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


def buscar(texto):
    """Chat InventarIA (RI-06): el mismo intérprete del bot; la IA solo arma filtros, los equipos salen de la base."""
    todos = flujo.inventario()
    p = flujo.buscar_codigo(texto)
    if p:
        return {"fuente": "codigo", "filtros": {}, "descripcion": f"el código {p['cod']}", "codigos": [p["cod"]],
                "cercanos": []}
    filtros, fuente = interprete.reglas(texto, [p["marca"] for p in todos]), "reglas"
    if not filtros and interprete.vale_la_pena_ia(flujo.normalizar(texto)):
        filtros, fuente = interprete.con_ia(texto), "ia"
    if not filtros:
        return {"fuente": "nada", "filtros": {}, "descripcion": "", "codigos": [], "cercanos": []}
    r = interprete.filtrar(todos, filtros, flujo.es_diseno)
    return {"fuente": fuente, "filtros": filtros, "descripcion": interprete.describir(filtros),
            "codigos": [p["cod"] for p in r],
            "cercanos": [] if r else [p["cod"] for p in interprete.cercanos(todos, filtros)]}


if __name__ == "__main__":
    anotar(f"Receptor de prueba escuchando en 127.0.0.1:{PUERTO}/webhook")
    # El visor de la demo se apagó en F3·5: la Bandeja de CRM InventarIA ocupa el 8096 (decisión 0017).
    ThreadingHTTPServer(("127.0.0.1", PUERTO), Webhook).serve_forever()

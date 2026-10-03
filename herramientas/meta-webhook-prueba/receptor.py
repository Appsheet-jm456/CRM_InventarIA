#!/usr/bin/env python3
"""
Receptor de PRUEBA del webhook de WhatsApp (API oficial de Meta). No es la app nueva:
solo comprueba que Meta entrega los mensajes al servidor antes de diseñar F3·3.

    python3 herramientas/meta-webhook-prueba/receptor.py        # escucha en 127.0.0.1:8095
    cloudflared tunnel --url http://127.0.0.1:8095               # dirección HTTPS temporal

Qué hace:
  GET  /webhook  verificación de Meta (hub.verify_token == META_VERIFY_TOKEN)
  POST /interno/buscar  Chat InventarIA de la app (token CRM_INTERNO_TOKEN; no responde por el túnel)
  POST /interno/simular Simulador del lienzo: el motor sobre una versión, sin escribir ni enviar (mismo token)
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
from datetime import datetime, timedelta, timezone
import time
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
    ruta = RAIZ / ".env.meta"
    for linea in (ruta.read_text(encoding="utf-8").splitlines() if ruta.exists() else []):
        if "=" in linea and not linea.strip().startswith("#"):
            k, _, v = linea.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


_BASE = {"META_TOKEN": "token", "META_APP_ID": "app_id", "META_WABA_ID": "waba_id",
         "META_PHONE_NUMBER_ID": "phone_number_id", "META_APP_SECRET": "app_secret", "META_VERIFY_TOKEN": "verify_token"}


class Entorno:
    """Las variables META_*. Manda la conexión guardada en la base (F4·16, RC-04: se relee cada 30 s, sin reiniciar);
    si la base no tiene ninguna, valen las de .env.meta (RC-07). CRM_INTERNO_TOKEN solo viene del archivo."""

    def __init__(self):
        self.archivo = cargar_env()
        self.origen = None

    def _valores(self):
        config, _ = db.config_meta()
        origen = "base" if config else "archivo"
        if origen != self.origen:
            if self.origen is not None or config:
                anotar(f"🔑 conexión con Meta: ahora se lee de {'la base (Configuración → Meta)' if config else '.env.meta'}")
            self.origen = origen
        if not config:
            return self.archivo
        return {**self.archivo, **{k: config.get(c) or "" for k, c in _BASE.items()}}

    def refrescar(self):
        """Relee la base ya, sin esperar los 30 s: para cuando Meta verifica o firma con algo recién guardado."""
        db.config_meta(forzar=True)

    def get(self, clave, defecto=None):
        return self._valores().get(clave, defecto)

    def __getitem__(self, clave):
        valor = self.get(clave)
        if valor is None:
            raise KeyError(clave)
        return valor


ENV = Entorno()


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
              pausa=lead["pausar_bot"], bot=lead.get("bot_id"))
    if lead.get("espera_vence_en") and lead.get("espera_cuadro") == st["nodo"]:  # en una Pausa (F4·13)
        st["espera_hasta"] = lead["espera_vence_en"]
    return st


def guardar_estado(lead, st, visible, nombre, del_cliente=True):
    """del_cliente=False: lo movió el reloj de la Pausa, no un mensaje del cliente (no toca su último mensaje)."""
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
        "estado_bot": {k: st[k] for k in ("campos", "rango", "marcas", "valor") if k in st},
        "espera_vence_en": st.get("espera_hasta"), "espera_cuadro": st["nodo"] if st.get("espera_hasta") else None,
        # En el principal se guarda null: si el principal cambia, el cliente sigue al nuevo (RF-16).
        "bot_id": None if st.get("bot") in (None, db.principal()) else st["bot"],
    }
    if del_cliente:
        cambios.update(ultimo_mensaje=visible[:500], fecha_ultimo_contacto=datetime.now().astimezone().isoformat())
    if st.get("valor"):
        cambios["valor_estimado"] = st["valor"]
    if nombre and not lead["nombre"]:
        cambios["nombre"] = nombre
    db.actualizar_lead(lead["id"], cambios)


def enviar_mensajes(numero, lead, mensajes):
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


# --------------------------------------------------------------------------- #
# Reloj de la Pausa (F4·13, RF-14 y RF-15)
# --------------------------------------------------------------------------- #

VENTANA = timedelta(hours=24) - timedelta(minutes=1)  # Meta solo entrega texto libre dentro de las 24 h


def vencer_espera(numero):
    """La Pausa de este cliente venció: sigue por "Pasó el tiempo", con el mismo candado que al contestar."""
    with _candados.setdefault(numero, threading.Lock()):
        lead = db.lead(numero)
        if not lead or not lead.get("espera_vence_en"):
            return
        if datetime.fromisoformat(lead["espera_vence_en"]) > datetime.now(timezone.utc):
            return  # alguien la movió mientras tanto
        quitar = {"espera_vence_en": None, "espera_cuadro": None}
        # RF-15: con un asesor o si el cliente ya está en otro cuadro, no se envía nada.
        if lead["pausar_bot"] or lead.get("espera_cuadro") != (lead["paso_menu"] or None):
            db.actualizar_lead(lead["id"], quitar)
            return
        ultimo = db.ultimo_del_cliente(lead["id"])
        if not ultimo or datetime.now(timezone.utc) - ultimo > VENTANA:
            etiquetas = list(lead.get("etiquetas") or [])
            if "Recordatorio-no-enviado" not in etiquetas:
                etiquetas.append("Recordatorio-no-enviado")
            db.actualizar_lead(lead["id"], {**quitar, "etiquetas": etiquetas})
            anotar(f"⏳ {numero}: la Pausa venció fuera de las 24 h de Meta; el recordatorio no se envía")
            return
        st = cargar_estado(lead)
        mensajes, st = flujo.tiempo_cumplido(st)
        anotar(f"⏳ {numero}: venció la Pausa {lead.get('espera_cuadro')} → {st['nodo']}")
        enviar_mensajes(numero, lead, mensajes)
        guardar_estado(lead, st, "", None, del_cliente=False)


def reloj():
    """Cada 5 s atiende las Pausas vencidas. Si el receptor estuvo apagado, al volver atiende las que siguen en ventana."""
    while True:
        time.sleep(5)
        try:
            for numero in db.esperas_vencidas():
                try:
                    vencer_espera(numero)
                except Exception as e:
                    anotar(f"  ✗ no se pudo vencer la Pausa de {numero}: {e!r}")
        except Exception as e:
            anotar(f"  ✗ el reloj de la Pausa falló: {e!r}")


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
        enviar_mensajes(numero, lead, mensajes)
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
        def coincide():
            return hmac.compare_digest(q.get("hub.verify_token", ""), ENV.get("META_VERIFY_TOKEN", ""))
        if q.get("hub.mode") == "subscribe" and not coincide():
            ENV.refrescar()  # puede ser un token de verificación recién generado en Configuración → Meta
        if q.get("hub.mode") == "subscribe" and coincide():
            anotar("✅ Meta verificó el webhook")
            return self.responder(200, q.get("hub.challenge", ""))
        anotar("✗ verificación rechazada: el token no coincide")
        self.responder(403)

    def interno(self, accion):
        """Solo para la app en este servidor: con token y nunca por el túnel (decisiones 0025 y 0026)."""
        token = ENV.get("CRM_INTERNO_TOKEN", "")
        por_tunel = any(self.headers.get(h) for h in ("Cf-Ray", "Cf-Connecting-Ip", "X-Forwarded-For"))
        if por_tunel or not token or not hmac.compare_digest(token, self.headers.get("X-Interno-Token", "")):
            return self.responder(403)
        try:
            pedido = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            respuesta = accion(pedido)
        except LookupError:
            return self.responder(404)
        except Exception as e:
            anotar(f"✗ ruta interna falló: {e!r}")
            return self.responder(500)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(respuesta, ensure_ascii=False, default=str).encode())

    def do_POST(self):
        ruta = urlparse(self.path).path
        if ruta == "/interno/buscar":
            return self.interno(lambda p: buscar(str(p["texto"])[:500]))
        if ruta == "/interno/simular":
            return self.interno(simular)
        if urlparse(self.path).path != "/webhook":
            return self.responder(404)
        crudo = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        def firma_valida():
            secreto = ENV.get("META_APP_SECRET", "").encode()
            esperada = "sha256=" + hmac.new(secreto, crudo, hashlib.sha256).hexdigest()
            return bool(secreto) and hmac.compare_digest(esperada, self.headers.get("X-Hub-Signature-256", ""))
        if not firma_valida():
            ENV.refrescar()  # quizá el App Secret se cambió hace menos de 30 s
            if not firma_valida():
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


def simular(pedido):
    """Simulador del lienzo (F4·8, RF-07): el motor del bot sobre una versión, sin escribir en la base ni enviar a
    WhatsApp. La app guarda el estado de la charla de prueba y lo manda en cada mensaje."""
    otros = db.cuadros_de_version(pedido["version"], pedido.get("bot"))
    if not otros:
        raise LookupError("versión")
    bot = pedido.get("bot") or db.principal()
    st = pedido.get("estado") or dict(flujo.estado_vacio(), bot=bot)
    antes = st.get("bot")
    avisos = []
    with flujo.con_cuadros(otros, bot):
        if pedido.get("evento") == "tiempo":  # "Simular que pasó el tiempo" en una Pausa (F4·13)
            mensajes, st = flujo.tiempo_cumplido(st)
        else:
            mensajes, st = flujo.responder(st, str(pedido["texto"])[:1000], avisos.append)
    if st.get("bot") != antes:  # "Ir a otro bot", o "hola" desde otro bot: se avisa a quien prueba
        avisos.append(f"El cliente pasó al bot «{db.nombre_bot(st['bot'])}».")
    return {"avisos": avisos, "mensajes": mensajes, "estado": st}


if __name__ == "__main__":
    if not ENV.get("META_TOKEN") or not ENV.get("META_PHONE_NUMBER_ID") or not ENV.get("META_VERIFY_TOKEN"):
        sys.exit("✗ No hay conexión con Meta: ni en la base (Configuración → Meta) ni en .env.meta")
    if not ENV.get("META_APP_SECRET"):
        print("⚠ Falta META_APP_SECRET: la verificación de Meta funciona, pero los mensajes se rechazan.")
    anotar(f"Receptor de prueba escuchando en 127.0.0.1:{PUERTO}/webhook")
    # El visor de la demo se apagó en F3·5: la Bandeja de CRM InventarIA ocupa el 8096 (decisión 0017).
    threading.Thread(target=reloj, daemon=True).start()  # Pausas vencidas (F4·13)
    ThreadingHTTPServer(("127.0.0.1", PUERTO), Webhook).serve_forever()

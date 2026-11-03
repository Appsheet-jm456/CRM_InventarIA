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
  POST /interno/agente  «Probar» de Configuración → Agente: un turno de Avi sin escribir ni enviar (mismo token)
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
import acciones
import agente
import compra
import cotizacion
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


def escribiendo(meta_id):
    """«escribiendo…» en el WhatsApp del cliente (F4·36, RAG-35): Meta lo muestra hasta que sale la respuesta o 25 s, y marca su
    mensaje como leído. No es un mensaje: no cuesta. Si falla, se sigue sin él."""
    cuerpo = {"messaging_product": "whatsapp", "status": "read", "message_id": meta_id, "typing_indicator": {"type": "text"}}
    peticion = urllib.request.Request(
        f"{API}/{ENV['META_PHONE_NUMBER_ID']}/messages", method="POST",
        headers={"Authorization": f"Bearer {ENV['META_TOKEN']}", "Content-Type": "application/json"},
        data=json.dumps(cuerpo).encode())
    try:
        urllib.request.urlopen(peticion, timeout=10).read()
    except Exception as e:
        anotar(f"  ✗ «escribiendo…» no se pudo mostrar: {getattr(e, 'read', lambda: str(e).encode())().decode()[:200]}")


def como_persona():
    """(mostrar «escribiendo…», segundos antes de responder, segundos entre mensajes) de Configuración → Agente → Avi (F4·36)."""
    c = db.agente_config()
    return (c.get("escribiendo", True) is not False, int(c.get("espera_primera_ms") or 0) / 1000,
            int(c.get("pausa_mensajes_ms") or 0) / 1000)


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


_medios_conocimiento = {}  # ruta del bucket → (id de medio en Meta, cuándo se subió): se reutiliza 25 días


def subir_conocimiento(ruta):
    """La imagen o PDF de una ficha de conocimiento en Meta (F4·23 y F4·24). Cada archivo nuevo tiene ruta nueva."""
    media_id, en = _medios_conocimiento.get(ruta, (None, None))
    if vigente(media_id, en):
        return media_id
    nombre = Path(ruta).name
    mime = "application/pdf" if nombre.endswith(".pdf") else MIME_FOTO.get(nombre.rsplit(".", 1)[-1].lower(), "image/jpeg")
    media_id = subir_a_meta(db.descargar("conocimiento", ruta), mime, nombre)
    _medios_conocimiento[ruta] = (media_id, datetime.now().astimezone().isoformat())
    return media_id


def resolver(mensaje):
    """Convierte las marcas internas del árbol en mensajes de la API ({'_pdf': catálogo} → documento)."""
    if "_cotizacion" in mensaje:  # PDF de la cotización (F4·26), recién guardado en el bucket cotizaciones
        c = mensaje["_cotizacion"]
        try:
            media_id = subir_a_meta(db.descargar("cotizaciones", c["ruta"]), "application/pdf", f"{c['numero']}.pdf")
        except Exception as e:
            anotar(f"  ✗ no se pudo subir la cotización {c['numero']}: {e!r}")
            return None
        return {"type": "document", "document": {"id": media_id, "filename": f"Cotizacion {c['numero']}.pdf",
                                                 "caption": f"📄 Cotización {c['numero']}"}}
    if "_conocimiento" in mensaje:  # imagen o PDF de una ficha (RAG-24)
        f = mensaje["_conocimiento"]
        try:
            media_id = subir_conocimiento(f["archivo"])
        except Exception as e:
            anotar(f"  ✗ no se pudo subir el archivo de «{f['titulo']}»: {e!r}")
            return None
        if f["archivo"].endswith(".pdf"):
            return {"type": "document", "document": {"id": media_id, "filename": f"{f['titulo']}.pdf", "caption": f"📄 {f['titulo']}"}}
        return {"type": "image", "image": {"id": media_id, "caption": f["titulo"]}}
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
    st.update({k: v for k, v in guardado.items() if k in ("campos", "rango", "marcas", "valor", "compra", "cotizacion", "agente")})
    st.update(nodo=lead["paso_menu"] or None, etapa=lead["etapa"], errores=lead["errores_bot"],
              pausa=lead["pausar_bot"], bot=lead.get("bot_id"))
    st["atributos"] = dict(lead.get("atributos") or {})  # datos de la ficha: las Preguntas y las marcas {dato} (F4·34)
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
        "estado_bot": {k: st[k] for k in ("campos", "rango", "marcas", "valor", "compra", "cotizacion", "agente") if k in st},
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
    # Datos que guardó una Pregunta o marcó un botón (F4·34): solo los que cambiaron, sobre lo que tiene la ficha.
    antes = lead.get("atributos") or {}
    nuevos = {k: v for k, v in (st.get("atributos") or {}).items() if antes.get(k) != v}
    if nuevos:
        cambios["atributos"] = {**antes, **nuevos}
    try:
        db.actualizar_lead(lead["id"], cambios)
    except Exception:
        if "atributos" not in cambios:
            raise
        anotar(f"  ✗ la base no aceptó los datos {list(nuevos)}: se guarda la charla sin ellos")
        cambios.pop("atributos")
        db.actualizar_lead(lead["id"], cambios)


def enviar_mensajes(numero, lead, mensajes, desde_error=False, responde_a=None):
    """Envía y guarda los mensajes del bot. Devuelve el cuadro del primero que Meta rechazó y tiene «Error al
    enviar» (RF-22), o None. `responde_a` es el id del mensaje del cliente que se contesta: entre un mensaje y otro se
    vuelve a mostrar «escribiendo…» y se hace la pausa (F4·36, RAG-37)."""
    rechazado = None
    mostrar, _, pausa = como_persona() if responde_a and len(mensajes) > 1 else (False, 0, 0)
    for n, m in enumerate(mensajes):
        if n and responde_a:
            if mostrar:
                escribiendo(responde_a)
            if pausa:
                time.sleep(pausa)
        cuadro = m.pop("_cuadro", None)
        m = resolver(m)
        if not m:
            continue
        # Si la foto de la cabecera no se puede descargar, la ficha sale igual sin imagen.
        wamid = enviar(numero, m)
        if not wamid and m.get("interactive", {}).pop("header", None):
            wamid = enviar(numero, m)
        if wamid:
            db.guardar_mensaje(lead["id"], "bot", visor.texto_saliente(m), m["type"],
                               wamid if wamid != "enviado" else None, cuadro=cuadro, desde_error=desde_error)
        elif cuadro and not desde_error and rechazado is None:
            rechazado = cuadro
    return rechazado


def seguir_error_de_envio(numero, lead, st, cuadro):
    """«Error al enviar el mensaje» (RF-22): Meta no entregó lo que envió `cuadro`. Se llama con el candado del
    número tomado. Lo que se envía desde esta salida no la vuelve a disparar. Devuelve el estado."""
    r = flujo.envio_fallido(st, cuadro)
    if r is None:
        return st
    mensajes, st = r
    anotar(f"⚠ {numero}: no se entregó el mensaje de {cuadro} → «Error al enviar» lleva a {st['nodo']}")
    enviar_mensajes(numero, lead, mensajes, desde_error=True)
    return st


def error_tardio(wamid):
    """Meta avisó por el webhook que un mensaje del bot falló (estado failed, RF-22)."""
    m = db.tomar_error_de_envio(wamid)
    if not m or not db.bot_config().get("chatbot_activo", True):
        return
    numero = db.telefono_de(m["lead_id"])
    if not numero:
        return
    with _candados.setdefault(numero, threading.Lock()):
        lead = db.lead(numero)
        st = seguir_error_de_envio(numero, lead, cargar_estado(lead), m["cuadro"])
        guardar_estado(lead, st, "", None, del_cliente=False)


# --------------------------------------------------------------------------- #
# Reloj de las esperas: Pausa (F4·13, RF-14 y RF-15) y «Sin respuesta» del Mensaje (RF-21)
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
        interruptores = db.bot_config()  # F4·35: con el chatbot apagado no salen recordatorios; con el menú apagado, solo el de la compra
        if not interruptores.get("chatbot_activo", True) or (not interruptores.get("menu_activo", True) and lead.get("espera_cuadro") != compra.NODO):
            db.actualizar_lead(lead["id"], quitar)
            return
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
        if lead.get("espera_cuadro") == compra.NODO:  # RAG-22: esperando el pago, «¿Sigues interesado?»
            mensajes = compra.tiempo_cumplido(st)
        else:
            mensajes, st = flujo.tiempo_cumplido(st)
        anotar(f"⏳ {numero}: venció la espera de {lead.get('espera_cuadro')} → {st['nodo']}")
        rechazado = enviar_mensajes(numero, lead, mensajes)
        if rechazado:
            st = seguir_error_de_envio(numero, lead, st, rechazado)
        guardar_estado(lead, st, "", None, del_cliente=False)


def vaciar_papelera():
    """Leads con más de 30 días en la papelera: se borran con sus mensajes y sus archivos (F4·30 E, 0035)."""
    r = db.vaciar_papelera()
    if r.get("borrados"):
        db.borrar_archivos("media", r.get("media") or [])
        db.borrar_archivos("cotizaciones", r.get("cotizaciones") or [])
        anotar(f"🗑 papelera: {r['borrados']} lead(s) de más de 30 días borrados con sus archivos")


def reloj():
    """Cada 5 s atiende las Pausas vencidas. Si el receptor estuvo apagado, al volver atiende las que siguen en ventana.
    Una vez por hora vacía la papelera de leads."""
    ultima_papelera = 0
    while True:
        time.sleep(5)
        if time.time() - ultima_papelera > 3600:
            ultima_papelera = time.time()
            try:
                vaciar_papelera()
            except Exception as e:
                anotar(f"  ✗ no se pudo vaciar la papelera: {e!r}")
        try:
            for numero in db.esperas_vencidas():
                try:
                    vencer_espera(numero)
                except Exception as e:
                    anotar(f"  ✗ no se pudo vencer la Pausa de {numero}: {e!r}")
        except Exception as e:
            anotar(f"  ✗ el reloj de la Pausa falló: {e!r}")


def extras_de_compra(lead, etiquetas, paso_embudo, nota):
    """Lo que la compra deja en el cliente además de los mensajes: etiquetas, etapa del embudo y nota para el asesor."""
    if etiquetas:
        lead["etiquetas"] = list(dict.fromkeys(list(lead.get("etiquetas") or []) + etiquetas))
    if paso_embudo:
        try:
            db.compra_mover(lead["id"], paso_embudo)
        except Exception as e:
            anotar(f"  ✗ no se pudo mover la oportunidad a {paso_embudo}: {e!r}")
    if nota:
        try:
            lead["notas"] = db.agregar_nota(lead["id"], lead.get("notas"), nota)
        except Exception as e:
            anotar(f"  ✗ no se pudo anotar la compra: {e!r}")


_lotes = {}
_lotes_candado = threading.Lock()


def para_avi(numero, entrada, tipo):
    """(lead, segundos) si este mensaje lo atenderá Avi con buffer; None si no. Lo que gana antes que Avi (asesor en el chat,
    compra o cotización en curso, una Acción) responde al instante, sin esperar."""
    if tipo != "text":
        return None
    lead = db.lead(numero)
    if not lead:
        return None
    interruptores = db.bot_config()
    if not interruptores.get("chatbot_activo", True):  # F4·35: con el chatbot apagado nadie automático contesta
        return None
    config = db.agente_config()
    segundos = int(config.get("buffer_segundos") or 0)
    st = cargar_estado(lead)
    en_cuadro = interruptores.get("menu_activo", True) and flujo.en_agente(st)
    if segundos <= 0 or compra.activa(st) or cotizacion.activa(st) or flujo.en_pregunta(st) \
            or not (en_cuadro or agente.atiende(st, lead, tipo, entrada, config, interruptores)):
        return None
    if acciones.ganadora(entrada):
        return None
    return lead, segundos


def sin_bot(st, interruptores):
    """Chatbot apagado (o menú y Avi apagados): el chat pasa a la cola sin respuesta automática. El cliente recibe el mensaje de
    «chatbot apagado» una sola vez por conversación: al entrar a la cola (F4·35, RF-31 a RF-33)."""
    st.pop("espera_hasta", None)
    if st["pausa"]:
        return []
    st["pausa"] = True
    st["campos"]["Etiqueta"] = "Chatbot-apagado"
    texto = flujo.con_horario((interruptores.get("texto_apagado") or "").strip())  # {horario} y {proxima}, F4·38
    return [flujo.m_texto(texto)] if texto else []


def contestar(numero, entrada, visible, nombre, tipo, meta_id, media=None):
    """Buffer de Avi (F4·28): los mensajes seguidos de un mismo cliente se juntan y Avi responde una sola vez.
    El primero espera unos segundos; los que llegan mientras tanto solo se guardan y se suman a su lote."""
    try:
        avi = para_avi(numero, entrada, tipo)
    except Exception as e:  # si algo falla al decidir, se atiende sin buffer
        anotar(f"  ✗ buffer de Avi: {e!r}")
        avi = None
    if not avi:
        return _contestar(numero, entrada, visible, nombre, tipo, meta_id, media)
    lead, segundos = avi
    db.guardar_mensaje(lead["id"], "cliente", visible, tipo, meta_id)
    if meta_id and como_persona()[0]:  # F4·36: «escribiendo…» también mientras Avi junta los mensajes seguidos
        threading.Thread(target=escribiendo, args=(meta_id,), daemon=True).start()
    with _lotes_candado:
        lote = _lotes.get(numero)
        if lote is not None:
            lote.append(entrada)
            anotar(f"  ⏳ se suma al lote de Avi ({len(lote)} mensajes)")
            return
        _lotes[numero] = lote = [entrada]
    time.sleep(segundos)
    with _lotes_candado:
        textos = _lotes.pop(numero, lote)
    junto = "\n".join(textos)
    return _contestar(numero, junto, junto, nombre, tipo, meta_id, guardado=True)


def _contestar(numero, entrada, visible, nombre, tipo, meta_id, media=None, guardado=False):
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
            if not guardado:  # con el buffer, cada mensaje ya se guardó al llegar
                db.guardar_mensaje(lead["id"], "cliente", visible, tipo, meta_id, guardada)
            st = cargar_estado(lead)
            # F4·36: «escribiendo…» mientras el bot prepara la respuesta (no si el chat está con un asesor o el chatbot apagado).
            empezo = time.monotonic()
            mostrar, espera, _ = como_persona()
            responde_a = meta_id if meta_id and not st["pausa"] and db.bot_config().get("chatbot_activo", True) else None
            if responde_a and mostrar:
                threading.Thread(target=escribiendo, args=(meta_id,), daemon=True).start()

            def avisar(texto):
                wamid = enviar(numero, flujo.m_texto(texto))
                if wamid:
                    db.guardar_mensaje(lead["id"], "bot", texto, meta_id=wamid if wamid != "enviado" else None)

            mensajes = avi = None
            interruptores = db.bot_config()
            menu = interruptores.get("menu_activo", True)
            if not interruptores.get("chatbot_activo", True):  # F4·35: nadie automático contesta; el chat va a la cola
                mensajes = sin_bot(st, interruptores)
                anotar("  ⏻ chatbot apagado: el chat queda en la cola")
            # Una compra (F4·25) o una cotización (F4·26) en curso atienden primero: botones, datos, comprobante, cancelar.
            for nombre_flujo, modulo, icono in (("compra", compra, "🛒"), ("cotizacion", cotizacion, "📄")):
                if mensajes is not None or not modulo.activa(st) or st["pausa"]:
                    continue
                try:
                    r = modulo.responder(st, entrada, tipo if tipo in ("text", "button", "interactive") else "media", lead)
                except Exception as e:  # si falla, se deja el flujo y el mensaje sigue por el menú como siempre
                    anotar(f"  ✗ el flujo de {nombre_flujo} falló: {e!r}")
                    st.pop(nombre_flujo, None)
                    r = None
                if r is not None:
                    mensajes, etiquetas, paso_embudo, nota = r
                    anotar(f"  {icono} {nombre_flujo} · {(st.get(nombre_flujo) or {}).get('paso') or 'terminó'}"
                           + (f" · embudo → {paso_embudo}" if paso_embudo else ""))
                    extras_de_compra(lead, etiquetas, paso_embudo, nota)
            # Acciones «Cuando → Hacer» (F4·24, RAG-25): solo con texto escrito, no con botones del menú ni media. La excepción es el
            # botón «Lo quiero» de la ficha: cuenta como «quiero comprar» y abre la compra si esa acción está activa (F4·25).
            atendida = None
            en_pregunta = mensajes is None and flujo.en_pregunta(st)  # F4·34: la respuesta es un dato, no una consulta
            entrada_accion = entrada
            if mensajes is None and tipo == "interactive" and not st["pausa"]:
                tocada = flujo.elegir(flujo.cuadro_actual(st), flujo.normalizar(entrada))
                if tocada and tocada.get("reconocer") == "quiere_comprar":
                    entrada_accion = "quiero comprar"
            if mensajes is None and (tipo in ("text", "button") or entrada_accion != entrada) and not st["pausa"] and not en_pregunta:
                try:
                    atendida = acciones.responder(st, entrada_accion, lead)
                except Exception as e:  # si las acciones fallan, el menú responde como siempre
                    anotar(f"  ✗ las acciones fallaron: {e!r}")
            if atendida:
                accion, mensajes, st, etiquetas = atendida
                anotar(f"  ⚡ acción «{accion['nombre']}»")
                if etiquetas:
                    lead["etiquetas"] = list(dict.fromkeys(list(lead.get("etiquetas") or []) + etiquetas))
                try:
                    db.registrar_accion(accion["id"], lead["id"])
                except Exception as e:
                    anotar(f"  ✗ no se pudo anotar la acción: {e!r}")
            elif mensajes is None:
                cuadro_agente = flujo.en_agente(st) if menu and tipo == "text" else None
                if cuadro_agente:  # cuadro Agente del lienzo (F4·35, RF-36): Avi con la instrucción y las salidas del cuadro
                    try:
                        avi = agente.responder_cuadro(st, entrada, lead, cuadro_agente)
                    except Exception as e:  # si Avi falla, atiende el Híbrido como siempre (RAG-10)
                        anotar(f"  ✗ Avi falló en el cuadro {cuadro_agente.get('clave')}: {e!r}")
                elif not en_pregunta and agente.atiende(st, lead, tipo, entrada, interruptores=interruptores):  # «Avi en todo el bot» (F4·35)
                    try:
                        avi = agente.responder(st, entrada, lead)
                    except Exception as e:  # si Avi falla, atiende el Híbrido como siempre (RAG-10)
                        anotar(f"  ✗ Avi falló: {e!r}")
                if avi:
                    mensajes, st = avi["mensajes"], avi["st"]
                    anotar(f"  🤖 Avi · {len(avi['traza'])} paso(s) · US$ {avi['costo_usd']}"
                           + (" · pasó a asesor" if avi["asesor"] else "") + (f" · {avi['flujo']}" if avi["flujo"] else ""))
                    extras_de_compra(lead, avi["etiquetas"], None, avi["nota"])
                elif menu or tipo != "text" or flujo.normalizar(entrada) == "reiniciar":
                    # Con el menú apagado, los botones que ya se enviaron (la ficha que manda Avi, por ejemplo), la media y «reiniciar»
                    # los sigue atendiendo el motor: si no, el cliente toca un botón y se queda sin respuesta.
                    mensajes, st = flujo.responder(st, entrada, avisar)
                else:  # menú apagado y Avi no atiende este texto: como con el chatbot apagado (RF-31)
                    mensajes = sin_bot(st, interruptores)
                    anotar("  ⏻ menú apagado y Avi no atiende: el chat queda en la cola")
        except Exception as e:  # una falla del árbol o de la base no debe tumbar el receptor
            anotar(f"  ✗ el árbol falló: {e!r}")
            return
        if mensajes and responde_a and espera:  # RAG-36: no contesta al instante; si preparar la respuesta tardó, no espera de más
            time.sleep(max(0, espera - (time.monotonic() - empezo)))
        rechazado = enviar_mensajes(numero, lead, mensajes, responde_a=responde_a)
        if rechazado:  # RF-22: Meta lo rechazó al instante
            try:
                st = seguir_error_de_envio(numero, lead, st, rechazado)
            except Exception as e:
                anotar(f"  ✗ «Error al enviar» falló: {e!r}")
        if avi and not avi["asesor"]:  # memoria larga de Avi: resume lo que ya no cabe en la memoria corta
            if agente.resumir(st, lead):
                anotar("  🧠 Avi actualizó el resumen del cliente")
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
                if s.get("status") == "failed" and s.get("id"):
                    try:
                        error_tardio(s["id"])
                    except Exception as e:
                        anotar(f"  ✗ «Error al enviar» falló: {e!r}")


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
        if ruta == "/interno/agente":  # «Probar» el agente (F4·28): sin escribir en la base ni enviar a WhatsApp
            return self.interno(probar_agente)
        if ruta == "/interno/acciones":  # «Probar con una frase» (F4·24, RAG-26)
            return self.interno(lambda p: acciones.probar(str(p["texto"])[:500]))
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
    filtros, fuente = interprete.reglas(texto, [p["marca"] for p in todos], todos), "reglas"
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
        if pedido.get("evento") == "tiempo":  # "Simular que pasó el tiempo": Pausa (F4·13) o «Sin respuesta» (RF-21)
            mensajes, st = flujo.tiempo_cumplido(st)
        elif pedido.get("evento") == "fallo":  # "Simular fallo de envío" (RF-22)
            r = flujo.envio_fallido(st, st.get("nodo"))
            mensajes, st = r if r else ([], st)
            if not r:
                avisos.append("Este cuadro no tiene «Error al enviar el mensaje» conectado.")
        else:
            texto = str(pedido["texto"])[:1000]
            cuadro = flujo.en_agente(st) if texto.strip() else None
            r = None
            if cuadro and flujo.normalizar(texto) not in flujo.SALUDOS + ("0", "reiniciar"):  # cuadro Agente (F4·35, RF-39): Avi de verdad
                previo = (st.get("sim_previo") or [])[-29:] + [{"role": "user", "content": texto}]
                r = agente.responder_cuadro(st, texto, {"id": None, "telefono": "", "nombre": "", "etiquetas": []}, cuadro,
                                            config=db.agente_config(fresco=True), simulador=True, previo=previo)
                if r:
                    st = r["st"]
                    st["sim_previo"] = (previo + [{"role": "assistant", "content": visor.texto_saliente(m)} for m in r["mensajes"]])[-30:]
                    avisos.append(f"🤖 Avi respondió · US$ {r['costo_usd']}" + (f" · {r['nota']}" if r["nota"] else ""))
                    mensajes = r["mensajes"]
                else:
                    avisos.append("🤖 Avi no respondió (cerebro apagado o con error): atiende el Híbrido.")
            if r is None:
                mensajes, st = flujo.responder(st, texto, avisos.append)
    for m in mensajes:
        m.pop("_cuadro", None)
    if st.get("bot") != antes:  # "Ir a otro bot", o "hola" desde otro bot: se avisa a quien prueba
        avisos.append(f"El cliente pasó al bot «{db.nombre_bot(st['bot'])}».")
    return {"avisos": avisos, "mensajes": mensajes, "estado": st}


def probar_agente(pedido):
    """Un turno de Avi con la conversación que lleva la pantalla Probar. No usa lead real: no guarda datos ni cuenta turnos del día."""
    previo = [{"role": "assistant" if m.get("role") == "assistant" else "user", "content": str(m.get("content", ""))[:1000]}
              for m in (pedido.get("mensajes") or [])[-30:] if str(m.get("content", "")).strip()]
    if not previo or previo[-1]["role"] != "user":
        raise ValueError("falta el mensaje del cliente")
    lead = {"id": None, "telefono": "", "nombre": str(pedido.get("nombre", ""))[:80], "etiquetas": []}
    st = pedido.get("estado") or flujo.estado_vacio()
    r = agente.responder(st, previo[-1]["content"], lead, config=db.agente_config(fresco=True), simulador=True, previo=previo)
    if r is None:
        return {"hibrido": True}
    return {"textos": [visor.texto_saliente(m) for m in r["mensajes"]], "traza": r["traza"], "asesor": r["asesor"],
            "flujo": r["flujo"], "costo_usd": r["costo_usd"], "tokens": r["tokens"], "nota": r["nota"], "estado": r["st"]}


if __name__ == "__main__":
    if not ENV.get("META_TOKEN") or not ENV.get("META_PHONE_NUMBER_ID") or not ENV.get("META_VERIFY_TOKEN"):
        sys.exit("✗ No hay conexión con Meta: ni en la base (Configuración → Meta) ni en .env.meta")
    if not ENV.get("META_APP_SECRET"):
        print("⚠ Falta META_APP_SECRET: la verificación de Meta funciona, pero los mensajes se rechazan.")
    anotar(f"Receptor de prueba escuchando en 127.0.0.1:{PUERTO}/webhook")
    # El visor de la demo se apagó en F3·5: la Bandeja de CRM InventarIA ocupa el 8096 (decisión 0017).
    threading.Thread(target=reloj, daemon=True).start()  # Pausas vencidas (F4·13)
    ThreadingHTTPServer(("127.0.0.1", PUERTO), Webhook).serve_forever()

"""
Acceso del bot de PRUEBA a la Supabase del CRM (decisión 0014), por PostgREST con la clave de servicio.

Tablas: productos, etapas, leads y mensajes (migraciones 0001 y 0002). Solo el servidor usa esta clave:
las tablas tienen RLS sin políticas, así que la clave pública no ve nada.
"""

import json
import time
from datetime import datetime, timedelta, timezone
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def _leer_env(ruta):
    env = {}
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.strip().startswith("#"):
            k, _, v = linea.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


_SUPA = _leer_env(RAIZ / "supabase/.env")
REST = f"http://localhost:{_SUPA.get('KONG_HTTP_PORT', '8020')}/rest/v1"
_CLAVE = _SUPA["SERVICE_ROLE_KEY"]
_CABECERAS = {"apikey": _CLAVE, "Authorization": f"Bearer {_CLAVE}", "Content-Type": "application/json"}


def pedir(ruta, metodo="GET", cuerpo=None, prefer=None):
    cabeceras = dict(_CABECERAS)
    if prefer:
        cabeceras["Prefer"] = prefer
    peticion = urllib.request.Request(f"{REST}/{ruta}", method=metodo, headers=cabeceras,
                                      data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
    with urllib.request.urlopen(peticion, timeout=20) as r:
        texto = r.read().decode()
        return json.loads(texto) if texto else None


def q(valor):
    return urllib.parse.quote(str(valor), safe="")


# --------------------------------------------------------------------------- #
# Conexión con Meta (F4·16, RC-04 y RC-07)
# --------------------------------------------------------------------------- #

_meta = {"t": 0, "config": None, "ok": False}


def config_meta(forzar=False):
    """Conexión con Meta guardada en la base (Configuración → Meta), con los secretos de Vault.

    Se relee cada 30 s. Devuelve (config, origen): config es None si la base no tiene conexión; si la base no
    responde, se conserva la última buena. Nunca lanza: el receptor sigue con lo que tenga."""
    if forzar or time.time() - _meta["t"] > 30:
        try:
            _meta.update(config=pedir("rpc/meta_config", "POST", {}), ok=True)
        except Exception:
            pass  # se queda con la última lectura buena
        _meta["t"] = time.time()
    return _meta["config"], _meta["ok"]


# --------------------------------------------------------------------------- #
# Inventario (solo lectura para el bot)
# --------------------------------------------------------------------------- #

_cache = {"t": 0, "filas": []}


def sin_stock(codigos):
    """F4·66 (RPD-53): de esos códigos, los que ya no tienen stock, preguntando a la base sin copia (otro cliente pudo pagarlo hace un
    segundo). Devuelve un conjunto en mayúsculas; un código que no existe cuenta como sin stock."""
    pedidos = {str(c).strip().upper() for c in codigos if str(c).strip()}
    if not pedidos:
        return set()
    lista = ",".join('"' + c.replace('"', "") + '"' for c in pedidos)
    filas = pedir("productos?select=codigo,stock&codigo=in.(" + urllib.parse.quote(lista, safe=",") + ")") or []
    con_stock = {f["codigo"].strip().upper() for f in filas if int(f.get("stock") or 0) > 0}
    return pedidos - con_stock


def olvidar_inventario():
    """F4·66 (RPD-52): tras validar un pago el stock cambió; el siguiente cliente lo ve sin esperar los 30 s de la copia."""
    _cache["t"] = 0
    _cache_bot.pop("agotados", None)


def productos_agotados():
    """Equipos en stock 0 (código, marca y modelo): para avisar que el que pidió el cliente ya no está (F4·42, RAG-46)."""
    return _cacheado("agotados", "productos?stock=eq.0&select=codigo,marca,modelo,categoria", 60) or []


def producto_atributos():
    """Atributos activos del producto (F4·41): clave, nombre, tipo y emoji. Cada 30 s, como el resto de la configuración."""
    return _cacheado("producto_atributos", "producto_atributos?archivado_en=is.null&select=clave,nombre,tipo,emoji&order=orden,id") or []


def productos_con_stock():
    """Productos con stock. Se refresca cada 30 s: un cambio de precio se ve casi en el acto."""
    if time.time() - _cache["t"] > 30:
        _cache.update(t=time.time(), filas=pedir("productos?stock=gt.0&select=*&order=precio"))
    return _cache["filas"]


# --------------------------------------------------------------------------- #
# Flujo del bot, horario y festivos (F3·7 y F4·5, decisiones 0023 y 0026)
# --------------------------------------------------------------------------- #

_cache_bot = {}


def _cacheado(clave, ruta, segundos=30):
    """Lee de la base cada `segundos`; si la base falla, devuelve lo último que se leyó (o None)."""
    t, valor = _cache_bot.get(clave, (0, None))
    if time.time() - t > segundos:
        try:
            valor = pedir(ruta)
        except Exception:
            pass
        _cache_bot[clave] = (time.time(), valor)
    return valor


def principal():
    """Id del bot principal (decisión 0028): el que atiende a todo cliente que no va en otro bot."""
    filas = _cacheado("principal", "bots?principal=eq.true&select=id")
    return filas[0]["id"] if filas else None


def nombre_bot(bot):
    filas = _cacheado("bots", "bots?select=id,nombre") or []
    return next((b["nombre"] for b in filas if b["id"] == bot), f"bot {bot}")


def flujo(bot=None):
    """{clave: cuadro} de la versión publicada de un bot (F4·5 y F4·10, decisiones 0026 y 0028); sin bot, el
    principal. None si ese bot no tiene versión publicada o está archivado. Un cambio se ve en menos de 30 s."""
    if bot is None or bot == principal():
        filas = _cacheado("flujo", "bot_flujos?estado=eq.publicada&select=version,bots!inner(principal),bot_cuadros(*)"
                                   "&bots.principal=eq.true")
        if not filas:
            raise RuntimeError("No hay una versión publicada del flujo del bot principal")
        return {c["clave"]: c for c in filas[0]["bot_cuadros"]}
    filas = _cacheado(f"flujo-{int(bot)}", f"bot_flujos?bot_id=eq.{int(bot)}&estado=eq.publicada"
                                           "&select=version,bots!inner(archivado),bot_cuadros(*)&bots.archivado=eq.false")
    return {c["clave"]: c for c in filas[0]["bot_cuadros"]} if filas else None


def cuadros_de_version(version, bot=None):
    """{clave: cuadro} de una versión de un bot (simulador, F4·8; el principal si no se dice cuál). Sin caché: el
    borrador cambia a cada rato."""
    filtro = f"bot_id=eq.{int(bot)}" if bot else "bots.principal=eq.true"
    filas = pedir(f"bot_flujos?{filtro}&version=eq.{int(version)}&select=version,bots!inner(principal),bot_cuadros(*)")
    return {c["clave"]: c for c in filas[0]["bot_cuadros"]} if filas else None


def horario():
    return _cacheado("horario", "horario_atencion?select=dia,abre,cierra&order=dia,abre") or []


def festivos():
    return {f["fecha"] for f in _cacheado("festivos", "festivos?select=fecha") or []}


# --------------------------------------------------------------------------- #
# Acciones, conocimiento y configuración del agente (F4·22 a F4·24, migración 0024)
# --------------------------------------------------------------------------- #

def acciones_activas():
    """Acciones «Cuando → Hacer» activas, de la primera a la última (RAG-25). Un cambio se ve en menos de 30 s."""
    return _cacheado("acciones", "acciones?activa=eq.true&select=id,nombre,cuando,hacer,prioridad&order=prioridad") or []


def acciones_todas():
    """Todas, sin caché: para «Probar» desde la pantalla, que debe ver lo recién guardado."""
    return pedir("acciones?select=id,nombre,cuando,hacer,prioridad,activa&order=prioridad") or []


def conocimiento(categoria, fresco=False):
    """Fichas activas de una categoría, en su orden (F4·23)."""
    ruta = f"conocimiento?activa=eq.true&categoria=eq.{q(categoria)}&select=id,titulo,respuesta,archivo&order=orden"
    return (pedir(ruta) if fresco else _cacheado(f"conocimiento-{categoria}", ruta)) or []


def agente_config(fresco=False):
    ruta = "agente_config?id=eq.1&select=*"
    filas = pedir(ruta) if fresco else _cacheado("agente_config", ruta)
    return filas[0] if filas else {}


def atributos():
    """Los datos de la ficha activos (lead_atributos, F4·30/F4·33): {clave: {nombre, tipo, opciones}}. Los usan el cuadro Pregunta,
    las marcas {dato} de los mensajes y «Marcar un dato» (F4·34)."""
    filas = _cacheado("atributos", "lead_atributos?archivado_en=is.null&select=clave,nombre,tipo,opciones") or []
    return {a["clave"]: a for a in filas}


def bot_config():
    """Interruptores del bot (F4·35, RF-31): chatbot_activo, menu_activo, agente_en_todo y texto_apagado. Un cambio se ve en
    menos de 30 s. Sin la fila (base vieja), todo encendido como antes."""
    filas = _cacheado("bot_config", "bot_config?id=eq.1&select=chatbot_activo,menu_activo,agente_en_todo,texto_apagado") or []
    return filas[0] if filas else {"chatbot_activo": True, "menu_activo": True, "agente_en_todo": False, "texto_apagado": ""}


def bot_modo(bot):
    """Cómo atiende un bot: menu, hibrido o agente (F4·22, RAG-14). Un cambio se ve en menos de 30 s."""
    filas = _cacheado("bots-modo", "bots?select=id,modo") or []
    return next((b["modo"] for b in filas if b["id"] == bot), "hibrido")


def mensajes_recientes(lead_id, cuantos):
    """Los últimos mensajes de la conversación, del más viejo al más nuevo (memoria del agente, RAG-12)."""
    filas = pedir(f"mensajes?lead_id=eq.{int(lead_id)}&select=lado,texto,tipo,creado_en&order=creado_en.desc&limit={int(cuantos)}") or []
    return list(reversed(filas))


def buscar_conocimiento(texto, limite=5):
    """Fichas y documentos activos que más se parecen a la pregunta (F4·32, RAG-29)."""
    return pedir("rpc/buscar_conocimiento", "POST", {"p_texto": texto, "p_limite": limite}) or []


def turnos_del_dia(lead_id):
    """Turnos del agente con este cliente desde la medianoche de Colombia (límite por conversación, RAG-08)."""
    ahora = datetime.now(timezone.utc) - timedelta(hours=5)
    desde = ahora.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(hours=5)
    filas = pedir(f"agente_turnos?lead_id=eq.{int(lead_id)}&detalle-%3E%3Epaso=eq.1&resultado=neq.simulador"
                  f"&en=gte.{q(desde.isoformat())}&select=id") or []
    return len(filas)


def crear_seguimiento(lead_id, que, horas, asignado_a, creado_por):
    """Recordatorio para un asesor (F3·6). El agente no es un usuario: lo firma quien configuró el agente."""
    vence = (datetime.now(timezone.utc) + timedelta(hours=horas)).isoformat()
    pedir("seguimientos", "POST", {"lead_id": lead_id, "que": que, "vence_en": vence, "asignado_a": asignado_a,
                                   "creado_por": creado_por, "nota": "Lo dejó Avi"}, "return=minimal")


def mensajes_del_cliente(lead_id, cuantos=200):
    """Hasta `cuantos` mensajes de la conversación, del más viejo al más nuevo (para el resumen del agente)."""
    return mensajes_recientes(lead_id, cuantos)


def vaciar_papelera():
    """Borra los leads con más de 30 días en la papelera (0035). Devuelve {borrados, media, cotizaciones} con los archivos a quitar."""
    return pedir("rpc/leads_vaciar_papelera", "POST", {}) or {}


def borrar_archivos(bucket, rutas):
    """Quita archivos del almacenamiento (fotos y audios del chat, PDF de cotizaciones) de leads ya borrados."""
    if not rutas:
        return
    url = REST.replace("/rest/v1", f"/storage/v1/object/{bucket}")
    for i in range(0, len(rutas), 100):
        peticion = urllib.request.Request(url, method="DELETE", headers=_CABECERAS, data=json.dumps({"prefixes": rutas[i:i + 100]}).encode())
        with urllib.request.urlopen(peticion, timeout=30) as r:
            r.read()


def compra_mover(lead_id, paso):
    """Lleva la oportunidad abierta del cliente al paso de compra (0027): solo hacia adelante, salvo cancelar."""
    return pedir("rpc/compra_mover", "POST", {"p_lead": lead_id, "p_paso": paso})


def agregar_nota(lead_id, notas_actuales, nota):
    """Suma una línea a las notas del cliente (las ve el asesor en la Bandeja)."""
    notas = ((notas_actuales or "").rstrip() + "\n" + nota).strip()
    pedir(f"leads?id=eq.{lead_id}", "PATCH", {"notas": notas[-8000:]}, "return=minimal")
    return notas


def crear_cotizacion(fila):
    """Guarda la cotización y devuelve la fila con su consecutivo (F4·26)."""
    return pedir("cotizaciones?select=id,consecutivo", "POST", fila, "return=representation")[0]


def guardar_pdf_cotizacion(cotizacion_id, ruta, contenido):
    """Sube el PDF al bucket privado 'cotizaciones' y lo anota en la cotización."""
    url = REST.replace("/rest/v1", f"/storage/v1/object/cotizaciones/{urllib.parse.quote(ruta)}")
    peticion = urllib.request.Request(url, method="POST", data=contenido, headers={
        "apikey": _CLAVE, "Authorization": f"Bearer {_CLAVE}", "Content-Type": "application/pdf", "x-upsert": "true"})
    with urllib.request.urlopen(peticion, timeout=60):
        pass
    pedir(f"cotizaciones?id=eq.{int(cotizacion_id)}", "PATCH", {"pdf": ruta}, "return=minimal")


def apariencia_para_pdf():
    """Colores y logo de Apariencia (F4·19) para el PDF: (colores, bytes del logo o None, mime)."""
    filas = _cacheado("apariencia", "apariencia?id=eq.1&select=color_panel,color_principal,color_acento,logo", 300) or [{}]
    a = filas[0] if filas else {}
    if not a.get("logo"):
        return a, None, "image/png"
    try:
        ext = a["logo"].rsplit(".", 1)[-1]
        return a, descargar("marca", a["logo"]), {"jpg": "image/jpeg", "webp": "image/webp"}.get(ext, "image/png")
    except Exception:
        return a, None, "image/png"


def registrar_accion(accion_id, lead_id):
    pedir("acciones_registro", "POST", {"accion_id": accion_id, "lead_id": lead_id}, "return=minimal")


# --------------------------------------------------------------------------- #
# Leads
# --------------------------------------------------------------------------- #

def lead(telefono):
    """El lead activo de ese teléfono. Los de la papelera no cuentan: si el cliente vuelve a escribir, entra como nuevo (RL-11, 0035)."""
    filas = pedir(f"leads?telefono=eq.{q(telefono)}&eliminado_en=is.null&select=*")
    return filas[0] if filas else None


def vincular_usuario(telefono, usuario):
    """Guarda el identificador de WhatsApp (BSUID) de un cliente con número, para encontrarlo si luego escribe sin él (0051)."""
    pedir(f"leads?telefono=eq.{q(telefono)}&eliminado_en=is.null&wa_user_id=is.null", "PATCH", {"wa_user_id": usuario}, "return=minimal")


def telefono_por_usuario(usuario):
    """El teléfono (o identificador) del cliente activo con ese usuario de WhatsApp, o None."""
    filas = pedir(f"leads?wa_user_id=eq.{q(usuario)}&eliminado_en=is.null&select=telefono")
    return filas[0]["telefono"] if filas else None


def crear_lead(telefono, nombre):
    """Un cliente nuevo entra siempre en la primera etapa del embudo. Si otro hilo ya lo creó (teléfono único entre los activos), se usa ese."""
    try:
        pedir("leads", "POST", {"telefono": telefono, "nombre": nombre or "", "etapa": "Nuevo"}, "return=minimal")
    except urllib.error.HTTPError as e:
        if e.code != 409:
            raise
    return lead(telefono)


def actualizar_lead(lead_id, campos):
    pedir(f"leads?id=eq.{lead_id}", "PATCH", campos, "return=minimal")


def orden_de_etapas():
    return {e["nombre"]: e["orden"] for e in pedir("etapas?select=nombre,orden")}


# --------------------------------------------------------------------------- #
# Catálogos (decisión 0015)
# --------------------------------------------------------------------------- #

def _sin_tildes(s):
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


def catalogo_para(categoria, marca):
    """(el más específico para la categoría y marca, el enlace de Drive con todos). Cualquiera puede ser None.

    Orden de preferencia: categoría y marca exactas → solo categoría → general (sin categoría ni marca).
    """
    activos = pedir("catalogos?activo=is.true&select=*&order=id")
    todos = next((c for c in activos if c["todos"]), None)
    candidatos = [c for c in activos if not c["todos"]]
    cat, mar = _sin_tildes(categoria), _sin_tildes(marca)

    def puntos(c):
        c_cat, c_mar = _sin_tildes(c["categoria"]), _sin_tildes(c["marca"])
        if (c_cat and c_cat != cat) or (c_mar and c_mar != mar):
            return -1
        return (2 if c_cat else 0) + (1 if c_mar else 0)

    elegibles = sorted((c for c in candidatos if puntos(c) >= 0), key=lambda c: (puntos(c), c["id"]), reverse=True)  # a igual puntaje, el más nuevo
    return (elegibles[0] if elegibles else None), todos


def catalogo(catalogo_id):
    """Un catálogo activo por id (cuadro Catálogos, F4·12), o None si se apagó o se borró."""
    if not catalogo_id:
        return None
    filas = pedir(f"catalogos?id=eq.{int(catalogo_id)}&activo=is.true&select=*")
    return filas[0] if filas else None


def retorno_config():
    """Ajustes del retorno del bot y el seguimiento automático (F4·45, RT-10). Un cambio se ve en menos de 30 s. Sin la fila, apagado."""
    filas = _cacheado("retorno_config", "retorno_config?id=eq.1&select=*") or []
    return filas[0] if filas else {"activo": False}


def retorno_candidatos(lead_id=None):
    """Clientes que deben recibir el mensaje automático ahora: [{lead_id, telefono, nombre, regla}] (RT-01 a RT-08)."""
    cuerpo = {"p_lead": int(lead_id)} if lead_id else {}
    return pedir("rpc/retorno_candidatos", "POST", cuerpo) or []


def retorno_marcar(lead_id, regla):
    pedir("rpc/retorno_marcar", "POST", {"p_lead": int(lead_id), "p_regla": regla})


def retorno_evento(lead_id, detalle):
    pedir("rpc/retorno_evento", "POST", {"p_lead": int(lead_id), "p_detalle": detalle})


def retorno_destino(etapa):
    """El bot al que vuelve el cliente (RT-06); None = el principal."""
    return pedir("rpc/retorno_destino", "POST", {"p_etapa": etapa or ""})


def retorno_inactivos():
    """RT-05.4: devuelve al bot los chats con asesor sin actividad en P horas. Cuántos volvieron."""
    return pedir("rpc/retorno_inactivos", "POST", {}) or 0


def esperas_vencidas():
    """Teléfonos de los clientes cuya Pausa ya venció (F4·13); el reloj del receptor los atiende."""
    ahora = datetime.now(timezone.utc).isoformat()
    return [f["telefono"] for f in pedir(f"leads?espera_vence_en=lte.{q(ahora)}&select=telefono&order=espera_vence_en&limit=50")]


def ultimo_del_cliente(lead_id):
    """Cuándo escribió el cliente por última vez (ventana de 24 h de Meta), o None."""
    filas = pedir(f"mensajes?lead_id=eq.{int(lead_id)}&lado=eq.cliente&select=creado_en&order=creado_en.desc&limit=1")
    return datetime.fromisoformat(filas[0]["creado_en"]) if filas else None


def guardar_media_id(catalogo_id, media_id):
    pedir(f"catalogos?id=eq.{catalogo_id}", "PATCH", {"meta_media_id": media_id, "meta_media_en": "now"},
          "return=minimal")


def descargar(bucket, ruta):
    """Baja un archivo de un bucket privado con la clave de servicio."""
    url = REST.replace("/rest/v1", f"/storage/v1/object/{bucket}/{urllib.parse.quote(ruta)}")
    peticion = urllib.request.Request(url, headers={"apikey": _CLAVE, "Authorization": f"Bearer {_CLAVE}"})
    with urllib.request.urlopen(peticion, timeout=60) as r:
        return r.read()


def guardar_foto_meta(producto_id, media_id):
    pedir(f"productos?id=eq.{producto_id}", "PATCH", {"foto_meta_id": media_id, "foto_meta_en": "now"},
          "return=minimal")
    _cache["t"] = 0


def descargar_pdf(ruta):
    """Baja un PDF del bucket privado 'catalogos' con la clave de servicio."""
    url = REST.replace("/rest/v1", f"/storage/v1/object/catalogos/{urllib.parse.quote(ruta)}")
    peticion = urllib.request.Request(url, headers={"apikey": _CLAVE, "Authorization": f"Bearer {_CLAVE}"})
    with urllib.request.urlopen(peticion, timeout=60) as r:
        return r.read()


def subir_media(ruta, contenido, mime):
    """Guarda en el bucket privado 'media' lo que mandó el cliente (la app lo muestra por /media/...)."""
    url = REST.replace("/rest/v1", f"/storage/v1/object/media/{urllib.parse.quote(ruta)}")
    peticion = urllib.request.Request(url, method="POST", data=contenido, headers={
        "apikey": _CLAVE, "Authorization": f"Bearer {_CLAVE}", "Content-Type": mime or "application/octet-stream",
        "x-upsert": "true"})
    with urllib.request.urlopen(peticion, timeout=120):
        pass


# --------------------------------------------------------------------------- #
# Mensajes
# --------------------------------------------------------------------------- #

def guardar_mensaje(lead_id, lado, texto, tipo="text", meta_id=None, media=None, cuadro=None, desde_error=False, automatico=False,
                    usuario=None):
    fila = {"lead_id": lead_id, "lado": lado, "texto": texto, "tipo": tipo}
    if usuario:  # F4·61 (RB-11): lo envió un asesor desde el chat con «/» (catálogo o acción)
        fila["usuario_id"] = usuario
    if automatico:  # F4·45 (RT-09): «¿Sigues necesitando ayuda?» o el aviso de demora
        fila["automatico"] = True
    if cuadro:  # el cuadro del bot que lo envió, para «Error al enviar» (RF-22)
        fila["cuadro"] = cuadro
    if desde_error:
        fila["desde_error"] = True
    if meta_id:
        fila["meta_id"] = meta_id
    if media:  # {"ruta", "mime", "nombre"}: audio, imagen o documento del cliente (F3·5)
        fila.update(media_ruta=media["ruta"], media_mime=media["mime"], media_nombre=media.get("nombre", ""))
    pedir("mensajes?on_conflict=meta_id" if meta_id else "mensajes", "POST", fila,
          "resolution=ignore-duplicates,return=minimal" if meta_id else "return=minimal")


def tomar_error_de_envio(wamid):
    """Un mensaje del bot que Meta no entregó (estado failed, RF-22): lo marca como atendido y lo devuelve, una sola vez.
    None si no es de un cuadro con «Error al enviar», ya se atendió o lo envió esa misma salida."""
    filas = pedir(f"mensajes?meta_id=eq.{q(wamid)}&lado=eq.bot&cuadro=not.is.null&desde_error=is.false&error_atendido=is.false"
                  "&select=id,lead_id,cuadro", "PATCH", {"error_atendido": True}, "return=representation")
    return filas[0] if filas else None


def telefono_de(lead_id):
    filas = pedir(f"leads?id=eq.{int(lead_id)}&select=telefono")
    return filas[0]["telefono"] if filas else None


def registrar_estado(estado, error=""):
    """Un estado del webhook (sent, delivered, read, failed) con su precio: la base lo aplica al mensaje (RM-07)."""
    precio = estado.get("pricing") or {}
    marca = estado.get("timestamp")
    pedir("rpc/registrar_estado_meta", "POST", {
        "p_wamid": estado.get("id", ""),
        "p_estado": estado.get("status", ""),
        "p_ocurrido_en": datetime.fromtimestamp(int(marca), timezone.utc).isoformat() if marca else None,
        "p_categoria": precio.get("category", ""),
        "p_cobrable": precio.get("billable"),
        "p_tipo_precio": precio.get("type", ""),
        "p_error": error,
    }, "return=minimal")


def conversaciones(limite=30):
    """Leads con sus mensajes, el más reciente primero (para la Bandeja)."""
    leads = pedir(f"leads?select=*,mensajes(lado,tipo,texto,creado_en)&mensajes.order=creado_en"
                  f"&order=fecha_ultimo_contacto.desc.nullslast&limit={limite}")
    return [l for l in leads if l.get("mensajes")]

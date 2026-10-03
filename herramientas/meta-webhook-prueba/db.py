"""
Acceso del bot de PRUEBA a la Supabase del CRM (decisión 0014), por PostgREST con la clave de servicio.

Tablas: productos, etapas, leads y mensajes (migraciones 0001 y 0002). Solo el servidor usa esta clave:
las tablas tienen RLS sin políticas, así que la clave pública no ve nada.
"""

import json
import time
from datetime import datetime, timezone
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
# Leads
# --------------------------------------------------------------------------- #

def lead(telefono):
    filas = pedir(f"leads?telefono=eq.{q(telefono)}&select=*")
    return filas[0] if filas else None


def crear_lead(telefono, nombre):
    """Un cliente nuevo entra siempre en la primera etapa del embudo."""
    pedir("leads?on_conflict=telefono", "POST", {"telefono": telefono, "nombre": nombre or "", "etapa": "Nuevo"},
          "resolution=ignore-duplicates,return=minimal")
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

    elegibles = sorted((c for c in candidatos if puntos(c) >= 0), key=puntos, reverse=True)
    return (elegibles[0] if elegibles else None), todos


def catalogo(catalogo_id):
    """Un catálogo activo por id (cuadro Catálogos, F4·12), o None si se apagó o se borró."""
    if not catalogo_id:
        return None
    filas = pedir(f"catalogos?id=eq.{int(catalogo_id)}&activo=is.true&select=*")
    return filas[0] if filas else None


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

def guardar_mensaje(lead_id, lado, texto, tipo="text", meta_id=None, media=None, cuadro=None, desde_error=False):
    fila = {"lead_id": lead_id, "lado": lado, "texto": texto, "tipo": tipo}
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

"""
Pruebas de los envíos del alistamiento al cliente (F4·50 bloque C): video, OP/FVE, guía y «listo para recoger». No habla con Meta ni con
la base: se reemplazan por datos fijos. Uso:  python3 herramientas/meta-webhook-prueba/prueba_envios_alistamiento.py
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import db  # noqa: E402
import flujo  # noqa: E402
import receptor  # noqa: E402

A = {"id": 7, "lead_id": 50, "equipos": [{"codigo": "100-1", "nombre": "LENOVO X1"}, {"codigo": "100-2", "nombre": "DELL 5420"}],
     "doc_tipo": "FVE", "doc_numero": "FVE-88", "transportadora": "Servientrega", "numero_guia": "SV-1", "guia_ruta": "7/guia.jpg"}
VIDEOS = [
    {"id": 1, "equipo_codigo": "100-1", "estado": "listo", "ruta": "7/100-1/1.mp4", "peso": 5_000_000, "subido_en": "2026-11-07T10:00:00Z"},
    {"id": 2, "equipo_codigo": "100-1", "estado": "listo", "ruta": "7/100-1/2.mp4", "peso": 6_000_000, "subido_en": "2026-11-07T11:00:00Z"},
    {"id": 3, "equipo_codigo": "100-2", "estado": "listo", "ruta": "7/100-2/3.mp4", "peso": 20_000_000, "subido_en": "2026-11-07T10:30:00Z"},
    {"id": 4, "equipo_codigo": "100-2", "estado": "error", "ruta": None, "peso": None, "subido_en": "2026-11-07T12:00:00Z"},
]
ESTADO = {"ultimo": datetime.now(timezone.utc) - timedelta(hours=1), "falla": False}
ENVIADOS, PATCHES, SUBIDOS, GUARDADOS = [], [], [], []


def marcas():  # las marcas de «enviado», sin contar la reserva que siempre se suelta al terminar
    return [p for p in PATCHES if p[1] != {"envios_en_curso": {}}]


def pedir(ruta, metodo="GET", cuerpo=None, prefer=None):
    if metodo == "PATCH":
        PATCHES.append((ruta, cuerpo))
        return None
    if ruta.startswith("alistamientos?"):
        return [A]
    if ruta.startswith("alistamiento_videos?"):
        return VIDEOS
    return []


db.pedir = pedir
db.telefono_de = lambda lead: "573001112233"
db.ultimo_del_cliente = lambda lead: ESTADO["ultimo"]
db.descargar = lambda bucket, ruta: f"{bucket}:{ruta}".encode()
db.lead = lambda numero: {"id": 50}
db.guardar_mensaje = lambda *a, **k: GUARDADOS.append(a)
flujo.texto_horario = lambda: "🕗 Lunes a viernes: 8:00 am – 6:00 pm"
receptor.subir_a_meta = lambda contenido, mime, nombre: (SUBIDOS.append((contenido.decode(), mime)), f"media-{len(SUBIDOS)}")[1]
receptor.enviar = lambda numero, m: None if ESTADO["falla"] else (ENVIADOS.append(m), f"wamid.{len(ENVIADOS)}")[1]
receptor.anotar = lambda *a: None

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def correr(que):
    ENVIADOS.clear(); PATCHES.clear(); SUBIDOS.clear()
    return receptor.resolver_alistamiento({"lead": 50, "alistamiento": 7, "que": que})


# 1. Video: el último listo de cada equipo; el de más de 16 MB va como documento
r = correr("video")
tipos = [m["type"] for m in ENVIADOS]
ok(r["ok"] and tipos == ["text", "video", "document"], f"texto y un video por equipo: {tipos}")
ok([s[0] for s in SUBIDOS] == ["videos-tecnicos:7/100-1/2.mp4", "videos-tecnicos:7/100-2/3.mp4"], "toma el último video listo de cada equipo")
ok(ENVIADOS[1]["video"]["caption"] == "🎥 Revisión de tu LENOVO X1", "el pie dice de qué equipo es el video")
ok(("alistamientos?id=eq.7", {"video_enviado_en": "now"}) in PATCHES and any("id=in.(2,3)" in p[0] for p in PATCHES),
   "anota la hora del envío en el pedido y en cada video")

# 2. Documento (OP o FVE)
r = correr("documento")
ok(r["ok"] and "factura electrónica (FVE)" in ENVIADOS[0]["text"]["body"] and "FVE-88" in ENVIADOS[0]["text"]["body"],
   "el OP o la FVE sale con su número")

# 3. Guía: la foto con transportadora, número y documento en el pie
r = correr("guia")
pie = ENVIADOS[0]["image"]["caption"]
ok(r["ok"] and ENVIADOS[0]["type"] == "image" and SUBIDOS[0] == ("guias:7/guia.jpg", "image/jpeg"), "la guía sale como foto")
ok("Servientrega" in pie and "SV-1" in pie and "FVE-88" in pie, "el pie de la guía trae transportadora, número y la FVE")
ok(("alistamientos?id=eq.7", {"guia_enviada_en": "now"}) in PATCHES, "anota la hora en que se envió la guía")

# 4. Listo para recoger en tienda
r = correr("listo_tienda")
ok(r["ok"] and "CC La Pasarela" in ENVIADOS[0]["text"]["body"] and "Lunes a viernes" in ENVIADOS[0]["text"]["body"],
   "el aviso de tienda trae la dirección y el horario")

# 5. Fuera de las 24 h no se envía nada
ESTADO["ultimo"] = datetime.now(timezone.utc) - timedelta(hours=30)
r = correr("documento")
ok(not r["ok"] and "24 h" in r["error"] and not ENVIADOS and not marcas(), "fuera de las 24 h no envía ni marca nada")
ESTADO["ultimo"] = datetime.now(timezone.utc) - timedelta(hours=1)

# 6. Si WhatsApp rechaza todo, no se marca como enviado
ESTADO["falla"] = True
r = correr("documento")
ok(not r["ok"] and not marcas(), "si WhatsApp no acepta el envío, no queda marcado como enviado")
ok(any(c == {"envios_en_curso": {}} for _, c in PATCHES), "pase lo que pase, suelta la reserva del envío (F4·54)")
ESTADO["falla"] = False

print(f"\n{n - fallos}/{n} pruebas bien")
sys.exit(1 if fallos else 0)

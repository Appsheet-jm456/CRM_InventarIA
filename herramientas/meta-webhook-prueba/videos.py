"""
Videos de soporte del servicio técnico (F4·50 bloque B, docs/ALISTAMIENTO-Y-VIDEO-TECNICO.md, RAL-05 y RAL-10).

El técnico sube desde el celular un video por equipo al bucket privado `videos-tecnicos` (hasta 100 MB) y la app lo registra en
`alistamiento_videos` como «procesando». Aquí, en segundo plano y de uno en uno:
  1. se baja el original, se comprime con ffmpeg a 720p (el lado corto) en H.264 a ≈ 1,9 Mbps (unos 15 MB por minuto: un video de
     hasta ~1 minuto cabe en los 16 MB que WhatsApp acepta como video), se sube la copia y se borra el original;
  2. los videos con más de 6 meses se borran del bucket y quedan «vencidos».
Si ffmpeg falla, el video queda en «error» con el motivo y el técnico lo sube de nuevo.
"""

import json
import shutil
import subprocess
import tempfile
import threading
import urllib.parse
import urllib.request
from pathlib import Path

import db

BUCKET = "videos-tecnicos"
_candado = threading.Lock()
FFMPEG = ["nice", "-n", "10", "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-threads", "2"]
# El lado corto queda en 720 (o menos, si el original es más chico): sirve para videos horizontales y verticales del celular.
ESCALA = "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'"


def _objeto(ruta):
    return db.REST.replace("/rest/v1", f"/storage/v1/object/{BUCKET}/{urllib.parse.quote(ruta)}")


def _cabeceras(extra=None):
    return {"apikey": db._CLAVE, "Authorization": f"Bearer {db._CLAVE}", **(extra or {})}


def bajar(ruta, destino):
    with urllib.request.urlopen(urllib.request.Request(_objeto(ruta), headers=_cabeceras()), timeout=300) as r, open(destino, "wb") as f:
        shutil.copyfileobj(r, f)


def subir(ruta, origen):
    with open(origen, "rb") as f:
        datos = f.read()
    peticion = urllib.request.Request(_objeto(ruta), method="POST", data=datos,
                                      headers=_cabeceras({"Content-Type": "video/mp4", "x-upsert": "true"}))
    with urllib.request.urlopen(peticion, timeout=300) as r:
        r.read()


def borrar(rutas):
    rutas = [r for r in rutas if r]
    if rutas:
        db.borrar_archivos(BUCKET, rutas)


def comprimir(origen, destino):
    """Deja el video en MP4 H.264 720p con sonido AAC y lo prepara para verse mientras carga. Devuelve la duración en segundos."""
    subprocess.run(FFMPEG + ["-i", str(origen), "-vf", ESCALA, "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
                             "-maxrate", "1800k", "-bufsize", "3600k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-ac", "1",
                             "-movflags", "+faststart", str(destino)], check=True, capture_output=True, timeout=1800)
    salida = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(destino)],
                            check=True, capture_output=True, text=True, timeout=60).stdout
    return round(float(json.loads(salida)["format"]["duration"]), 1)


def procesar(video, anotar=print):
    """Comprime un video «procesando» y lo deja «listo» (o «error»)."""
    original = video["original"]
    final = f"{video['alistamiento_id']}/{original.split('/')[1]}/{video['id']}.mp4"
    with tempfile.TemporaryDirectory(prefix="video-tecnico-") as tmp:
        entrada, salida = Path(tmp) / "original", Path(tmp) / "final.mp4"
        try:
            bajar(original, entrada)
            duracion = comprimir(entrada, salida)
            subir(final, salida)
        except subprocess.CalledProcessError as e:
            motivo = (e.stderr or b"").decode(errors="replace").strip().splitlines()[-1:] or ["ffmpeg falló"]
            db.pedir(f"alistamiento_videos?id=eq.{video['id']}", "PATCH",
                     {"estado": "error", "error": f"No se pudo procesar el video: {motivo[0][:200]}"}, "return=minimal")
            anotar(f"  ✗ video {video['id']}: ffmpeg falló: {motivo[0][:200]}")
            return
        peso = salida.stat().st_size
    db.pedir(f"alistamiento_videos?id=eq.{video['id']}", "PATCH",
             {"estado": "listo", "ruta": final, "peso": peso, "duracion_s": duracion, "original": None, "error": None}, "return=minimal")
    if original != final:
        borrar([original])
    anotar(f"  🎥 video {video['id']} listo: {video.get('peso_original') or 0:,} → {peso:,} bytes, {duracion} s")


def vencer(anotar=print):
    """RAL-10: a los 6 meses se borran del bucket y quedan «vencidos»."""
    viejos = db.pedir("alistamiento_videos?vence_en=lt.now&estado=neq.vencido&select=id,ruta,original&limit=100") or []
    for v in viejos:
        borrar([v.get("ruta"), v.get("original")])
        db.pedir(f"alistamiento_videos?id=eq.{v['id']}", "PATCH", {"estado": "vencido", "ruta": None, "original": None}, "return=minimal")
    if viejos:
        anotar(f"  🗑 {len(viejos)} video(s) del servicio técnico vencidos (6 meses) borrados")


def revisar(anotar=print):
    """Lo llama el reloj del receptor. Corre en su propio hilo y nunca dos a la vez: comprimir puede tardar minutos."""
    if not _candado.acquire(blocking=False):
        return

    def trabajo():
        try:
            pendientes = db.pedir("alistamiento_videos?estado=eq.procesando&original=not.is.null"
                                  "&select=id,alistamiento_id,original,peso_original&order=id&limit=5") or []
            for v in pendientes:
                try:
                    procesar(v, anotar)
                except Exception as e:  # la red o el bucket: se reintenta en la próxima vuelta
                    anotar(f"  ✗ video {v['id']}: {e!r}")
            vencer(anotar)
        except Exception as e:
            anotar(f"  ✗ la revisión de videos falló: {e!r}")
        finally:
            _candado.release()

    threading.Thread(target=trabajo, daemon=True, name="videos-tecnicos").start()

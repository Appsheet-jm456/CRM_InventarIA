"""
Pruebas del compresor de videos del servicio técnico (F4·50 bloque B). Usa ffmpeg de verdad con videos sintéticos; no toca la base ni el
almacenamiento (se reemplazan por archivos locales). Uso:  python3 herramientas/meta-webhook-prueba/prueba_videos.py
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import db  # noqa: E402
import videos  # noqa: E402

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def sintetico(destino, ancho, alto, segundos):
    """Un video «de celular»: movimiento y ruido a alta tasa (como uno real de 1080p), con sonido."""
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=size={ancho}x{alto}:rate=30",
                    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", str(segundos), "-vf", "noise=alls=20:allf=t",
                    "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "12M", "-c:a", "aac", str(destino)], check=True)


def info(ruta):
    s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(ruta)],
                                  check=True, capture_output=True, text=True).stdout)
    v = next(x for x in s["streams"] if x["codec_type"] == "video")
    return int(v["width"]), int(v["height"]), v["codec_name"], any(x["codec_type"] == "audio" for x in s["streams"]), float(s["format"]["duration"])


tmp = Path(tempfile.mkdtemp(prefix="prueba-videos-"))
try:
    # 1. Vertical de celular 1080x1920, 20 s a 12 Mbps
    sintetico(tmp / "vertical.mp4", 1080, 1920, 20)
    antes = (tmp / "vertical.mp4").stat().st_size
    dur = videos.comprimir(tmp / "vertical.mp4", tmp / "vertical-720.mp4")
    w, h, codec, audio, _ = info(tmp / "vertical-720.mp4")
    despues = (tmp / "vertical-720.mp4").stat().st_size
    ok((w, h) == (720, 1280) and codec == "h264" and audio, f"vertical 1080x1920 → {w}x{h} H.264 con sonido")
    ok(abs(dur - 20) < 1 and despues < antes / 3, f"20 s: {antes / 1e6:.1f} MB → {despues / 1e6:.1f} MB")
    ok(despues / dur * 60 <= 16e6, f"≈ {despues / dur * 60 / 1e6:.1f} MB por minuto: un video de hasta 1 minuto cabe en los 16 MB de WhatsApp")

    # 2. Horizontal 1920x1080 y uno chico (480p) que no se agranda
    sintetico(tmp / "horizontal.mp4", 1920, 1080, 5)
    videos.comprimir(tmp / "horizontal.mp4", tmp / "h-720.mp4")
    ok(info(tmp / "h-720.mp4")[:2] == (1280, 720), "horizontal 1920x1080 → 1280x720")
    sintetico(tmp / "chico.mp4", 640, 480, 3)
    videos.comprimir(tmp / "chico.mp4", tmp / "chico-out.mp4")
    ok(info(tmp / "chico-out.mp4")[:2] == (640, 480), "un video de 640x480 no se agranda")

    # 3. procesar(): baja, comprime, sube la copia, borra el original y deja el video «listo»
    BUCKET, CAMBIOS, BORRADOS = {"7/100-101-1147/abc.mov": tmp / "vertical.mp4"}, [], []
    videos.bajar = lambda ruta, destino: shutil.copy(BUCKET[ruta], destino)
    videos.subir = lambda ruta, origen: BUCKET.__setitem__(ruta, Path(shutil.copy(origen, tmp / "subido.mp4")))
    videos.borrar = lambda rutas: BORRADOS.extend(rutas)
    db.pedir = lambda ruta, metodo="GET", cuerpo=None, prefer=None: CAMBIOS.append((ruta, cuerpo))
    videos.procesar({"id": 41, "alistamiento_id": 7, "original": "7/100-101-1147/abc.mov", "peso_original": antes}, anotar=lambda *_: None)
    ruta, cambio = CAMBIOS[-1]
    ok(ruta == "alistamiento_videos?id=eq.41" and cambio["estado"] == "listo" and cambio["ruta"] == "7/100-101-1147/41.mp4"
       and cambio["original"] is None and cambio["peso"] < antes, "procesar deja el video listo en 7/100-101-1147/41.mp4 con su peso")
    ok(BORRADOS == ["7/100-101-1147/abc.mov"], "el original se borra después de subir la copia")

    # 4. Un archivo que no es video queda en «error» con el motivo (el técnico lo sube de nuevo)
    (tmp / "no-video.mp4").write_bytes(b"esto no es un video")
    BUCKET["7/x/malo.mp4"] = tmp / "no-video.mp4"
    videos.procesar({"id": 42, "alistamiento_id": 7, "original": "7/x/malo.mp4"}, anotar=lambda *_: None)
    ok(CAMBIOS[-1][1]["estado"] == "error" and "No se pudo procesar" in CAMBIOS[-1][1]["error"], "un archivo dañado queda en «error» con el motivo")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print(f"\n{n - fallos}/{n} pruebas bien")
sys.exit(1 if fallos else 0)

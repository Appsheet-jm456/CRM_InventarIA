"""
Pruebas de las fotos del equipo (F4·65, docs/INVENTARIO.md RFE-05 y RFE-06): la ficha lleva «📷 Más fotos» si hay carpeta de Drive y
después salen las Fotos 2 y 3; sin Foto 1 no salen solas; el receptor sube cada foto extra a Meta una vez. Sin base ni WhatsApp.
Uso: python3 herramientas/meta-webhook-prueba/prueba_fotos_equipo.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import acciones, db, flujo, receptor

DRIVE = "https://drive.google.com/drive/folders/abc123"


def equipo(cod, modelo, foto=None, extra=None, drive=""):
    return {"cod": cod, "marca": "LENOVO", "modelo": modelo, "cpu": "Core i5-8365U", "gen": 8, "ram": "8GB", "disco": "256GB NVMe",
            "estado": "Usado", "precio": 950000, "stock": 1, "categoria": "Portatil", "descripcion": "", "foto": foto,
            "atributos": {}, "fotos_extra": extra or [], "fotos_drive": drive}


T490 = equipo("100-101-1121-2", "THINKPAD T490", foto={"_producto": {"id": 393}}, extra=["393/1-2.jpg", "393/1-3.png"], drive=DRIVE)
X13 = equipo("X13-01", "THINKPAD X13", foto={"_producto": {"id": 2}})
SINFOTO = equipo("D5420", "LATITUDE 5420", extra=["5/1-2.jpg"], drive=DRIVE)
flujo.inventario = lambda: [T490, X13, SINFOTO]
db.productos_agotados = lambda: []
db.agente_config = lambda fresco=False: {"plantilla_equipo": "💻 *{equipo}* · {codigo}\n💰 {precio}", "max_equipos": 3}
fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


FICHA = {"id": 9, "nombre": "Pregunta por un equipo", "activa": True, "cuando": [{"forma": "equipo", "texto": "un equipo del inventario"}],
         "hacer": [{"tipo": "ficha_equipo"}]}


def ficha(texto):
    st = flujo.estado_vacio()
    return acciones.ejecutar(FICHA, st, None, texto=texto)[0]


# Bot del menú (r11): se prueba solo lo que suma F4·65, sin la base de cuadros.
ok(flujo.con_drive("💻 ficha", T490) == f"💻 ficha\n📷 Más fotos: {DRIVE}", "la ficha suma el renglón «📷 Más fotos» con el enlace")
ok(flujo.con_drive("💻 ficha", X13) == "💻 ficha", "sin carpeta de Drive la ficha queda igual")
ok(flujo.con_drive("x" * 1020, T490) == "x" * 1020, "si el renglón no cabe en 1.024 caracteres, no se agrega")
extras = flujo.fotos_extra(T490)
ok([m["image"].get("_extra") for m in extras] == ["393/1-2.jpg", "393/1-3.png"] and all(not m["image"]["caption"] for m in extras),
   "las Fotos 2 y 3 salen como imágenes sin texto, en orden")
ok(flujo.fotos_extra(SINFOTO) == [], "sin Foto 1 subida, las fotos 2 y 3 no salen solas (RI-14)")

# Acción «Pregunta por un equipo» (F4·42)
msgs = ficha("info del 100-101-1121-2")
ok(msgs[0]["type"] == "image" and msgs[0]["image"].get("_producto") and DRIVE in msgs[0]["image"]["caption"],
   "RFE-05: la ficha sale con la Foto 1 y «📷 Más fotos»")
ok([m["image"].get("_extra") for m in msgs[1:3]] == ["393/1-2.jpg", "393/1-3.png"], "RFE-05: después de la ficha salen las Fotos 2 y 3")
msgs = ficha("info del X13-01")
ok(len(msgs) == 1 and msgs[0]["type"] == "image" and "Más fotos" not in msgs[0]["image"]["caption"],
   "RFE-06: con solo la Foto 1 la ficha sale como siempre, sin mensajes de más")

# Receptor: sube cada foto extra a Meta una vez y la reutiliza
subidas = []
receptor.subir_a_meta = lambda datos, mime, nombre: (subidas.append((mime, nombre)), f"media-{len(subidas)}")[1]
receptor.db.descargar = lambda bucket, ruta: b"img"
r1 = receptor.resolver(flujo.m_imagen({"_extra": "393/1-3.png"}, ""))
r2 = receptor.resolver(flujo.m_imagen({"_extra": "393/1-3.png"}, ""))
ok(r1 == {"type": "image", "image": {"id": "media-1"}} and r2 == r1, "el receptor sube la foto extra y la reutiliza en el siguiente envío")
ok(subidas == [("image/png", "1-3.png")], "la sube una sola vez, con el tipo según la extensión")
receptor.subir_a_meta = lambda *a: (_ for _ in ()).throw(RuntimeError("Meta caído"))
ok(receptor.resolver(flujo.m_imagen({"_extra": "393/otra.jpg"}, "")) is None, "si una foto extra falla, no se manda nada (la ficha ya salió)")

print(f"{'✅' if not fallos else '✗'} {n - fallos}/{n}")
sys.exit(1 if fallos else 0)

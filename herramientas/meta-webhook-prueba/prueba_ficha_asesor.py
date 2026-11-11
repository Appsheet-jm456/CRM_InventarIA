"""
Pruebas de la ficha técnica que el asesor envía desde el chat (F4·71, docs/MEJORAS-CHAT-Y-PAGOS.md RB-23 a RB-29): saludo con nombre,
código y la plantilla de la ficha del bot; con Foto 1 va de pie y luego las Fotos 2 y 3; sin foto, texto; queda como último equipo visto.
Sin base ni WhatsApp.
Uso: python3 herramientas/meta-webhook-prueba/prueba_ficha_asesor.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import acciones, db, flujo, receptor  # noqa: E402

DRIVE = "https://drive.google.com/drive/folders/abc123"


def equipo(cod, modelo, foto=None, extra=None, drive="", descripcion=""):
    return {"cod": cod, "marca": "LENOVO", "modelo": modelo, "cpu": "Core i5-8365U", "gen": 8, "ram": "16GB", "disco": "256GB NVMe",
            "estado": "Usado", "precio": 1250000, "stock": 1, "categoria": "Portatil", "descripcion": descripcion, "foto": foto,
            "atributos": {"grafica": "Intel UHD 620"}, "fotos_extra": extra or [], "fotos_drive": drive}


T490 = equipo("100-101-1121-2", "THINKPAD T490", foto={"_producto": {"id": 393}}, extra=["393/1-2.jpg", "393/1-3.png"], drive=DRIVE)
SINFOTO = equipo("D5420", "LATITUDE 5420")
LARGO = equipo("L-1", "LARGO", foto={"_producto": {"id": 7}}, descripcion="x" * 1100)
ACCION = {"id": 9, "nombre": "Pregunta por un equipo", "activa": True,
          "hacer": [{"tipo": "ficha_equipo", "plantilla": "🎮 {procesador}\n🚀 {grafica}\n🧠 {ram}\n🔥 {teclado}\n💰 *{precio}*"}]}
db.acciones_todas = lambda: [ACCION]
fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def texto(m):
    return (m.get("image") or {}).get("caption") or (m.get("text") or {}).get("body") or ""


st = flujo.estado_vacio()
ms = receptor.ficha_del_asesor(T490, {"nombre": "Juan Pérez"}, st)
pie = texto(ms[0])
ok(ms[0]["type"] == "image" and len(ms) == 3, "con Foto 1: la ficha va de pie de la foto y después las Fotos 2 y 3 (RB-26)")
ok(pie.startswith("Hola Juan 👋 Te envío la ficha técnica del equipo:"), "saluda con el primer nombre (RB-25)")
ok("💻 *LENOVO THINKPAD T490*" in pie and "🔖 Código: 100-101-1121-2" in pie, "lleva el equipo y el código")
ok("🎮 Core i5-8365U" in pie and "🚀 Intel UHD 620" in pie and "💰 *$1.250.000*" in pie, "usa la plantilla de la ficha del bot, con atributos y precio")
ok("🔥" not in pie, "un renglón sin dato no sale (RAG-40)")
ok(f"📷 Más fotos: {DRIVE}" in pie and pie.rstrip().endswith("te ayudo con la compra."), "enlace de Drive y cierre")
ok(st["campos"]["Código producto"] == "100-101-1121-2" and st["valor"] == 1250000, "queda como el último equipo que vio el cliente (RB-27)")

ms = receptor.ficha_del_asesor(SINFOTO, {"nombre": ""}, flujo.estado_vacio())
ok(len(ms) == 1 and ms[0]["type"] == "text" and texto(ms[0]).startswith("Hola 👋"), "sin foto: un solo texto; sin nombre, «Hola 👋»")

db.acciones_todas = lambda: [{**ACCION, "hacer": [{"tipo": "texto", "texto": "x"}]}]
pie = texto(receptor.ficha_del_asesor(T490, {"nombre": "Ana"}, flujo.estado_vacio())[0])
ok("✨ Estado estético" in pie or "🧠 16GB" in pie, "sin acción de ficha usa la plantilla de fábrica")

db.acciones_todas = lambda: [ACCION]
ACCION["hacer"][0]["plantilla"] = "{descripcion}\n💰 {precio}"
ms = receptor.ficha_del_asesor(LARGO, {"nombre": "Ana"}, flujo.estado_vacio())
ok(ms[0]["type"] == "image" and texto(ms[0]) == "" and ms[1]["type"] == "text", "más de 1.024 caracteres: foto sola y la ficha aparte")
ok(receptor.ficha_del_asesor(None, {}, flujo.estado_vacio()) == [], "sin equipo (agotado) no arma nada")

print(f"\n{n - fallos}/{n}")
sys.exit(1 if fallos else 0)

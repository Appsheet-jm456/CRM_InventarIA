"""
Pruebas de los atributos del producto en el bot (F4·41, RI-10): la plantilla de Avi usa {clave} de cada atributo, un renglón sin dato no
sale, sí/no y números se muestran en palabras, y buscar_productos le pasa a Avi las características con su nombre.
Sin base ni WhatsApp. Uso: python3 herramientas/meta-webhook-prueba/prueba_atributos.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import agente, db

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


LEGION = {"cod": "LG7-01", "marca": "LENOVO", "modelo": "LEGION 7", "cpu": "Intel Core i9-11980HK", "gen": 11, "ram": "32 GB RAM DDR4",
          "disco": "SSD NVMe 512 GB", "estado": "Usado", "precio": 4800000, "stock": 1, "categoria": "Portatil", "descripcion": "",
          "atributos": {"grafica": "NVIDIA GeForce RTX 3080", "teclado": "Teclado RGB", "estado_estetico": "10/10", "lector": True, "hz": 165}}
SIN = {**LEGION, "cod": "D1", "atributos": {}}
PLANTILLA = ("¡Hola! Gracias por tu interés en nuestro {equipo}.\n🎮 {procesador}\n🚀 {grafica}\n🧠 {ram}\n💾 {disco}\n🌈 {teclado}\n"
             "✨ Estado estético {estado_estetico}\n🔐 Lector de huella: {lector}\n📺 {hz} Hz\n💰 {precio}")

t = agente.armar_equipo(PLANTILLA, LEGION)
ok("🚀 NVIDIA GeForce RTX 3080" in t and "🌈 Teclado RGB" in t and "✨ Estado estético 10/10" in t, "la plantilla usa los atributos por su clave")
ok("Lector de huella: Sí" in t and "📺 165 Hz" in t, "sí/no sale en palabras y el número sin decimales")
ok("💰 $4.800.000" in t, "el precio sigue saliendo de la base")
t = agente.armar_equipo(PLANTILLA, SIN)
ok("🚀" not in t and "🌈" not in t and "✨" not in t and "🎮 Intel Core i9" in t, "un equipo sin el atributo no muestra ese renglón")
ok(agente.texto_atributo(15.6) == "15,6" and agente.texto_atributo(False) == "No" and agente.texto_atributo(None) == "", "formato de valores")

db.producto_atributos = lambda: [{"clave": "grafica", "nombre": "Tarjeta gráfica"}, {"clave": "teclado", "nombre": "Teclado"}]
r = agente._resumen(LEGION)
ok(r.get("caracteristicas") == {"Tarjeta gráfica": "NVIDIA GeForce RTX 3080", "Teclado": "Teclado RGB"},
   "Avi recibe las características activas con su nombre (las archivadas no)")
ok("caracteristicas" not in agente._resumen(SIN), "sin atributos no agrega nada")

print(f"{'✅' if not fallos else '✗'} {n - fallos}/{n}")
sys.exit(1 if fallos else 0)

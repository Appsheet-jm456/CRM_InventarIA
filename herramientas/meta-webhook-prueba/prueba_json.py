"""
Pruebas de interpretar() con respuestas del modelo cortadas o rotas (3 nov 2026): un JSON a medias no se le manda al cliente.
Uso: python3 herramientas/meta-webhook-prueba/prueba_json.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import agente

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


I = agente.interpretar
ok(I('{"responder": "Hola 👋"}') == {"responder": "Hola 👋"}, "un JSON completo se respeta")
ok(I('{"herramienta": "buscar_productos", "args": {}}')["herramienta"] == "buscar_productos", "una herramienta se respeta")
ok(I('```json\n{"responder": "Listo"}\n```')["responder"] == "Listo", "un JSON dentro de un bloque de código")
ok(I('Claro, aquí va {"responder": "Hola"}')["responder"] == "Hola", "JSON con texto alrededor")
ok(I('{"respond')["responder"] == "", "JSON cortado: no se envía el pedazo")
ok(I('{"responder": "La garantía es de seis meses y los envíos salen en')["responder"] == "", "respuesta cortada a media frase")
ok(I('```json\n{"responder": "Hola')["responder"] == "", "bloque de código cortado")
ok(I("Hola, ¿en qué te ayudo?")["responder"] == "Hola, ¿en qué te ayudo?", "texto plano sin JSON se toma como respuesta")
ok(I("")["responder"] == "", "vacío")

print(f"\n{n - fallos} de {n} pruebas bien")
sys.exit(1 if fallos else 0)

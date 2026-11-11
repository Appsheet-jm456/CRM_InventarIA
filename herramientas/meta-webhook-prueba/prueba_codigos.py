"""
Pruebas de los códigos que no están en el inventario (3 nov 2026): un código vendido o mal escrito se avisa y no llega al intérprete, que
ofrecía equipos que nadie pidió. Sin base ni WhatsApp. Uso: python3 herramientas/meta-webhook-prueba/prueba_codigos.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import db, flujo, interprete

C = {"B00": {"clave": "B00", "tipo": "mensaje", "nombre": "B00", "inicio": True, "texto": "Hola", "salidas": {},
             "opciones": [{"id": "1", "titulo": "Productos", "destino": "B00"}]},
     "R11": {"clave": "R11", "tipo": "ficha", "nombre": "ficha", "inicio": False, "texto": "x", "salidas": {},
             "opciones": [{"id": "0", "titulo": "Menú principal", "destino": "B00"}]},
     "ERROR": {"clave": "ERROR", "tipo": "aviso", "nombre": "e", "inicio": False, "texto": "No entendí", "salidas": {}, "opciones": []},
     "P1": {"clave": "P1", "tipo": "presupuesto", "nombre": "p", "inicio": False, "texto": "¿Presupuesto?", "salidas": {}, "opciones": []}}
INV = [{"cod": "100-102-1069", "marca": "DELL", "modelo": "5490", "cpu": "i5", "gen": 8, "ram": "8GB", "disco": "256GB", "estado": "Usado", "precio": 800000,
        "stock": 1, "foto": "", "categoria": "Portatil", "descripcion": "", "video": ""},
       {"cod": "PU-23", "marca": "DELL", "modelo": "5511", "cpu": "i7", "gen": 10, "ram": "16GB", "disco": "512GB", "estado": "Usado", "precio": 1699900,
        "stock": 1, "foto": "", "categoria": "Portatil", "descripcion": "", "video": ""}]
db.flujo = lambda bot=None: C
db.principal = lambda: 1
db.atributos = lambda: {}
flujo.inventario = lambda: INV
db.sin_stock = lambda cods: {str(c).upper() for c in cods} - {p["cod"].upper() for p in flujo.inventario() if p.get("stock", 1) > 0}  # F4·66: el stock sale del inventario de la prueba, no de la base
flujo.texto_horario = lambda: "L-V"
interprete.con_ia = lambda texto: (_ for _ in ()).throw(AssertionError("no debe llegar a la IA"))
fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def en(nodo, texto):
    st = dict(flujo.estado_vacio(), nodo=nodo, bot=1)
    mensajes, st = flujo.responder(st, texto, lambda t: None)
    return mensajes, st


def cuerpo(m):
    return m.get("text", {}).get("body") or m.get("interactive", {}).get("body", {}).get("text", "")


m, st = en("B00", "100-102-1007-7")
ok(len(m) == 1 and "*100-102-1007-7* no está disponible" in cuerpo(m[0]), "código agotado: avisa con el código")
ok(st["nodo"] == "B00" and st["errores"] == 0, "código agotado: sigue en el mismo cuadro y no cuenta como error")
m, _ = en("B00", "me interesa el 100 - 102 - 1007 - 7 por favor")
ok("*100-102-1007-7*" in cuerpo(m[0]), "lo reconoce dentro de una frase y con espacios")
m, _ = en("R11", "pu-40")
ok("*PU-40* no está disponible" in cuerpo(m[0]), "formato PU- en minúsculas")
m, st = en("B00", "100-102-1069")
ok(st["nodo"] == "R11" and "5490" in cuerpo(m[0]), "un código con stock sigue dando su ficha")
m, st = en("B00", "PU-23")
ok(st["nodo"] == "R11" and "5511" in cuerpo(m[0]), "PU con stock sigue dando su ficha")
ok(flujo.codigo_sin_stock("mi celular es 300-210-3979") is None, "un teléfono no es un código")
ok(flujo.codigo_sin_stock("tengo 1.200.000") is None, "un presupuesto no es un código")
ok(flujo.codigo_sin_stock("compu-23") is None, "«compu-23» no es un código")
interprete.con_ia = lambda texto: {}  # en presupuesto el texto sigue su camino de siempre
m, _ = en("P1", "100-102-1007-7")
ok("no está disponible" not in " ".join(cuerpo(x) for x in m), "en el cuadro de presupuesto no se revisan códigos")

print(f"\n{n - fallos} de {n} pruebas bien")
sys.exit(1 if fallos else 0)

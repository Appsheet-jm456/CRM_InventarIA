"""
Pruebas de la acción «Pregunta por un equipo» (F4·42, docs/AGENTE.md RAG-43 a RAG-48): el disparador encuentra el equipo por código o
modelo sin IA, un equipo responde su ficha con la plantilla, varios responden la lista, un agotado avisa y ofrece parecidos, y
«quiero comprar» (más arriba en la lista) sigue ganando. Sin base ni WhatsApp. Uso: python3 herramientas/meta-webhook-prueba/prueba_ficha_equipo.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import acciones, agente, db, flujo


def equipo(cod, marca, modelo, precio, atributos=None, foto=None):
    return {"cod": cod, "marca": marca, "modelo": modelo, "cpu": "Intel Core i9-11980HK", "gen": 11, "ram": "32 GB RAM DDR4",
            "disco": "SSD NVMe 512 GB", "estado": "Usado", "precio": precio, "stock": 1, "categoria": "Portatil", "descripcion": "",
            "foto": foto, "atributos": atributos or {}}


INV = [equipo("LG7-01", "LENOVO", "LEGION 7", 4800000, {"grafica": "NVIDIA GeForce RTX 3080", "teclado": "Teclado RGB", "estado_estetico": "10/10"},
              foto={"_producto": {"id": 1}}),
       equipo("T14-A", "LENOVO", "THINKPAD T14", 1500000), equipo("T14-B", "LENOVO", "THINKPAD T14", 1600000),
       equipo("D5420", "DELL", "LATITUDE 5420", 1400000)]
flujo.inventario = lambda: INV
db.sin_stock = lambda cods: {str(c).upper() for c in cods} - {p["cod"].upper() for p in flujo.inventario() if p.get("stock", 1) > 0}  # F4·66: el stock sale del inventario de la prueba, no de la base
db.productos_agotados = lambda: [{"codigo": "HP840", "marca": "HP", "modelo": "ELITEBOOK 840 G5", "categoria": "Portatil"}]
db.agente_config = lambda fresco=False: {"plantilla_equipo": "💻 *{equipo}* · {codigo}\n💰 {precio}", "max_equipos": 3, "equipos_separados": False}
flujo.asesor = lambda st, **k: (st.update(pausa=True), [flujo.m_texto("Te paso con un asesor")])[1]
fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


FICHA = {"id": 9, "nombre": "Pregunta por un equipo", "activa": True, "cuando": [{"forma": "equipo", "texto": "un equipo del inventario"}],
         "hacer": [{"tipo": "ficha_equipo"}]}
COMPRA = {"id": 3, "nombre": "Quiero comprar", "activa": True, "cuando": [{"forma": "contiene", "texto": "quiero comprar"}],
          "hacer": [{"tipo": "texto", "texto": "compra"}]}
LISTA = [COMPRA, FICHA]


def correr(texto, accion=None, lead=None):
    a = accion or acciones.ganadora(texto, LISTA)
    st = flujo.estado_vacio()
    r = acciones.ejecutar(a, st, lead, texto=texto) if a else None
    return a, (r[0] if r else []), st


def cuerpo(m):
    return m.get("text", {}).get("body") or m.get("image", {}).get("caption") or ""


a, msgs, st = correr("Hola, ¿cuánto vale el Lenovo Legion 7?", lead={"nombre": "Ana María"})
c = cuerpo(msgs[0]) if msgs else ""
ok(a and a["id"] == 9, "«¿cuánto vale el Lenovo Legion 7?» dispara la acción de la ficha (por modelo, sin IA)")
ok(c.startswith("¡Hola Ana! 👋🔥\nGracias por tu interés en nuestro *LENOVO LEGION 7*."), "encabezado con el nombre del cliente y el equipo")
ok("🚀 NVIDIA GeForce RTX 3080" in c and "🌈 Teclado RGB" in c and "✨ Estado estético 10/10" in c and "💰 *$4.800.000*" in c,
   "renglones con los atributos del producto y el precio de la base")
ok("quiero comprar LG7-01" in c, "el cierre lleva el código del equipo")
ok(msgs[0]["type"] == "image" and msgs[0]["image"].get("_producto"), "con foto sale como imagen con su texto")
ok(st["campos"].get("Código producto") == "LG7-01" and st["valor"] == 4800000, "queda como último equipo visto (para «Lo quiero»)")

_, msgs, _ = correr("cuanto vale el legion 7", lead=None)
ok(cuerpo(msgs[0]).startswith("¡Hola! 👋🔥"), "sin nombre: «¡Hola!» sin espacio de sobra")
_, msgs, _ = correr("info del D5420")
c = cuerpo(msgs[0])
ok(msgs[0]["type"] == "text" and "LATITUDE 5420" in c and "🚀" not in c, "por código; sin foto sale texto y sin el renglón vacío")

a, msgs, st = correr("tienen el thinkpad t14?")
c = cuerpo(msgs[0])
ok("Tenemos estas opciones de *THINKPAD T14*" in c and "T14-A" in c and "T14-B" in c and "¿Cuál te interesa?" in c,
   "varios equipos del mismo modelo: lista con la plantilla de Avi")
ok("Código producto" not in st["campos"], "con varios no se elige ninguno por el cliente")

a, msgs, _ = correr("precio del hp elitebook 840 g5")
ok(a and a["id"] == 9 and "no está disponible" in cuerpo(msgs[0]), "un modelo en stock 0 avisa que no está disponible")
ok(len(msgs) == 1, "sin equipos de esa marca con stock, no ofrece parecidos")
a, msgs, _ = correr("y el 100-102-9999?")
ok(a and "no está disponible" in cuerpo(msgs[0]), "un código que no existe también avisa")

a, msgs, st = correr("precio del hp elitebook 840 g5", accion={**FICHA, "hacer": [{"tipo": "ficha_equipo", "si_agotado": "asesor"}],
                                                          "_equipo": acciones.detectar_equipo("precio del hp elitebook 840 g5")})
ok(st.get("pausa") and "asesor" in cuerpo(msgs[-1]), "agotado con «pasar a asesor» pausa el bot")
db.productos_agotados = lambda: [{"codigo": "D5410", "marca": "DELL", "modelo": "LATITUDE 5410", "categoria": "Portatil"}]
_, msgs, _ = correr("me interesa el latitude 5410")
ok(len(msgs) == 2 and "D5420" in cuerpo(msgs[1]), "agotado con «parecidos»: ofrece los de la misma marca con stock")

a, _, _ = correr("quiero comprar el legion 7")
ok(a and a["id"] == 3, "«quiero comprar el Legion 7» abre la compra: gana la acción de más arriba")
ok(acciones.ganadora("hola buenas tardes", LISTA) is None, "un saludo sin equipo no dispara nada")
ok(acciones.ganadora("tienen lenovo?", LISTA) is None, "la marca sola no dispara si no se pidió")
MARCA = {**FICHA, "cuando": [{"forma": "equipo", "texto": "x", "marca": True}]}
_, msgs, _ = correr("tienen lenovo?", accion={**MARCA, "_equipo": acciones.detectar_equipo("tienen lenovo?", MARCA["cuando"][0])})
ok("LG7-01" in cuerpo(msgs[0]) and "D5420" not in cuerpo(msgs[0]), "con «también por marca» lista los de esa marca")
EXIGE = [{**FICHA, "cuando": [{"forma": "equipo", "texto": "x", "exigir": True, "palabras": ["cuanto", "precio", "vale"]}]}]
ok(acciones.ganadora("el legion 7 es muy bonito", EXIGE) is None and acciones.ganadora("cuánto vale el legion 7", EXIGE),
   "con «exigir palabra», solo dispara si pregunta por precio o información")
ok(acciones.lista(FICHA), "el paso «ficha_equipo» se puede activar")

print(f"{'✅' if not fallos else '✗'} {n - fallos}/{n}")
sys.exit(1 if fallos else 0)

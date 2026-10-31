"""
Pruebas del motor de acciones «Cuando → Hacer» (F4·24). No escribe en la base ni envía a WhatsApp: la base se
reemplaza por datos fijos. Uso:  python3 herramientas/meta-webhook-prueba/prueba_acciones.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import acciones  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402

ACCIONES = [
    {"id": 1, "nombre": "Pasar a asesor", "prioridad": 1, "activa": True,
     "cuando": [{"forma": "contiene", "texto": "asesor"}], "hacer": [{"tipo": "asesor"}]},
    {"id": 2, "nombre": "Cuentas", "prioridad": 10, "activa": True,
     "cuando": [{"forma": "contiene", "texto": "cuentas"}, {"forma": "contiene", "texto": "cómo pago"}], "hacer": [{"tipo": "cuentas"}]},
    {"id": 3, "nombre": "Cotización", "prioridad": 20, "activa": True,
     "cuando": [{"forma": "contiene", "texto": "cotizacion"}], "hacer": [{"tipo": "flujo", "flujo": "garantia"}]},
    {"id": 5, "nombre": "Ubicación", "prioridad": 40, "activa": True,
     "cuando": [{"forma": "contiene", "texto": "ubicación"}, {"forma": "contiene", "texto": "dónde quedan"}],
     "hacer": [{"tipo": "conocimiento", "categoria": "Ubicación"}, {"tipo": "etiqueta", "etiqueta": "Pidio-Ubicacion"}]},
    {"id": 6, "nombre": "Garantía", "prioridad": 50, "activa": True,
     "cuando": [{"forma": "contiene", "texto": "garantía"}], "hacer": [{"tipo": "conocimiento", "categoria": "Garantía"}]},
    {"id": 7, "nombre": "Devoluciones", "prioridad": 60, "activa": False,
     "cuando": [{"forma": "contiene", "texto": "cambio"}], "hacer": [{"tipo": "texto", "texto": "Política de cambios"}]},
    {"id": 8, "nombre": "Saludo exacto", "prioridad": 70, "activa": True,
     "cuando": [{"forma": "igual", "texto": "info"}], "hacer": [{"tipo": "texto", "texto": "Hola {nombre}, horario: {horario}"}]},
]
CONOCIMIENTO = {
    "Ubicación": [{"id": 1, "titulo": "Dirección", "respuesta": "Calle 10 # 20-30", "archivo": "conocimiento/1.png"}],
    "Garantía": [],  # sin fichas activas
}
CUENTAS = {"texto": "💳 Bancolombia 123"}

# La base, reemplazada por datos fijos
db.acciones_activas = lambda: [a for a in ACCIONES if a["activa"]]
db.acciones_todas = lambda: ACCIONES
db.conocimiento = lambda categoria, fresco=False: CONOCIMIENTO.get(categoria, [])
db.agente_config = lambda fresco=False: {"texto_cuentas": CUENTAS["texto"]}
db.principal = lambda: 1
flujo.texto_horario = lambda: "L–V 8–18"
flujo.asesor = lambda st, etiqueta="Escalado-Asesor", motivo=None: (st.update(pausa=True), [flujo.m_texto("asesor")])[1]

fallos = 0
n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def nombre(texto):
    a = acciones.ganadora(texto)
    return a and a["nombre"]


ok(nombre("Hola, ¿cuál es la UBICACIÓN del local?") == "Ubicación", "contiene, sin importar mayúsculas, tildes ni signos")
ok(nombre("¿Dónde quedan?") == "Ubicación", "cualquiera de las frases de la acción")
ok(nombre("mándame las cuentas") == "Cuentas", "cuentas")
ok(nombre("quiero un asesor para las cuentas") == "Pasar a asesor", "gana la de menor prioridad (asesor primero)")
ok(nombre("hago intercambio") is None, "«contiene» busca al inicio de la palabra: «cambio» no se dispara con «intercambio»")
ok(nombre("cuál es la política de garantías?") == "Garantía" and nombre("garantias") == "Garantía", "el plural también coincide: «garantía» encuentra «garantías»")
ok(nombre("quiero hacer un cambio") is None, "una acción apagada no corre")
ok(nombre("quiero una cotización") is None, "una acción con un flujo que no existe no corre")
ok(nombre("info") == "Saludo exacto" and nombre("más info") is None, "«es igual a» solo con el texto exacto")
ok(nombre("") is None and nombre("👍") is None, "vacío o solo emojis no dispara nada")

st = flujo.estado_vacio()
r = acciones.responder(st, "ubicación", {"nombre": "Ana María"})
ok(r is not None and r[1][0]["text"]["body"] == "Calle 10 # 20-30" and r[1][1] == {"_conocimiento": {"archivo": "conocimiento/1.png", "titulo": "Dirección"}},
   "conocimiento: envía la respuesta y el archivo de la ficha")
ok(r is not None and r[3] == ["Pidio-Ubicacion"], "etiqueta de la acción")

ok(acciones.responder(flujo.estado_vacio(), "garantía") is None, "categoría sin fichas activas: no responde y sigue el menú")

r = acciones.responder(flujo.estado_vacio(), "info", {"nombre": "Ana María"})
ok(r is not None and r[1][0]["text"]["body"] == "Hola Ana, horario: L–V 8–18", "texto con {nombre} y {horario}")

CUENTAS["texto"] = ""
ok(acciones.responder(flujo.estado_vacio(), "cuentas") is None, "sin texto de cuentas aprobado no se envía nada (RAG-09)")
CUENTAS["texto"] = "💳 Bancolombia 123"

st = flujo.estado_vacio()
r = acciones.responder(st, "asesor")
ok(r is not None and r[2]["pausa"] is True, "pasar a asesor pausa el bot")
ok(acciones.responder(dict(flujo.estado_vacio(), pausa=True), "ubicación") is None, "con el chat en manos de un asesor no corre ninguna acción")

p = acciones.probar("cambio de equipo")
ok(p["accion"] is None and p["apagada"] == {"id": 7, "nombre": "Devoluciones"}, "Probar avisa qué acción apagada ganaría")
p = acciones.probar("ubicación")
ok(p["accion"]["nombre"] == "Ubicación" and p["mensajes"][1]["type"] == "archivo", "Probar muestra lo que se enviaría")

print(f"\n{n - fallos}/{n} en verde" if not fallos else f"\n✗ {fallos} en rojo")
sys.exit(1 if fallos else 0)

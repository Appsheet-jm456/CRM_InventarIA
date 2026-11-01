"""
Pruebas de los interruptores del bot y del cuadro Agente (F4·35, RF-31 a RF-39). No escribe en la base, no envía a WhatsApp ni
gasta IA: la base y el turno de Avi se reemplazan por datos fijos. Uso:  python3 herramientas/meta-webhook-prueba/prueba_interruptores.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import agente  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402
import receptor  # noqa: E402


def cuadro(clave, tipo, texto="", **extra):
    return {"clave": clave, "tipo": tipo, "nombre": clave, "inicio": False, "texto": texto, "opciones": [], "salidas": {}, "ajustes": {},
            "al_entrar": {}, "marcas": [], **extra}


CUADROS = {
    "B00": dict(cuadro("B00", "mensaje", "Hola 👋", inicio=True), opciones=[{"id": "1", "titulo": "Tengo dudas", "destino": "A1"}]),
    "A1": cuadro("A1", "agente", "Cuéntame tu duda 🙂", salidas={"compra": "M9"},
                 ajustes={"instruccion": "Resuelve dudas y lleva a comprar", "herramientas": ["buscar_productos"], "max_vueltas": 2}),
    "A2": cuadro("A2", "agente", "Hola", salidas={"asesor": "M9", "falla": "M9", "menu": "M9"}, ajustes={"max_vueltas": 8}),
    "M9": dict(cuadro("M9", "mensaje", "Mensaje del dueño"), opciones=[{"id": "1", "titulo": "Ok", "destino": "B00"}]),
    "B-ASESOR": cuadro("B-ASESOR", "asesor", "asesor"),
}
CONFIG = {"estado": "todos", "lista_blanca": [], "herramientas_apagadas": ["enviar_catalogo"]}
INTERRUPTORES = {"chatbot_activo": True, "menu_activo": True, "agente_en_todo": False, "texto_apagado": "Hola 👋 En un momento te atiende un asesor"}

db.flujo = lambda bot=None: CUADROS
db.principal = lambda: 1
db.atributos = lambda: {}
db.agente_config = lambda fresco=False: CONFIG
db.bot_config = lambda: INTERRUPTORES
flujo.asesor = lambda st, etiqueta="Escalado-Asesor", motivo=None: (st.update(pausa=True, nodo="B-ASESOR"), [flujo.m_texto("asesor")])[1]

# El turno de Avi: lo que diga RESPUESTA (None = el cerebro falló). Se guarda con qué cuadro lo llamaron.
RESPUESTA = {}
LLAMADAS = []


def avi_falso(st, entrada, lead, config=None, simulador=False, previo=None, cuadro=None):
    LLAMADAS.append({"cuadro": cuadro, "config": config})
    if RESPUESTA.get("nada"):
        return None
    if RESPUESTA.get("asesor"):
        st.update(pausa=True, nodo="B-ASESOR")
    if RESPUESTA.get("flujo") == "compra":
        st.update(compra={"paso": "codigo"}, nodo="COMPRA")
    return {"mensajes": [flujo.m_texto("respuesta de Avi")], "st": st, "nota": "", "etiquetas": ["Agente"], "asesor": bool(RESPUESTA.get("asesor")),
            "flujo": RESPUESTA.get("flujo"), "traza": [], "trozos": [], "costo_usd": 0, "tokens": 0}


agente.responder = avi_falso
fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def cuerpo(m):
    return m.get("text", {}).get("body") or m.get("interactive", {}).get("body", {}).get("text", "")


def nuevo(**extra):
    return {**flujo.estado_vacio(), "bot": 1, "nodo": "B00", **extra}


# --- Cuadro Agente
st = nuevo()
m, st = flujo.responder(st, "1")
ok(st["nodo"] == "A1" and cuerpo(m[0]) == "Cuéntame tu duda 🙂" and st["agente"]["vueltas"] == 0 and flujo.en_agente(st)["clave"] == "A1",
   "un botón lleva al cuadro Agente: manda su mensaje de entrada y deja al cliente con Avi")

r = agente.responder_cuadro(st, "¿tienen Dell i5?", {"telefono": "573001112233"}, flujo.en_agente(st))
ok(cuerpo(r["mensajes"][0]) == "respuesta de Avi" and st["agente"]["vueltas"] == 1 and LLAMADAS[-1]["cuadro"]["clave"] == "A1",
   "Avi responde con el cuadro (su instrucción y herramientas) y cuenta la vuelta")

r = agente.responder_cuadro(st, "¿y en 16 GB?", {"telefono": "573001112233"}, flujo.en_agente(st))
r = agente.responder_cuadro(st, "¿y otro?", {"telefono": "573001112233"}, flujo.en_agente(st))
ok(st["pausa"] and r["asesor"] and len(LLAMADAS) == 2, "al llegar al límite de vueltas (2) no llama a Avi y pasa al asesor (sin unir)")

st = nuevo(nodo="A1", agente={"vueltas": 0})
RESPUESTA.update(flujo="compra")
r = agente.responder_cuadro(st, "lo quiero", {"telefono": "573001112233"}, flujo.en_agente(st))
ok(st["nodo"] == "M9" and "compra" not in st and cuerpo(r["mensajes"][0]).startswith("Mensaje del dueño"),
   "«Inició compra» unida: sigue la flecha del dueño en vez del flujo de compra")
RESPUESTA.clear()

st = nuevo(nodo="A2", agente={"vueltas": 0})
RESPUESTA.update(asesor=True)
r = agente.responder_cuadro(st, "quiero un asesor", {"telefono": "573001112233"}, flujo.en_agente(st))
ok(not st["pausa"] and st["nodo"] == "M9" and not r["asesor"], "«Pidió asesor o no avanza» unida: sigue la flecha y no pausa")
RESPUESTA.clear()

st = nuevo(nodo="A2", agente={"vueltas": 0})
RESPUESTA.update(nada=True)
r = agente.responder_cuadro(st, "hola?", {"telefono": "573001112233"}, flujo.en_agente(st))
ok(st["nodo"] == "M9", "«Error del cerebro» unida: si Avi no responde, sigue la flecha")
st = nuevo(nodo="A1", agente={"vueltas": 0})
ok(agente.responder_cuadro(st, "hola?", {"telefono": "573001112233"}, flujo.en_agente(st)) is None,
   "sin unir «Error del cerebro»: devuelve None y atiende el Híbrido")
RESPUESTA.clear()

st = nuevo(nodo="A2", agente={"vueltas": 0})
m, st = flujo.responder(st, "menú")
ok(st["nodo"] == "M9", "«menú» dentro del cuadro sigue «Volvió al menú»")
st = nuevo(nodo="A1", agente={"vueltas": 0})
m, st = flujo.responder(st, "hola")
ok(st["nodo"] == "B00", "sin unir «Volvió al menú», «hola» vuelve al inicio del principal")

CONFIG["estado"] = "apagado"
st = nuevo(nodo="A2", agente={"vueltas": 0})
r = agente.responder_cuadro(st, "¿precio?", {"telefono": "573001112233"}, flujo.en_agente(st))
ok(st["nodo"] == "M9" and len(LLAMADAS) == 6, "con Avi apagado el cuadro sale por «Error del cerebro» sin llamar al cerebro (RF-38)")
CONFIG["estado"] = "todos"

# --- Avi en todo el bot y menú (atiende)
st = nuevo()
lead = {"telefono": "573001112233"}
ok(not agente.atiende(st, lead, "text", "busco un dell", CONFIG), "con «Avi en todo» apagado, Avi no atiende el texto libre fuera de sus cuadros")
INTERRUPTORES["agente_en_todo"] = True
ok(agente.atiende(st, lead, "text", "busco un dell", CONFIG) and not agente.atiende(st, lead, "text", "hola", CONFIG)
   and not agente.atiende(st, lead, "text", "2", CONFIG), "encendido, atiende el texto libre; «hola» y los números siguen al menú")
INTERRUPTORES["menu_activo"] = False
ok(agente.atiende(st, lead, "text", "hola", CONFIG) and agente.atiende(st, lead, "text", "2", CONFIG),
   "con el menú apagado, Avi atiende también «hola» y los números")
INTERRUPTORES.update(menu_activo=True, agente_en_todo=False)

# --- Chatbot apagado
st = nuevo()
m = receptor.sin_bot(st, INTERRUPTORES)
ok(st["pausa"] and cuerpo(m[0]) == "Hola 👋 En un momento te atiende un asesor" and st["campos"]["Etiqueta"] == "Chatbot-apagado",
   "chatbot apagado: el chat va a la cola con el mensaje fijo")
ok(receptor.sin_bot(st, INTERRUPTORES) == [], "el mensaje fijo sale una sola vez por conversación (ya está en la cola)")
st = nuevo()
ok(receptor.sin_bot(st, dict(INTERRUPTORES, texto_apagado="")) == [] and st["pausa"], "sin mensaje escrito, va a la cola en silencio")

print(f"\n{n - fallos} de {n} pruebas bien")
sys.exit(1 if fallos else 0)

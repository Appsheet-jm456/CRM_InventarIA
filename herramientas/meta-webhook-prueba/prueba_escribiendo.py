"""
Pruebas de «escribiendo…» y las pausas como una persona (F4·36, RAG-35 a RAG-38). No escribe en la base ni envía a WhatsApp:
la base, Meta y el reloj de envío se reemplazan. Uso:  python3 herramientas/meta-webhook-prueba/prueba_escribiendo.py
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import acciones  # noqa: E402
import db  # noqa: E402
import receptor  # noqa: E402

ENVIADOS, TIPEO = [], []
LEAD = {"id": 1, "telefono": "573001112233", "nombre": "", "paso_menu": "B00", "etapa": "Nuevo", "errores_bot": 0, "pausar_bot": False,
        "bot_id": None, "estado_bot": {}, "etiquetas": [], "atributos": {}, "categoria_interes": "", "uso_equipo": "", "presupuesto": "",
        "marca_interes": "", "cotiz_producto": ""}
CUADROS = {
    "B00": {"clave": "B00", "tipo": "mensaje", "nombre": "B00", "inicio": True, "texto": "Hola", "opciones": [{"id": "1", "titulo": "A", "destino": "M2"}],
            "salidas": {}, "ajustes": {}, "al_entrar": {}, "marcas": []},
    # Un catálogo que no existe responde con dos mensajes (el aviso y el saludo): sirve para medir la pausa entre ellos.
    "M2": {"clave": "M2", "tipo": "catalogo", "nombre": "M2", "inicio": False, "texto": "Te envío", "opciones": [], "salidas": {"siguiente": "B00"},
           "ajustes": {"catalogo_id": None}, "al_entrar": {}, "marcas": []},
}
CONFIG = {"estado": "todos", "buffer_segundos": 0, "escribiendo": True, "espera_primera_ms": 800, "pausa_mensajes_ms": 500}
INTERRUPTORES = {"chatbot_activo": True, "menu_activo": True, "agente_en_todo": False, "texto_apagado": ""}

db.lead = lambda t: dict(LEAD)
db.crear_lead = lambda t, n: dict(LEAD)
db.guardar_mensaje = lambda *a, **k: None
db.actualizar_lead = lambda i, c: None
db.bot_config = lambda: INTERRUPTORES
db.flujo = lambda bot=None: CUADROS
db.principal = lambda: 1
db.atributos = lambda: {}
db.agente_config = lambda fresco=False: CONFIG
db.catalogo = lambda i: None
acciones.responder = lambda st, e, lead: None
receptor.enviar = lambda numero, m: ENVIADOS.append((time.monotonic(), m)) or "enviado"
receptor.anotar = lambda *a: None
receptor.resolver = lambda m: m
receptor.escribiendo = lambda meta_id: TIPEO.append((time.monotonic(), meta_id))

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def turno(texto, meta_id):
    ENVIADOS.clear()
    TIPEO.clear()
    inicio = time.monotonic()
    receptor._contestar("573001112233", texto, texto, "", "text", meta_id)
    time.sleep(0.1)  # el primer «escribiendo…» va en un hilo
    return inicio


inicio = turno("1", "wamid.CLIENTE")
ok(len(ENVIADOS) == 2 and ENVIADOS[0][0] - inicio >= 0.75, "espera antes de la primera respuesta (RAG-36)")
ok(ENVIADOS[1][0] - ENVIADOS[0][0] >= 0.45 and len(TIPEO) == 2 and all(m == "wamid.CLIENTE" for _, m in TIPEO),
   "«escribiendo…» al llegar y otra vez entre los dos mensajes, con la pausa (RAG-35, RAG-37)")

LEAD["pausar_bot"] = True
turno("hola", "wamid.X")
ok(not TIPEO and not ENVIADOS, "con el chat en manos de un asesor no muestra «escribiendo…»")
LEAD["pausar_bot"] = False

INTERRUPTORES["chatbot_activo"] = False
turno("hola", "wamid.Z")
ok(not TIPEO, "con el chatbot apagado no muestra «escribiendo…»")
INTERRUPTORES["chatbot_activo"] = True

CONFIG.update(escribiendo=False, espera_primera_ms=0)
inicio = turno("1", "wamid.Y")
ok(not TIPEO and ENVIADOS[0][0] - inicio < 0.3, "apagado y sin espera: responde enseguida y sin «escribiendo…»")

print(f"\n{n - fallos} de {n} pruebas bien")
sys.exit(1 if fallos else 0)

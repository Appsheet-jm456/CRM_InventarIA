"""
Pruebas de Avi (F4·28). El modelo, la base y WhatsApp se reemplazan por datos fijos: no se escribe ni se envía nada.
Uso:  python3 herramientas/meta-webhook-prueba/prueba_agente.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import agente  # noqa: E402
import cerebro  # noqa: E402
import compra  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402

INV = [
    {"cod": "100-102-1030-1", "marca": "Dell", "modelo": "Latitude 5420", "cpu": "i5-1135G7", "gen": 11, "ram": "16GB", "disco": "512GB",
     "estado": "Grado A", "precio": 1500000, "stock": 1, "foto": None},
    {"cod": "PU-23", "marca": "HP", "modelo": "ProBook 450", "cpu": "i7-8550U", "gen": 8, "ram": "8GB", "disco": "256GB",
     "estado": "Grado B", "precio": 1200000, "stock": 2, "foto": None},
]
CONFIG = {"nombre": "Avi", "tono": "amigable", "emojis": "pocos", "trato": "tu", "largo": "corto", "prompt": "Ofrece primero los grado A.",
          "max_pasos": 6, "max_mensajes": 3, "memoria_mensajes": 20, "max_turnos_dia": 40, "herramientas_apagadas": [],
          "estado": "lista_blanca", "lista_blanca": ["+57 300 111 2233"]}
FICHAS = [{"fuente": "ficha", "id": 1, "titulo": "Garantía", "texto": "La garantía es de 3 meses. Configuración: $80.000.", "puntaje": 1},
          {"fuente": "documento", "id": 9, "titulo": "Lista vieja", "texto": "Dell i5 a $999.000", "puntaje": 1}]

flujo.inventario = lambda: INV
flujo.texto_horario = lambda: "L-V 8 a 18"
flujo.asesor = lambda st, etiqueta="Escalado-Asesor", motivo=None: (st.__setitem__("pausa", True), [flujo.m_texto("Te paso con un asesor 🙌")])[1]
flujo.r11 = lambda st, p: [flujo.m_texto(f"FICHA {p['cod']}")]
compra.iniciar = lambda st, texto, lead=None: [flujo.m_texto("COMPRA iniciada")]
db.mensajes_recientes = lambda lead_id, n: [{"lado": "cliente", "texto": "hola"}, {"lado": "bot", "texto": "¡Hola! Soy Avi"},
                                            {"lado": "cliente", "texto": "busco un dell i5"}]
db.buscar_conocimiento = lambda texto, limite=5: FICHAS
db.turnos_del_dia = lambda lead_id: 0
db.actualizar_lead = lambda *a, **k: None
db.bot_modo = lambda bot: "agente"
db.principal = lambda: 1
db.agente_config = lambda fresco=False: CONFIG
REGISTRO = []
cerebro.registrar = lambda lead, m, resultado, r=None, detalle=None: REGISTRO.append((resultado, detalle))

SALIDAS = []
LLAMADAS = []


def modelo_falso(mensajes, sistema="", lead_id=None, config=None, llaves=None, simulador=False, detalle=None):
    LLAMADAS.append({"mensajes": [dict(m) for m in mensajes], "sistema": sistema, "simulador": simulador})
    if not SALIDAS:
        raise AssertionError("el modelo falso se quedó sin respuestas")
    s = SALIDAS.pop(0)
    if isinstance(s, Exception):
        raise s
    return {"texto": s if isinstance(s, str) else json.dumps(s, ensure_ascii=False), "tokens_entrada": 100, "tokens_salida": 50,
            "costo_usd": 0.001, "ms": 5, "proveedor": "deepseek", "modelo": "deepseek-chat", "respaldo": False}


cerebro.completar = modelo_falso
fallos = 0


def prueba(n, texto, cond):
    global fallos
    print(("ok" if cond else "not ok") + f" {n} - {texto}")
    fallos += 0 if cond else 1


def turno(salidas, entrada="busco un dell i5", **kw):
    SALIDAS[:] = salidas
    LLAMADAS.clear(); REGISTRO.clear()
    st = kw.pop("st", None) or flujo.estado_vacio()
    lead = kw.pop("lead", {"id": 7, "telefono": "573001112233", "nombre": "", "etiquetas": []})
    return agente.responder(st, entrada, lead, **kw)


def textos(r):
    return [m["text"]["body"] for m in r["mensajes"] if m["type"] == "text"]


# --- Quién atiende (1-4)
lead_b = {"id": 7, "telefono": "573001112233"}
st0 = flujo.estado_vacio()
prueba(1, "atiende texto libre de un número de la lista blanca", agente.atiende(st0, lead_b, "text", "busco un portátil", CONFIG))
prueba(2, "no atiende a un número que no está en la lista blanca", not agente.atiende(st0, {"id": 8, "telefono": "573009998877"}, "text", "hola", CONFIG))
prueba(3, "no atiende botones, números sueltos del menú ni chats con asesor", not agente.atiende(st0, lead_b, "interactive", "x", CONFIG)
        and not agente.atiende(st0, lead_b, "text", "3", CONFIG) and not agente.atiende(dict(st0, pausa=True), lead_b, "text", "hola", CONFIG))
db.bot_modo = lambda bot: "hibrido"
prueba(4, "no atiende si el bot no está en modo Agente", not agente.atiende(st0, lead_b, "text", "hola", CONFIG))
db.bot_modo = lambda bot: "agente"
prueba(5, "apagado no atiende; para todos sí", not agente.atiende(st0, lead_b, "text", "hola", dict(CONFIG, estado="apagado"))
        and agente.atiende(st0, {"id": 9, "telefono": "573009998877"}, "text", "hola", dict(CONFIG, estado="todos")))

# --- Herramientas y precios reales (6-9)
r = turno([{"herramienta": "buscar_productos", "args": {"marca": "Dell", "procesador": "i5"}},
           {"responder": "Tengo el Dell Latitude 5420 i5 de 11.ª, 16GB, por $1.500.000 💻"}])
prueba(6, "busca en el inventario y responde con el precio de la herramienta", textos(r) == ["Tengo el Dell Latitude 5420 i5 de 11.ª, 16GB, por $1.500.000 💻"]
        and r["traza"][0]["resultado"]["equipos"][0]["codigo"] == "100-102-1030-1" and len(LLAMADAS) == 2)
prueba(7, "al modelo le llegan el resultado de la herramienta, las reglas y el prompt del dueño",
       "RESULTADO de buscar_productos" in LLAMADAS[1]["mensajes"][-1]["content"] and "Ofrece primero los grado A" in LLAMADAS[0]["sistema"]
       and "REGLAS QUE NO SE PUEDEN CAMBIAR" in LLAMADAS[0]["sistema"])
prueba(8, "la memoria trae la conversación con roles alternados que empiezan por el cliente",
       [m["role"] for m in LLAMADAS[0]["mensajes"]] == ["user", "assistant", "user"])
prueba(9, "cuenta tokens y costo del turno", r["tokens"] == 300 and abs(r["costo_usd"] - 0.002) < 1e-9)

# --- Verificación RAG-02 / RAG-09 (10-14)
r = turno([{"responder": "Te lo dejo en $1.000.000"}, {"responder": "Cuesta $1.000.000, no hay más"}])
prueba(10, "un precio que no salió de una herramienta no se envía y pasa a asesor tras el segundo intento",
       r["asesor"] and textos(r) == ["Te paso con un asesor 🙌"] and "no salió de ninguna herramienta" in r["nota"] and
       any(t["tipo"] == "bloqueado" for t in r["traza"]) and REGISTRO[-1][0] == "bloqueado")
r = turno([{"responder": "Cuesta $1.000.000"}, {"herramienta": "buscar_productos", "args": {"marca": "HP"}}, {"responder": "El HP está en $1.200.000"}])
prueba(11, "si el primer intento falla, el modelo se corrige consultando la herramienta", not r["asesor"] and textos(r) == ["El HP está en $1.200.000"])
r = turno([{"responder": "Paga a la cuenta 12345678901 de Bancolombia"}, {"responder": "Cuenta 12345678901"}])
prueba(12, "no deja pasar números de cuenta que escribió el modelo", r["asesor"] and not any("12345678901" in t for t in textos(r)))
r = turno([{"herramienta": "buscar_conocimiento", "args": {"pregunta": "garantia"}}, {"responder": "La garantía es de 3 meses y la configuración $80.000"}])
prueba(13, "el texto de una ficha de conocimiento sí vale como fuente de cifras", not r["asesor"] and "3 meses" in textos(r)[0])
r = turno([{"herramienta": "buscar_conocimiento", "args": {"pregunta": "dell i5"}}, {"responder": "Hay un Dell i5 a $999.000"}, {"responder": "Hay un Dell i5 a $999.000"}])
prueba(14, "los precios de un documento no se aceptan (RAG-30)", r["asesor"] and len(r["trozos"]) == 2)

# --- Herramientas que terminan el turno (15-19)
r = turno([{"herramienta": "iniciar_compra", "args": {"codigo": "100-102-1030-1"}}])
prueba(15, "iniciar_compra le entrega el chat al flujo de compra sin escribir cuentas", textos(r) == ["COMPRA iniciada"] and r["flujo"] == "iniciar_compra" and len(LLAMADAS) == 1)
r = turno([{"herramienta": "pasar_a_asesor", "args": {"motivo": "reclamo por una garantía"}}])
prueba(16, "pasar_a_asesor pausa el bot y deja el motivo en la nota", r["asesor"] and r["st"]["pausa"] and "reclamo por una garantía" in r["nota"])
r = turno([{"herramienta": "ficha_producto", "args": {"codigo": "PU-23"}}, {"responder": "Ahí te envié la ficha"}])
prueba(17, "ficha_producto envía la ficha y la deja después del texto", textos(r) == ["Ahí te envié la ficha", "FICHA PU-23"])
st = flujo.estado_vacio()
r = turno([{"herramienta": "capturar_datos", "args": {"nombre": "Ana", "uso": "Diseño", "presupuesto": "hasta 2 millones", "ciudad": "Cali"}},
           {"responder": "Gracias Ana"}], st=st)
prueba(18, "capturar_datos llena los campos del lead y deja la ciudad en la nota", st["campos"].get("Uso equipo") == "Diseño"
        and st["campos"].get("Presupuesto") == "hasta 2 millones" and "Ciudad: Cali" in r["nota"])
CONFIG["herramientas_apagadas"] = ["ficha_producto"]
r = turno([{"herramienta": "ficha_producto", "args": {"codigo": "PU-23"}}, {"responder": "No pude"}])
prueba(19, "una herramienta apagada no se ejecuta ni se ofrece al modelo", "FICHA PU-23" not in textos(r) and "- ficha_producto" not in LLAMADAS[0]["sistema"])
CONFIG["herramientas_apagadas"] = []

# --- Formato, límites y fallos (20-27)
r = turno(["Hola, claro que sí 😊 ¿para qué lo vas a usar?"])
prueba(20, "texto plano sin JSON también se toma como respuesta (y se revisa igual)", textos(r) == ["Hola, claro que sí 😊 ¿para qué lo vas a usar?"])
r = turno(["```json\n{\"responder\": \"Uno\\n\\nDos\\n\\nTres\\n\\nCuatro\"}\n```"])
prueba(21, "máximo 3 mensajes por turno: lo que sobra se junta en el último", len(textos(r)) == 3 and textos(r)[2] == "Tres\n\nCuatro")
r = turno([{"herramienta": "buscar_productos", "args": {}}] * 6)
prueba(22, "si agota los 6 pasos sin responder, pasa a asesor para revisión", r["asesor"] and "todos sus pasos" in r["nota"])
db.turnos_del_dia = lambda lead_id: 40
r = turno([])
prueba(23, "con 40 turnos en el día pasa a asesor sin llamar al modelo", r["asesor"] and not LLAMADAS)
r = turno([{"responder": "Hola"}], simulador=True)
prueba(24, "el simulador no cuenta el límite diario", textos(r) == ["Hola"])
db.turnos_del_dia = lambda lead_id: 0
r = turno([cerebro.TopeAgotado()])
prueba(25, "con el presupuesto agotado ofrece asesor y pasa el chat a la Bandeja", r["asesor"] and textos(r)[0] == "¿Quieres que te atienda un asesor? 🙌")
r = turno([cerebro.CerebroError("DeepSeek respondió 500")])
prueba(26, "si ningún modelo responde devuelve None para que atienda el Híbrido", r is None)
r = turno([{"herramienta": "inventada", "args": {}}, {"responder": "Hola"}])
prueba(27, "una herramienta que no existe no rompe el turno", r["traza"][0]["resultado"].get("error") and textos(r) == ["Hola"])

# --- Cifras (28)
prueba(28, "lee «1,5 millones», «$1.500.000» y «1.500.000» como el mismo valor", agente.cifras("de 1,5 millones, $1.500.000 o 1.500.000") == {1500000})

print(f"\n{28 - fallos}/28 pruebas bien")
sys.exit(1 if fallos else 0)

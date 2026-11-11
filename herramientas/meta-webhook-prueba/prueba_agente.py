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
db.sin_stock = lambda cods: {str(c).upper() for c in cods} - {p["cod"].upper() for p in flujo.inventario() if p.get("stock", 1) > 0}  # F4·66: el stock sale del inventario de la prueba, no de la base
flujo.texto_horario = lambda: "L-V 8 a 18"
flujo.asesor = lambda st, etiqueta="Escalado-Asesor", motivo=None, **_: (st.__setitem__("pausa", True), [flujo.m_texto("Te paso con un asesor 🙌")])[1]
flujo.r11 = lambda st, p: [flujo.m_texto(f"FICHA {p['cod']}")]
compra.iniciar = lambda st, texto, lead=None: [flujo.m_texto("COMPRA iniciada")]
db.mensajes_recientes = lambda lead_id, n: [{"lado": "cliente", "texto": "hola"}, {"lado": "bot", "texto": "¡Hola! Soy Avi"},
                                            {"lado": "cliente", "texto": "busco un dell i5"}]
db.buscar_conocimiento = lambda texto, limite=5: FICHAS
db.turnos_del_dia = lambda lead_id: 0
db.catalogo_para = lambda categoria, marca: (None, None)  # el catálogo al final de la lista se prueba en prueba_fichas.py
db.actualizar_lead = lambda *a, **k: None
INTERRUPTORES = {"chatbot_activo": True, "menu_activo": True, "agente_en_todo": True, "texto_apagado": ""}
db.bot_config = lambda: INTERRUPTORES  # F4·35: reemplaza el modo por bot
db.principal = lambda: 1
db.agente_config = lambda fresco=False: CONFIG
REGISTRO = []
cerebro.registrar = lambda lead, m, resultado, r=None, detalle=None: REGISTRO.append((resultado, detalle))

SALIDAS = []
LLAMADAS = []


def modelo_falso(mensajes, sistema="", lead_id=None, config=None, llaves=None, simulador=False, detalle=None, tokens_max=None,
                 con_respaldo=True):
    LLAMADAS.append({"mensajes": [dict(m) for m in mensajes], "sistema": sistema, "simulador": simulador, "tokens_max": tokens_max,
                     "con_respaldo": con_respaldo})
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
INTERRUPTORES["agente_en_todo"] = False
prueba(4, "no atiende si «Avi en todo el bot» está apagado (F4·35)", not agente.atiende(st0, lead_b, "text", "hola", CONFIG))
INTERRUPTORES["agente_en_todo"] = True
prueba(5, "apagado no atiende; para todos sí", not agente.atiende(st0, lead_b, "text", "busco un portátil", dict(CONFIG, estado="apagado"))
        and agente.atiende(st0, {"id": 9, "telefono": "573009998877"}, "text", "busco un portátil", dict(CONFIG, estado="todos")))

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
       any(t["tipo"] == "bloqueado" for t in r["traza"]) and [x[0] for x in REGISTRO][-2:] == ["bloqueado", "asesor"])
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


# --- Herramientas nuevas (29-34)
flujo.mensajes_catalogo = lambda categoria, marca: [flujo.m_texto(f"CATALOGO {categoria} {marca}")]
r = turno([{"herramienta": "enviar_catalogo", "args": {"marca": "Dell"}}, {"responder": "Te envié el catálogo"}])
prueba(29, "enviar_catalogo manda el catálogo después del texto", textos(r) == ["Te envié el catálogo", "CATALOGO Portátiles Dell"])
st = dict(flujo.estado_vacio(), etapa="Cotización")
r = turno([{"herramienta": "mover_etapa", "args": {"etapa": "En Conversación"}}, {"responder": "Listo"}], st=st)
prueba(30, "mover_etapa nunca retrocede el embudo", st["etapa"] == "Cotización" and r["traza"][0]["resultado"]["cambio"] is False)
st = flujo.estado_vacio()
r = turno([{"herramienta": "mover_etapa", "args": {"etapa": "Vendido"}}, {"herramienta": "mover_etapa", "args": {"etapa": "Cotización"}}, {"responder": "Listo"}], st=st)
prueba(31, "mover_etapa solo acepta las etapas del bot y avanza", r["traza"][0]["resultado"].get("error") and st["etapa"] == "Cotización")
SEGUIMIENTOS = []
db.crear_seguimiento = lambda *a: SEGUIMIENTOS.append(a)
CONFIG["actualizado_por"] = "admin-uuid"
r = turno([{"herramienta": "crear_seguimiento", "args": {"que": "Llamar mañana", "horas": 30}}, {"responder": "Te escribimos mañana"}],
          lead={"id": 7, "telefono": "573001112233", "nombre": "", "etiquetas": [], "asignado_a": "asesor-uuid"})
prueba(32, "crear_seguimiento se lo deja al asesor del cliente", SEGUIMIENTOS == [(7, "Llamar mañana", 30, "asesor-uuid", "admin-uuid")])
SEGUIMIENTOS.clear()
r = turno([{"herramienta": "crear_seguimiento", "args": {"que": "Llamar"}}, {"responder": "Ok"}], simulador=True)
prueba(33, "en el simulador crear_seguimiento no escribe nada", not SEGUIMIENTOS and r["traza"][0]["resultado"]["simulado"])
CONFIG["actualizado_por"] = None
r = turno([{"herramienta": "crear_seguimiento", "args": {"que": "Llamar"}}, {"responder": "Ok"}])
prueba(34, "sin asesor a quien asignarlo, el seguimiento queda en la nota", not SEGUIMIENTOS and "Seguimiento pedido por Avi: Llamar" in r["nota"])

# --- Tres respuestas sin avance (35-36) y etiqueta Agente (37)
st = flujo.estado_vacio()
for _ in range(2):
    r = turno([{"responder": "¿Para qué lo vas a usar?"}], st=st)
prueba(35, "dos respuestas sin avance siguen con Avi", not r["asesor"] and st["agente"]["sin_avance"] == 2)
r = turno([{"responder": "¿Y de qué presupuesto?"}], st=st)
prueba(36, "a la tercera respuesta sin avance pasa a asesor, después de responder", r["asesor"] and textos(r)[0] == "¿Y de qué presupuesto?"
        and "3 veces seguidas" in r["nota"] and st["agente"]["sin_avance"] == 0)
st = flujo.estado_vacio(); st["agente"] = {"sin_avance": 2}
r = turno([{"herramienta": "capturar_datos", "args": {"uso": "Oficina"}}, {"responder": "Perfecto"}], st=st)
prueba(37, "un avance (datos, ficha, búsqueda con resultados) reinicia la cuenta; cada turno deja la etiqueta Agente",
       not r["asesor"] and st["agente"]["sin_avance"] == 0 and r["etiquetas"] == ["Agente"])

# --- Resumen (38-41)
prueba(38, "resume solo cuando quedan 20 mensajes nuevos fuera de la memoria", not agente.falta_resumen(39, 20, 0) and agente.falta_resumen(40, 20, 0)
        and not agente.falta_resumen(50, 20, 20))
CHARLA = [{"lado": "cliente" if i % 2 == 0 else "bot", "texto": f"mensaje {i}"} for i in range(45)]
db.mensajes_del_cliente = lambda lead_id, cuantos=200: CHARLA
GUARDADO = {}
db.actualizar_lead = lambda lead_id, campos: GUARDADO.update(campos)
lead = {"id": 7, "telefono": "573001112233", "resumen_agente": "- Busca un Dell"}
st = flujo.estado_vacio()
SALIDAS[:] = ["- Busca un Dell i5 para diseño\n- Cuenta 123456789012"]; LLAMADAS.clear()
r = agente.resumir(st, lead, CONFIG)
prueba(39, "resume los 25 mensajes viejos con el resumen anterior y guarda cuántos cubrió", r and st["agente"]["resumidos"] == 25
        and "mensaje 24" in LLAMADAS[0]["mensajes"][0]["content"] and "mensaje 25" not in LLAMADAS[0]["mensajes"][0]["content"]
        and "Busca un Dell" in LLAMADAS[0]["mensajes"][0]["content"])
prueba(40, "el resumen nunca guarda números largos (cuentas, cédulas)", "123456789012" not in GUARDADO["resumen_agente"])
prueba(40.1, "el resumen pide tokens de sobra (el modelo razona) y no espera al respaldo lento",
       LLAMADAS[-1]["tokens_max"] >= 4000 and LLAMADAS[-1]["con_respaldo"] is False)
LLAMADAS.clear()
prueba(41, "con el resumen al día no vuelve a llamar al modelo", agente.resumir(st, lead, CONFIG) is None and not LLAMADAS)
SALIDAS[:] = []
r = turno([{"responder": "Hola"}], lead=dict(lead))
prueba(42, "el resumen va en el prompt de Avi", "LO QUE PASÓ EN CONVERSACIONES ANTERIORES" in LLAMADAS[0]["sistema"])

r = turno([{"responder": "Consulta buscar_conocimiento para eso"}, {"herramienta": "buscar_conocimiento", "args": {"pregunta": "descuentos"}},
           {"responder": "No tenemos descuentos publicados; un asesor te puede orientar"}])
prueba(43, "una respuesta que nombra una herramienta no sale: el modelo la corrige", not r["asesor"]
        and textos(r) == ["No tenemos descuentos publicados; un asesor te puede orientar"] and r["traza"][0]["tipo"] == "bloqueado")

flujo.SALUDOS = ("hola", "menu", "inicio", "buenas")
flujo.normalizar = lambda t: t.strip().lower().replace("ú", "u")
prueba(44, "«hola», «menú» y «reiniciar» van al menú guiado; el texto libre, a Avi", not agente.atiende(st0, lead_b, "text", "Hola", CONFIG)
        and not agente.atiende(st0, lead_b, "text", "menú", CONFIG) and not agente.atiende(st0, lead_b, "text", "reiniciar", CONFIG)
        and agente.atiende(st0, lead_b, "text", "hola, busco un dell", CONFIG))

FICHAS.append({"fuente": "ficha", "id": 5, "titulo": "Medios de pago", "texto": "Bancolombia ahorros 82547373550, llave @x", "puntaje": 1})
CONFIG["texto_cuentas"] = "Bancolombia ahorros 82547373550"
r = turno([{"herramienta": "buscar_conocimiento", "args": {"pregunta": "medios de pago"}},
           {"responder": "Puedes pagar a Bancolombia 82547373550"}, {"responder": "Puedes pagar a Bancolombia 825 4737 3550"}])
prueba(45, "aunque una ficha traiga las cuentas, Avi no puede escribir sus números (RAG-09)", r["asesor"]
        and not any("82547373550" in t.replace(" ", "") for t in textos(r)) and "número de cuenta" in r["nota"])
CONFIG["texto_cuentas"] = ""

# --- Lista de equipos con la plantilla del dueño (F4·37, 46-51)
r = turno([{"herramienta": "buscar_productos", "args": {}},
           {"responder": "Te recomiendo estos:", "equipos": ["100-102-1030-1", "pu-23", "NO-EXISTE"], "despues": "¿Te mando la ficha de alguno?"}])
t = textos(r)
prueba(46, "arma la lista con la plantilla y los datos de la base, en un solo mensaje", len(t) == 1
       and t[0] == "Te recomiendo estos:\n\n💻 *Dell Latitude 5420* · Código 100-102-1030-1\n⚙️ i5-1135G7 · 16GB · 512GB\n⭐ Grado A\n💰 *$1.500.000*"
                   "\n\n💻 *HP ProBook 450* · Código PU-23\n⚙️ i7-8550U · 8GB · 256GB\n⭐ Grado B\n💰 *$1.200.000*\n\n¿Te mando la ficha de alguno?")
prueba(47, "un código que no existe no sale y el código en minúscula se reconoce", "NO-EXISTE" not in t[0] and "PU-23" in t[0])
CONFIG.update(equipos_separados=True, max_equipos=1, plantilla_equipo="🖥 {equipo}\n📝 {descripcion}\n💵 {precio}")
r = turno([{"responder": "Mira este:", "equipos": ["100-102-1030-1", "PU-23"], "despues": "¿Lo quieres?"}])
t = textos(r)
prueba(48, "un mensaje por equipo, hasta el máximo, y un renglón sin dato no sale", t == ["Mira este:", "🖥 Dell Latitude 5420\n💵 $1.500.000", "¿Lo quieres?"])
r = turno([{"responder": "Este cuesta $999.000", "equipos": ["PU-23"]}, {"responder": "Te paso con un asesor"}])
prueba(49, "un precio inventado en la frase se revisa como siempre (RAG-02)", any(x.get("tipo") == "bloqueado" for x in r["traza"]))
r = turno([{"responder": "", "equipos": ["NO-EXISTE"]}, {"responder": "No tengo ese equipo"}])
prueba(50, "si ningún código existe, le pide una respuesta de nuevo", textos(r) == ["No tengo ese equipo"])
st = flujo.estado_vacio(); st["agente"] = {"sin_avance": 2}
r = turno([{"responder": "Mira:", "equipos": ["PU-23"]}], st=st)
prueba(51, "mostrar equipos cuenta como avance (no pasa al asesor por 3 sin avance)", not r["asesor"] and st["agente"]["sin_avance"] == 0)
for k in ("equipos_separados", "max_equipos", "plantilla_equipo"):
    CONFIG.pop(k)

print(f"\n{51 - fallos}/51 pruebas bien")
sys.exit(1 if fallos else 0)

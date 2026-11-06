"""
Pruebas del retorno del bot y «¿Sigues necesitando ayuda?» (F4·45, docs/SEGUIMIENTOS-Y-SLA.md RT-01 a RT-10). Sin base ni WhatsApp:
la base se reemplaza por datos fijos (quién recibe el mensaje lo prueba supabase/pruebas/0049_retorno_del_bot.sql). Uso:
python3 herramientas/meta-webhook-prueba/prueba_retorno.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import db  # noqa: E402
import flujo  # noqa: E402
import receptor  # noqa: E402
import retorno  # noqa: E402

CFG = {"activo": True, "a_texto": "¡Hola {nombre}! ¿Sigues necesitando ayuda?", "a_boton_si": "Sí, continuar",
       "a_boton_asesor": "Hablar con asesor", "a_boton_no": "Ya no, gracias", "b_texto": "Disculpa la demora 🙏",
       "b_boton_si": "Sí, sigue tú", "b_boton_espera": "Espero al asesor", "texto_espera": "👍 Un asesor te escribe pronto.",
       "texto_no": "¡Gracias por escribirnos!", "volver_respuesta": True, "palabra": "continuar"}
C = {"B00": {"clave": "B00", "tipo": "mensaje", "nombre": "B00", "inicio": True, "texto": "Hola, ¿qué buscas?",
             "opciones": [{"id": "1", "titulo": "Portátiles", "destino": "B00"}], "salidas": {}, "ajustes": {}, "al_entrar": {}, "marcas": []},
     "P00": {"clave": "P00", "tipo": "mensaje", "nombre": "P00", "inicio": True, "texto": "Postventa: ¿en qué te ayudo?",
             "opciones": [{"id": "1", "titulo": "Garantía", "destino": "P00"}], "salidas": {}, "ajustes": {}, "al_entrar": {}, "marcas": []},
     "B-ASESOR": {"clave": "B-ASESOR", "tipo": "asesor", "nombre": "x", "inicio": False, "texto": "Un asesor te atiende",
                  "opciones": [], "salidas": {}, "ajustes": {}, "al_entrar": {}, "marcas": []},
     "B-CERRADO": {"clave": "B-CERRADO", "tipo": "aviso", "nombre": "x", "inicio": False, "texto": "Fuera de horario",
                   "opciones": [], "salidas": {}, "ajustes": {}, "al_entrar": {}, "marcas": []}}
POSTVENTA = 9
BOTS = {1: {k: v for k, v in C.items() if k != "P00"}, POSTVENTA: {**{k: v for k, v in C.items() if k != "B00"}}}
LEAD = {}
ENV, GUARDADOS, MARCAS, EVENTOS, CAMBIOS = [], [], [], [], {}
CANDIDATOS = []
DESTINO = [None]

db.retorno_config = lambda: CFG
db.retorno_candidatos = lambda lead_id=None: [c for c in CANDIDATOS if lead_id is None or c["lead_id"] == lead_id]
db.retorno_marcar = lambda i, r: MARCAS.append((i, r))
db.retorno_evento = lambda i, d: EVENTOS.append(d)
db.retorno_destino = lambda etapa: DESTINO[0]
db.retorno_inactivos = lambda: 0
db.flujo = lambda bot=None: BOTS.get(bot or 1)
db.principal = lambda: 1
db.bot_config = lambda: {"chatbot_activo": True, "menu_activo": True, "agente_en_todo": False, "texto_apagado": ""}
db.agente_config = lambda fresco=False: {"estado": "lista_blanca", "buffer_segundos": 0, "escribiendo": False,
                                         "espera_primera_ms": 0, "pausa_mensajes_ms": 0}
db.lead = lambda t: dict(LEAD)
db.crear_lead = lambda t, n: dict(LEAD)
db.guardar_mensaje = lambda *a, **k: GUARDADOS.append((a, k))
db.actualizar_lead = lambda i, c: CAMBIOS.update(c)
db.atributos = lambda: {}
db.acciones_activas = lambda: []
flujo.texto_horario = lambda: "L-V"
flujo.proxima_apertura = lambda ahora=None: (True, "")
receptor.enviar = lambda n, m: (ENV.append(m) or "enviado")
receptor.anotar = lambda *a: None
receptor.resolver = lambda m: m

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def cuerpo(m):
    return m.get("text", {}).get("body") or m.get("interactive", {}).get("body", {}).get("text", "")


def botones(m):
    return [b["reply"]["id"] for b in m.get("interactive", {}).get("action", {}).get("buttons", [])]


def nuevo_lead(**extra):
    LEAD.clear()
    LEAD.update({"id": 7, "telefono": "573001112233", "nombre": "Ana María", "paso_menu": "B00", "etapa": "En Conversación",
                 "errores_bot": 0, "pausar_bot": False, "bot_id": None, "estado_bot": {"campos": {}}, "etiquetas": [],
                 "atributos": {}, "categoria_interes": "", "uso_equipo": "", "presupuesto": "", "marca_interes": "",
                 "cotiz_producto": "", "retorno_pendiente": None, **extra})


def turno(entrada, tipo="interactive"):
    for lista in (ENV, EVENTOS):
        lista.clear()
    CAMBIOS.clear()
    receptor._contestar(LEAD["telefono"], entrada, entrada, "", tipo, "wamid.1")
    return ENV


# 1. El mensaje de la regla A: texto con el primer nombre y tres botones (RT-01)
m = retorno.mensaje("A", "Ana María", CFG)
ok(cuerpo(m) == "¡Hola Ana! ¿Sigues necesitando ayuda?" and botones(m) == ["ret-si", "ret-asesor", "ret-no"],
   "regla A: «¿Sigues necesitando ayuda?» con el primer nombre y Sí · Asesor · No")
m = retorno.mensaje("A", "", CFG)
ok(cuerpo(m) == "¡Hola! ¿Sigues necesitando ayuda?", "sin nombre, {nombre} se quita sin dejar un espacio de más")

# 2. Regla B: demora con dos botones (RT-02)
m = retorno.mensaje("B", "Ana", CFG)
ok(cuerpo(m) == "Disculpa la demora 🙏" and botones(m) == ["ret-si", "ret-espera"], "regla B: demora con «Sí, sigue tú» y «Espero al asesor»")

# 3. El reloj envía, guarda como automático y marca (RT-03, RT-09)
nuevo_lead()
CANDIDATOS[:] = [{"lead_id": 7, "telefono": "573001112233", "nombre": "Ana", "regla": "A"}]
ENV.clear()
receptor.revisar_retorno()
ok(len(ENV) == 1 and botones(ENV[0]) == ["ret-si", "ret-asesor", "ret-no"] and MARCAS == [(7, "A")]
   and GUARDADOS[-1][1].get("automatico") is True, "el reloj envía la regla A, la guarda como automática y la marca")

# 4. Si ya no es candidato al momento de enviar (el cliente escribió), no envía
CANDIDATOS.clear()
ENV.clear()
receptor.enviar_retorno({"lead_id": 7, "telefono": "573001112233", "regla": "A"}, CFG)
ok(not ENV and MARCAS == [(7, "A")], "antes de enviar se revisa otra vez: si ya no aplica, no sale nada")

# 5. Apagado o con el chatbot apagado no envía nada
CANDIDATOS[:] = [{"lead_id": 7, "telefono": "573001112233", "nombre": "Ana", "regla": "A"}]
CFG["activo"] = False
ENV.clear()
receptor.revisar_retorno()
ok(not ENV, "con el retorno apagado no sale nada (criterio 6)")
CFG["activo"] = True
apagado = db.bot_config
db.bot_config = lambda: {"chatbot_activo": False}
receptor.revisar_retorno()
db.bot_config = apagado
ok(not ENV, "con el chatbot apagado tampoco (RT-07)")
CANDIDATOS.clear()

# 6. Con el bot: «Sí, continuar» sigue donde iba y limpia el pendiente
nuevo_lead(retorno_pendiente="A")
r = turno("ret-si")
ok(r and cuerpo(r[0]).startswith("Hola, ¿qué buscas?") and CAMBIOS.get("retorno_pendiente", "x") is None and EVENTOS,
   "con el bot, «Sí, continuar» sigue en su cuadro, limpia el pendiente y deja historial")

# 7. Con asesor: «Sí, sigue tú» devuelve el chat al bot, al destino configurado (RT-05.1, RT-06)
nuevo_lead(retorno_pendiente="B", pausar_bot=True, paso_menu="B-ASESOR")
r = turno("ret-si")
ok(r and cuerpo(r[0]).startswith("Hola, ¿qué buscas?") and CAMBIOS.get("pausar_bot") is False, "con asesor, «Sí» vuelve al bot (inicio del principal)")
DESTINO[0] = POSTVENTA
nuevo_lead(retorno_pendiente="B", pausar_bot=True, paso_menu="B-ASESOR", etapa="Vendido")
r = turno("ret-si")
ok(r and cuerpo(r[0]).startswith("Postventa: ¿en qué te ayudo?") and CAMBIOS.get("bot_id") == POSTVENTA, "y va al bot de destino (postventa)")
DESTINO[0] = None

# 8. Con la casilla «volver al responder» apagada, se queda con el asesor
CFG["volver_respuesta"] = False
nuevo_lead(retorno_pendiente="B", pausar_bot=True, paso_menu="B-ASESOR")
r = turno("ret-si")
ok(r and cuerpo(r[0]) == CFG["texto_espera"] and CAMBIOS.get("pausar_bot") is True, "casilla apagada: «Sí» no devuelve el chat al bot")
CFG["volver_respuesta"] = True

# 9. La palabra «continuar» vale como «Sí» solo si hay un mensaje pendiente (RT-05.1)
nuevo_lead(retorno_pendiente="B", pausar_bot=True, paso_menu="B-ASESOR")
r = turno("Continuar", "text")
ok(r and CAMBIOS.get("pausar_bot") is False, "escribir «continuar» con un mensaje pendiente devuelve el chat al bot")
nuevo_lead(pausar_bot=True, paso_menu="B-ASESOR")
r = turno("continuar", "text")
ok(not r and CAMBIOS.get("pausar_bot") is True, "sin mensaje pendiente, «continuar» es un mensaje más para el asesor")

# 10. «Espero al asesor» y «Hablar con asesor» con asesor: se queda en la cola sin volver a entrar
nuevo_lead(retorno_pendiente="B", pausar_bot=True, paso_menu="B-ASESOR")
r = turno("ret-espera")
ok(r and cuerpo(r[0]) == CFG["texto_espera"] and CAMBIOS.get("pausar_bot") is True, "«Espero al asesor» deja el chat en la cola")
nuevo_lead(retorno_pendiente="A", pausar_bot=True, paso_menu="B-ASESOR")
r = turno("ret-asesor")
ok(r and cuerpo(r[0]) == CFG["texto_espera"] and CAMBIOS.get("pausar_bot") is True, "«Hablar con asesor» si ya está con uno: solo el aviso")

# 11. Con el bot, «Hablar con asesor» pasa a la cola
nuevo_lead(retorno_pendiente="A")
r = turno("ret-asesor")
ok(r and cuerpo(r[0]) == "Un asesor te atiende" and CAMBIOS.get("pausar_bot") is True, "con el bot, «Hablar con asesor» pasa a la cola")

# 12. «Ya no, gracias»: despedida y etiqueta No-Interesado (no vuelve a recibir mensajes, RT-07)
nuevo_lead(retorno_pendiente="A")
r = turno("ret-no")
ok(r and cuerpo(r[0]) == CFG["texto_no"] and "No-Interesado" in (CAMBIOS.get("etiquetas") or []), "«Ya no, gracias» se despide y etiqueta No-Interesado")

# 13. Otro mensaje cualquiera con un pendiente: sigue su camino normal y limpia el pendiente
nuevo_lead(retorno_pendiente="A", pausar_bot=True, paso_menu="B-ASESOR")
r = turno("¿cuánto cuesta el envío?", "text")
ok(not r and CAMBIOS.get("retorno_pendiente", "x") is None, "otro mensaje va al asesor como siempre y limpia el pendiente")

print(f"\n{n - fallos}/{n} en verde" if not fallos else f"\n{fallos} de {n} fallaron")
sys.exit(1 if fallos else 0)

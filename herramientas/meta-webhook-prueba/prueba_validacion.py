"""
Pruebas de la validación del comprobante por el asesor (F4·46, docs/AGENTE.md §4g, RAG-63 a RAG-70). Sin base ni WhatsApp: la base
se reemplaza por datos fijos (los permisos, el historial y el embudo los prueba supabase/pruebas/0050_validacion_del_comprobante.sql).
Uso: python3 herramientas/meta-webhook-prueba/prueba_validacion.py
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import compra  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402
import receptor  # noqa: E402

DESPACHO = 462
CFG = {"texto_cuentas": "💳 Bancolombia 123", "cargo_configuracion": 80000, "horas_sin_respuesta": 12,
       "texto_comprobante": "✅ Recibimos tu comprobante. Un asesor valida tu pago.", "texto_cancelacion": "Entendido.",
       "validar_comprobante": True, "texto_soporte": "📄 Recibimos tu soporte por {total}. Te confirmamos {proxima}.",
       "texto_validado": "✅ Recibimos tu comprobante.", "texto_rechazado": "😕 No pudimos validar tu pago: {motivo}. Envíanos otro.",
       "compra_bot_despues": DESPACHO, "escribiendo": False, "espera_primera_ms": 0, "pausa_mensajes_ms": 0, "buffer_segundos": 0,
       "estado": "lista_blanca"}


def cuadro(clave, tipo, texto, inicio=False, opciones=()):
    return {"clave": clave, "tipo": tipo, "nombre": clave, "inicio": inicio, "texto": texto, "salidas": {}, "ajustes": {},
            "al_entrar": {}, "marcas": [], "opciones": [{"id": str(i), "titulo": t, "destino": clave} for i, t in enumerate(opciones, 1)]}


SISTEMA = {"B-ASESOR": cuadro("B-ASESOR", "asesor", "Un asesor te atiende"), "B-CERRADO": cuadro("B-CERRADO", "aviso", "Fuera de horario")}
BOTS = {1: {"B00": cuadro("B00", "mensaje", "Hola", True, ["Portátiles"]), **SISTEMA},
        DESPACHO: {"D1": cuadro("D1", "mensaje", "¿Cómo recibes tu equipo?", True, ["Envío a domicilio", "Recojo en tienda"]), **SISTEMA}}
LEAD = {}
ENV, CAMBIOS = [], {}
ULTIMO = [datetime.now(timezone.utc)]

db.conocimiento = lambda categoria, fresco=False: []  # F4·49: sin imagen de medios de pago
db.agente_config = lambda fresco=False: CFG
db.flujo = lambda bot=None: BOTS.get(bot or 1)
db.principal = lambda: 1
db.bot_config = lambda: {"chatbot_activo": True, "menu_activo": True, "agente_en_todo": False, "texto_apagado": ""}
db.lead = lambda t: dict(LEAD)
db.crear_lead = lambda t, n: dict(LEAD)
db.telefono_de = lambda i: LEAD.get("telefono")
db.ultimo_del_cliente = lambda i: ULTIMO[0]
db.guardar_mensaje = lambda *a, **k: None
db.actualizar_lead = lambda i, c: CAMBIOS.update(c)
db.atributos = lambda: {}
db.acciones_activas = lambda: []
db.compra_mover = lambda *a, **k: None
db.agregar_nota = lambda *a, **k: ""
db.retorno_config = lambda: {"activo": False}
flujo.texto_horario = lambda: "L-V"
flujo.proxima_apertura = lambda ahora=None: (True, "")
flujo.con_horario = lambda t: t.replace("{proxima}", "en breve")
receptor.enviar = lambda n, m: (ENV.append(m) or "enviado")
receptor.anotar = lambda *a: None
receptor.resolver = lambda m: m
receptor.extras_de_compra = lambda *a, **k: None

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def cuerpo(m):
    return m.get("text", {}).get("body") or m.get("interactive", {}).get("body", {}).get("text", "")


def con_compra(paso="esperando_pago", pausa=False, **compra_extra):
    LEAD.clear()
    LEAD.update({"id": 5, "telefono": "573002103979", "nombre": "Jhonatan Marin", "paso_menu": "COMPRA", "etapa": "Esperando pago",
                 "errores_bot": 0, "pausar_bot": pausa, "bot_id": None, "etiquetas": [], "atributos": {}, "categoria_interes": "",
                 "uso_equipo": "", "presupuesto": "", "marca_interes": "", "cotiz_producto": "", "retorno_pendiente": None,
                 "estado_bot": {"campos": {}, "compra": {"paso": paso, "codigo": "100-102-1137", "equipo": "LENOVO T16", "precio": 4000000,
                                                         "tipo": "cliente_final", "total": 4080000, **compra_extra}}})


def turno(entrada, tipo="text"):
    ENV.clear()
    CAMBIOS.clear()
    receptor._contestar(LEAD["telefono"], entrada, entrada, "", tipo, "wamid.1")
    LEAD.update(CAMBIOS)  # lo que quedó guardado es lo que ve el siguiente paso
    return [cuerpo(m) for m in ENV]


def validar(resultado, **extra):
    """Lo que hace la base al pulsar el botón: deja la marca en la compra (como validar_comprobante / rechazar_comprobante)."""
    if "compra" in LEAD["estado_bot"]:
        LEAD["estado_bot"]["compra"].update(validacion=resultado, **extra)
    ENV.clear()
    CAMBIOS.clear()
    r = receptor.resolver_comprobante({"lead": 5})
    LEAD.update(CAMBIOS)
    return r, [cuerpo(m) for m in ENV]


# 1. La foto del comprobante solo acusa recibo: no confirma ni arranca el despacho (RAG-63)
con_compra()
t = turno("asesor", "image")
ok(t == ["📄 Recibimos tu soporte por $4.080.000. Te confirmamos en breve."], "la foto recibe el acuse con el total, sin «¿Cómo recibes tu equipo?»")
ok(LEAD["pausar_bot"] is True and LEAD["estado_bot"]["compra"]["paso"] == "pago_por_confirmar"
   and "Comprobante-Por-Validar" in LEAD["etiquetas"], "la compra queda en pago por confirmar, con etiqueta y el chat en la cola")

# 2. «Ya pagué» sin foto pide el soporte (no hay validación sin soporte)
con_compra()
t = turno("ya pagué")
ok(t and "foto o el PDF" in t[0] and LEAD["estado_bot"]["compra"]["paso"] == "esperando_pago", "«ya pagué» sin archivo pide la foto o el PDF")

# 3. Mientras se valida, lo que escriba el cliente va al asesor (el bot no contesta)
con_compra("pago_por_confirmar", pausa=True)
ok(turno("¿ya les llegó?") == [], "con el comprobante por validar, el bot no contesta: lo ve el asesor")

# 4. Validado: «✅ Recibimos tu comprobante.» y arranca Datos de despacho (RAG-65)
con_compra("pago_por_confirmar", pausa=True)
r, t = validar("validado", validado_por="Jhonatan")
ok(r["ok"] and r["resultado"] == "validado" and t[0] == "✅ Recibimos tu comprobante." and t[1].startswith("¿Cómo recibes tu equipo?")
   and "Envío a domicilio" in t[1], "validar envía la confirmación y enseguida «¿Cómo recibes tu equipo? 1 Envío a domicilio 2 Recojo en tienda»")
ok(LEAD["pausar_bot"] is False and LEAD["bot_id"] == DESPACHO and "compra" not in LEAD["estado_bot"],
   "el chat vuelve al bot de despacho y la compra se cierra")

# 5. Validar dos veces no repite nada
r, t = validar("validado")
ok(not r["ok"] and not t, "una segunda llamada no envía nada: ya no hay validación pendiente")

# 6. Sin bot de despacho, la confirmación y el asesor sigue
CFG["compra_bot_despues"] = None
con_compra("pago_por_confirmar", pausa=True)
r, t = validar("validado")
ok(t == ["✅ Recibimos tu comprobante."] and LEAD["pausar_bot"] is True, "sin bot de despacho: solo la confirmación y sigue el asesor")
CFG["compra_bot_despues"] = DESPACHO

# 7. La flecha «Pedido pagado» del cuadro 🛒 Carrito se sigue al validar, no al recibir (consecuencia de la 0036)
con_compra("pago_por_confirmar", pausa=True, salidas={"listo": "B00"}, bot=1)
r, t = validar("validado")
ok(len(t) == 2 and t[1].startswith("Hola"), "con el Carrito del lienzo, «Pedido pagado» se sigue al validar")

# 8. Rechazado: el motivo al cliente y vuelve a esperar el pago (RAG-66)
con_compra("pago_por_confirmar", pausa=True)
r, t = validar("rechazado", motivo="El monto no coincide", rechazos=1)
ok(t == ["😕 No pudimos validar tu pago: el monto no coincide. Envíanos otro."] and LEAD["pausar_bot"] is False
   and LEAD["estado_bot"]["compra"]["paso"] == "esperando_pago", "el rechazo manda el motivo y la compra vuelve a esperar el soporte")
t = turno("asesor", "image")
ok(t and t[0].startswith("📄 Recibimos tu soporte") and LEAD["estado_bot"]["compra"]["paso"] == "pago_por_confirmar",
   "el nuevo soporte vuelve a la tarjeta de validación")

# 9. Segundo rechazo: el chat se queda con el asesor, pero el siguiente soporte igual llega a la tarjeta
r, t = validar("rechazado", motivo="No aparece en la cuenta", rechazos=2)
ok(t and LEAD["pausar_bot"] is True and LEAD["estado_bot"]["compra"]["paso"] == "esperando_pago",
   "al segundo rechazo el chat se queda con el asesor")
t = turno("asesor", "image")
ok(t and LEAD["estado_bot"]["compra"]["paso"] == "pago_por_confirmar", "con el asesor, un tercer soporte llega igual a la tarjeta")

# 10. Fuera de las 24 h: se registra pero no se escribe (RAG-68)
con_compra("pago_por_confirmar", pausa=True)
ULTIMO[0] = datetime.now(timezone.utc) - timedelta(hours=30)
r, t = validar("validado")
ok(r["ok"] and r["aviso"] and not t and LEAD["pausar_bot"] is True, "fuera de las 24 h no se envía nada y avisa al asesor")
ULTIMO[0] = datetime.now(timezone.utc)

# 11. Con la casilla apagada, como antes: confirma y arranca el despacho al recibir (RAG-70)
CFG["validar_comprobante"] = False
con_compra()
t = turno("asesor", "image")
ok(len(t) == 1 and t[0].startswith("¿Cómo recibes tu equipo?"), "casilla apagada: el despacho arranca al recibir la foto, como antes")
CFG["validar_comprobante"] = True

print(f"\n{n - fallos}/{n} en verde" if not fallos else f"\n{fallos} de {n} fallaron")
sys.exit(1 if fallos else 0)

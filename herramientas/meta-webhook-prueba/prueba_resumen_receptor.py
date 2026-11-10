"""
Pruebas de punta a punta del resumen del pedido (F4·64, RF-46 a RF-51): el cliente toca «Recojo en tienda» o termina los datos de envío
y el receptor manda, en este orden, la política de despacho y el resumen del pedido. Sin base ni WhatsApp (todo reemplazado).
Uso: python3 herramientas/meta-webhook-prueba/prueba_resumen_receptor.py
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import db  # noqa: E402
import flujo  # noqa: E402
import receptor  # noqa: E402

POLITICA_TIENDA = "🏬 *Política de entrega en tienda*\n1️⃣ ✅ Pago confirmado."
POLITICA_ENVIO = "🚚 *Política de despacho*\n1️⃣ ✅ Pago confirmado."


def cuadro(clave, tipo, texto="", **extra):
    return {"clave": clave, "tipo": tipo, "nombre": clave, "inicio": False, "texto": texto, "opciones": [], "salidas": {}, "ajustes": {},
            "al_entrar": {}, "marcas": [], **extra}


BOT = {
    "B00": dict(cuadro("B00", "mensaje", "📦 ¿Cómo quieres recibir tu equipo?", inicio=True), opciones=[
        {"id": "1", "titulo": "Envío transportadora", "destino": "Q1", "efectos": {"atributos": {"venta_online": True}}},
        {"id": "2", "titulo": "Recojo en tienda", "destino": "B-ASESOR", "efectos": {"atributos": {"venta_online": False}, "motivo": POLITICA_TIENDA}}]),
    "Q1": cuadro("Q1", "pregunta", "¿Tu nombre?", salidas={"siguiente": "M1"},
                 ajustes={"atributo": "nombre_completo", "texto_error": "De nuevo", "espera_segundos": 1800}),
    "M1": dict(cuadro("M1", "mensaje", "Confirma"), opciones=[{"id": "1", "titulo": "Sí, correctos", "destino": "B-ASESOR", "efectos": {"motivo": POLITICA_ENVIO}}]),
    "B-ASESOR": cuadro("B-ASESOR", "asesor", "{motivo}🙌 Un asesor te escribe.", marcas=["motivo"], ajustes={"solo_motivo": True}),
    "B-CERRADO": cuadro("B-CERRADO", "aviso", "Fuera de horario"), "ERROR": cuadro("ERROR", "aviso", "No entendí"),
    "ERROR-3": cuadro("ERROR-3", "aviso", "Te paso con un asesor"),
}
ATRIBUTOS = {"nombre_completo": {"clave": "nombre_completo", "nombre": "Nombre completo", "tipo": "texto", "opciones": []},
             "venta_online": {"clave": "venta_online", "nombre": "Venta online", "tipo": "si_no", "opciones": []}}
CFG = {"resumen_pedido_activo": True, "estado": "lista_blanca", "escribiendo": False, "espera_primera_ms": 0, "pausa_mensajes_ms": 0, "buffer_segundos": 0,
       "texto_resumen_pedido": "🧾 *Resumen de tu pedido* {pedido}\n\n💻 *Equipos*\n{equipos}\n\n💰 Total: *{total}*\n✅ Pagado: *{pagado}*{saldo}\n\n"
                               "📦 *Entrega:* {entrega}\n{datos}\n\nSi algo no está correcto, escríbelo por aquí. 🙌"}
A = {"id": 7, "numero": 78, "oportunidad_id": 607, "resumen_enviado_en": None, "equipos": [{"codigo": "100-101-1149", "nombre": "LENOVO X13 GEN 3"}]}
LEAD, ENV, CAMBIOS, PATCHES = {}, [], {}, []


def pedir(ruta, metodo="GET", cuerpo=None, prefer=None):
    if metodo == "PATCH":
        PATCHES.append((ruta, cuerpo))
        if ruta.startswith("alistamientos?id=eq.7"):
            A.update(cuerpo if cuerpo.get("resumen_enviado_en") is None else {"resumen_enviado_en": "2026-11-10T21:00:00Z"})  # la base guarda la hora
        return None
    if ruta.startswith("alistamientos?"):
        return [dict(A)]
    if ruta.startswith("oportunidades?"):
        return [{"valor_estimado": "3580000"}]
    if ruta.startswith("pagos?"):
        return [{"valor": "3580000"}]
    return []


db.pedir = pedir
db.atributos = lambda: ATRIBUTOS
db.flujo = lambda bot=None: BOT
db.principal = lambda: 1
db.agente_config = lambda fresco=False: CFG
db.conocimiento = lambda categoria, fresco=False: []
db.bot_config = lambda: {"chatbot_activo": True, "menu_activo": True, "agente_en_todo": False, "texto_apagado": ""}
db.lead = lambda t: dict(LEAD)
db.crear_lead = lambda t, n: dict(LEAD)
db.telefono_de = lambda i: LEAD.get("telefono")
db.ultimo_del_cliente = lambda i: datetime.now(timezone.utc)
db.guardar_mensaje = lambda *a, **k: None
db.actualizar_lead = lambda i, c: CAMBIOS.update(c)
db.acciones_activas = lambda: []
db.retorno_config = lambda: {"activo": False}
flujo.proxima_apertura = lambda ahora=None: (False, "mañana a las 9:00 am")
flujo.texto_horario = lambda: "L-V"
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


def cliente(**atributos):
    LEAD.clear()
    LEAD.update({"id": 5, "telefono": "573002103979", "nombre": "Ventas virtual colombia 2", "paso_menu": "B00", "etapa": "Esperando pago", "errores_bot": 0,
                 "pausar_bot": False, "bot_id": None, "etiquetas": [], "atributos": atributos, "categoria_interes": "", "uso_equipo": "",
                 "presupuesto": "", "marca_interes": "", "cotiz_producto": "", "estado_bot": {"campos": {}}, "valor_estimado": 0})
    ENV.clear(); CAMBIOS.clear(); PATCHES.clear()


def turno(entrada, tipo="text"):
    ENV.clear(); CAMBIOS.clear()
    receptor._contestar(LEAD["telefono"], entrada, entrada, "", tipo, "wamid.1")
    LEAD.update(CAMBIOS)
    return [m["text"]["body"] for m in ENV if "text" in m]


# Recojo en tienda: la política y, enseguida, el resumen
cliente()
t = turno("2")
ok(len(t) == 2 and t[0] == POLITICA_TIENDA, "tienda: primero la política de entrega, tal cual")
ok(len(t) == 2 and t[1].startswith("🧾 *Resumen de tu pedido* PED-0078") and "LENOVO X13 GEN 3 (100-101-1149)" in t[1]
   and "🏬 Recojo en tienda" in t[1] and "Total: *$3.580.000*" in t[1], "tienda: después, el resumen con pedido, equipo, total y entrega")
ok(LEAD["pausar_bot"] is True and "resumen_pedido" not in (LEAD.get("estado_bot") or {}), "el chat queda con el asesor y la marca no se guarda en la base")
ok(any(p[0] == "alistamientos?id=eq.7" for p in PATCHES), "queda anotado que el resumen ya se envió")

# Segunda vez: no se repite
LEAD.update(paso_menu="B00", pausar_bot=False)
t = turno("2")
ok(len(t) == 1 and t[0] == POLITICA_TIENDA, "si recorre el bot otra vez, la política sale pero el resumen no se repite")

# Envío: datos y confirmación
A["resumen_enviado_en"] = None
cliente()
turno("1")
turno("Juan Pérez Gómez")
t = turno("1")
ok(len(t) == 2 and t[0] == POLITICA_ENVIO and "🚚 Envío por transportadora" in t[1] and "👤 Juan Pérez Gómez" in t[1], "envío: política y después el resumen con los datos de despacho")

# Pedir asesor a mitad de camino: sin resumen
cliente()
turno("1")
t = turno("asesor")
ok(not any("Resumen de tu pedido" in x for x in t), "pedir asesor a mitad del camino no manda el resumen")

# Interruptor apagado
CFG["resumen_pedido_activo"] = False
A["resumen_enviado_en"] = None
cliente()
t = turno("2")
ok(len(t) == 1 and t[0] == POLITICA_TIENDA, "con el interruptor apagado solo sale la política")

# Si armar el resumen falla, el cliente igual recibe la política
CFG["resumen_pedido_activo"] = True
orig = receptor.compra.resumen_pedido
receptor.compra.resumen_pedido = lambda lead, st: 1 / 0
cliente()
t = turno("2")
ok(len(t) == 1 and t[0] == POLITICA_TIENDA, "si el resumen falla, la política llega igual")
receptor.compra.resumen_pedido = orig

print(f"\n{n - fallos}/{n} en verde")
sys.exit(1 if fallos else 0)

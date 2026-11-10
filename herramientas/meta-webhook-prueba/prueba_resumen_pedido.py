"""
Pruebas del resumen del pedido después del cierre de la compra (F4·64, docs/FLUJO-DEL-BOT.md, RF-46 a RF-51). Sin base ni WhatsApp:
la base se reemplaza por datos fijos. Uso: python3 herramientas/meta-webhook-prueba/prueba_resumen_pedido.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import compra  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402

PLANTILLA = ("🧾 *Resumen de tu pedido* {pedido}\n\n💻 *Equipos*\n{equipos}\n\n💰 Total: *{total}*\n✅ Pagado: *{pagado}*{saldo}\n\n"
             "📦 *Entrega:* {entrega}\n{datos}\n\nSi algo no está correcto, escríbelo por aquí y un asesor te ayuda. 🙌")
CFG = {"resumen_pedido_activo": True, "texto_resumen_pedido": PLANTILLA}
A = {"id": 7, "numero": 78, "oportunidad_id": 607, "resumen_enviado_en": None,
     "equipos": [{"codigo": "100-101-1149", "nombre": "LENOVO X13 GEN 3"}]}
OP = {"valor_estimado": "3580000"}
PAGOS = [{"valor": "3580000"}]
PATCHES = []


def pedir(ruta, metodo="GET", cuerpo=None, prefer=None):
    if metodo == "PATCH":
        PATCHES.append((ruta, cuerpo))
        return None
    if ruta.startswith("alistamientos?"):
        return [dict(A)] if A else []
    if ruta.startswith("oportunidades?"):
        return [OP]
    if ruta.startswith("pagos?"):
        return PAGOS
    return []


db.pedir = pedir
db.agente_config = lambda fresco=False: CFG

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def texto(r):
    return r[0]["text"]["body"] if r else ""


LEAD = {"id": 5, "nombre": "Ventas virtual colombia 2", "valor_estimado": 0, "atributos": {}}
TIENDA = {"venta_online": "false"}
ENVIO = {"venta_online": "true", "nombre_completo": "Ana Ruiz", "celular": "3001112233", "direccion_entrega": "Cra 5 # 10-20, Cali, Valle", "cedula": "123"}

# Recojo en tienda
t = texto(compra.resumen_pedido(LEAD, {"atributos": TIENDA}))
ok("PED-0078" in t and "💻 LENOVO X13 GEN 3 (100-101-1149)" in t, "dice el número de pedido y el equipo con su código")
ok("Total: *$3.580.000*" in t and "Pagado: *$3.580.000*" in t and "Saldo" not in t, "total y pagado; sin saldo no hay línea de saldo")
ok("🏬 Recojo en tienda" in t and "👤" not in t and "📍" not in t, "en tienda dice «Recojo en tienda» y no pone datos de envío")
ok("\n\n\n" not in t and "{" not in t, "sin huecos de más ni marcas sin reemplazar")
ok(PATCHES and PATCHES[-1][0] == "alistamientos?id=eq.7" and "resumen_enviado_en" in PATCHES[-1][1], "queda anotado que ya se envió (RF-50)")

# Envío por transportadora
PATCHES.clear()
t = texto(compra.resumen_pedido(LEAD, {"atributos": ENVIO}))
ok("🚚 Envío por transportadora" in t and "👤 Ana Ruiz" in t and "📱 3001112233" in t and "📍 Cra 5 # 10-20, Cali, Valle" in t,
   "en envío pone nombre, celular y dirección")
ok("123" not in t, "no repite la cédula en el resumen")

# El lead ya traía los datos y la bandera venta_online sin el estado
t = texto(compra.resumen_pedido({**LEAD, "atributos": ENVIO}, {"atributos": {}}))
ok("📍 Cra 5" in t, "los datos de la ficha también valen si no están en el estado del bot")
# Sin venta_online, la dirección decide
t = texto(compra.resumen_pedido(LEAD, {"atributos": {"direccion_entrega": "Cll 1 # 2-3"}}))
ok("🚚 Envío por transportadora" in t, "sin «Venta online», una dirección significa envío")

# Con un abono (F4·59): el saldo pendiente se ve
PAGOS[:] = [{"valor": "2000000"}]
t = texto(compra.resumen_pedido(LEAD, {"atributos": ENVIO}))
ok("Pagado: *$2.000.000*" in t and "⏳ Saldo pendiente: *$1.580.000*" in t, "con abono muestra lo pagado y el saldo pendiente")
PAGOS[:] = [{"valor": "3580000"}]

# Varios equipos
A["equipos"] = [{"codigo": "100-1", "nombre": "DELL 5420"}, {"codigo": "100-2", "nombre": "HP 840"}]
t = texto(compra.resumen_pedido(LEAD, {"atributos": TIENDA}))
ok(t.count("💻") == 3 and "DELL 5420 (100-1)" in t and "HP 840 (100-2)" in t, "varios equipos, uno por línea")
A["equipos"] = [{"codigo": "100-101-1149", "nombre": "LENOVO X13 GEN 3"}]

# Cuándo NO sale
CFG["resumen_pedido_activo"] = False
ok(compra.resumen_pedido(LEAD, {"atributos": TIENDA}) == [], "con el interruptor apagado no sale (RF-48)")
CFG["resumen_pedido_activo"] = True
A["resumen_enviado_en"] = "2026-11-10T21:00:00Z"
ok(compra.resumen_pedido(LEAD, {"atributos": TIENDA}) == [], "si ya se envió, no se repite (RF-50)")
A["resumen_enviado_en"] = None
equipos = A["equipos"]; A["equipos"] = []
ok(compra.resumen_pedido(LEAD, {"atributos": TIENDA}) == [], "un pedido sin equipos no genera resumen (RF-49)")
A["equipos"] = equipos
A_guardado = dict(A); A.clear()
ok(compra.resumen_pedido(LEAD, {"atributos": TIENDA}) == [], "sin pedido no sale (RF-49)")
A.update(A_guardado)

# Texto editado por el dueño
CFG["texto_resumen_pedido"] = "Hola {nombre}, tu pedido {pedido}: {equipos}\nTotal {total}.\n{datos}"
t = texto(compra.resumen_pedido({**LEAD, "nombre": "Ana Ruiz"}, {"atributos": TIENDA}))
ok(t == "Hola Ana, tu pedido PED-0078: 💻 LENOVO X13 GEN 3 (100-101-1149)\nTotal $3.580.000.", "el texto del dueño se respeta y {datos} vacío no deja una línea suelta")

print(f"\n{n - fallos}/{n} en verde")
sys.exit(1 if fallos else 0)

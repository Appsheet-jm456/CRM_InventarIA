"""
Pruebas de F4·48: el tipo de cliente se pregunta una sola vez (y se guarda en la ficha) y la configuración se cobra una sola vez por
pedido, solo en equipos usados. No escribe en la base ni envía a WhatsApp. Uso:  python3 herramientas/meta-webhook-prueba/prueba_tipo_cliente.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import compra  # noqa: E402
import cotizacion  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402


def equipo(cod, estado, precio, marca="DELL"):
    return {"cod": cod, "marca": marca, "modelo": "M" + cod[-2:], "cpu": "i5", "gen": 11, "ram": "16GB", "disco": "512GB",
            "estado": estado, "precio": precio, "stock": 3, "foto": None}


INVENTARIO = [equipo("100-102-1030-1", "Usado · Grado A", 1500000), equipo("100-101-1113", "Usado", 3200000, "LENOVO"),
              equipo("100-103-2000", "Nuevo", 4000000, "HP"), equipo("100-103-2001", "Semi nuevo", 2000000, "HP")]
CONFIG = {"validar_comprobante": False, "texto_cuentas": "💳 Bancolombia 123", "cargo_configuracion": 80000, "horas_sin_respuesta": 12,
          "texto_comprobante": "✅ Recibimos tu comprobante.", "texto_cancelacion": "😊 Entendido.", "texto_sigue_interesado": "👋",
          "carrito_activo": True, "carrito_max": 3, "carrito_texto_otro": "¿Otro? Llevas {n}.", "carrito_texto_pedir": "Código 👇",
          "carrito_texto_maximo": "Máximo {max}", "carrito_encabezado": "🛒 *Resumen de tu pedido*", "validez_cotizacion_h": 24}
GUARDADAS = []
ATRIBUTOS = {"tipo_cliente": {"clave": "tipo_cliente", "nombre": "Tipo de cliente", "tipo": "lista", "opciones": ["Distribuidor", "Cliente final"]}}

flujo.inventario = lambda: INVENTARIO
db.atributos = lambda: ATRIBUTOS
db.conocimiento = lambda categoria, fresco=False: []  # F4·49: sin imagen de medios de pago
db.agente_config = lambda fresco=False: CONFIG
db.productos_agotados = lambda: []
db.principal = lambda: 1
db.crear_cotizacion = lambda fila: (GUARDADAS.append(fila), {"id": len(GUARDADAS), "consecutivo": 100 + len(GUARDADAS)})[1]
db.guardar_pdf_cotizacion = lambda i, ruta, contenido: None
db.apariencia_para_pdf = lambda: ({}, None, "image/png")
flujo.del_tipo = lambda tipo: "B-ASESOR"
flujo.asesor = lambda st, etiqueta="Escalado-Asesor", motivo=None, **_: (st.update(pausa=True), [flujo.m_texto("asesor")])[1]
cotizacion._generar_pdf = getattr(cotizacion, "_generar_pdf", None)

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def cuerpo(m):
    return m.get("text", {}).get("body") or m.get("interactive", {}).get("body", {}).get("text", "")


def nuevo(**extra):
    return {**flujo.estado_vacio(), "bot": 1, "atributos": {}, **extra}


def pregunta_tipo(mensajes):
    return any("distribuidor" in cuerpo(m).lower() and "cliente final" in cuerpo(m).lower() for m in mensajes)


# 1. Sin tipo: la compra lo pregunta; al responder, se guarda en la ficha (compra de un equipo, sin carrito)
CONFIG["carrito_activo"] = False
st = nuevo()
m = compra.iniciar(st, "quiero comprar 100-102-1030-1", {"etiquetas": [], "atributos": {}})
ok(pregunta_tipo(m) and st["compra"]["paso"] == "tipo", "sin tipo conocido la compra pregunta «¿distribuidor o cliente final?»")
m, _, _, _ = compra.responder(st, "compra-final", "interactive", {"etiquetas": [], "atributos": {}})
ok(st["atributos"].get("tipo_cliente") == "Cliente final" and st["compra"]["paso"] == "confirmar",
   "la respuesta queda guardada en la ficha («Tipo de cliente» = Cliente final) y sigue al resumen")

# 2. La cotización que viene después NO vuelve a preguntar (el caso del dueño)
m = cotizacion.iniciar(st, "cotizar 100-102-1030-1", {"etiquetas": [], "atributos": dict(st["atributos"]), "telefono": "573001112233"})
ok(st["cotizacion"]["tipo"] == "cliente_final" and st["cotizacion"]["paso"] == "nombre", "la cotización ya sabe que es cliente final y no pregunta")

# 3. Tipo en la ficha desde antes (menú o asesor): ninguna de las dos pregunta
for valor, esperado in (("Cliente final", "cliente_final"), ("Distribuidor", "distribuidor")):
    st = nuevo(atributos={"tipo_cliente": valor})
    m = compra.iniciar(st, "quiero comprar 100-102-1030-1", {"etiquetas": [], "atributos": {"tipo_cliente": valor}})
    ok(not pregunta_tipo(m) and st["compra"]["tipo"] == esperado and st["compra"]["paso"] == "confirmar",
       f"con «{valor}» en la ficha la compra va directo al resumen")

# 3b. Con carrito: tras «¿otro equipo?» el resumen sale sin preguntar el tipo cuando ya se sabe
CONFIG["carrito_activo"] = True
st = nuevo(atributos={"tipo_cliente": "Cliente final"})
m = compra.iniciar(st, "quiero comprar 100-102-1030-1", {"etiquetas": [], "atributos": {"tipo_cliente": "Cliente final"}})
r = compra._seguir(st, {"etiquetas": [], "atributos": {"tipo_cliente": "Cliente final"}})
ok(not pregunta_tipo(r) and st["compra"]["paso"] == "confirmar" and "Resumen" in cuerpo(r[-1]), "con carrito, al terminar de elegir va al resumen sin preguntar el tipo")

# 4. La etiqueta de siempre sigue valiendo (menú «2. Distribuidores») y el dato de la ficha manda si hay los dos
st = nuevo()
compra.iniciar(st, "quiero comprar 100-102-1030-1", {"etiquetas": ["Interes-Distribuidor"], "atributos": {}})
ok(st["compra"]["tipo"] == "distribuidor", "la etiqueta Interes-Distribuidor sigue marcando distribuidor")
ok(flujo.tipo_cliente(nuevo(), {"etiquetas": ["Interes-Distribuidor"], "atributos": {"tipo_cliente": "Cliente final"}}) == "cliente_final",
   "si la ficha dice Cliente final, manda sobre una etiqueta vieja")

# 5. «Productos» marca Cliente final solo si está vacío; «Distribuidores» marca siempre
st = nuevo()
flujo.marcar_datos(st, {"tipo_cliente": "Cliente final"}, solo_vacios=True)
ok(st["atributos"]["tipo_cliente"] == "Cliente final", "«Productos» marca Cliente final cuando no hay dato")
st = nuevo(atributos={"tipo_cliente": "Distribuidor"})
flujo.marcar_datos(st, {"tipo_cliente": "Cliente final"}, solo_vacios=True)
ok(st["atributos"]["tipo_cliente"] == "Distribuidor", "«Productos» no pisa a un distribuidor ya identificado")
flujo.marcar_datos(st, {"tipo_cliente": "Cliente final"})
ok(st["atributos"]["tipo_cliente"] == "Cliente final", "una opción que marca (sin «solo vacío») sí cambia el dato")

# 6. Configuración: una sola vez por pedido con varios equipos usados (regla del dueño)
st = nuevo(atributos={"tipo_cliente": "Cliente final"})
cotizacion.iniciar(st, "", {"etiquetas": [], "atributos": {"tipo_cliente": "Cliente final"}, "telefono": "573001112233"},
                   pedido=["100-102-1030-1", "100-101-1113"], tipo="cliente_final")
st["cotizacion"].update(nombre="Ana", cedula="123456", celular="3001112233")
m, etq, _, _ = cotizacion._generar(st, {"id": 1, "etiquetas": [], "atributos": {}})
g = GUARDADAS[-1]
ok(len(g["cargos"]) == 1 and g["cargos"][0]["valor"] == 80000 and g["total"] == 1500000 + 3200000 + 80000,
   "cotización de 2 equipos usados a cliente final: configuración $80.000 UNA vez (no 2 × $80.000)")

# 7. Un equipo NUEVO no paga configuración; con uno usado en el pedido, se cobra una vez
def total_compra(codigos, tipo="cliente_final"):
    s = nuevo()
    s["compra"] = {"paso": "confirmar", "tipo": tipo, "carrito": True,
                   "equipos": [{"codigo": k, "equipo": k, "precio": next(p["precio"] for p in INVENTARIO if p["cod"] == k)} for k in codigos]}
    s["compra"].update(codigo=codigos[0], equipo=codigos[0], precio=s["compra"]["equipos"][0]["precio"])
    compra._confirmar(s)
    return s["compra"]


c = total_compra(["100-103-2000"])
ok(c["cargo"] == 0 and c["total"] == 4000000, "equipo nuevo, cliente final: sin cargo de configuración")
c = total_compra(["100-103-2000", "100-102-1030-1"])
ok(c["cargo"] == 80000 and c["total"] == 4000000 + 1500000 + 80000, "un nuevo y un usado: configuración una sola vez")
c = total_compra(["100-102-1030-1", "100-101-1113", "100-103-2001"])
ok(c["cargo"] == 80000 and c["total"] == 1500000 + 3200000 + 2000000 + 80000, "tres usados (uno semi nuevo): una sola configuración")
c = total_compra(["100-102-1030-1", "100-101-1113"], tipo="distribuidor")
ok(c["cargo"] == 0 and c["total"] == 4700000, "distribuidor: precio sin configuración")

# 8. El resumen lo dice claro
s = nuevo()
s["compra"] = {"paso": "confirmar", "tipo": "cliente_final", "carrito": True,
               "equipos": [{"codigo": "100-102-1030-1", "equipo": "DELL", "precio": 1500000}, {"codigo": "100-101-1113", "equipo": "LENOVO", "precio": 3200000}]}
s["compra"].update(codigo="100-102-1030-1", equipo="DELL", precio=1500000)
r = cuerpo(compra._confirmar(s)[0])
ok("1 sola vez por pedido" in r and "$80.000" in r and "2 ×" not in r and "$4.780.000" in r,
   "el resumen de 2 equipos muestra la configuración «1 sola vez por pedido» y el total correcto")

print(f"\n{n - fallos}/{n} pruebas bien")
sys.exit(1 if fallos else 0)

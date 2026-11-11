"""
Pruebas del equipo vendido mientras otro cliente compra (F4·66, docs/MEJORAS-CHAT-Y-PAGOS.md RVD-06 a RVD-08 y RPD-52 a RPD-55): antes de
las cuentas el bot pregunta el stock a la base; si se vendió, avisa «se acaba de vender», muestra parecidos y ofrece asesor; un
comprobante de un equipo vendido se recibe con aviso para el asesor. Sin base ni WhatsApp.
Uso: python3 herramientas/meta-webhook-prueba/prueba_stock_vendido.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import acciones  # noqa: E402
import compra  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402


def equipo(cod, marca, modelo, precio):
    return {"cod": cod, "marca": marca, "modelo": modelo, "cpu": "i5", "gen": 8, "ram": "8GB", "disco": "256GB", "estado": "Usado",
            "precio": precio, "stock": 1, "foto": None}


INVENTARIO = [equipo("100-101-1121-2", "LENOVO", "T490", 950000), equipo("100-101-2000", "LENOVO", "T480", 900000),
              equipo("100-101-3000", "LENOVO", "X1 CARBON", 1800000), equipo("100-102-4000", "DELL", "5420", 1400000)]
VENDIDOS = set()  # lo que la base dice que ya no tiene stock «en este momento»
CONFIG = {"validar_comprobante": True, "texto_cuentas": "💳 Bancolombia 123", "cargo_configuracion": 80000, "horas_sin_respuesta": 12,
          "texto_soporte": "📄 Recibimos tu soporte.", "carrito_activo": False}
ACCIONES = [{"id": 3, "nombre": "Quiero comprar", "prioridad": 20, "activa": True,
             "cuando": [{"forma": "contiene", "texto": "quiero comprar"}], "hacer": [{"tipo": "flujo", "flujo": "compra"}]}]

flujo.inventario = lambda: [p for p in INVENTARIO if p["cod"] not in VENDIDOS]
db.sin_stock = lambda cods: {str(c).upper() for c in cods if str(c) in VENDIDOS}
db.productos_agotados = lambda: [{"codigo": p["cod"], "marca": p["marca"], "modelo": p["modelo"], "categoria": "Portatil"}
                                 for p in INVENTARIO if p["cod"] in VENDIDOS]
db.conocimiento = lambda categoria, fresco=False: []
db.agente_config = lambda fresco=False: CONFIG
db.acciones_activas = lambda: ACCIONES
db.principal = lambda: 1
flujo.del_tipo = lambda tipo: "B-ASESOR"
flujo.con_horario = lambda t: t
flujo.asesor = lambda st, etiqueta="Escalado-Asesor", motivo=None, **_: (st.update(pausa=True), [flujo.m_texto("asesor")])[1]
fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def textos(ms):
    return " | ".join(m.get("text", {}).get("body") or m.get("interactive", {}).get("body", {}).get("text", "") for m in ms)


def botones(ms):
    return [b["reply"]["title"] for m in ms for b in m.get("interactive", {}).get("action", {}).get("buttons", [])]


def resumen_de(codigo):
    """Un cliente final con el resumen del pedido en pantalla."""
    VENDIDOS.clear()
    st = dict(flujo.estado_vacio(), bot=1)
    acciones.responder(st, f"quiero comprar el {codigo}", {"etiquetas": []})
    compra.responder(st, "compra-final", "interactive")
    return st


# RVD-06: se vendió mientras Luis miraba el resumen
st = resumen_de("100-101-1121-2")
ok(st["compra"]["paso"] == "confirmar", "Luis tiene el resumen del T490 en pantalla")
VENDIDOS.add("100-101-1121-2")
m, etq, paso, nota = compra.responder(st, "compra-si", "interactive")
t = textos(m)
ok("compra" not in st and "Bancolombia" not in t, "RVD-06: al tocar «Sí, enviar cuentas» no recibe las cuentas y la compra termina")
ok("*LENOVO T490* (100-101-1121-2) se acaba de vender y ya no está disponible" in t, "RVD-06: le dice cuál se vendió")
lista = next((x for x in m if x.get("interactive", {}).get("type") == "list"), None)
cuerpo_lista = lista["interactive"]["body"]["text"] if lista else ""
ok(lista and "100-101-2000" in cuerpo_lista and "100-101-1121-2" not in cuerpo_lista, "RPD-54: muestra parecidos con stock y nunca el vendido")
ok(cuerpo_lista.index("100-101-2000") < cuerpo_lista.index("100-101-3000") and "100-102-4000" not in cuerpo_lista,
   "RPD-54: primero la misma marca y el precio más cercano")
ok(botones(m) == ["Ver equipos", "Hablar con asesor"], "RPD-54: cierra con «Ver equipos» y «Hablar con asesor»")

# Si sigue con stock, las cuentas salen como siempre
st = resumen_de("100-101-1121-2")
m, etq, paso, nota = compra.responder(st, "compra-si", "interactive")
ok(paso == "esperando_pago" and "Bancolombia" in textos(m), "con stock, «Sí, enviar cuentas» envía las cuentas como siempre")

# RVD-08: ya tenía las cuentas, el equipo se vendió a otro y manda el soporte
VENDIDOS.add("100-101-1121-2")
m, etq, paso, nota = compra.responder(st, "📷", "media")
ok(paso == "pago_por_confirmar" and textos(m) == "📄 Recibimos tu soporte.", "RVD-08: el soporte se recibe igual (el bot no rechaza pagos)")
ok(nota.startswith("⚠ Sin stock: LENOVO T490 (100-101-1121-2) ya se vendió a otro cliente."), "RVD-08: el asesor ve el aviso de sin stock en la nota")

# RVD-07: escribe «quiero comprar» con el código de uno vendido
VENDIDOS.clear()
VENDIDOS.add("100-101-1121-2")
st = dict(flujo.estado_vacio(), bot=1)
r = acciones.responder(st, "quiero comprar el 100-101-1121-2", {"etiquetas": []})
m = r[1] if r else []
t = textos(m)
ok("compra" not in st and "*LENOVO T490* (100-101-1121-2) se acaba de vender" in t, "RVD-07: «quiero comprar» un vendido dice que se acaba de vender")
ok(botones(m) == ["Ver equipos", "Hablar con asesor"] and any(x.get("interactive", {}).get("type") == "list" for x in m),
   "RVD-07: con parecidos y los botones de equipos y asesor")

# Carrito: se vende uno de dos, el otro sigue en el pedido
VENDIDOS.clear()
CONFIG["carrito_activo"] = True
st = dict(flujo.estado_vacio(), bot=1)
st["compra"] = {"paso": "confirmar", "carrito": True, "tipo": "cliente_final",
                "equipos": [{"codigo": "100-101-1121-2", "equipo": "LENOVO T490", "precio": 950000},
                            {"codigo": "100-102-4000", "equipo": "DELL 5420", "precio": 1400000}]}
VENDIDOS.add("100-101-1121-2")
m, etq, paso, nota = compra.responder(st, "compra-si", "interactive")
ok([i["codigo"] for i in st["compra"]["equipos"]] == ["100-102-4000"] and "se acaba de vender" in textos(m) and "lo quité de tu pedido" in textos(m),
   "carrito: el vendido sale del pedido con aviso y el otro sigue")
CONFIG["carrito_activo"] = False

print(f"{'✅' if not fallos else '✗'} {n - fallos}/{n}")
sys.exit(1 if fallos else 0)

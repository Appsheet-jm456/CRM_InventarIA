"""
Pruebas del carrito del asesor (F4·72, docs/CARRITO-DEL-ASESOR.md, RCA-03 a RCA-08): la compra arranca en «confirmar» con los renglones y
precios del asesor, los renglones libres no cuentan para stock ni «Código producto», la configuración se quita con la casilla y con
«Sí» salen las cuentas. Sin base ni WhatsApp.
Uso: python3 herramientas/meta-webhook-prueba/prueba_carrito_asesor.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import compra  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402

EQUIPOS = {
    "100-101-1121-2": {"cod": "100-101-1121-2", "marca": "LENOVO", "modelo": "T490", "estado": "Usado · Grado A", "precio": 1300000, "stock": 1},
    "TORRE-1": {"cod": "TORRE-1", "marca": "HP", "modelo": "PRODESK", "estado": "Nuevo", "precio": 2000000, "stock": 1, "categoria": "Torre"},
}
VENDIDOS = set()
CONFIG = {"validar_comprobante": False, "texto_cuentas": "💳 Bancolombia 123", "cargo_configuracion": 80000, "horas_sin_respuesta": 12,
          "texto_cancelacion": "😊 Entendido.", "carrito_encabezado": "🛒 *Resumen de tu pedido*"}

flujo.equipo_por_codigo = lambda cod: None if str(cod).upper() in VENDIDOS else EQUIPOS.get(str(cod).upper())
flujo.inventario = lambda: [p for k, p in EQUIPOS.items() if k not in VENDIDOS]
db.sin_stock = lambda cods: {str(c).upper() for c in cods} & VENDIDOS
db.conocimiento = lambda categoria, fresco=False: []
db.agente_config = lambda fresco=False: CONFIG
db.productos_agotados = lambda: []
db.principal = lambda: 1
db.atributos = lambda: {"tipo_cliente": {}}
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


CARRITO = {"tipo": "Cliente final", "sin_configuracion": False, "items": [
    {"codigo": "100-101-1121-2", "equipo": "LENOVO T490", "precio": 1250000},
    {"codigo": "TORRE-1", "equipo": "HP PRODESK", "precio": 2000000},
    {"codigo": "LIBRE-1", "equipo": "Mouse inalámbrico", "precio": 45000, "libre": True}]}

st = flujo.estado_vacio()
ms = compra.desde_asesor(st, CARRITO, {"nombre": "Juan"})
texto = cuerpo(ms[-1])
ok(st["compra"]["paso"] == "confirmar" and st["compra"]["asesor"], "la compra arranca en «confirmar» con el carrito del asesor (RCA-07)")
ok("💰 $1.250.000" in texto and "$1.300.000" not in texto, "respeta el precio del asesor, no el de la base (RCA-08)")
ok("📦 Mouse inalámbrico" in texto and "Código LIBRE" not in texto, "el renglón libre sale con 📦 y sin código (RCA-03)")
ok("Configuración" in texto and "*Total (3 productos): $3.375.000*" in texto, "configuración una vez por el equipo usado y total (RCA-05)")
ok(botones(ms[-1]) == ["compra-si", "compra-asesor", "compra-cancelar"] and "¿Confirmas tu pedido?" in texto,
   "botones Sí, confirmar · Hablar con asesor · Cancelar")
ok(st["campos"]["Código producto"] == "100-101-1121-2, TORRE-1", "«Código producto» sin los renglones libres (no van al Servicio técnico)")
ok(st["valor"] == 3375000, "el valor estimado es el total del carrito")

r = compra.responder(st, "compra-si", "text", {"nombre": "Juan"})
ok(r and "Bancolombia" in cuerpo(r[0][-1]) and st["compra"]["paso"] == "esperando_pago" and st["compra"]["total"] == 3375000,
   "con «Sí» salen las cuentas y la compra espera el pago por el total del carrito")

st = flujo.estado_vacio()
texto = cuerpo(compra.desde_asesor(st, {**CARRITO, "sin_configuracion": True}, {})[-1])
ok("Configuración" not in texto and "$3.295.000" in texto, "con la casilla, sin configuración")
st = flujo.estado_vacio()
texto = cuerpo(compra.desde_asesor(st, {**CARRITO, "tipo": "Distribuidor"}, {})[-1])
ok("Configuración" not in texto, "distribuidor: nunca configuración")

VENDIDOS.add("TORRE-1")
st = flujo.estado_vacio()
ms = compra.desde_asesor(st, CARRITO, {})
ok("se acaba de vender" in cuerpo(ms[0]) and "HP PRODESK" in cuerpo(ms[0]) and "PRODESK" not in cuerpo(ms[-1])
   and "💰 $1.250.000" in cuerpo(ms[-1]), "un equipo vendido se quita con aviso y los demás conservan su precio (RCA-08)")
VENDIDOS.add("100-101-1121-2")
st = flujo.estado_vacio()
ms = compra.desde_asesor(st, {**CARRITO, "items": CARRITO["items"][:2]}, {})
ok(not compra.activa(st) and "se acaban de vender" in cuerpo(ms[0]), "si todo se vendió, la compra termina con el aviso")
VENDIDOS.clear()
EQUIPOS["HP-NUEVA"] = {"cod": "HP-NUEVA", "marca": "HP", "modelo": "PROBOOK", "estado": "NUEVA", "precio": 3000000, "stock": 1}
st = flujo.estado_vacio()
texto = cuerpo(compra.desde_asesor(st, {"tipo": "Cliente final", "items": [{"codigo": "HP-NUEVA", "equipo": "HP PROBOOK", "precio": 3000000}]}, {})[-1])
ok("Configuración" not in texto and "$3.000.000" in texto, "un equipo «NUEVA» no paga configuración (migración 0079)")
ok(compra.desde_asesor(flujo.estado_vacio(), {"items": []}, {}) == [], "un carrito vacío no envía nada")

print(f"\n{n - fallos}/{n}")
sys.exit(1 if fallos else 0)

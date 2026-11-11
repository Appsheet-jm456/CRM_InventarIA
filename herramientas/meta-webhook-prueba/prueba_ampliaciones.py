"""
Pruebas de «Aumentar RAM o disco» en el pedido del bot (F4·73, docs/AMPLIACIONES-RAM-DISCO.md, RAM-01 a RAM-08). Sin base ni WhatsApp.
Uso: python3 herramientas/meta-webhook-prueba/prueba_ampliaciones.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import ampliacion  # noqa: E402
import compra  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402

INVENTARIO = [
    {"cod": "T490", "marca": "LENOVO", "modelo": "T490", "cpu": "Core i5-8365U", "gen": 8, "ram": "8GB", "disco": "256GB SSD",
     "estado": "Usado", "precio": 1300000, "stock": 1, "foto": None, "atributos": {"ram_onboard": True, "ram_ranuras": "1"}},
    {"cod": "X1C6", "marca": "LENOVO", "modelo": "X1 CARBON GEN 6", "cpu": "Core i7-8550U", "gen": 8, "ram": "8GB", "disco": "512GB NVMe",
     "estado": "Usado", "precio": 1600000, "stock": 1, "foto": None, "atributos": {"ram_onboard": True, "ram_ranuras": "Ninguna"}},
    {"cod": "E5470", "marca": "DELL", "modelo": "LATITUDE 5470", "cpu": "Core i5-6300U", "gen": 6, "ram": "16GB", "disco": "1TB",
     "estado": "Usado", "precio": 900000, "stock": 1, "foto": None, "atributos": {}},
]
TABLA = [
    {"tipo": "ram", "desde_gb": 8, "hasta_gb": 16, "precio": 120000, "precio_rapida": 140000},
    {"tipo": "ram", "desde_gb": 8, "hasta_gb": 24, "precio": 200000, "precio_rapida": 220000},
    {"tipo": "ram", "desde_gb": 16, "hasta_gb": 32, "precio": 200000, "precio_rapida": 220000},
    {"tipo": "disco", "desde_gb": 256, "hasta_gb": 512, "precio": 130000, "precio_rapida": None},
    {"tipo": "disco", "desde_gb": 256, "hasta_gb": 1024, "precio": 280000, "precio_rapida": None},
    {"tipo": "disco", "desde_gb": 512, "hasta_gb": 1024, "precio": 180000, "precio_rapida": None},
]
CONFIG = {"validar_comprobante": False, "texto_cuentas": "💳 Bancolombia 123", "cargo_configuracion": 80000, "horas_sin_respuesta": 12,
          "texto_cancelacion": "😊 Entendido.", "carrito_activo": True, "carrito_max": 3, "carrito_encabezado": "🛒 *Resumen de tu pedido*",
          "ampliacion_activa": True, "ampliacion_nvme": 30000}

flujo.inventario = lambda: INVENTARIO
flujo.equipo_por_codigo = lambda cod: next((p for p in INVENTARIO if p["cod"] == str(cod).upper()), None)
db.sin_stock = lambda cods: {str(c).upper() for c in cods} - {p["cod"] for p in INVENTARIO}
db.conocimiento = lambda categoria, fresco=False: []
db.agente_config = lambda fresco=False: CONFIG
db.productos_agotados = lambda: []
db.ampliaciones = lambda: TABLA
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


def ids(m):
    i = m.get("interactive", {})
    if i.get("type") == "button":
        return [b["reply"]["id"] for b in i["action"]["buttons"]]
    return [r["id"] for s in i.get("action", {}).get("sections", []) for r in s["rows"]]


def pedido(*codigos):
    st = flujo.estado_vacio()
    st["bot"] = 1
    eq = [{"codigo": p["cod"], "equipo": f"{p['marca']} {p['modelo']}", "precio": p["precio"]} for p in INVENTARIO if p["cod"] in codigos]
    st["compra"] = {"paso": "confirmar", "carrito": True, "tipo": "cliente_final", "equipos": eq}
    st["nodo"] = compra.NODO
    return st, compra._confirmar(st)


def r(st, entrada):
    return compra.responder(st, entrada, "interactive", {"nombre": "Juan"})[0]


# Utilidades
ok(ampliacion.gb("8GB") == 8 and ampliacion.gb("512GB SSD") == 512 and ampliacion.gb("1TB") == 1024 and ampliacion.gb("") is None,
   "lee la RAM y el disco: 8GB, 512GB SSD, 1TB")
ok(ampliacion.velocidad(INVENTARIO[0]) == "2666-3200" and ampliacion.velocidad(INVENTARIO[2]) == "2400"
   and ampliacion.velocidad({"ram": "8GB", "gen": None, "atributos": {}}) is None
   and ampliacion.velocidad({"ram": "8GB", "gen": 6, "atributos": {"ram_velocidad": "2666-3200"}}) == "2666-3200",
   "velocidad: atributo, si no la generación (6.ª → 2400, 8.ª → 2666-3200); sin datos, None (RAM-03)")

# Resumen con la opción
st, ms = pedido("T490")
ok("compra-ampliar" in ids(ms[-1]) and ids(ms[-1]).index("compra-ampliar") == 2, "el resumen trae «Aumentar RAM o disco» de tercera (RAM-01)")
CONFIG["ampliacion_activa"] = False
ok("compra-ampliar" not in ids(pedido("T490")[1][-1]), "con el interruptor apagado no sale")
CONFIG["ampliacion_activa"] = True

# T490: RAM soldada + 1 ranura → se puede, precio 2666-3200
ms = r(st, "compra-ampliar")
ok(ids(ms[-1]) == ["ampliar-ram", "ampliar-disco", "compra-resumen"] and "8GB de RAM" in cuerpo(ms[-1]),
   "con un equipo pregunta directo RAM o disco")
ms = r(st, "ampliar-ram")
ok("8GB → 16GB" in cuerpo(ms[-1]) and "$140.000" in cuerpo(ms[-1]) and "$120.000" not in cuerpo(ms[-1]),
   "RAM con ranura: opciones de 8GB con el precio de 2666-3200 (RAM-02, RAM-03)")
ms = r(st, "ampliar-op-1")
texto = cuerpo(ms[-1])
ok("⚡ Aumento RAM 8GB → 16GB (LENOVO T490)" in texto and "Total (1 equipo + 1 aumento)" in texto and "$1.520.000" in texto,
   "el aumento entra como renglón ⚡ y suma al total con la configuración (RAM-06)")
ok(st["campos"]["Código producto"] == "T490", "el aumento no entra a «Código producto»")
r(st, "compra-ampliar")
r(st, "ampliar-ram")
r(st, "ampliar-op-2")
ok(sum(1 for i in st["compra"]["equipos"] if i.get("ampliacion")) == 1 and "8GB → 24GB" in st["compra"]["equipos"][1]["equipo"],
   "elegir otra RAM reemplaza la anterior (uno por tipo y equipo)")
r(st, "compra-ampliar")
r(st, "ampliar-disco")
ms = r(st, "2")
ok(len([i for i in st["compra"]["equipos"] if i.get("ampliacion")]) == 2 and "256GB → 1TB" in cuerpo(ms[-1]),
   "disco por número escrito; RAM y disco a la vez")

# X1 Carbon: onboard sin ranura
st, _ = pedido("X1C6")
r(st, "compra-ampliar")
ms = r(st, "ampliar-ram")
ok("no es posible aumentar la RAM" in cuerpo(ms[-1]) and ids(ms[-1]) == ["ampliar-disco", "compra-resumen"],
   "onboard sin ranura: aviso y «¿quieres aumentar el disco?» (RAM-02)")
ms = r(st, "si")
ok("512GB → 1TB" in cuerpo(ms[-1]) and "$210.000" in cuerpo(ms[-1]), "dice Sí → disco con el adicional NVMe (+$30.000, RAM-04)")

# Dell sin atributos: RAM la confirma un asesor; disco de 1TB sin opciones
st, _ = pedido("E5470")
r(st, "compra-ampliar")
ms = r(st, "ampliar-ram")
ok("un asesor te confirma" in cuerpo(ms[-1]) and "compra-asesor" in ids(ms[-1]), "sin ranuras en la ficha: lo confirma un asesor")
ms = r(st, "ampliar-disco")
ok("ya tiene 1TB" in cuerpo(ms[-1]), "disco de 1TB: no hay opciones (RAM-05)")
ms = r(st, "compra-resumen")
ok(st["compra"]["paso"] == "confirmar" and "ampliar" not in st["compra"], "«Ver mi pedido» vuelve al resumen")

# Varios equipos: a cuál; quitar el equipo quita sus aumentos
st, _ = pedido("T490", "X1C6")
ms = r(st, "compra-ampliar")
ok(ids(ms[-1]) == ["ampliar-eq-1", "ampliar-eq-2"], "con varios equipos pregunta a cuál")
r(st, "ampliar-eq-1")
r(st, "ampliar-ram")
r(st, "ampliar-op-1")
ok([i["codigo"] for i in st["compra"]["equipos"]] == ["T490", "AMP-RAM-T490", "X1C6"], "el aumento queda debajo de su equipo")
r(st, "compra-quitar")
ms = r(st, "quitar-1")
ok([i["codigo"] for i in st["compra"]["equipos"]] == ["X1C6"], "quitar el equipo quita sus aumentos (RAM-07)")

# Equipo vendido: sus aumentos salen con él; el máximo no cuenta aumentos
st, _ = pedido("T490", "X1C6")
r(st, "compra-ampliar"); r(st, "ampliar-eq-1"); r(st, "ampliar-ram"); r(st, "ampliar-op-1")
INVENTARIO[0]["stock"] = 0
vendido = INVENTARIO.pop(0)
compra._confirmar(st)
ok([i["codigo"] for i in st["compra"]["equipos"]] == ["X1C6"], "si el equipo se vende, su aumento sale con él")
INVENTARIO.insert(0, vendido)
vendido["stock"] = 1
st, _ = pedido("T490", "X1C6")
r(st, "compra-ampliar"); r(st, "ampliar-eq-1"); r(st, "ampliar-ram"); ms = r(st, "ampliar-op-1")
ok("compra-agregar" in ids(ms[-1]), "con 2 equipos + 1 aumento y máximo 3 aún deja agregar otro equipo (RAM-08)")

# Confirmar: cuentas por el total con el aumento
ms = r(st, "compra-si")
ok(st["compra"]["paso"] == "esperando_pago" and st["compra"]["total"] == 1300000 + 1600000 + 140000 + 80000,
   "con «Sí» salen las cuentas por el total con el aumento")

# RAM-09: el asesor toma el chat y vuelve a iniciar la compra → el mismo pedido con sus aumentos
st, _ = pedido("T490")
r(st, "compra-ampliar"); r(st, "ampliar-ram"); r(st, "ampliar-op-1"); r(st, "compra-ampliar"); r(st, "ampliar-disco"); r(st, "ampliar-op-1")
ms = compra.iniciar(st, "", {"nombre": "Juan"})  # Flujos → Iniciar compra con la compra aún en curso
ok([i["codigo"] for i in st["compra"]["equipos"]] == ["T490", "AMP-RAM-T490", "AMP-DISCO-T490"] and st["compra"]["paso"] == "confirmar"
   and "Total (1 equipo + 2 aumentos)" in cuerpo(ms[-1]), "Iniciar compra con la compra en curso: el mismo pedido con RAM y disco")
compra.responder(st, "asesor", "text", {"nombre": "Juan"})  # pidió asesor: la compra se cierra y el pedido queda guardado
ok(not compra.activa(st) and len(st["pedido_previo"]["equipos"]) == 3, "al pasar al asesor el pedido queda guardado 24 h")
ms = compra.iniciar(st, "", {"nombre": "Juan"})
ok(len(st["compra"]["equipos"]) == 3 and "$1.650.000" in cuerpo(ms[-1]) and "pedido_previo" not in st,
   "el asesor reactiva la compra: vuelve el resumen con los aumentos, sin preguntar otra vez")
st["compra"]["paso"] = "confirmar"
compra.responder(st, "compra-cancelar", "interactive", {"nombre": "Juan"})
ok("pedido_previo" not in st, "si el cliente cancela, el pedido no se guarda")
st, _ = pedido("T490")
r(st, "compra-ampliar"); r(st, "ampliar-ram"); r(st, "ampliar-op-1")
compra.responder(st, "asesor", "text", {"nombre": "Juan"})
st["pedido_previo"]["en"] = "2020-01-01T00:00:00+00:00"
compra.iniciar(st, "", {"nombre": "Juan"})
ok(st["compra"]["paso"] != "confirmar" or not any(i.get("ampliacion") for i in st["compra"].get("equipos", [])),
   "después de 24 h el pedido guardado ya no vuelve")
st, _ = pedido("T490")
r(st, "compra-ampliar"); r(st, "ampliar-ram"); r(st, "ampliar-op-1")
compra.iniciar(st, "quiero comprar X1C6", {"nombre": "Juan"})
ok(not any(i.get("ampliacion") for i in st["compra"].get("equipos", [])), "si escribe otro código, la compra empieza con ese equipo")

print(f"\n{n - fallos}/{n}")
sys.exit(1 if fallos else 0)

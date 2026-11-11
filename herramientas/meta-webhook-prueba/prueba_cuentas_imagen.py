"""
Pruebas de F4·49: los datos para pagar salen con la imagen de los medios de pago primero y el texto después (compra y acción «Cuentas
para pagar»). No escribe en la base ni envía a WhatsApp. Uso:  python3 herramientas/meta-webhook-prueba/prueba_cuentas_imagen.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import acciones  # noqa: E402
import compra  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402

INVENTARIO = [{"cod": "100-102-1030-1", "marca": "DELL", "modelo": "LATITUDE 5420", "cpu": "i5", "gen": 11, "ram": "16GB", "disco": "512GB",
               "estado": "Usado · Grado A", "precio": 1500000, "stock": 3, "foto": None}]
CONFIG = {"validar_comprobante": False, "texto_cuentas": "💳 Transferencia a estas cuentas: Bancolombia 123", "cargo_configuracion": 80000,
          "horas_sin_respuesta": 12, "texto_comprobante": "✅", "texto_cancelacion": "😊", "texto_sigue_interesado": "👋", "carrito_activo": False}
FICHAS = {"Pagos": [{"titulo": "Medios de pago", "respuesta": "Transferencia a estas cuentas", "archivo": "conocimiento/pagos.jpg"}]}
ATRIBUTOS = {"tipo_cliente": {"clave": "tipo_cliente", "nombre": "Tipo de cliente", "tipo": "lista", "opciones": ["Distribuidor", "Cliente final"]}}

flujo.inventario = lambda: INVENTARIO
db.sin_stock = lambda cods: {str(c).upper() for c in cods} - {p["cod"].upper() for p in flujo.inventario() if p.get("stock", 1) > 0}  # F4·66: el stock sale del inventario de la prueba, no de la base
db.atributos = lambda: ATRIBUTOS
db.agente_config = lambda fresco=False: CONFIG
db.conocimiento = lambda categoria, fresco=False: FICHAS.get(categoria, [])
db.productos_agotados = lambda: []
db.principal = lambda: 1
db.acciones_activas = lambda: [{"id": 2, "nombre": "Cuentas para pagar", "prioridad": 5, "activa": True,
                                "cuando": [{"forma": "contiene", "texto": "medios de pago"}], "hacer": [{"tipo": "cuentas"}]}]
flujo.del_tipo = lambda tipo: "B-ASESOR"

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def tipos(mensajes):
    return ["imagen" if "_conocimiento" in m else "texto" for m in mensajes]


def nuevo():
    return {**flujo.estado_vacio(), "bot": 1, "atributos": {"tipo_cliente": "Cliente final"}}


def confirmar():
    st = nuevo()
    compra.iniciar(st, "quiero comprar 100-102-1030-1", {"etiquetas": [], "atributos": {"tipo_cliente": "Cliente final"}})
    return compra.responder(st, "compra-si", "interactive", {"etiquetas": [], "atributos": {}}), st


# 1. Compra: al confirmar el pedido, primero la imagen y después el texto
(m, etq, paso, nota), st = confirmar()
ok(tipos(m) == ["imagen", "texto"] and m[0]["_conocimiento"]["archivo"] == "conocimiento/pagos.jpg" and "Bancolombia" in m[1]["text"]["body"],
   "al confirmar el pedido sale la imagen de medios de pago y luego el texto de las cuentas")
ok(paso == "esperando_pago" and etq == ["Compra-Iniciada"] and st["compra"]["paso"] == "esperando_pago", "la compra sigue esperando el pago como siempre")

# 2. Sin imagen en la ficha (o ficha apagada): solo el texto, como antes
FICHAS["Pagos"] = [{"titulo": "Medios de pago", "respuesta": "x", "archivo": None}]
(m, *_), _ = confirmar()
ok(tipos(m) == ["texto"], "si la ficha de Pagos no tiene imagen, sale solo el texto")
FICHAS["Pagos"] = []
(m, *_), _ = confirmar()
ok(tipos(m) == ["texto"], "sin ficha de Pagos activa, sale solo el texto")

# 3. Sin texto de cuentas aprobado, no se manda nada ni se inventa (RAG-09): pasa al asesor
FICHAS["Pagos"] = [{"titulo": "Medios de pago", "respuesta": "x", "archivo": "conocimiento/pagos.jpg"}]
CONFIG["texto_cuentas"] = ""
(m, etq, paso, nota), _ = confirmar()
ok(not any("_conocimiento" in x for x in m) and "Falta enviarle las cuentas" in nota, "sin texto de cuentas aprobado la imagen sola no se manda: lo envía un asesor")
CONFIG["texto_cuentas"] = "💳 Transferencia a estas cuentas: Bancolombia 123"

# 4. La acción «Cuentas para pagar» (el cliente escribe «medios de pago») también va imagen y texto
st = nuevo()
r = acciones.responder(st, "¿cuáles son los medios de pago?", {"etiquetas": [], "atributos": {}})
mensajes = r[1] if r else None
ok(mensajes is not None and tipos(mensajes) == ["imagen", "texto"], "la acción «Cuentas para pagar» envía la imagen y luego el texto")

# 5. F4·68 (RIC-01 a RIC-04): el instructivo del comprobante sale después de las cuentas
INSTRUCTIVO = "📎 *Último paso:* envíanos por aquí el *comprobante de pago* en foto (JPG) o PDF y un asesor validará tu pago."
CONFIG["texto_instructivo_pago"] = INSTRUCTIVO
(m, *_), _ = confirmar()
ok(tipos(m) == ["imagen", "texto", "texto"] and m[-1]["text"]["body"] == INSTRUCTIVO and "Bancolombia" in m[1]["text"]["body"],
   "RIC-01: al confirmar sale la imagen, las cuentas y al final el instructivo")
st = nuevo()
r = acciones.responder(st, "¿cuáles son los medios de pago?", {"etiquetas": [], "atributos": {}})
ok(r and tipos(r[1]) == ["imagen", "texto", "texto"] and r[1][-1]["text"]["body"] == INSTRUCTIVO,
   "RIC-02: la acción «Cuentas para pagar» también termina con el instructivo")
CONFIG["texto_cuentas"] = ""
(m, etq, paso, nota), _ = confirmar()
ok(not any(x.get("text", {}).get("body") == INSTRUCTIVO for x in m), "sin cuentas aprobadas el instructivo no sale solo (RAG-83)")
CONFIG["texto_cuentas"] = "💳 Transferencia a estas cuentas: Bancolombia 123"
CONFIG["texto_instructivo_pago"] = "   "
(m, *_), _ = confirmar()
ok(tipos(m) == ["imagen", "texto"], "RIC-03: con el instructivo vacío salen solo la imagen y las cuentas, como antes")
CONFIG.pop("texto_instructivo_pago")

print(f"\n{n - fallos}/{n} pruebas bien")
sys.exit(1 if fallos else 0)

"""
Pruebas del carrito de varios equipos (F4·44, docs/AGENTE.md §4f, RAG-54 a RAG-62). No escribe en la base ni envía a WhatsApp:
la base se reemplaza por datos fijos. Uso:  python3 herramientas/meta-webhook-prueba/prueba_carrito.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import acciones  # noqa: E402
import compra  # noqa: E402
import cotizacion  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402

INVENTARIO = [
    {"cod": "100-101-1113", "marca": "LENOVO", "modelo": "P16S GEN 2", "cpu": "AMD Ryzen 5 PRO 7545U", "gen": 0, "ram": "16GB",
     "disco": "512GB", "estado": "Grado A", "precio": 3200000, "stock": 1, "foto": None},
    {"cod": "100-101-1050-1", "marca": "LENOVO", "modelo": "P16S", "cpu": "Core i7-1260P", "gen": 12, "ram": "16GB",
     "disco": "512GB SSD", "estado": "Grado B", "precio": 3000000, "stock": 1, "foto": None},
    {"cod": "100-102-1030-1", "marca": "DELL", "modelo": "LATITUDE 5420", "cpu": "i5-1145G7", "gen": 11, "ram": "16GB",
     "disco": "512GB", "estado": "Grado A", "precio": 1500000, "stock": 1, "foto": None},
]
VIVO = list(INVENTARIO)
CONFIG = {"validar_comprobante": False,  # el camino de antes de F4·46 (casilla apagada); el nuevo, en prueba_validacion.py
          "texto_cuentas": "💳 Bancolombia 123", "cargo_configuracion": 80000, "horas_sin_respuesta": 12,
          "texto_comprobante": "✅ Recibimos tu comprobante.", "texto_cancelacion": "😊 Entendido.",
          "texto_sigue_interesado": "👋 ¿Sigues interesado?", "carrito_activo": True, "carrito_max": 3,
          "carrito_texto_otro": "¿Quieres agregar otro equipo? Llevas {n}.",
          "carrito_texto_pedir": "Escríbeme el código o el modelo 👇",
          "carrito_texto_maximo": "Llegaste al máximo de {max} equipos 🙌", "carrito_encabezado": "🛒 *Resumen de tu pedido*",
          "validez_cotizacion_h": 24}
GUARDADAS, PDFS, IR = [], {}, []

flujo.inventario = lambda: VIVO
db.agente_config = lambda fresco=False: CONFIG
db.productos_agotados = lambda: []
db.principal = lambda: 1
db.crear_cotizacion = lambda fila: (GUARDADAS.append(fila), {"id": len(GUARDADAS), "consecutivo": 100 + len(GUARDADAS)})[1]
db.guardar_pdf_cotizacion = lambda i, ruta, contenido: PDFS.update({ruta: contenido})
db.apariencia_para_pdf = lambda: ({}, None, "image/png")
flujo.del_tipo = lambda tipo: "B-ASESOR"
flujo.asesor = lambda st, etiqueta="Escalado-Asesor", motivo=None, **_: (st.update(pausa=True), [flujo.m_texto("asesor")])[1]
flujo.ir = lambda st, clave: (IR.append(clave), [flujo.m_texto(f"cuadro {clave}")])[1]

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def cuerpo(m):
    return m.get("text", {}).get("body") or m.get("interactive", {}).get("body", {}).get("text", "") \
        or m.get("image", {}).get("caption", "")


def botones(m):
    i = m.get("interactive", {})
    if i.get("type") == "button":
        return [b["reply"]["id"] for b in i["action"]["buttons"]]
    if i.get("type") == "list":
        return [r["id"] for s in i["action"]["sections"] for r in s["rows"]]
    return []


def nuevo(**extra):
    return dict(flujo.estado_vacio(), bot=1, **extra)


def responder(st, entrada, tipo="interactive", lead=None):
    return compra.responder(st, entrada, tipo, lead or {"etiquetas": [], "nombre": "Jhonatan Pérez"})


# 1. «Lo quiero» de la ficha con el carrito encendido: entra el equipo y pregunta si quiere otro
st = nuevo(campos={"Código producto": "100-101-1113"})
m = compra.iniciar(st, "quiero comprar", {"etiquetas": []})
ok(st["compra"]["paso"] == "otro" and len(st["compra"]["equipos"]) == 1 and "Llevas 1" in cuerpo(m[0])
   and botones(m[0]) == ["compra-otro-si", "compra-otro-no"], "con carrito, después del primer equipo pregunta «¿otro equipo?» (RAG-56)")

# 2. Sí → pide código o modelo; escribe un modelo → ficha con «Agregar este»
m, *_ = responder(st, "compra-otro-si")
ok(st["compra"]["paso"] == "agregar" and cuerpo(m[0]) == CONFIG["carrito_texto_pedir"], "«Sí, agregar otro» pide el código o el modelo")
m, *_ = responder(st, "100-101-1050-1", "text")
ok(st["compra"].get("candidato") == "100-101-1050-1" and "P16S" in cuerpo(m[0])
   and botones(m[0]) == ["compra-agregar-este", "compra-ver-otro", "compra-resumen"], "muestra la ficha con «Agregar este · Ver otro código · Ver mi pedido»")

# 3. Agregar este → 2 en el pedido y vuelve a preguntar
m, *_ = responder(st, "compra-agregar-este")
ok(len(st["compra"]["equipos"]) == 2 and st["compra"]["paso"] == "otro" and "Llevas 2" in cuerpo(m[0]), "«Agregar este» lo suma y pregunta otra vez")

# 4. El mismo código otra vez no se repite (RAG-57)
responder(st, "compra-otro-si")
m, *_ = responder(st, "me interesa el 100-101-1113", "text")
ok(len(st["compra"]["equipos"]) == 2 and "ya está en tu pedido" in cuerpo(m[0]), "un código que ya está en el pedido no se repite")

# 5. Código agotado o que no existe: avisa y no lo agrega
m, *_ = responder(st, "100-101-9999", "text")
ok(len(st["compra"]["equipos"]) == 2 and "no está disponible" in cuerpo(m[0]), "un código sin stock no entra al pedido")

# 6. Ver mi pedido → tipo de cliente → resumen con todos, cargo por equipo y total
m, *_ = responder(st, "compra-resumen")
ok(st["compra"]["paso"] == "tipo", "«Ver mi pedido» pregunta distribuidor o cliente final")
m, *_ = responder(st, "compra-final")
r = cuerpo(m[0])
ok(st["compra"]["total"] == 3200000 + 3000000 + 80000 and "Resumen de tu pedido" in r and "100-101-1113" in r and "100-101-1050-1" in r
   and "1 sola vez por pedido" in r and "$80.000" in r and "2 ×" not in r and "$6.280.000" in r,
   "resumen: los dos equipos, configuración UNA sola vez y total (RAG-58, F4·48)")
ok(botones(m[0]) == ["compra-si", "compra-agregar", "compra-quitar", "compra-cotizar", "compra-asesor", "compra-cancelar"],
   "opciones del resumen: confirmar, agregar, quitar, cotizar, asesor y cancelar")
ok(st["campos"]["Código producto"] == "100-101-1113, 100-101-1050-1" and st["valor"] == 6280000, "la oportunidad lleva los códigos y el total")

# 7. Quitar uno → vuelve el resumen con uno
st_q = dict(st, compra={**st["compra"], "equipos": list(st["compra"]["equipos"])}, campos=dict(st["campos"]))
m, *_ = responder(st_q, "compra-quitar")
ok(st_q["compra"]["paso"] == "quitar" and botones(m[0]) == ["quitar-1", "quitar-2"], "«Quitar un equipo» muestra los del pedido")
m, *_ = responder(st_q, "quitar-2")
ok(len(st_q["compra"]["equipos"]) == 1 and "Quité" in cuerpo(m[0]) and st_q["compra"]["total"] == 3280000
   and "compra-quitar" not in botones(m[1]), "quita el elegido y el resumen se rehace (sin «Quitar» si queda uno)")

# 8. Máximo de equipos (3): no pregunta más y pasa al resumen
st_m = dict(st, compra={**st["compra"], "equipos": list(st["compra"]["equipos"]), "paso": "confirmar"}, campos=dict(st["campos"]))
responder(st_m, "compra-agregar")
responder(st_m, "100-102-1030-1", "text")
m, *_ = responder(st_m, "compra-agregar-este")
ok(len(st_m["compra"]["equipos"]) == 3 and "máximo de 3" in cuerpo(m[0]) and st_m["compra"]["paso"] == "confirmar"
   and "compra-agregar" not in botones(m[-1]), "al llegar al máximo avisa, va al resumen y ya no ofrece agregar")

# 9. Un equipo se agota antes de confirmar: se quita con aviso y no se envían las cuentas todavía (RAG-57)
VIVO[:] = [p for p in INVENTARIO if p["cod"] != "100-101-1050-1"]
st_a = dict(st, compra={**st["compra"], "equipos": list(st["compra"]["equipos"])}, campos=dict(st["campos"]))
m, etq, paso, nota = responder(st_a, "compra-si")
ok(len(st_a["compra"]["equipos"]) == 1 and "ya no está disponible" in cuerpo(m[0]) and paso is None
   and st_a["compra"]["paso"] == "confirmar", "si uno se agotó, lo quita, avisa y vuelve al resumen sin cuentas")
VIVO[:] = list(INVENTARIO)

# 10. Confirmar → cuentas con el total del pedido; comprobante → nota con todos los equipos (RAG-59)
m, etq, paso, nota = responder(st, "compra-si")
ok(cuerpo(m[0]) == CONFIG["texto_cuentas"] and paso == "esperando_pago" and "P16S GEN 2 (100-101-1113) + LENOVO P16S (100-101-1050-1)" in nota
   and "6.280.000" in nota, "confirmar envía las cuentas y la nota lleva los dos equipos y el total")
m, etq, paso, nota = responder(st, "ya pagué", "text")
ok(paso == "pago_por_confirmar" and "100-101-1113" in nota and "100-101-1050-1" in nota and st["pausa"],
   "el comprobante pasa a Pago por confirmar con la nota de todos los equipos")

# 11. Escribir el número de la opción también vale
st_n = nuevo(campos={"Código producto": "100-101-1113"})
compra.iniciar(st_n, "", {"etiquetas": ["Interes-Distribuidor"]})
responder(st_n, "compra-otro-no", lead={"etiquetas": ["Interes-Distribuidor"]})
m, *_ = responder(st_n, "2", "text")
ok(st_n["compra"]["paso"] == "agregar", "en el resumen, «2» es «Agregar otro equipo» (distribuidor, sin pregunta de tipo)")

# 12. Cotizar este pedido → la cotización no pregunta equipo ni cantidad y el PDF lleva un renglón por equipo (RAG-60)
st_c = dict(st_m, compra={**st_m["compra"], "equipos": list(st_m["compra"]["equipos"])}, campos=dict(st_m["campos"]))
m, *_ = responder(st_c, "compra-cotizar")
ok("compra" not in st_c and st_c["cotizacion"]["pedido"] == ["100-101-1113", "100-101-1050-1", "100-102-1030-1"]
   and st_c["cotizacion"]["tipo"] == "cliente_final" and st_c["cotizacion"]["paso"] == "nombre", "«Cotizar este pedido» pasa a la cotización con los 3 códigos")
for dato in ("Jhonatan Pérez", "1020304050", "3001234567"):
    r = cotizacion.responder(st_c, dato, "text", {"etiquetas": []})
m, etq, paso, nota = r
f = GUARDADAS[-1]
ok(len(f["items"]) == 3 and all(i["cantidad"] == 1 for i in f["items"]) and f["total"] == 3200000 + 3000000 + 1500000 + 80000
   and "Cotizacion-Enviada" in etq and "3 equipos" in cuerpo(m[1]), "un solo PDF con los 3 equipos, configuración una sola vez y total")

# 13. «asesor» en el carrito: nota con el pedido; con el cuadro Carrito unido, sigue su flecha (RAG-55)
st_s = nuevo(campos={"Código producto": "100-101-1113"})
compra.iniciar(st_s, "", {"etiquetas": []}, cuadro={"clave": "K1", "salidas": {"asesor": "M5", "listo": "M7"}})
m, etq, paso, nota = responder(st_s, "quiero hablar con un asesor", "text")
ok(IR[-1] == "M5" and "100-101-1113" in nota and "compra" not in st_s, "«asesor» sigue «Pidió asesor» del cuadro Carrito con la nota del pedido")
st_l = nuevo(campos={"Código producto": "100-101-1113"})
compra.iniciar(st_l, "", {"etiquetas": []}, cuadro={"clave": "K1", "salidas": {"listo": "M7"}})
st_l["compra"].update(paso="esperando_pago", tipo="distribuidor", total=3200000)
m, etq, paso, nota = responder(st_l, "comprobante", "text")
ok(IR[-1] == "M7" and paso == "pago_por_confirmar", "el comprobante sigue «Pedido pagado» del cuadro Carrito")

# 14. El cuadro del lienzo entra con su texto y el carrito encendido aunque la casilla esté apagada
CONFIG["carrito_activo"] = False
flujo_ir = flujo.ir
st_k = nuevo(campos={})
m = flujo.entrar_carrito(st_k, {"clave": "K1", "texto": "🛒 ¡Armemos tu pedido!", "salidas": {}})
ok(cuerpo(m[0]) == "🛒 ¡Armemos tu pedido!" and st_k["compra"]["carrito"] and "modelo" in cuerpo(m[1]),
   "el cuadro Carrito manda su texto y pide el equipo con el carrito encendido")
m, *_ = responder(st_k, "100-102-1030-1", "text")
ok(len(st_k["compra"]["equipos"]) == 1 and st_k["compra"]["paso"] == "otro", "el primer equipo entra directo y pregunta si quiere otro")

# 15. Carrito apagado: la compra de un equipo queda igual que antes (RAG-62)
st_o = nuevo(campos={"Código producto": "100-101-1113"})
m = compra.iniciar(st_o, "quiero comprar", {"etiquetas": []})
ok(st_o["compra"]["paso"] == "tipo" and "equipos" not in st_o["compra"], "carrito apagado: un equipo, pregunta el tipo como siempre")
m, *_ = responder(st_o, "compra-final")
ok("Resumen de tu compra" in cuerpo(m[0]) and botones(m[0]) == ["compra-si", "compra-asesor", "compra-cancelar"],
   "carrito apagado: mismo resumen y mismos botones de antes")

# 16. Recordatorio de 12 h con varios equipos los nombra (RAG-61)
st_r = nuevo(compra={"paso": "esperando_pago", "equipos": [{"codigo": "A-1", "equipo": "HP 840", "precio": 1}, {"codigo": "B-2", "equipo": "Dell 5420", "precio": 1}]})
m = compra.tiempo_cumplido(st_r)
ok("HP 840" in cuerpo(m[0]) and "Dell 5420" in cuerpo(m[0]), "«¿Sigues interesado?» recuerda los equipos del pedido")

# 17. Cotizó dos equipos y luego compra: el resumen lleva los dos, no solo el primero
CONFIG["carrito_activo"] = True
st_c = nuevo(campos={"Código producto": "100-101-1113, 100-101-1050-1"})
m = compra.iniciar(st_c, "quiero comprar", {"etiquetas": []})
ok(len(st_c["compra"]["equipos"]) == 2 and st_c["compra"]["paso"] == "tipo", "tras cotizar 2 equipos, «quiero comprar» los carga a los dos y pide el tipo")
m, *_ = responder(st_c, "compra-final")
t = cuerpo(m[0])
ok("100-101-1113" in t and "100-101-1050-1" in t and "Total (2 equipos)" in t and "compra-si" in botones(m[0]), "el resumen muestra los dos equipos y «Confirmar pedido»")

print(f"\n{n - fallos}/{n} en verde" if not fallos else f"\n{fallos} de {n} fallaron")
sys.exit(1 if fallos else 0)

"""
Pruebas del flujo de cotización (F4·26). No escribe en la base ni envía a WhatsApp: la base se reemplaza por datos fijos.
Sí genera un PDF de verdad con wkhtmltopdf. Uso:  python3 herramientas/meta-webhook-prueba/prueba_cotizacion.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import acciones  # noqa: E402
import cotizacion  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402

INVENTARIO = [{"cod": "100-102-1069", "marca": "DELL", "modelo": "5490", "cpu": "i5 8.ª", "gen": 8, "ram": "8GB", "disco": "256GB",
               "estado": "Grado A", "precio": 800000, "stock": 3, "foto": None}]
CONFIG = {"cargo_configuracion": 80000, "validez_cotizacion_h": 24, "recargo_tarjeta_pct": 6}
ACCIONES = [
    {"id": 1, "nombre": "Pasar a asesor", "prioridad": 1, "activa": True, "cuando": [{"forma": "contiene", "texto": "asesor"}],
     "hacer": [{"tipo": "asesor"}]},
    {"id": 4, "nombre": "Cotización", "prioridad": 30, "activa": True,
     "cuando": [{"forma": "contiene", "texto": "cotizacion"}, {"forma": "contiene", "texto": "cotizame"}],
     "hacer": [{"tipo": "flujo", "flujo": "cotizacion"}]},
]
GUARDADAS, PDFS = [], {}

flujo.inventario = lambda: INVENTARIO
db.agente_config = lambda fresco=False: CONFIG
db.acciones_activas = lambda: ACCIONES
db.principal = lambda: 1
db.crear_cotizacion = lambda fila: (GUARDADAS.append(fila), {"id": len(GUARDADAS), "consecutivo": 100 + len(GUARDADAS)})[1]
db.guardar_pdf_cotizacion = lambda i, ruta, contenido: PDFS.update({ruta: contenido})
db.apariencia_para_pdf = lambda: ({}, None, "image/png")
flujo.asesor = lambda st, etiqueta="Escalado-Asesor", motivo=None: (st.update(pausa=True), [flujo.m_texto("asesor")])[1]

fallos = n = 0
LEAD = {"id": 7, "telefono": "573002103979", "etiquetas": []}


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def cuerpo(m):
    return m.get("text", {}).get("body") or m.get("interactive", {}).get("body", {}).get("text", "")


def paso(st):
    return (st.get("cotizacion") or {}).get("paso")


def decir(st, texto, tipo="text", lead=LEAD):
    return cotizacion.responder(st, texto, tipo, lead)


# Recorrido completo, cliente final, sin código previo
st = dict(flujo.estado_vacio(), bot=1)
r = acciones.responder(st, "Hola, me cotizas un portátil? cotización", LEAD)
ok(r is not None and paso(st) == "nombre" and "nombre completo" in cuerpo(r[1][0]), "la acción inicia la cotización y pide el nombre")
ok("necesito" in cuerpo(decir(st, "12")[0][0]) or paso(st) == "nombre", "un nombre sin letras no pasa")
decir(st, "ana maría gómez")
ok(st["cotizacion"]["nombre"] == "Ana María Gómez" and paso(st) == "cedula", "guarda el nombre (con mayúsculas) y pide la cédula")
m = decir(st, "12a45")[0]
ok(paso(st) == "cedula" and "6 a 10" in cuerpo(m[0]), "cédula con letras: la vuelve a pedir")
m = decir(st, "1.234.567.890")[0]
ok(st["cotizacion"]["cedula"] == "1234567890" and paso(st) == "celular" and "3002103979" in cuerpo(m[0]),
   "cédula con puntos se limpia; ofrece el celular de WhatsApp")
decir(st, "cot-cel-otro", "interactive")
m = decir(st, "60123")[0]
ok(paso(st) == "celular" and "10 dígitos" in cuerpo(m[0]), "otro celular: valida 10 dígitos que empiezan por 3")
m = decir(st, "300 123 4567")[0]
ok(st["cotizacion"]["celular"] == "3001234567" and paso(st) == "producto", "guarda el celular y pide el código (no había ficha)")
m = decir(st, "el 100-101-0000")[0]
ok(paso(st) == "producto" and "No encuentro" in cuerpo(m[0]), "un código que no está no avanza")
m = decir(st, "100-102-1069")[0]
ok(paso(st) == "cantidad" and "hay 3 disponibles" in cuerpo(m[0]), "con el código pide la cantidad y dice cuántos hay")
m = decir(st, "5")[0]
ok(paso(st) == "cantidad" and "Solo hay *3*" in cuerpo(m[0]), "no cotiza más que el stock")
decir(st, "2")
ok(paso(st) == "tipo", "pregunta distribuidor o cliente final")
m, etq, _, nota = decir(st, "cot-final", "interactive")
g = GUARDADAS[-1]
ok(g["subtotal"] == 1600000 and g["cargos"][0]["valor"] == 160000 and g["total"] == 1760000,
   "cliente final: 2 × $800.000 + 2 × $80.000 de configuración = $1.760.000")
ok(g["lead_id"] == 7 and g["cedula"] == "1234567890" and g["celular"] == "3001234567" and g["items"][0]["codigo"] == "100-102-1069",
   "guarda cliente, cédula, celular y equipo")
ok(m[0] == {"_cotizacion": {"ruta": "cotizaciones/101.pdf", "numero": "COT-000101"}} and "quiero comprar" in cuerpo(m[1]),
   "envía el PDF y el mensaje que invita a comprar")
ok(PDFS["cotizaciones/101.pdf"].startswith(b"%PDF"), "el PDF se generó de verdad")
ok("cotizacion" not in st and st["etapa"] == "Cotización" and st["valor"] == 1760000 and st["campos"]["Código producto"] == "100-102-1069",
   "termina: etapa Cotización, valor y código para una compra después")
ok("Cotizacion-Enviada" in etq and "COT-000101" in nota and "CC 1234567890" in nota, "etiqueta y nota para el asesor")

# Distribuidor con la ficha ya vista: no pregunta ni el código ni el tipo
st = dict(flujo.estado_vacio(), bot=1)
st["campos"]["Código producto"] = "100-102-1069"
acciones.responder(st, "cotizame", dict(LEAD, etiquetas=["Interes-Distribuidor"]))
for x in ("Luis Pérez", "98765432", "cot-cel-si"):
    decir(st, x, "interactive" if x.startswith("cot-") else "text")
ok(paso(st) == "cantidad", "con la ficha vista y etiqueta de distribuidor salta código y tipo")
decir(st, "1")
ok(GUARDADAS[-1]["total"] == 800000 and GUARDADAS[-1]["cargos"] == [] and GUARDADAS[-1]["tipo_cliente"] == "distribuidor",
   "distribuidor: precio de distribución sin cargo de configuración")

# Salidas
st = dict(flujo.estado_vacio(), bot=1)
acciones.responder(st, "cotizacion", LEAD)
ok(decir(st, "0") is None and "cotizacion" not in st, "«0» sale de la cotización y sigue por el menú")
acciones.responder(st, "cotizacion", LEAD)
m, *_ = decir(st, "quiero un asesor")
ok(st["pausa"] and "cotizacion" not in st, "«asesor» pasa al asesor")

# Se agotó mientras tanto
st = dict(flujo.estado_vacio(), bot=1)
st["campos"]["Código producto"] = "100-102-1069"
acciones.responder(st, "cotizacion", LEAD)
for x in ("Ana Gómez", "1234567", "cot-cel-si", "1"):
    decir(st, x, "interactive" if x.startswith("cot-") else "text")
INVENTARIO.clear()
m, *_ = decir(st, "cot-final", "interactive")
ok("se acaba de agotar" in cuerpo(m[0]) and "cotizacion" not in st, "si se agota antes de generar, no cotiza (RAG-28)")

print(f"\n{n - fallos}/{n} en verde" if not fallos else f"\n✗ {fallos} en rojo")
sys.exit(1 if fallos else 0)

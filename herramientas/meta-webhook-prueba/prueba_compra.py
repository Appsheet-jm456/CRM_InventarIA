"""
Pruebas del flujo de compra sin IA (F4·25). No escribe en la base ni envía a WhatsApp: la base se reemplaza por datos
fijos. Uso:  python3 herramientas/meta-webhook-prueba/prueba_compra.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import acciones  # noqa: E402
import compra  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402

INVENTARIO = [
    {"cod": "100-102-1030-1", "marca": "Dell", "modelo": "Latitude 5420", "cpu": "i5", "gen": 11, "ram": "16GB", "disco": "512GB",
     "estado": "Grado A", "precio": 1500000, "stock": 1, "foto": None},
]
CONFIG = {"validar_comprobante": False,  # el camino de antes de F4·46 (casilla apagada); el nuevo, en prueba_validacion.py
          "texto_cuentas": "💳 Bancolombia 123 · Davivienda 456", "cargo_configuracion": 80000, "horas_sin_respuesta": 12,
          "texto_comprobante": "✅ Recibimos tu comprobante.", "texto_cancelacion": "😊 Entendido.",
          "texto_sigue_interesado": "👋 ¿Sigues interesado?"}
ACCIONES = [
    {"id": 1, "nombre": "Pasar a asesor", "prioridad": 1, "activa": True, "cuando": [{"forma": "contiene", "texto": "asesor"}],
     "hacer": [{"tipo": "asesor"}]},
    {"id": 3, "nombre": "Quiero comprar", "prioridad": 20, "activa": True,
     "cuando": [{"forma": "contiene", "texto": "quiero comprar"}, {"forma": "contiene", "texto": "lo quiero"}],
     "hacer": [{"tipo": "flujo", "flujo": "compra"}]},
    {"id": 4, "nombre": "Cotización", "prioridad": 30, "activa": True, "cuando": [{"forma": "contiene", "texto": "cotizacion"}],
     "hacer": [{"tipo": "flujo", "flujo": "garantia"}]},
]

flujo.inventario = lambda: INVENTARIO
db.conocimiento = lambda categoria, fresco=False: []  # F4·49: sin imagen de medios de pago
db.agente_config = lambda fresco=False: CONFIG
db.acciones_activas = lambda: [a for a in ACCIONES if a["activa"]]
db.principal = lambda: 1
flujo.del_tipo = lambda tipo: "B-ASESOR"
flujo.asesor = lambda st, etiqueta="Escalado-Asesor", motivo=None, **_: (st.update(pausa=True), [flujo.m_texto("asesor")])[1]

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def cuerpo(m):
    return m.get("text", {}).get("body") or m.get("interactive", {}).get("body", {}).get("text", "")


def nuevo(**extra):
    return dict(flujo.estado_vacio(), bot=1, **extra)


# 1. Disparo por acción con el código en la frase
st = nuevo()
r = acciones.responder(st, "Hola, quiero comprar el 100-102-1030-1", {"etiquetas": []})
ok(r is not None and r[0]["nombre"] == "Quiero comprar" and st["compra"]["paso"] == "tipo", "«quiero comprar <código>» inicia la compra y pregunta el tipo de cliente")
ok(st["nodo"] == compra.NODO and st["compra"]["codigo"] == "100-102-1030-1", "la compra queda en el estado con el equipo")

# 2. Cliente final: suma el cargo de configuración
m, etq, paso, nota = compra.responder(st, "compra-final", "interactive")
ok(st["compra"]["total"] == 1580000 and "Total: $1.580.000" in cuerpo(m[0]) and "Configuración: $80.000" in cuerpo(m[0]),
   "cliente final: precio de la base + $80.000 de configuración")
ok(st["valor"] == 1580000 and st["campos"]["Código producto"] == "100-102-1030-1", "el valor y el código pasan a la oportunidad")

# 3. Confirmar → cuentas exactas, Esperando pago y espera de 12 h
m, etq, paso, nota = compra.responder(st, "compra-si", "interactive")
ok(m[0]["text"]["body"] == CONFIG["texto_cuentas"], "envía el texto de cuentas aprobado, tal cual (RAG-09)")
ok(paso == "esperando_pago" and "Compra-Iniciada" in etq and st["compra"]["paso"] == "esperando_pago" and st.get("espera_hasta"),
   "mueve a Esperando pago, etiqueta Compra-Iniciada y espera 12 h")

# 4. «Ya pagué» no reenvía las cuentas: es comprobante
st2 = dict(st, compra=dict(st["compra"]), campos=dict(st["campos"]))
m, etq, paso, nota = compra.responder(st2, "ya te pagué", "text")
ok(paso == "pago_por_confirmar" and st2["pausa"] and "compra" not in st2 and m[0]["text"]["body"] == CONFIG["texto_comprobante"],
   "«ya te pagué» → Pago por confirmar, texto fijo y el chat pasa al asesor (RAG-20)")
ok("Pago-Por-Confirmar" in etq and "1.580.000" in nota, "deja etiqueta y una nota con equipo y total para el asesor")

# 5. Foto del comprobante
st3 = dict(st, compra=dict(st["compra"]), campos=dict(st["campos"]))
m, etq, paso, nota = compra.responder(st3, "asesor", "media")
ok(paso == "pago_por_confirmar" and st3["pausa"], "una foto o PDF esperando el pago es el comprobante")

# 6. Datos de envío mientras espera: se anotan, un solo recordatorio
st4 = dict(st, compra=dict(st["compra"]), campos=dict(st["campos"]))
m1, _, p1, n1 = compra.responder(st4, "Juan Pérez, CC 1234567, Cali calle 5 # 3-2", "text")
m2, _, p2, n2 = compra.responder(st4, "tel 3001234567", "text")
ok(p1 is None and len(m1) == 1 and len(m2) == 0 and "Cali" in n1 and not st4.get("pausa"),
   "datos de envío: se anotan para el asesor y el recordatorio del comprobante sale una sola vez")

# 7. Cancelar esperando el pago
st5 = dict(st, compra=dict(st["compra"]), campos=dict(st["campos"]))
m, etq, paso, nota = compra.responder(st5, "ya no quiero comprar", "text")
ok(paso == "cancelada" and "Compra-Cancelada" in etq and "compra" not in st5 and m[0]["text"]["body"] == CONFIG["texto_cancelacion"],
   "«ya no quiero» cancela con el texto fijo")

# 8. Distribuidor: sin cargo y sin preguntar
st = nuevo()
r = acciones.responder(st, "quiero comprar 100-102-1030-1", {"etiquetas": ["Interes-Distribuidor"]})
ok(st["compra"]["paso"] == "confirmar" and st["compra"]["total"] == 1500000 and "Configuración" not in cuerpo(r[1][0]),
   "distribuidor (etiqueta del bot): precio de distribución sin cargo, directo al resumen")

# 9. Sin código: lo pide; luego usa el que escribe
st = nuevo()
r = acciones.responder(st, "lo quiero", {"etiquetas": []})
ok(st["compra"]["paso"] == "codigo" and "código" in cuerpo(r[1][0]), "sin código ni ficha previa: lo pide")
m, *_ = compra.responder(st, "el 100-102-1030-1", "text")
ok(st["compra"]["paso"] == "tipo", "con el código escrito sigue al tipo de cliente")

# 10. Usa el código de la última ficha
st = nuevo()
st["campos"]["Código producto"] = "100-102-1030-1"
acciones.responder(st, "quiero comprar", {"etiquetas": []})
ok(st["compra"].get("codigo") == "100-102-1030-1", "sin código en la frase usa el de la última ficha que vio")

# 11. Código agotado
st = nuevo()
r = acciones.responder(st, "quiero comprar el 100-101-9999-1", {"etiquetas": []})
ok("compra" not in st and "ya no está disponible" in cuerpo(r[1][0]), "un código sin stock no inicia la compra")

# 12. «asesor» en medio de la compra
st = nuevo()
acciones.responder(st, "quiero comprar 100-102-1030-1", {"etiquetas": []})
m, etq, paso, nota = compra.responder(st, "mejor con un asesor", "text")
ok(st["pausa"] and "compra" not in st and "pidió asesor" in nota, "«asesor» pasa al asesor con la compra anotada")

# 13. Sin texto de cuentas: lo envía un asesor
CONFIG["texto_cuentas"] = ""
st = nuevo()
acciones.responder(st, "quiero comprar 100-102-1030-1", {"etiquetas": ["Interes-Distribuidor"]})
m, etq, paso, nota = compra.responder(st, "compra-si", "interactive")
ok(st["pausa"] and paso == "esperando_pago" and "Falta enviarle las cuentas" in nota, "sin texto aprobado no se inventan cuentas: pasa al asesor")
CONFIG["texto_cuentas"] = "💳 Bancolombia 123 · Davivienda 456"

# 14. Cotización todavía no corre; «0» sale al menú
st = nuevo()
ok(acciones.responder(st, "quiero una cotizacion", {"etiquetas": []}) is None, "una acción con un flujo que no existe no corre")
acciones.responder(st, "quiero comprar 100-102-1030-1", {"etiquetas": []})
ok(compra.responder(st, "0", "text") is None and "compra" not in st, "«0» antes de las cuentas sale de la compra y sigue por el menú")

# 15. Recordatorio a las 12 h
ok(compra.tiempo_cumplido(dict(espera_hasta="x"))[0]["text"]["body"] == CONFIG["texto_sigue_interesado"], "12 h sin respuesta: «¿Sigues interesado?»")

print(f"\n{n - fallos}/{n} en verde" if not fallos else f"\n✗ {fallos} en rojo")
sys.exit(1 if fallos else 0)

"""
Pruebas del cierre de la compra con políticas de despacho (F4·47, RF-40 a RF-43): el cuadro Asesor con `solo_motivo` envía solo el
texto de cierre que trae la flecha, en vez del aviso de horario. No escribe en la base ni envía a WhatsApp.
Uso:  python3 herramientas/meta-webhook-prueba/prueba_cierre_despacho.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import db  # noqa: E402
import flujo  # noqa: E402

ATRIBUTOS = {k: {"clave": k, "nombre": k, "tipo": t, "opciones": []} for k, t in [
    ("nombre_completo", "texto"), ("cedula", "documento"), ("celular", "telefono"), ("correo_para_la_factura", "correo"),
    ("direccion_entrega", "texto"), ("venta_online", "si_no")]}

POLITICA_ENVIO = "🚚 *Política de despacho*\n1️⃣ ✅ Pago confirmado."
POLITICA_TIENDA = "🏬 *Recojo en tienda*\n1️⃣ ✅ Pago confirmado."


def cuadro(clave, tipo, texto="", **extra):
    return {"clave": clave, "tipo": tipo, "nombre": clave, "inicio": False, "texto": texto, "opciones": [], "salidas": {}, "ajustes": {},
            "al_entrar": {}, "marcas": [], **extra}


def pregunta(clave, atributo, siguiente):
    return cuadro(clave, "pregunta", f"¿{atributo}?", salidas={"siguiente": siguiente},
                  ajustes={"atributo": atributo, "texto_error": "De nuevo 🙏", "espera_segundos": 1800})


def despacho(solo_motivo=True):
    return {
        "B00": dict(cuadro("B00", "mensaje", "📦 ¿Cómo quieres recibir tu equipo?", inicio=True), opciones=[
            {"id": "1", "titulo": "Envío transportadora", "destino": "Q1", "efectos": {"atributos": {"venta_online": True}}},
            {"id": "2", "titulo": "Recojo en tienda", "destino": "B-ASESOR",
             "efectos": {"atributos": {"venta_online": False}, "motivo": POLITICA_TIENDA}}]),
        "Q1": pregunta("Q1", "nombre_completo", "Q2"), "Q2": pregunta("Q2", "cedula", "Q3"), "Q3": pregunta("Q3", "celular", "Q4"),
        "Q4": pregunta("Q4", "correo_para_la_factura", "Q5"), "Q5": pregunta("Q5", "direccion_entrega", "M1"),
        "M1": dict(cuadro("M1", "mensaje", "📋 Confirma: 👤 {nombre_completo} 📍 {direccion_entrega}"), opciones=[
            {"id": "1", "titulo": "Sí, correctos", "destino": "B-ASESOR", "efectos": {"motivo": POLITICA_ENVIO}},
            {"id": "2", "titulo": "Corregir", "destino": "Q1"}]),
        "B-ASESOR": cuadro("B-ASESOR", "asesor", "{motivo}🙌 Un asesor te escribe por aquí.\n\n{horario}", marcas=["motivo", "horario"],
                           ajustes={"solo_motivo": True} if solo_motivo else {}),
        "B-CERRADO": cuadro("B-CERRADO", "aviso", "{motivo}¡Entendido! 🙌 Ahora estamos fuera de horario: te responden {proxima}.\n\n{horario}"),
        "ERROR": cuadro("ERROR", "aviso", "🤔 No entendí tu respuesta."),
        "ERROR-3": cuadro("ERROR-3", "aviso", "Tres respuestas no reconocidas: te paso con un asesor."),
    }


FLUJO = {"cuadros": despacho()}
db.atributos = lambda: ATRIBUTOS
db.flujo = lambda bot=None: FLUJO["cuadros"] if bot in (None, 1) else None
db.principal = lambda: 1
flujo.proxima_apertura = lambda ahora=None: (False, "mañana a las 9:00 am")  # fuera de horario: el caso que molestaba
flujo.texto_horario = lambda: "🕗 Lunes a viernes: 8:00 am – 6:00 pm"

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def cuerpo(m):
    return m.get("text", {}).get("body") or m.get("interactive", {}).get("body", {}).get("text", "")


def nuevo():
    return {**flujo.estado_vacio(), "bot": 1, "nodo": "B00"}


# 1. Recojo en tienda: solo la política, aunque esté fuera de horario
m, st = flujo.responder(nuevo(), "2")
ok(len(m) == 1 and cuerpo(m[0]) == POLITICA_TIENDA, "«Recojo en tienda» envía solo la política de tienda (RF-42, RF-43)")
ok(st["pausa"] and st["nodo"] == "B-ASESOR" and st["atributos"].get("venta_online") is False,
   "el chat pasa a la cola, con el bot pausado y Venta tienda marcada")
ok("fuera de horario" not in cuerpo(m[0]), "no llega el aviso de «fuera de horario»")
ok(st.get("resumen_pedido") is True, "F4·64: el cierre de tienda deja la marca para enviar el resumen del pedido (RF-46)")

# 2. Envío: 5 preguntas, confirmación y política de envío
st = nuevo()
m, st = flujo.responder(st, "1")
ok(st["nodo"] == "Q1" and st["atributos"].get("venta_online") is True, "«Envío transportadora» marca Venta online y pregunta el nombre")
for texto in ["Juan Pérez Gómez", "1020345678", "3001234567", "juan@correo.com", "Cra 10 # 20-30, Bogotá, Cundinamarca"]:
    m, st = flujo.responder(st, texto)
ok(st["nodo"] == "M1" and "Juan Pérez Gómez" in cuerpo(m[0]) and "Cra 10 # 20-30" in cuerpo(m[0]),
   "tras las 5 preguntas muestra la confirmación con los datos (RF-41)")
m, st = flujo.responder(st, "1")
ok(len(m) == 1 and cuerpo(m[0]) == POLITICA_ENVIO and st["pausa"], "«Sí, correctos» envía solo la política de despacho y pasa a la cola")
ok(st.get("resumen_pedido") is True, "F4·64: el cierre de envío también deja la marca del resumen del pedido (RF-46)")

# 3. Pedir asesor a mitad de las preguntas: aviso de siempre (no hay texto de cierre)
st = nuevo()
m, st = flujo.responder(st, "1")
m, st = flujo.responder(st, "asesor")
ok(st["pausa"] and "fuera de horario" in cuerpo(m[0]), "«asesor» a mitad de camino da el aviso de horario de siempre")
ok(not st.get("resumen_pedido"), "F4·64: pedir asesor no manda el resumen del pedido (RF-49)")

# 4. Sin la casilla, todo como antes: el texto de la flecha va en cursiva antes del aviso
FLUJO["cuadros"] = despacho(solo_motivo=False)
m, st = flujo.responder(nuevo(), "2")
ok(cuerpo(m[0]).startswith("_" + POLITICA_TIENDA) and "fuera de horario" in cuerpo(m[0]),
   "sin solo_motivo el Asesor sigue mandando el aviso de horario (otros bots no cambian)")

# 5. Tres errores con la casilla puesta: aviso normal (el texto no viene de una flecha)
FLUJO["cuadros"] = despacho()
st = nuevo()
for _ in range(3):
    m, st = flujo.responder(st, "xyz")
ok(st["pausa"] and "fuera de horario" in cuerpo(m[-1]), "tres respuestas no reconocidas siguen con el aviso de horario")
ok(not st.get("resumen_pedido"), "F4·64: tres respuestas no reconocidas no mandan el resumen (RF-49)")

print(f"\n{n - fallos}/{n} pruebas bien")
sys.exit(1 if fallos else 0)

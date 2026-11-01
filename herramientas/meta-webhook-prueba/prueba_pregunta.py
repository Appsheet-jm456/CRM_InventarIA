"""
Pruebas del cuadro Pregunta, las marcas {dato} y «Marcar un dato» (F4·34, RF-23 a RF-28). No escribe en la base ni envía a
WhatsApp: la base se reemplaza por datos fijos. Uso:  python3 herramientas/meta-webhook-prueba/prueba_pregunta.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import compra  # noqa: E402
import db  # noqa: E402
import flujo  # noqa: E402

ATRIBUTOS = {
    "nombre_completo": {"clave": "nombre_completo", "nombre": "Nombre completo", "tipo": "texto", "opciones": []},
    "cedula": {"clave": "cedula", "nombre": "Cédula (CC)", "tipo": "documento", "opciones": []},
    "celular": {"clave": "celular", "nombre": "Celular", "tipo": "telefono", "opciones": []},
    "correo_para_la_factura": {"clave": "correo_para_la_factura", "nombre": "Correo", "tipo": "correo", "opciones": []},
    "metodo_pago": {"clave": "metodo_pago", "nombre": "Método de pago", "tipo": "lista", "opciones": ["Efectivo en tienda", "Transferencia"]},
    "venta_online": {"clave": "venta_online", "nombre": "Venta online", "tipo": "si_no", "opciones": []},
}


def cuadro(clave, tipo, texto="", **extra):
    return {"clave": clave, "tipo": tipo, "nombre": clave, "inicio": False, "texto": texto, "opciones": [], "salidas": {}, "ajustes": {},
            "al_entrar": {}, "marcas": [], **extra}


DESPACHO = {
    "B00": dict(cuadro("B00", "mensaje", "✅ Recibimos tu comprobante. ¿Cómo recibes tu equipo?", inicio=True), opciones=[
        {"id": "1", "titulo": "Envío a domicilio", "destino": "Q1", "efectos": {"atributos": {"venta_online": True}}},
        {"id": "2", "titulo": "Recojo en tienda", "destino": "M2", "efectos": {"atributos": {"venta_online": False}}}]),
    "Q1": cuadro("Q1", "pregunta", "¿Tu nombre completo?", salidas={"siguiente": "Q2"},
                 ajustes={"atributo": "nombre_completo", "texto_error": "Escribe tu nombre", "espera_segundos": 1800}),
    "Q2": cuadro("Q2", "pregunta", "¿Tu cédula?", salidas={"siguiente": "Q3", "no_logro": "M2"},
                 ajustes={"atributo": "cedula", "texto_error": "La cédula va solo con números 🙏", "espera_segundos": 1800}),
    "Q3": cuadro("Q3", "pregunta", "¿Tu celular?", salidas={"siguiente": "Q4"},
                 ajustes={"atributo": "celular", "texto_error": "El celular tiene 10 números", "espera_segundos": 1800}),
    "Q4": cuadro("Q4", "pregunta", "¿Cómo pagaste?", salidas={"siguiente": "M1"},
                 ajustes={"atributo": "metodo_pago", "texto_error": "Elige una opción", "espera_segundos": 1800}),
    "M1": dict(cuadro("M1", "mensaje", "Confirma: 👤 {nombre_completo} · CC {cedula} · 📱 {celular} · ✉️ {correo_para_la_factura}"),
               opciones=[{"id": "1", "titulo": "Sí", "destino": "B-ASESOR"}, {"id": "2", "titulo": "Corregir", "destino": "Q1"}]),
    "M2": dict(cuadro("M2", "mensaje", "Te esperamos en la tienda"), opciones=[{"id": "1", "titulo": "Listo", "destino": "B-ASESOR"}]),
    "B-ASESOR": cuadro("B-ASESOR", "asesor", "Un asesor te atiende {motivo}{horario}", marcas=["motivo", "horario"]),
}
CONFIG = {"texto_cuentas": "💳 Bancolombia 123", "horas_sin_respuesta": 12, "texto_comprobante": "✅ Recibimos tu comprobante.",
          "compra_bot_despues": None}

db.atributos = lambda: ATRIBUTOS
db.flujo = lambda bot=None: DESPACHO if bot in (None, 1, 7) else None
db.principal = lambda: 1
db.agente_config = lambda fresco=False: CONFIG
flujo.asesor = lambda st, etiqueta="Escalado-Asesor", motivo=None: (st.update(pausa=True, nodo="B-ASESOR"), [flujo.m_texto("asesor")])[1]

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def cuerpo(m):
    return m.get("text", {}).get("body") or m.get("interactive", {}).get("body", {}).get("text", "")


def nuevo(**extra):
    return {**flujo.estado_vacio(), "bot": 1, "nodo": "B00", **extra}


# 1. Un botón marca Venta online y lleva a la primera pregunta
st = nuevo()
m, st = flujo.responder(st, "1")
ok(st["atributos"] == {"venta_online": True} and st["nodo"] == "Q1" and cuerpo(m[0]) == "¿Tu nombre completo?" and st.get("espera_hasta"),
   "«Envío a domicilio» marca Venta online, pregunta el nombre y espera (RF-27, RF-23)")

# 2. La respuesta se guarda y sigue
m, st = flujo.responder(st, "  Juan Pérez Gómez ")
ok(st["atributos"]["nombre_completo"] == "Juan Pérez Gómez" and st["nodo"] == "Q2", "guarda el nombre recortado y sigue a la cédula")

# 3. Cédula con puntos: se limpia; una cédula no se toma como código de equipo
m, st = flujo.responder(st, "1.020.345.678")
ok(st["atributos"]["cedula"] == "1020345678" and st["nodo"] == "Q3", "la cédula «1.020.345.678» se guarda como 1020345678 (RF-24)")

# 4. Celular mal: mensaje de error y sigue en la pregunta; con +57 se limpia
m, st = flujo.responder(st, "12345")
ok(st["nodo"] == "Q3" and cuerpo(m[0]) == "El celular tiene 10 números" and st["errores"] == 1, "un celular mal manda el error y vuelve a pedirlo")
m, st = flujo.responder(st, "+57 300 123 4567")
ok(st["atributos"]["celular"] == "3001234567" and st["nodo"] == "Q4" and st["errores"] == 0, "«+57 300 123 4567» se guarda como 3001234567")

# 5. Un dato de lista sale como botones y acepta el número o el texto
ok(m[0].get("type") == "interactive" and "Transferencia" in str(m[0]), "la pregunta de una lista muestra sus opciones como botones")
m, st = flujo.responder(st, "transferencia")
ok(st["atributos"]["metodo_pago"] == "Transferencia" and st["nodo"] == "M1", "acepta la opción escrita")

# 6. Las marcas {dato} se llenan; las vacías salen con —
ok(cuerpo(m[0]).startswith("Confirma: 👤 Juan Pérez Gómez · CC 1020345678 · 📱 3001234567 · ✉️ —"), "el resumen trae los datos y «—» en lo vacío (RF-26)")

# 7. Tres intentos fallidos: «No logró responder»
st = nuevo(nodo="Q2", atributos={})
for _ in range(3):
    m, st = flujo.responder(st, "no la tengo")
ok(st["nodo"] == "M2" and "cedula" not in st["atributos"], "al tercer intento sigue por «No logró responder»")

# 8. Sin unir «No logró responder», pasa al asesor
st = nuevo(nodo="Q3", atributos={})
for _ in range(3):
    m, st = flujo.responder(st, "x")
ok(st["pausa"] and cuerpo(m[0]) == "asesor", "sin unir «No logró responder», el cliente pasa al asesor")

# 9. «asesor» sigue valiendo; «hola» vuelve al inicio
st = nuevo(nodo="Q1")
m, st = flujo.responder(st, "asesor")
ok(st["pausa"], "«asesor» en una pregunta pasa al asesor")

# 10. Sin respuesta: sin unir, al asesor
st = nuevo(nodo="Q1")
st["espera_hasta"] = "2000-01-01T00:00:00+00:00"
m, st = flujo.tiempo_cumplido(st)
ok(st["pausa"], "si el cliente no responde la pregunta y no hay flecha, pasa al asesor (RF-28)")

# 11. en_pregunta: Acciones y Avi no se meten
ok(flujo.en_pregunta(nuevo(nodo="Q2")) and not flujo.en_pregunta(nuevo(nodo="B00")), "en_pregunta solo en un cuadro Pregunta")

# 12. Compra: con «después del comprobante» el cliente pasa al bot de despacho sin pausar
compra_st = nuevo(nodo=compra.NODO, compra={"paso": "esperando_pago", "equipo": "Dell", "codigo": "PU-1", "total": 1000, "tipo": "cliente_final"})
CONFIG["compra_bot_despues"] = 7
mensajes, etiquetas, paso, nota = compra.responder(compra_st, "ya pagué", "text", {"etiquetas": []})
ok(not compra_st["pausa"] and compra_st["bot"] == 7 and compra_st["nodo"] == "B00" and paso == "pago_por_confirmar"
   and "Pago-Por-Confirmar" in etiquetas and "¿Cómo recibes tu equipo?" in cuerpo(mensajes[0]),
   "con un bot elegido, el comprobante lleva al bot de despacho y la oportunidad a Pago por confirmar (RF-28)")

# 13. Sin bot elegido, como antes
compra_st = nuevo(nodo=compra.NODO, compra={"paso": "esperando_pago", "equipo": "Dell", "codigo": "PU-1", "total": 1000, "tipo": "cliente_final"})
CONFIG["compra_bot_despues"] = None
flujo.del_tipo = lambda tipo: "B-ASESOR"
mensajes, etiquetas, paso, nota = compra.responder(compra_st, "ya pagué", "text", {"etiquetas": []})
ok(compra_st["pausa"] and cuerpo(mensajes[0]) == "✅ Recibimos tu comprobante.", "sin bot elegido, el comprobante pasa al asesor como antes")

print(f"\n{n - fallos} de {n} pruebas bien")
sys.exit(1 if fallos else 0)

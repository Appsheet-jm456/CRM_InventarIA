"""
Pruebas de las herramientas del asesor en el chat (F4·61, docs/MEJORAS-CHAT-Y-PAGOS.md, RB-07 a RB-12). Sin base ni WhatsApp: la
base se reemplaza por datos fijos (permisos, 24 h y estado del chat los prueba supabase/pruebas/0064_herramientas_del_asesor.sql).
Uso: python3 herramientas/meta-webhook-prueba/prueba_herramientas.py
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import db  # noqa: E402
import flujo  # noqa: E402
import receptor  # noqa: E402

ASESORA = "aaaaaaaa-0000-0000-0000-000000000001"
DESPACHO = 462


def cuadro(clave, tipo, texto, inicio=False, opciones=()):
    return {"clave": clave, "tipo": tipo, "nombre": clave, "inicio": inicio, "texto": texto, "salidas": {}, "ajustes": {},
            "al_entrar": {}, "marcas": [], "opciones": [{"id": str(i), "titulo": t, "destino": clave} for i, t in enumerate(opciones, 1)]}


SISTEMA = {"B-ASESOR": cuadro("B-ASESOR", "asesor", "Un asesor te atiende"), "B-CERRADO": cuadro("B-CERRADO", "aviso", "Fuera de horario")}
BOTS = {1: {"B00": cuadro("B00", "mensaje", "Hola", True, ["Portátiles"]), **SISTEMA},
        DESPACHO: {"D1": cuadro("D1", "mensaje", "¿Cómo recibes tu equipo?", True, ["Envío a domicilio", "Recojo en tienda"]), **SISTEMA}}
CATALOGOS = {7: {"id": 7, "nombre": "Portatiles Lenovo", "tipo": "drive", "url": "https://drive.google.com/lenovo", "archivo": "",
                 "categoria": "Portatiles", "marca": "Lenovo", "todos": False, "activo": True}}
ACCIONES = [{"id": 5, "nombre": "Ubicación del local", "activa": True, "cuando": [], "prioridad": 5,
             "hacer": [{"tipo": "texto", "texto": "📍 Estamos en el CC La Pasarela, local 2-107"},
                       {"tipo": "etiqueta", "etiqueta": "Pidio-Ubicacion"},
                       {"tipo": "asesor"}]}]  # el paso «asesor» no corre desde el chat (RB-08)
LEAD, CAMBIOS, ENV, GUARDADOS = {}, {}, [], []

db.flujo = lambda bot=None: BOTS.get(bot or 1)
db.principal = lambda: 1
db.catalogo = lambda i: CATALOGOS.get(int(i)) if i else None
db.acciones_todas = lambda: ACCIONES
db.lead = lambda t: dict(LEAD)
db.telefono_de = lambda i: LEAD.get("telefono")
db.guardar_mensaje = lambda *a, **k: GUARDADOS.append((a, k))
db.actualizar_lead = lambda i, c: CAMBIOS.update(c)
db.agente_config = lambda fresco=False: {}
db.retorno_config = lambda: {"activo": False}
flujo.texto_horario = lambda: "L-V"
flujo.proxima_apertura = lambda ahora=None: (True, "")
flujo.con_horario = lambda t: t.replace("{proxima}", "en breve")
receptor.enviar = lambda n, m: (ENV.append(m) or "enviado")
receptor.anotar = lambda *a: None
receptor.resolver = lambda m: m

fallos = n = 0


def ok(condicion, descripcion):
    global fallos, n
    n += 1
    print(("ok" if condicion else "not ok"), n, "-", descripcion)
    fallos += 0 if condicion else 1


def cuerpo(m):
    return m.get("text", {}).get("body") or m.get("interactive", {}).get("body", {}).get("text", "")


def cliente(pausa=True, volver_a=None, paso="", bot=None):
    LEAD.clear()
    estado = {"volver_a": volver_a} if volver_a else {}
    LEAD.update({"id": 9, "telefono": "573001112233", "nombre": "Ana Ruiz", "paso_menu": paso, "etapa": "En Conversación", "errores_bot": 0,
                 "pausar_bot": pausa, "bot_id": bot, "etiquetas": [], "atributos": {}, "categoria_interes": "", "uso_equipo": "",
                 "presupuesto": "", "marca_interes": "", "cotiz_producto": "", "estado_bot": estado, "espera_vence_en": None})
    CAMBIOS.clear(); ENV.clear(); GUARDADOS.clear()


# RB-07: catálogo desde el chat, como mensaje del asesor
cliente()
r = receptor.herramienta({"lead": 9, "tipo": "catalogo", "ref": "7", "usuario": ASESORA})
ok(r["ok"] and len(ENV) == 1 and "drive.google.com/lenovo" in cuerpo(ENV[0]) and "Portatiles Lenovo" in cuerpo(ENV[0]),
   "el catálogo sale con su nombre y su enlace de Drive")
ok(GUARDADOS and GUARDADOS[0][0][1] == "asesor" and GUARDADOS[0][1].get("usuario") == ASESORA,
   "queda guardado como mensaje del asesor que lo pidió (RB-11)")
ok("ultimo_mensaje" in CAMBIOS and "pausar_bot" not in CAMBIOS, "actualiza el último mensaje sin tocar quién atiende el chat")

# RB-07b: mensaje propio del catálogo
CATALOGOS[7]["mensaje"] = "📎 Hola {nombre}, te envío el catálogo de *portátiles usados*.\n\n🤖 Escribe \"Asesor\" si quieres atención personalizada."
cliente()
receptor.herramienta({"lead": 9, "tipo": "catalogo", "ref": "7", "usuario": ASESORA})
ok(cuerpo(ENV[0]).startswith("📎 Hola Ana, te envío") and cuerpo(ENV[0]).endswith("📚 https://drive.google.com/lenovo")
   and "*Portatiles Lenovo*" not in cuerpo(ENV[0]), "con mensaje propio: sale ese texto con el nombre del cliente y el enlace al final")
CATALOGOS[7]["mensaje"] = "Míralo aquí 👉 {enlace}\n\nCualquier duda me cuentas."
cliente()
receptor.herramienta({"lead": 9, "tipo": "catalogo", "ref": "7", "usuario": ASESORA})
ok(cuerpo(ENV[0]) == "Míralo aquí 👉 https://drive.google.com/lenovo\n\nCualquier duda me cuentas.", "{enlace} pone el enlace donde el dueño quiere")
CATALOGOS[7]["mensaje"] = ""

# RB-08: acción con solo los pasos que envían
cliente()
r = receptor.herramienta({"lead": 9, "tipo": "accion", "ref": "5", "usuario": ASESORA})
ok(r["ok"] and len(ENV) == 1 and "La Pasarela" in cuerpo(ENV[0]), "la acción envía su texto")
ok(CAMBIOS.get("etiquetas") == ["Pidio-Ubicacion"], "pone la etiqueta de la acción")
ok(not any("asesor te atiende" in cuerpo(m) for m in ENV), "el paso «pasar a asesor» no corre desde el chat")

cliente()
r = receptor.herramienta({"lead": 9, "tipo": "accion", "ref": "999", "usuario": ASESORA})
ok(not r["ok"] and not ENV, "una acción que ya no está activa no envía nada")

# RB-09: flujo → el bot hace el tramo
cliente(pausa=False, volver_a={"usuario": ASESORA, "hasta": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()})
r = receptor.herramienta({"lead": 9, "tipo": "flujo", "ref": f"bot:{DESPACHO}", "usuario": ASESORA})
ok(r["ok"] and ENV and "Cómo recibes" in cuerpo(ENV[0]), "«Bot Datos de despacho» arranca en su inicio")
ok(CAMBIOS.get("bot_id") == DESPACHO and CAMBIOS.get("paso_menu") == "D1", "el cliente queda en ese bot, esperando su respuesta")
ok(CAMBIOS.get("estado_bot", {}).get("volver_a", {}).get("usuario") == ASESORA, "se conserva a quién volver mientras el bot trabaja")
ok(GUARDADOS and GUARDADOS[0][0][1] == "bot", "los mensajes del flujo salen como del bot")

# RB-09b: cuando el bot pasa a asesor, vuelve a quien lo disparó
cliente(pausa=False, volver_a={"usuario": ASESORA, "hasta": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()})
st = receptor.cargar_estado(db.lead("x"))
st["pausa"] = True
receptor.guardar_estado(db.lead("x"), st, "", None, del_cliente=False)
ok(CAMBIOS.get("estado_chat") == "asignada" and CAMBIOS.get("asignado_a") == ASESORA, "«Vuelve a mí»: el chat vuelve al asesor, no a la cola")
ok("volver_a" not in CAMBIOS.get("estado_bot", {}), "y se borra el «vuelve a mí» (una sola vez)")

cliente(pausa=False, volver_a={"usuario": ASESORA, "hasta": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()})
st = receptor.cargar_estado(db.lead("x"))
st["pausa"] = True
receptor.guardar_estado(db.lead("x"), st, "", None, del_cliente=False)
ok("estado_chat" not in CAMBIOS, "vencidas las 24 h, pasa a la cola como siempre")

cliente(pausa=False)
st = receptor.cargar_estado(db.lead("x"))
st["pausa"] = True
receptor.guardar_estado(db.lead("x"), st, "", None, del_cliente=False)
ok("estado_chat" not in CAMBIOS, "sin «vuelve a mí» (o con «sigue el bot»), pasa a la cola como siempre")

cliente(pausa=False, volver_a={"usuario": ASESORA, "hasta": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()})
st = receptor.cargar_estado(db.lead("x"))
receptor.guardar_estado(db.lead("x"), st, "hola", None)
ok(CAMBIOS.get("estado_bot", {}).get("volver_a"), "mientras el bot sigue el tramo, el «vuelve a mí» no se pierde")

print(f"\n{n - fallos}/{n} en verde")
sys.exit(1 if fallos else 0)

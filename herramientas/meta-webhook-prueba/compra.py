"""
Flujo de compra sin IA (F4·25, docs/AGENTE.md tramo 2, RAG-19 a RAG-22).

«Quiero comprar <código>» (acción con el paso «Iniciar flujo de compra») → el equipo (el código escrito o el de la última
ficha) → distribuidor o cliente final → resumen con el total → cuentas con el texto aprobado → Esperando pago →
comprobante (foto, PDF o «ya pagué») → Pago por confirmar y el chat pasa al asesor. Cancelar con «ya no quiero».
Si en 12 h no hay respuesta, el reloj manda «¿Sigues interesado?».

El estado va en st["compra"] (se guarda en leads.estado_bot). Mientras hay compra, st["nodo"] es "COMPRA".
Precios: siempre los de la tabla productos; el cargo de configuración y los textos salen de agente_config.
"""

import re
from datetime import datetime, timedelta, timezone

import db
import flujo

NODO = "COMPRA"
PAGO = re.compile(r"\b(ya (te )?(pague|transferi|consigne|hice (el|la) (pago|transferencia))|listo el pago|pago (hecho|realizado)|"
                  r"comprobante|te (envio|mando) el (pago|comprobante)|transferencia (hecha|realizada|lista))\b")
CANCELA = re.compile(r"\b(no (lo )?quiero|ya no|cancel\w*|no me interesa|mejor no|desisto)\b")
SALIR = ("0", "menu", "menú", "inicio")


def _cfg():
    return db.agente_config() or {}


def _n(texto):
    return flujo.normalizar_condicion(texto)


def activa(st):
    return bool((st.get("compra") or {}).get("paso"))


def _limpiar(st):
    st.pop("compra", None)
    st.pop("espera_hasta", None)
    if st.get("nodo") == NODO:
        st["nodo"] = None


def _es_distribuidor(lead):
    etiquetas = (lead or {}).get("etiquetas") or []
    return "Interes-Distribuidor" in etiquetas


def _producto_por_codigo(cod):
    return next((p for p in flujo.inventario() if p["cod"] and p["cod"].upper() == str(cod).upper()), None)


def _resumen(c):
    lineas = [f"🛒 *Resumen de tu compra*", f"💻 {c['equipo']} · Código {c['codigo']}", f"💰 Precio: {flujo.cop(c['precio'])}"]
    if c["tipo"] == "cliente_final" and c["cargo"]:
        lineas.append(f"🔧 Configuración: {flujo.cop(c['cargo'])}")
    lineas += [f"*Total: {flujo.cop(c['total'])}*", "", "¿Te envío los datos para pagar?"]
    return "\n".join(lineas)


def _pedir_tipo(st):
    st["compra"]["paso"] = "tipo"
    return [flujo.m_botones("¿Compras como *distribuidor* o como *cliente final*?",
                            [("compra-distribuidor", "Distribuidor"), ("compra-final", "Cliente final")])]


def _confirmar(st):
    c = st["compra"]
    cargo = int(float(_cfg().get("cargo_configuracion") or 0)) if c["tipo"] == "cliente_final" else 0
    c.update(cargo=cargo, total=c["precio"] + cargo, paso="confirmar")
    st["valor"] = c["total"]
    st["campos"].update({"Código producto": c["codigo"], "Valor estimado": flujo.cop(c["total"])})
    return [flujo.m_botones(_resumen(c), [("compra-si", "Sí, enviar cuentas"), ("compra-asesor", "Hablar con asesor"),
                                          ("compra-cancelar", "Cancelar")])]


def _con_equipo(st, p, lead):
    """Ya se sabe el equipo: comprueba stock y sigue con el tipo de cliente o el resumen."""
    st["compra"].update(codigo=p["cod"], equipo=f"{p['marca']} {p['modelo']}".strip(), precio=p["precio"])
    if _es_distribuidor(lead):
        st["compra"]["tipo"] = "distribuidor"
    if not st["compra"].get("tipo"):
        return _pedir_tipo(st)
    return _confirmar(st)


def _asesor(st, motivo=None):
    """Pasa al asesor con el aviso de horario del cuadro asesor; la compra queda anotada para el asesor."""
    return flujo.asesor(st, etiqueta="Escalado-Asesor", motivo=motivo)


def iniciar(st, texto, lead=None):
    """Lo llama la acción «Quiero comprar» (RAG-19). Devuelve (mensajes, nota) o None si no hay nada que hacer."""
    st["compra"] = {"paso": "codigo", "desde": datetime.now(timezone.utc).isoformat()}
    st["nodo"] = NODO
    st.pop("espera_hasta", None)
    p = flujo.buscar_codigo(texto)
    if not p and (st.get("campos") or {}).get("Código producto"):  # el de la última ficha que vio
        p = _producto_por_codigo(st["campos"]["Código producto"])
    if not p and (lead or {}).get("cotiz_producto"):
        p = _producto_por_codigo(lead["cotiz_producto"])
    if p:
        return _con_equipo(st, p, lead)
    if re.search(r"\d{3}-\d{3}", texto) or re.search(r"\bpu-?\d+", texto.lower()):
        _limpiar(st)  # escribió un código que ya no está disponible
        return [flujo.m_botones("😕 Ese equipo ya no está disponible. ¿Te muestro otros o prefieres hablar con un asesor?",
                                [("0", "Ver equipos"), ("9", "Hablar con asesor")])]
    return [flujo.m_texto("🛒 ¡Perfecto! ¿Cuál es el *código* del equipo que quieres comprar? Lo ves en la ficha "
                          "(por ejemplo 100-102-1030-1).")]


def responder(st, entrada, tipo="text", lead=None):
    """Mensaje del cliente con una compra en curso. Devuelve (mensajes, etiquetas, paso_embudo, nota) o None si el mensaje
    debe seguir por el menú (el cliente salió de la compra). `tipo` es "media" si mandó foto, PDF u otro archivo."""
    st.setdefault("bot", None)
    if st["bot"] is None:
        st["bot"] = db.principal()
    flujo._hilo.bot, flujo._hilo.saltos = st["bot"], 0  # el paso a asesor usa los cuadros del bot del cliente
    try:
        return _responder(st, entrada, tipo, lead)
    finally:
        flujo._hilo.bot, flujo._hilo.saltos = None, 0


def _responder(st, entrada, tipo, lead):
    c = st["compra"]
    paso = c.get("paso")
    n = _n(entrada) if tipo != "media" else ""
    cfg = _cfg()

    # «asesor» en cualquier paso: al asesor, con la compra anotada (RAG-04).
    if entrada in ("9", "compra-asesor") or re.search(r"\basesor\b", n):
        nota = (f"🛒 Compra en curso ({paso}): {c.get('equipo') or 'equipo sin elegir'} ({c.get('codigo') or 'sin código'})"
                + (f" · total {flujo.cop(c['total'])}" if c.get("total") else "") + ". El cliente pidió asesor.")
        _limpiar(st)
        return _asesor(st), [], None, nota

    if tipo == "media" and paso != "esperando_pago":  # una foto o audio antes de las cuentas: al asesor, como siempre
        nota = f"🛒 Compra en curso ({paso}): el cliente mandó un archivo antes de recibir las cuentas."
        _limpiar(st)
        return _asesor(st), [], None, nota

    if paso == "esperando_pago":
        # RAG-20: comprobante → Pago por confirmar y al asesor (sin IA, nadie confirma el pago solo).
        if tipo == "media" or PAGO.search(n):
            nota = (f"🛒 Compra: {c.get('equipo')} ({c.get('codigo')}) · "
                    f"{'distribuidor' if c.get('tipo') == 'distribuidor' else 'cliente final'} · total {flujo.cop(c.get('total', 0))} · "
                    f"comprobante recibido {datetime.now(flujo.BOGOTA):%d/%m %H:%M}. Verificar transferencia y datos de envío.")
            _limpiar(st)
            st["campos"]["Etiqueta"] = "Pago-Por-Confirmar"
            despues = cfg.get("compra_bot_despues")
            if despues and db.flujo(despues):  # RF-28 (F4·34): sigue en un bot del lienzo (datos de despacho) y ese termina en el asesor
                return flujo.cambiar_de_bot(st, despues), ["Pago-Por-Confirmar"], "pago_por_confirmar", nota
            st["pausa"], st["nodo"] = True, flujo.del_tipo("asesor")
            texto = (cfg.get("texto_comprobante") or "✅ Recibimos tu comprobante. Un asesor valida tu pago y te confirma por aquí.").strip()
            return [flujo.m_texto(texto)], ["Pago-Por-Confirmar"], "pago_por_confirmar", nota
        if CANCELA.search(n):
            _limpiar(st)
            texto = (cfg.get("texto_cancelacion") or "Entendido. Si cambias de opinión, escríbenos.").strip()
            return [flujo.m_texto(texto)], ["Compra-Cancelada"], "cancelada", f"🛒 Compra cancelada por el cliente: {c.get('codigo')}."
        # Otra cosa (datos de envío, una pregunta): se anota para el asesor y se recuerda el comprobante una sola vez.
        st["espera_hasta"] = (datetime.now(timezone.utc) + timedelta(hours=int(cfg.get("horas_sin_respuesta") or 12))).isoformat()
        nota = f"🛒 Mientras espera el pago, el cliente escribió: {entrada[:300]}"
        if c.get("recordado"):
            return [], [], None, nota
        c["recordado"] = True
        return [flujo.m_texto("✅ Anotado. Cuando hagas el pago, envíanos el *comprobante* por aquí. Si tienes una duda, escribe *asesor*.")], [], None, nota

    # Antes de enviar las cuentas el cliente puede salir de la compra.
    if n in SALIR or entrada in ("0", "compra-cancelar") or CANCELA.search(n):
        _limpiar(st)
        if entrada == "compra-cancelar" or CANCELA.search(n):
            return [flujo.m_texto((cfg.get("texto_cancelacion") or "Entendido.").strip())], ["Compra-Cancelada"], None, None
        return None  # «0» o «menú»: sigue por el menú
    if paso == "codigo":
        p = flujo.buscar_codigo(entrada)
        if p:
            return _con_equipo(st, p, lead), [], None, None
        return [flujo.m_texto("No encuentro ese código en los equipos disponibles. Escríbelo como sale en la ficha "
                              "(por ejemplo 100-102-1030-1), o escribe *asesor*.")], [], None, None

    if paso == "tipo":
        if entrada == "compra-distribuidor" or "distribuidor" in n:
            c["tipo"] = "distribuidor"
        elif entrada == "compra-final" or "final" in n or "cliente" in n:
            c["tipo"] = "cliente_final"
        else:
            return _pedir_tipo(st), [], None, None
        return _confirmar(st), [], None, None

    if paso == "confirmar":
        if entrada == "compra-si" or n in ("si", "1", "dale", "listo", "ok", "de una") or n.startswith("si "):
            cuentas = (cfg.get("texto_cuentas") or "").strip()
            if not cuentas:  # RAG-09: sin texto aprobado, las cuentas las envía un asesor
                nota = f"🛒 Confirmó la compra de {c['equipo']} ({c['codigo']}) por {flujo.cop(c['total'])}. Falta enviarle las cuentas."
                _limpiar(st)
                return _asesor(st, motivo="Un asesor te envía los datos para pagar."), ["Compra-Iniciada"], "esperando_pago", nota
            c["paso"] = "esperando_pago"
            c["cuentas_en"] = datetime.now(timezone.utc).isoformat()
            st["espera_hasta"] = (datetime.now(timezone.utc) + timedelta(hours=int(cfg.get("horas_sin_respuesta") or 12))).isoformat()
            nota = f"🛒 Cuentas enviadas: {c['equipo']} ({c['codigo']}) · total {flujo.cop(c['total'])}. Esperando comprobante."
            return [flujo.m_texto(cuentas)], ["Compra-Iniciada"], "esperando_pago", nota
        return _confirmar(st), [], None, None

    _limpiar(st)  # estado desconocido: se sale sin romper nada
    return None


def tiempo_cumplido(st):
    """RAG-22: pasaron las horas sin respuesta esperando el pago. Un solo recordatorio; la compra sigue abierta."""
    st.pop("espera_hasta", None)
    texto = (_cfg().get("texto_sigue_interesado") or "👋 ¿Sigues interesado en el equipo?").strip()
    return [flujo.m_texto(texto)]

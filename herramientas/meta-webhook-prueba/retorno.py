"""
Retorno del bot tras el asesor y «¿Sigues necesitando ayuda?» (F4·45, decisión 0035, docs/SEGUIMIENTOS-Y-SLA.md RT-01 a RT-10).

Quién recibe el mensaje lo decide la base (retorno_candidatos, migración 0049): aquí se arma el mensaje con sus botones y se atiende
lo que el cliente responde. Regla A: el cliente quedó callado → «¿Sigues necesitando ayuda?» (Sí, continuar · Hablar con asesor ·
Ya no, gracias). Regla B: el asesor no respondió → mensaje de demora (Sí, sigue tú · Espero al asesor). «Sí» devuelve el chat al bot
(si la casilla está encendida) y lo lleva al destino configurado.
"""

import db
import flujo

SI, ASESOR, NO, ESPERA = "ret-si", "ret-asesor", "ret-no", "ret-espera"
IDS = (SI, ASESOR, NO, ESPERA)


def _cfg():
    return db.retorno_config()


def mensaje(regla, nombre, cfg=None):
    """El mensaje automático de la regla A o B, con sus botones. {nombre} es el primer nombre del cliente (o se quita)."""
    cfg = cfg or _cfg()
    primero = (nombre or "").strip().split(" ")[0]
    if regla == "A":
        texto = cfg.get("a_texto") or "¿Sigues necesitando ayuda?"
        botones = [(SI, cfg.get("a_boton_si") or "Sí, continuar"), (ASESOR, cfg.get("a_boton_asesor") or "Hablar con asesor"),
                   (NO, cfg.get("a_boton_no") or "Ya no, gracias")]
    else:
        texto = cfg.get("b_texto") or "Disculpa la demora 🙏"
        botones = [(SI, cfg.get("b_boton_si") or "Sí, sigue tú"), (ESPERA, cfg.get("b_boton_espera") or "Espero al asesor")]
    texto = texto.replace("{nombre}", primero) if primero else texto.replace(" {nombre}", "").replace("{nombre}", "")
    return flujo.m_botones(texto.strip(), botones)


def es_respuesta(entrada, lead, cfg=None):
    """¿Este mensaje del cliente contesta el mensaje automático? Los botones siempre; la palabra (RT-05.1) solo si hay uno pendiente."""
    if entrada in IDS:
        return True
    cfg = cfg or _cfg()
    palabra = flujo.normalizar(cfg.get("palabra") or "")
    return bool(lead.get("retorno_pendiente") and palabra and flujo.normalizar(entrada) == palabra)


def responder(st, entrada, lead, cfg=None):
    """Atiende la respuesta al mensaje automático. Devuelve (mensajes, detalle para el historial)."""
    cfg = cfg or _cfg()
    eleccion = entrada if entrada in IDS else SI  # la palabra «continuar» vale como «Sí»
    if eleccion == NO:
        st["campos"]["Etiqueta"] = "No-Interesado"
        return [flujo.m_texto(cfg.get("texto_no") or "¡Gracias por escribirnos! 🙌")], "El cliente respondió «Ya no, gracias»"
    if eleccion == ESPERA:
        return [flujo.m_texto(cfg.get("texto_espera") or "👍 Un asesor te escribe pronto.")], "El cliente prefiere esperar al asesor"
    if eleccion == ASESOR:
        if st["pausa"]:  # ya está con un asesor: no se vuelve a meter a la cola
            return [flujo.m_texto(cfg.get("texto_espera") or "👍 Un asesor te escribe pronto.")], "El cliente pidió un asesor (ya estaba con uno)"
        return _con_bot(st, lambda: flujo.asesor(st, etiqueta="Escalado-Asesor")), "El cliente pidió un asesor"
    # «Sí»: con asesor, vuelve al bot si la casilla lo permite (RT-05.1) y va al destino (RT-06); con el bot, sigue donde iba.
    if st["pausa"]:
        if not cfg.get("volver_respuesta", True):
            return [flujo.m_texto(cfg.get("texto_espera") or "👍 Un asesor te escribe pronto.")], "El cliente quiso seguir con el bot (casilla apagada)"
        st["pausa"] = False
        st["errores"] = 0
        destino = db.retorno_destino(st.get("etapa"))
        return _con_bot(st, lambda: flujo.cambiar_de_bot(st, destino)), "Volvió al bot: el cliente respondió «Sí»"
    return _con_bot(st, lambda: flujo.ir(st, st["nodo"]) if st.get("nodo") else flujo.al_principal(st)), "El cliente siguió con el bot"


def _con_bot(st, hacer):
    """Corre el motor del lienzo con el bot del cliente, como flujo.responder."""
    st.setdefault("bot", None)
    if st["bot"] is None:
        st["bot"] = db.principal()
    flujo._hilo.bot, flujo._hilo.saltos = st["bot"], 0
    try:
        return hacer()
    finally:
        flujo._hilo.bot, flujo._hilo.saltos = None, 0

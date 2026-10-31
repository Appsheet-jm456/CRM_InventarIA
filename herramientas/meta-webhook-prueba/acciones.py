"""
Acciones «Cuando → Hacer» (F4·24, docs/AGENTE.md, RAG-23 a RAG-26).

Reglas que arma el administrador en Configuración → Agente → Acciones: cuando el cliente escribe algo, hacer algo.
Se revisan antes que el menú y que el agente, no usan IA y responden al instante. Gana la primera acción activa que
coincide (por prioridad); «Pasar a asesor» es siempre la primera.

Pasos que se ejecutan hoy: texto, conocimiento (fichas activas de una categoría), cuentas (texto aprobado), ir a otro
bot, etiqueta, pasar a asesor e iniciar los flujos de compra (F4·25) y cotización (F4·26).
"""

import re

import compra
import cotizacion
import db
import flujo

PASOS_LISTOS = {"texto", "conocimiento", "cuentas", "bot", "etiqueta", "asesor", "flujo"}
FLUJOS_LISTOS = {"compra", "cotizacion"}


def normalizar(s):
    """Igual que las condiciones del lienzo (RF-10): minúsculas, sin tildes, sin signos y con un solo espacio."""
    return flujo.normalizar_condicion(s)


def cumple(condicion, n):
    """RAG-23. «contiene» busca la frase al inicio de una palabra: «devolucion» también encuentra «devoluciones», pero
    «cambio» no se dispara con «intercambio»."""
    texto = normalizar(condicion.get("texto", ""))
    if not texto:
        return False
    forma = condicion.get("forma", "contiene")
    if forma == "igual":
        return n == texto
    if forma == "empieza":
        return n == texto or n.startswith(texto + " ")
    return re.search(rf"(?:^|\s){re.escape(texto)}\w*(?:\s|$)", n) is not None


def lista(accion):
    """Una acción se ejecuta solo si todos sus pasos ya existen."""
    pasos = accion.get("hacer") or []
    return bool(pasos) and all(p.get("tipo") in PASOS_LISTOS and (p.get("tipo") != "flujo" or p.get("flujo") in FLUJOS_LISTOS)
                               for p in pasos)


def ganadora(texto, acciones=None):
    """La primera acción activa (por prioridad) que coincide con lo que escribió el cliente, o None."""
    n = normalizar(texto)
    if not n:
        return None
    for a in acciones if acciones is not None else db.acciones_activas():
        if any(cumple(c, n) for c in a.get("cuando") or []) and lista(a):
            return a
    return None


def _texto(plantilla, lead):
    nombre = ((lead or {}).get("nombre") or "").split(" ")[0]
    return plantilla.replace("{horario}", flujo.texto_horario()).replace("{nombre}", nombre or "").strip()


def ejecutar(accion, st, lead=None, fresco=False, texto=""):
    """Corre los pasos de la acción. Devuelve (mensajes, st, etiquetas) o None si no hubo nada que enviar (por ejemplo,
    la categoría no tiene fichas activas): entonces el mensaje sigue su camino normal por el menú.

    `fresco` lee conocimiento y configuración sin caché (para «Probar» desde la pantalla)."""
    st.setdefault("bot", None)
    if st["bot"] is None:
        st["bot"] = db.principal()
    # Los pasos «asesor» e «ir a otro bot» usan los cuadros del bot en el que va el cliente, como flujo.responder.
    flujo._hilo.bot, flujo._hilo.saltos = st["bot"], 0
    try:
        return _ejecutar(accion, st, lead, fresco, texto)
    finally:
        flujo._hilo.bot, flujo._hilo.saltos = None, 0


def _ejecutar(accion, st, lead, fresco, texto):
    mensajes, etiquetas = [], []
    for paso in accion.get("hacer") or []:
        tipo = paso.get("tipo")
        if tipo == "texto" and paso.get("texto", "").strip():
            mensajes.append(flujo.m_texto(_texto(paso["texto"], lead)))
        elif tipo == "conocimiento":
            for f in db.conocimiento(paso.get("categoria", ""), fresco):
                if f.get("respuesta", "").strip():
                    mensajes.append(flujo.m_texto(_texto(f["respuesta"], lead)))
                if f.get("archivo"):
                    mensajes.append({"_conocimiento": {"archivo": f["archivo"], "titulo": f["titulo"]}})
        elif tipo == "cuentas":
            cuentas = (db.agente_config(fresco).get("texto_cuentas") or "").strip()
            if cuentas:  # sin texto aprobado no se inventa nada (RAG-09)
                mensajes.append(flujo.m_texto(cuentas))
        elif tipo == "etiqueta" and paso.get("etiqueta", "").strip():
            etiquetas.append(paso["etiqueta"].strip())
        elif tipo == "bot" and paso.get("bot_id"):
            mensajes += flujo.cambiar_de_bot(st, int(paso["bot_id"]))
        elif tipo == "flujo" and paso.get("flujo") == "compra":  # F4·25: el flujo sigue con los próximos mensajes
            mensajes += compra.iniciar(st, texto, lead)
        elif tipo == "flujo" and paso.get("flujo") == "cotizacion":  # F4·26
            mensajes += cotizacion.iniciar(st, texto, lead)
        elif tipo == "asesor":
            mensajes += flujo.asesor(st, etiqueta="Escalado-Asesor", motivo=(paso.get("texto") or "").strip() or None)
    if not mensajes and not st.get("pausa"):
        return None
    return mensajes, st, etiquetas


def responder(st, texto, lead=None):
    """Para el receptor: (accion, mensajes, st, etiquetas) si una acción atendió el mensaje; None si no.
    No corre con el chat en manos de un asesor (RAG-25): el asesor manda."""
    if st.get("pausa"):
        return None
    a = ganadora(texto)
    if not a:
        return None
    r = ejecutar(a, st, lead, texto=texto)
    if r is None:
        return None
    mensajes, st, etiquetas = r
    return a, mensajes, st, etiquetas


def probar(texto, acciones=None):
    """«Probar con una frase» de la pantalla (RAG-26): qué acción gana y qué se enviaría, sin escribir ni enviar.
    Revisa también las apagadas para decir cuál ganaría si estuviera activa."""
    todas = acciones if acciones is not None else db.acciones_todas()
    activas = [a for a in todas if a.get("activa")]
    a = ganadora(texto, activas)
    if not a:
        apagada = ganadora(texto, [x for x in todas if not x.get("activa")])
        return {"accion": None, "apagada": apagada and {"id": apagada["id"], "nombre": apagada["nombre"]}, "mensajes": []}
    st = flujo.estado_vacio()
    r = ejecutar(a, st, None, fresco=True, texto=texto)
    mensajes = r[0] if r else []
    return {"accion": {"id": a["id"], "nombre": a["nombre"]}, "apagada": None, "vacia": r is None,
            "mensajes": [m if "_conocimiento" not in m else {"type": "archivo", "archivo": m["_conocimiento"]["archivo"],
                                                              "titulo": m["_conocimiento"]["titulo"]} for m in mensajes],
            "etiquetas": r[2] if r else []}

"""
Flujo de cotización sin IA (F4·26, docs/AGENTE.md, RAG-27 y RAG-28).

Acción con el paso «Iniciar flujo de cotización» → nombre → cédula → celular (por defecto el de WhatsApp) → equipo (el
escrito, el de la última ficha o lo pide) → cantidad (hasta el stock) → distribuidor o cliente final → PDF con las
reglas del negocio (precio de la base; cliente final + configuración por equipo; tarjeta + recargo como opción;
validez) → se guarda en cotizaciones, se envía por WhatsApp y el cliente pasa a la etapa Cotización.

El estado va en st["cotizacion"] (leads.estado_bot). Mientras dura, st["nodo"] es "COTIZACION".
"""

import re
from datetime import datetime, timedelta, timezone

import db
import flujo
import pdf_cotizacion

NODO = "COTIZACION"
SALIR = ("0", "menu", "inicio", "cancelar", "cancela", "ya no", "no quiero")


def _cfg():
    return db.agente_config() or {}


def activa(st):
    return bool((st.get("cotizacion") or {}).get("paso"))


def _limpiar(st):
    st.pop("cotizacion", None)
    if st.get("nodo") == NODO:
        st["nodo"] = None


def _celular_de(telefono):
    t = re.sub(r"\D", "", str(telefono or ""))
    if len(t) == 12 and t.startswith("57"):
        t = t[2:]
    return t if re.fullmatch(r"3\d{9}", t) else None


def _producto_por_codigo(cod):
    return next((p for p in flujo.inventario() if p["cod"] and p["cod"].upper() == str(cod).upper()), None)


def _detalle(p):
    return " · ".join(x for x in (p.get("cpu"), p.get("ram"), p.get("disco"), p.get("estado")) if x)


def _pregunta(st):
    """El mensaje del paso en el que va la cotización."""
    c = st["cotizacion"]
    paso = c["paso"]
    if paso == "nombre":
        return [flujo.m_texto("📄 ¡Con gusto te hago la cotización! ¿A nombre de quién la hago? Escribe el *nombre completo*.")]
    if paso == "cedula":
        return [flujo.m_texto("¿Cuál es el número de *cédula o NIT*? (solo números)")]
    if paso == "celular":
        if c.get("celular_sugerido"):
            return [flujo.m_botones(f"¿Te contactamos a este celular? *{c['celular_sugerido']}*",
                                    [("cot-cel-si", "Sí, ese"), ("cot-cel-otro", "Otro número")])]
        return [flujo.m_texto("¿A qué *celular* te contactamos? (10 dígitos, empieza por 3)")]
    if paso == "producto":
        return [flujo.m_texto("¿Qué equipo cotizamos? Escribe el *código* que sale en la ficha (por ejemplo 100-102-1030-1).")]
    if paso == "cantidad":
        return [flujo.m_texto(f"¿Cuántos *{c['equipo']}* necesitas? (hay {c['stock']} disponibles)")]
    if paso == "tipo":
        return [flujo.m_botones("¿La cotización es como *distribuidor* o como *cliente final*?",
                                [("cot-distribuidor", "Distribuidor"), ("cot-final", "Cliente final")])]
    return []


def _siguiente(st, lead):
    """Avanza al primer dato que falta. Si no falta nada, genera la cotización."""
    c = st["cotizacion"]
    for paso in ("nombre", "cedula", "celular", "producto", "cantidad", "tipo"):
        if c.get(paso) is None:
            c["paso"] = paso
            return _pregunta(st), [], None, None
    return _generar(st, lead)


def iniciar(st, texto, lead=None):
    """Lo llama la acción de cotización. Devuelve los mensajes."""
    st["cotizacion"] = {"paso": "nombre", "nombre": None, "cedula": None, "celular": None, "producto": None,
                        "cantidad": None, "tipo": None, "celular_sugerido": _celular_de((lead or {}).get("telefono"))}
    st["nodo"] = NODO
    p = flujo.buscar_codigo(texto)
    if not p and (st.get("campos") or {}).get("Código producto"):  # el de la última ficha
        p = _producto_por_codigo(st["campos"]["Código producto"])
    if p:
        st["cotizacion"].update(producto=p["cod"], equipo=f"{p['marca']} {p['modelo']}".strip(), stock=int(p.get("stock") or 1))
    if "Interes-Distribuidor" in ((lead or {}).get("etiquetas") or []):
        st["cotizacion"]["tipo"] = "distribuidor"
    return _siguiente(st, lead)[0]


def responder(st, entrada, tipo="text", lead=None):
    """Mensaje del cliente con una cotización en curso. Devuelve (mensajes, etiquetas, paso_embudo, nota) o None si debe
    seguir por el menú."""
    st.setdefault("bot", None)
    if st["bot"] is None:
        st["bot"] = db.principal()
    flujo._hilo.bot, flujo._hilo.saltos = st["bot"], 0  # el paso a asesor usa los cuadros del bot del cliente
    try:
        return _responder(st, entrada, tipo, lead)
    finally:
        flujo._hilo.bot, flujo._hilo.saltos = None, 0


def _responder(st, entrada, tipo, lead):
    c = st["cotizacion"]
    n = flujo.normalizar_condicion(entrada) if tipo != "media" else ""

    if tipo == "media" or entrada in ("9",) or re.search(r"\basesor\b", n):
        nota = f"📄 Cotización sin terminar (iba en {c['paso']}). El cliente pidió asesor o mandó un archivo."
        _limpiar(st)
        return flujo.asesor(st, etiqueta="Escalado-Asesor"), [], None, nota
    if n in SALIR:
        _limpiar(st)
        if n in ("0", "menu", "inicio"):
            return None
        return [flujo.m_texto("👍 Listo, dejamos la cotización. Si la necesitas después, escribe *cotización*.")], [], None, None

    paso = c["paso"]
    if paso == "nombre":
        nombre = " ".join(entrada.split())[:80]
        if len(nombre) < 3 or not re.search(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}", nombre) or re.search(r"\d{4}", nombre):
            return [flujo.m_texto("Escribe el *nombre completo* (nombre y apellido), por favor.")], [], None, None
        c["nombre"] = nombre.title() if nombre.islower() or nombre.isupper() else nombre
    elif paso == "cedula":
        cedula = re.sub(r"[\s.\-]", "", entrada)
        if not re.fullmatch(r"\d{6,10}", cedula):
            return [flujo.m_texto("La cédula o NIT va con *6 a 10 números*, sin letras. ¿Cuál es?")], [], None, None
        c["cedula"] = cedula
    elif paso == "celular":
        if entrada == "cot-cel-si" or (c.get("celular_sugerido") and n in ("si", "1", "ese", "si ese")):
            c["celular"] = c["celular_sugerido"]
        elif entrada == "cot-cel-otro":
            c["celular_sugerido"] = None
            return _pregunta(st), [], None, None
        else:
            cel = _celular_de(entrada)
            if not cel:
                c["celular_sugerido"] = None
                return [flujo.m_texto("El celular va con *10 dígitos* y empieza por 3 (por ejemplo 3001234567).")], [], None, None
            c["celular"] = cel
    elif paso == "producto":
        p = flujo.buscar_codigo(entrada)
        if not p:
            return [flujo.m_texto("No encuentro ese código en los equipos disponibles. Escríbelo como sale en la ficha, o "
                                  "escribe *asesor*.")], [], None, None
        c.update(producto=p["cod"], equipo=f"{p['marca']} {p['modelo']}".strip(), stock=int(p.get("stock") or 1))
    elif paso == "cantidad":
        m = re.search(r"\d+", entrada)
        cantidad = int(m.group()) if m else {"uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5}.get(n, 0)
        if cantidad < 1:
            return [flujo.m_texto("Escribe la *cantidad* en números (por ejemplo 1).")], [], None, None
        if cantidad > c["stock"]:
            return [flujo.m_texto(f"Solo hay *{c['stock']}* disponibles de este equipo. ¿Cuántos cotizamos?")], [], None, None
        c["cantidad"] = cantidad
    elif paso == "tipo":
        if entrada == "cot-distribuidor" or "distribuidor" in n:
            c["tipo"] = "distribuidor"
        elif entrada == "cot-final" or "final" in n or "cliente" in n:
            c["tipo"] = "cliente_final"
        else:
            return _pregunta(st), [], None, None
    return _siguiente(st, lead)


def _generar(st, lead):
    """RAG-27 y RAG-28: precio de la base al momento de cotizar; sin stock no se cotiza."""
    c = st["cotizacion"]
    p = _producto_por_codigo(c["producto"])
    if not p:
        _limpiar(st)
        return [flujo.m_botones("😕 Ese equipo se acaba de agotar, así que no lo puedo cotizar. ¿Te muestro otros o prefieres un asesor?",
                                [("0", "Ver equipos"), ("9", "Hablar con asesor")])], [], None, None
    cfg = _cfg()
    cantidad = min(int(c["cantidad"]), int(p.get("stock") or c["cantidad"]))
    precio = int(p["precio"])
    subtotal = precio * cantidad
    cargos = []
    cargo = int(float(cfg.get("cargo_configuracion") or 0))
    if c["tipo"] == "cliente_final" and cargo:
        cargos.append({"concepto": f"Configuración ({cantidad} × {flujo.cop(cargo)})", "valor": cargo * cantidad})
    total = subtotal + sum(x["valor"] for x in cargos)
    valida = datetime.now(timezone.utc) + timedelta(hours=int(cfg.get("validez_cotizacion_h") or 24))
    fila = {"lead_id": (lead or {}).get("id"), "nombre": c["nombre"], "cedula": c["cedula"], "celular": c["celular"],
            "tipo_cliente": c["tipo"], "items": [{"codigo": p["cod"], "nombre": f"{p['marca']} {p['modelo']}".strip(),
                                                    "detalle": _detalle(p), "cantidad": cantidad, "precio": precio}],
            "subtotal": subtotal, "cargos": cargos, "total": total, "valida_hasta": valida.isoformat()}
    guardada = db.crear_cotizacion(fila)
    apariencia, logo, mime = db.apariencia_para_pdf()
    pdf = pdf_cotizacion.generar(dict(fila, consecutivo=guardada["consecutivo"],
                                      valida_hasta=valida.astimezone(flujo.BOGOTA).replace(tzinfo=None)),
                                 apariencia, logo, mime, float(cfg.get("recargo_tarjeta_pct") or 0))
    ruta = f"cotizaciones/{guardada['consecutivo']}.pdf"
    db.guardar_pdf_cotizacion(guardada["id"], ruta, pdf)
    numero = pdf_cotizacion.numero(guardada["consecutivo"])

    _limpiar(st)
    st["valor"] = total
    st["campos"].update({"Código producto": p["cod"], "Valor estimado": flujo.cop(total)})
    flujo.etapa(st, "Cotización")
    nota = (f"📄 Cotización {numero}: {cantidad} × {p['marca']} {p['modelo']} ({p['cod']}) · "
            f"{'distribuidor' if c['tipo'] == 'distribuidor' else 'cliente final'} · total {flujo.cop(total)} · "
            f"{c['nombre']}, CC {c['cedula']}, cel {c['celular']}.")
    mensajes = [{"_cotizacion": {"ruta": ruta, "numero": numero}},
                flujo.m_texto(f"📄 Te envié la cotización *{numero}* por *{flujo.cop(total)}*, válida por "
                              f"{int(cfg.get('validez_cotizacion_h') or 24)} horas o hasta agotar existencias.\n\n"
                              "Si quieres comprar, escribe *quiero comprar*. 🙌")]
    return mensajes, ["Cotizacion-Enviada"], None, nota

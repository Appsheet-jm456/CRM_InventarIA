"""
Agente Avi (F4·28, decisión 0032, docs/AGENTE.md): conversa con el cliente, usa herramientas del sistema y pasa al asesor.

El modelo nunca escribe precios, stock ni cuentas de pago por su cuenta (RAG-01, RAG-02, RAG-09): los datos salen de herramientas,
y antes de enviar se revisa la respuesta. Habla con cualquier proveedor porque las herramientas se piden en JSON dentro del texto
(no con el formato de herramientas de un proveedor): {"herramienta": "...", "args": {...}} o {"responder": "..."}.

Entra solo con un cliente con texto escrito, en un bot en modo Agente, con el agente encendido para ese número y sin asesor en el chat.
Si el modelo no responde, devuelve None y atiende el modo Híbrido (RAG-10); si se acabó el presupuesto, ofrece asesor (RAG-17).
"""

import json
import re

import cerebro
import compra
import cotizacion
import db
import flujo
import interprete

TONOS = {"amigable": "amigable, cálida y cercana", "cercano": "cercana y natural, sin formalismos", "formal": "formal y respetuosa"}
EMOJIS = {"si": "Usa emojis con naturalidad.", "pocos": "Usa pocos emojis, solo cuando aporten.", "no": "No uses emojis."}
TRATO = {"tu": "Háblale de tú.", "usted": "Háblale de usted."}
LARGO = {"corto": "Respuestas cortas: una a tres frases.", "medio": "Respuestas de tamaño medio, sin párrafos largos."}

HERRAMIENTAS = {
    "buscar_productos": 'Busca portátiles con stock. args: {"marca":"", "procesador":"i5", "generacion":10, "ram_gb":16, "precio_max":1500000, "uso":"Diseño"} (todos opcionales). '
                        "Devuelve código, equipo, especificaciones, precio y stock reales.",
    "ficha_producto": 'Envía al cliente la ficha con foto de un equipo. args: {"codigo":"100-102-1030-1"}.',
    "buscar_conocimiento": 'Busca en las preguntas frecuentes, políticas y documentos del negocio. args: {"pregunta":"..."}.',
    "enviar_catalogo": 'Envía el catálogo en PDF o el enlace con todos los equipos. args: {"marca":""} (opcional).',
    "mover_etapa": 'Avanza al cliente en el embudo cuando corresponda: "En Conversación" (ya dijo qué busca) o "Cotización" (pidió precio de un equipo concreto). args: {"etapa":"..."}. Nunca retrocede.',
    "crear_seguimiento": 'Deja un recordatorio a un asesor para escribirle al cliente más tarde. args: {"que":"Llamar para confirmar el equipo", "horas":24}.',
    "capturar_datos": 'Guarda lo que el cliente cuenta. args: {"nombre":"", "ciudad":"", "uso":"", "presupuesto":"", "marca":""} (los que sepas).',
    "iniciar_compra": 'El cliente quiere comprar un equipo: arranca el flujo de compra (confirma total, envía cuentas y pide el comprobante). args: {"codigo":"..."}. Termina tu turno.',
    "iniciar_cotizacion": 'El cliente pide una cotización: arranca el flujo que pide sus datos y genera el PDF. args: {"codigo":"..."}. Termina tu turno.',
    "pasar_a_asesor": 'Pasa el chat a una persona. args: {"motivo":"..."}. Úsala si no sabes, si el cliente lo pide o si hay un reclamo. Termina tu turno.',
}

REGLAS = """REGLAS QUE NO SE PUEDEN CAMBIAR
1. Precios, stock, especificaciones, garantía, envíos y condiciones salen SOLO de las herramientas. Si no las consultaste en este turno, no los digas.
2. Nunca escribas números de cuenta, titulares, cédulas ni llaves de pago. Para pagar o comprar usa iniciar_compra.
3. No prometas descuentos, tiempos de entrega ni garantías que no te haya devuelto buscar_conocimiento.
4. No confirmes pagos. Eso lo hace una persona.
5. Si no sabes algo o el cliente lo pide, usa pasar_a_asesor.
6. Solo vendes portátiles del inventario; no inventes equipos."""

SIN_AVANCE = 3  # RAG-04

PROTOCOLO = """FORMATO DE CADA RESPUESTA (obligatorio): un único objeto JSON, sin texto fuera de él.
- Para usar una herramienta: {"herramienta": "nombre", "args": {...}}
- Para responderle al cliente: {"responder": "texto para WhatsApp"}
Después de una herramienta recibirás su resultado y podrás usar otra o responder."""


# --------------------------------------------------------------------------- #
# Quién atiende
# --------------------------------------------------------------------------- #

def _digitos(s):
    return re.sub(r"\D", "", s or "")


def encendido(config, lead):
    """El agente está encendido para este cliente (RAG-16): para todos, o solo para la lista blanca."""
    estado = config.get("estado")
    if estado == "todos":
        return True
    if estado == "lista_blanca":
        tel = _digitos((lead or {}).get("telefono"))
        return bool(tel) and any(_digitos(n) and tel.endswith(_digitos(n)) for n in config.get("lista_blanca") or [])
    return False


def atiende(st, lead, tipo, entrada, config=None):
    """True si este mensaje lo debe atender Avi. Los números sueltos (0 a 9) son del menú y siguen por él."""
    config = config or db.agente_config()
    if tipo != "text" or st.get("pausa") or not config or not encendido(config, lead):
        return False
    if re.fullmatch(r"\s*\d{1,2}\s*", entrada or "") or not (entrada or "").strip():
        return False
    return db.bot_modo(st.get("bot") or db.principal()) == "agente"


# --------------------------------------------------------------------------- #
# Prompt
# --------------------------------------------------------------------------- #

def sistema(config, lead, st):
    campos = st.get("campos") or {}
    ficha = [f"Nombre: {(lead or {}).get('nombre') or 'no lo sabes todavía'}", f"Etapa: {st.get('etapa') or 'Nuevo'}"]
    for k in ("Uso equipo", "Presupuesto", "Marca interés", "Código producto"):
        if campos.get(k):
            ficha.append(f"{k}: {campos[k]}")
    if (lead or {}).get("etiquetas"):
        ficha.append("Etiquetas: " + ", ".join(lead["etiquetas"]))
    resumen = ((lead or {}).get("resumen_agente") or "").strip()
    herramientas = "\n".join(f"- {n}: {d}" for n, d in HERRAMIENTAS.items() if n not in (config.get("herramientas_apagadas") or []))
    dueno = (config.get("prompt") or "").strip()
    return "\n\n".join(filter(None, [
        f"Eres {config.get('nombre') or 'Avi'}, asesora de ventas por WhatsApp de Ventas Virtuales Colombia (portátiles usados). "
        f"Tu personalidad es {TONOS.get(config.get('tono'), TONOS['amigable'])}. {EMOJIS.get(config.get('emojis'), '')} "
        f"{TRATO.get(config.get('trato'), '')} {LARGO.get(config.get('largo'), '')}",
        REGLAS,
        f"INSTRUCCIONES DEL DUEÑO\n{dueno}" if dueno else "",
        f"HORARIO DE LOS ASESORES\n{flujo.texto_horario()}",
        "EL CLIENTE\n" + "\n".join(ficha),
        f"LO QUE PASÓ EN CONVERSACIONES ANTERIORES\n{resumen}" if resumen else "",
        f"HERRAMIENTAS\n{herramientas}",
        PROTOCOLO,
    ]))


def historial(lead, entrada, cuantos, previo=None):
    """La conversación como mensajes del modelo: lo más reciente al final, roles alternados y empezando por el cliente."""
    if previo is not None:
        crudo = list(previo)
    else:
        crudo = [{"role": "user" if m["lado"] == "cliente" else "assistant", "content": m["texto"]}
                 for m in db.mensajes_recientes(lead["id"], cuantos) if (m.get("texto") or "").strip()]
        if not crudo or crudo[-1]["role"] != "user":  # el receptor ya guardó lo que escribió el cliente (también los juntados por el buffer)
            crudo.append({"role": "user", "content": entrada})
    mezclado = []
    for m in crudo:
        if mezclado and mezclado[-1]["role"] == m["role"]:
            mezclado[-1]["content"] += "\n" + m["content"]
        else:
            mezclado.append(dict(m))
    while mezclado and mezclado[0]["role"] != "user":
        mezclado.pop(0)
    return mezclado


# --------------------------------------------------------------------------- #
# Verificación antes de enviar (RAG-02, RAG-09)
# --------------------------------------------------------------------------- #

_DINERO = re.compile(r"\$\s?\d[\d.,]*|\b\d{1,3}(?:\.\d{3})+\b|\b\d+(?:[.,]\d+)?\s*(?:millones|millón|millon)\b", re.I)


def _a_pesos(t):
    t = t.lower().replace("$", "").strip()
    m = re.match(r"(\d+(?:[.,]\d+)?)\s*mill", t)
    if m:
        return int(round(float(m.group(1).replace(",", ".")) * 1_000_000))
    return int(re.sub(r"\D", "", t) or 0)


def cifras(texto):
    return {_a_pesos(t) for t in _DINERO.findall(texto or "")} - {0}


def revisar(respuesta, permitido, texto_permitido=""):
    """Problemas de una respuesta: precios que no salieron de una herramienta y números largos (cuentas, cédulas)."""
    problemas = []
    for c in sorted(cifras(respuesta) - permitido):
        problemas.append(f"el valor {c:,} no salió de ninguna herramienta".replace(",", "."))
    largos = set(re.findall(r"\d{9,}", re.sub(r"[\s.\-]", "", respuesta or "")))
    for n in largos:
        if n not in re.sub(r"[\s.\-]", "", texto_permitido):
            problemas.append("tiene un número largo (¿cuenta, cédula o teléfono?) que no te dio una herramienta")
            break
    return problemas


# --------------------------------------------------------------------------- #
# Herramientas
# --------------------------------------------------------------------------- #

def _resumen(p):
    return {"codigo": p["cod"], "equipo": f"{p['marca']} {p['modelo']}".strip(), "procesador": p["cpu"], "ram": p["ram"],
            "disco": p["disco"], "estado": p["estado"], "precio": p["precio"], "stock": p["stock"]}


def usar(nombre, args, ctx):
    """Corre una herramienta. Devuelve (resultado, terminal): terminal=True cierra el turno (ya hay mensajes del sistema)."""
    st, lead, sim = ctx["st"], ctx["lead"], ctx["simulador"]
    if nombre in (ctx["config"].get("herramientas_apagadas") or []) or nombre not in HERRAMIENTAS:
        return {"error": f"La herramienta {nombre} no existe o está apagada."}, False
    if nombre == "buscar_productos":
        f = {k: args.get(k) for k in ("marca", "procesador", "generacion", "ram_gb", "precio_max", "uso") if args.get(k)}
        for k in ("generacion", "ram_gb", "precio_max"):
            if k in f:
                try:
                    f[k] = int(re.sub(r"\D", "", str(f[k])))
                except ValueError:
                    f.pop(k)
        todos = flujo.inventario()
        r = interprete.filtrar(todos, f, flujo.es_diseno)
        exactos = bool(r)
        r = (r or interprete.cercanos(todos, f))[:5]
        for p in r:
            ctx["permitido"].add(p["precio"])
        ctx["avance"] = ctx["avance"] or exactos
        return {"coincide_exacto": exactos, "equipos": [_resumen(p) for p in r],
                "nota": "" if r else "No hay equipos con stock que se parezcan."}, False
    if nombre == "ficha_producto":
        p = flujo.buscar_codigo(str(args.get("codigo", "")))
        if not p:
            return {"error": "Ese código no existe o ya no tiene stock."}, False
        ctx["permitido"].add(p["precio"])
        ctx["extra"] += flujo.r11(st, p)
        ctx["avance"] = True
        return {"enviada": True, **_resumen(p)}, False
    if nombre == "buscar_conocimiento":
        trozos = db.buscar_conocimiento(str(args.get("pregunta", ""))[:300])
        for t in trozos:
            if t.get("fuente") == "ficha":  # los precios de los documentos no cuentan (RAG-30)
                ctx["permitido"] |= cifras(t["texto"])
                ctx["texto_permitido"] += " " + t["texto"]
        ctx["trozos"] += [{"fuente": t.get("fuente"), "id": t.get("id"), "titulo": t.get("titulo")} for t in trozos]
        return {"resultados": [{"fuente": t.get("fuente"), "titulo": t.get("titulo"), "texto": t["texto"][:900]} for t in trozos]
                or "No hay información del negocio sobre eso: pásalo a un asesor."}, False
    if nombre == "enviar_catalogo":
        campos = st.get("campos") or {}
        salida = flujo.mensajes_catalogo(campos.get("Categoría interés") or "Portátiles", str(args.get("marca") or campos.get("Marca interés") or ""))
        if not salida:
            return {"error": "No hay catálogos cargados."}, False
        ctx["extra"] += salida
        ctx["avance"] = True
        return {"enviado": True}, False
    if nombre == "mover_etapa":
        nueva = str(args.get("etapa", "")).strip()
        if nueva not in flujo.ETAPAS:
            return {"error": f"Solo puedes avanzar a: {', '.join(flujo.ETAPAS[1:])}."}, False
        antes = st.get("etapa")
        flujo.etapa(st, nueva)  # solo avanza (decisión 0006)
        ctx["avance"] = ctx["avance"] or st.get("etapa") != antes
        return {"etapa": st.get("etapa"), "cambio": st.get("etapa") != antes}, False
    if nombre == "crear_seguimiento":
        que = str(args.get("que", "")).strip()[:200]
        try:
            horas = max(1, min(int(args.get("horas") or 24), 168))
        except (TypeError, ValueError):
            horas = 24
        if not que:
            return {"error": "Falta qué debe hacer el asesor."}, False
        asesor = (lead or {}).get("asignado_a") or ctx["config"].get("actualizado_por")
        if sim or not lead or not lead.get("id"):
            return {"creado": True, "simulado": True}, False
        if not asesor:
            ctx["nota"].append(f"Seguimiento pedido por Avi: {que} (en {horas} h)")
            return {"creado": False, "nota": "No hay asesor a quien asignarlo: quedó en la nota del cliente."}, False
        db.crear_seguimiento(lead["id"], que, horas, asesor, ctx["config"].get("actualizado_por") or asesor)
        return {"creado": True}, False
    if nombre == "capturar_datos":
        campos = st.setdefault("campos", {})
        for arg, campo in (("uso", "Uso equipo"), ("presupuesto", "Presupuesto"), ("marca", "Marca interés")):
            if str(args.get(arg, "")).strip():
                campos[campo] = str(args[arg]).strip()[:80]
        nombre_cliente = str(args.get("nombre", "")).strip()[:80]
        if nombre_cliente and lead and not lead.get("nombre") and not sim:
            db.actualizar_lead(lead["id"], {"nombre": nombre_cliente})
            lead["nombre"] = nombre_cliente
        if str(args.get("ciudad", "")).strip():
            ctx["nota"].append(f"Ciudad: {str(args['ciudad']).strip()[:60]}")
        ctx["avance"] = True
        return {"guardado": True}, False
    if nombre in ("iniciar_compra", "iniciar_cotizacion"):
        modulo = compra if nombre == "iniciar_compra" else cotizacion
        ctx["extra"] += modulo.iniciar(st, str(args.get("codigo", "")), lead)
        ctx["flujo"] = nombre
        return {"iniciado": True}, True
    if nombre == "pasar_a_asesor":
        motivo = str(args.get("motivo", "")).strip()[:300]
        ctx["extra"] += flujo.asesor(st, etiqueta="Escalado-Asesor")
        ctx["nota"].append(f"Pasó de Avi a asesor. Motivo: {motivo or 'sin motivo'}")
        ctx["asesor"] = True
        return {"pasado": True}, True
    return {"error": "herramienta sin implementar"}, False


# --------------------------------------------------------------------------- #
# El turno
# --------------------------------------------------------------------------- #

def interpretar(texto):
    """Lo que pidió el modelo: {"herramienta", "args"} o {"responder"}. Texto plano sin JSON se toma como respuesta."""
    crudo = (texto or "").strip()
    m = re.search(r"\{.*\}", crudo, re.S)
    if m:
        try:
            d = json.loads(m.group(0))
            if isinstance(d, dict) and (d.get("herramienta") or d.get("responder") is not None):
                return d
        except ValueError:
            pass
    return {"responder": re.sub(r"^```\w*|```$", "", crudo).strip()}


def partir(texto, maximo):
    """Hasta `maximo` mensajes de WhatsApp: se parte por párrafos y lo que sobra se junta en el último."""
    partes = [p.strip() for p in re.split(r"\n\s*\n", texto.strip()) if p.strip()] or [texto.strip()]
    if len(partes) > maximo:
        partes = partes[:maximo - 1] + ["\n\n".join(partes[maximo - 1:])]
    return [p[:4096] for p in partes]


def _asesor_por(ctx, motivo, etiqueta):
    ctx["extra"] += flujo.asesor(st=ctx["st"], etiqueta=etiqueta)
    ctx["nota"].append(motivo)
    ctx["asesor"] = True


def responder(st, entrada, lead, config=None, simulador=False, previo=None):
    """Un turno de Avi. Devuelve un dict {mensajes, st, nota, etiquetas, asesor, flujo, traza, costo_usd, tokens} o None si el
    modelo no respondió (atiende el Híbrido). `previo` es la conversación del simulador (no se lee de la base)."""
    config = config or db.agente_config(fresco=True)
    st.setdefault("bot", None)
    if st["bot"] is None:
        st["bot"] = db.principal()
    ctx = {"st": st, "lead": lead, "config": config, "simulador": simulador, "permitido": set(), "texto_permitido": "",
           "extra": [], "nota": [], "trozos": [], "asesor": False, "flujo": None, "avance": False}
    traza, costo, tokens = [], 0.0, 0
    lead_id = (lead or {}).get("id")
    flujo._hilo.bot, flujo._hilo.saltos = st["bot"], 0  # el paso a asesor usa los cuadros del bot del cliente
    try:
        if not simulador and lead_id and db.turnos_del_dia(lead_id) >= int(config.get("max_turnos_dia") or 40):
            _asesor_por(ctx, "Avi llegó al límite de turnos del día con este cliente.", "Revisar-Agente")
            return _salida(ctx, [], traza, costo, tokens)
        mensajes = historial(lead, entrada, int(config.get("memoria_mensajes") or 20), previo)
        prompt = sistema(config, lead, st)
        reintento = False
        for paso in range(1, int(config.get("max_pasos") or 6) + 1):
            try:
                r = cerebro.completar(mensajes, prompt, lead_id=lead_id, simulador=simulador, detalle={"paso": paso})
            except cerebro.TopeAgotado:
                ctx["extra"] += [flujo.m_texto("¿Quieres que te atienda un asesor? 🙌")] + flujo.asesor(st, etiqueta="Escalado-Asesor")
                ctx["nota"].append("Se acabó el presupuesto de IA del mes: Avi pasó el chat a un asesor.")
                ctx["asesor"] = True
                traza.append({"tipo": "tope"})
                return _salida(ctx, [], traza, costo, tokens)
            except cerebro.CerebroError as e:
                traza.append({"tipo": "error", "detalle": str(e)})
                return None  # atiende el Híbrido (RAG-10)
            costo += r["costo_usd"]
            tokens += r["tokens_entrada"] + r["tokens_salida"]
            pedido = interpretar(r["texto"])
            if pedido.get("herramienta"):
                nombre, args = str(pedido["herramienta"]), pedido.get("args") if isinstance(pedido.get("args"), dict) else {}
                resultado, terminal = usar(nombre, args, ctx)
                traza.append({"tipo": "herramienta", "nombre": nombre, "args": args, "resultado": resultado})
                if terminal:
                    return _salida(ctx, [], traza, costo, tokens)
                mensajes += [{"role": "assistant", "content": r["texto"]},
                             {"role": "user", "content": f"RESULTADO de {nombre}: {json.dumps(resultado, ensure_ascii=False)}\n"
                                                         "Usa otra herramienta o responde al cliente en el formato JSON."}]
                continue
            texto = str(pedido.get("responder") or "").strip()
            if not texto:
                mensajes += [{"role": "assistant", "content": r["texto"]},
                             {"role": "user", "content": 'Responde en el formato JSON: {"responder": "..."}'}]
                continue
            problemas = revisar(texto, ctx["permitido"], ctx["texto_permitido"])
            if problemas and not reintento:  # RAG-02: una oportunidad más
                reintento = True
                traza.append({"tipo": "bloqueado", "problemas": problemas, "texto": texto})
                mensajes += [{"role": "assistant", "content": r["texto"]},
                             {"role": "user", "content": "No puedes enviar eso: " + "; ".join(problemas) +
                              ". Consulta la herramienta que corresponde o quita ese dato, y responde de nuevo."}]
                continue
            if problemas:
                traza.append({"tipo": "bloqueado", "problemas": problemas, "texto": texto})
                if not simulador:
                    cerebro.registrar(lead_id, {"proveedor": r["proveedor"], "modelo": r["modelo"]}, "bloqueado",
                                      detalle={"problemas": problemas, "texto": texto})
                _asesor_por(ctx, "Avi no pudo responder sin inventar un dato: " + "; ".join(problemas), "Revisar-Agente")
                return _salida(ctx, [], traza, costo, tokens)
            traza.append({"tipo": "respuesta", "texto": texto})
            memoria = st.setdefault("agente", {})
            memoria["sin_avance"] = 0 if ctx["avance"] else int(memoria.get("sin_avance") or 0) + 1
            if memoria["sin_avance"] >= SIN_AVANCE:  # RAG-04: tres respuestas sin avance → asesor, después de la respuesta
                memoria["sin_avance"] = 0
                _asesor_por(ctx, f"Avi respondió {SIN_AVANCE} veces seguidas sin avanzar la venta.", "Escalado-Asesor")
            return _salida(ctx, partir(texto, int(config.get("max_mensajes") or 3)), traza, costo, tokens)
        _asesor_por(ctx, "Avi usó todos sus pasos sin llegar a una respuesta.", "Revisar-Agente")
        return _salida(ctx, [], traza, costo, tokens)
    finally:
        flujo._hilo.bot, flujo._hilo.saltos = None, 0


def _salida(ctx, textos, traza, costo, tokens):
    lead_id = (ctx["lead"] or {}).get("id")
    if ctx["asesor"] and not ctx["simulador"] and lead_id:  # para las métricas: conversaciones que Avi pasó a asesor
        cerebro.registrar(lead_id, {"proveedor": ctx["config"].get("proveedor") or "", "modelo": ctx["config"].get("modelo") or ""},
                          "asesor", detalle={"nota": " · ".join(ctx["nota"])})
    mensajes = [flujo.m_texto(t) for t in textos] + ctx["extra"]
    return {"mensajes": mensajes, "st": ctx["st"], "nota": " · ".join(ctx["nota"]), "etiquetas": ["Agente"],
            "asesor": ctx["asesor"], "flujo": ctx["flujo"], "traza": traza, "trozos": ctx["trozos"],
            "costo_usd": round(costo, 6), "tokens": tokens}


# --------------------------------------------------------------------------- #
# Resumen de conversaciones anteriores (memoria larga)
# --------------------------------------------------------------------------- #

RESUMEN_CADA = 20  # mensajes nuevos fuera de la memoria corta antes de volver a resumir


def falta_resumen(total, memoria, ya_resumidos):
    """True si quedaron por fuera de la memoria corta al menos RESUMEN_CADA mensajes que el resumen aún no cubre."""
    return total - memoria - ya_resumidos >= RESUMEN_CADA


def resumir(st, lead, config=None):
    """Actualiza leads.resumen_agente con lo que ya no cabe en la memoria corta. Una llamada barata al modelo, solo cuando hace falta.
    Devuelve el resumen nuevo o None. Nunca lanza: el resumen no puede tumbar una respuesta."""
    try:
        config = config or db.agente_config()
        memoria = int(config.get("memoria_mensajes") or 20)
        todos = [m for m in db.mensajes_del_cliente(lead["id"]) if (m.get("texto") or "").strip()]
        estado = st.setdefault("agente", {})
        ya = int(estado.get("resumidos") or 0)
        if not falta_resumen(len(todos), memoria, ya):
            return None
        viejos = todos[:len(todos) - memoria]
        charla = "\n".join(f"{'Cliente' if m['lado'] == 'cliente' else 'Nosotros'}: {m['texto'][:300]}" for m in viejos[-120:])
        previo = (lead.get("resumen_agente") or "").strip()
        pedido = ("Resume en español, en máximo 6 viñetas cortas, lo útil para seguir vendiéndole a este cliente: qué busca, presupuesto, "
                  "equipos que vio, datos que dio, objeciones y en qué quedó. Sin precios ni números de cuenta.\n\n"
                  + (f"Resumen anterior:\n{previo}\n\n" if previo else "") + f"Conversación:\n{charla}")
        r = cerebro.completar([{"role": "user", "content": pedido}], "Eres un asistente que resume conversaciones de ventas.",
                              lead_id=lead["id"], detalle={"paso": 0, "resumen": True})
        texto = re.sub(r"\d{9,}", "…", r["texto"])[:1500]
        db.actualizar_lead(lead["id"], {"resumen_agente": texto})
        lead["resumen_agente"] = texto
        estado["resumidos"] = len(viejos)
        return texto
    except Exception:
        return None

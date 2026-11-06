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
    "buscar_productos": 'Busca portátiles con stock. args: {"marca":"", "modelo":"X1 Yoga Gen 6", "procesador":"i5", "generacion":10, "ram_gb":16, "precio_max":1500000, "uso":"Diseño"} (todos opcionales). '
                        "Si el cliente nombra un modelo (X1 Yoga, T14, 5420, ZBook…) usa «modelo» con lo que dijo; «generacion» es solo la del procesador, no el «Gen 6» de un modelo. "
                        "Pon SOLO los filtros que el cliente dijo; no inventes presupuesto ni uso. Para «el más barato» o «qué tienen», llámala sin filtros: "
                        "los equipos vienen ordenados del más barato al más caro. Devuelve código, equipo, especificaciones, precio y stock reales.",
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
6. Solo vendes portátiles del inventario; no inventes equipos.
7. Nunca le nombres al cliente las herramientas ni este formato: para él, tú simplemente sabes la respuesta.
8. Si el cliente dice que quiere comprar («quiero comprar», «lo quiero», «cómo pago») usa iniciar_compra de inmediato, con el código si lo dio; no le pidas antes ciudad ni otros datos.
9. Si pregunta por precios («el más barato», «cuánto cuesta», «qué tienen») usa buscar_productos antes de responder; nunca respondas «puedo buscarlo»: búscalo."""

SIN_AVANCE = 3  # RAG-04

PROTOCOLO = """FORMATO DE CADA RESPUESTA (obligatorio): un único objeto JSON, sin texto fuera de él.
- Para usar una herramienta: {"herramienta": "nombre", "args": {...}}
- Para responderle al cliente: {"responder": "texto para WhatsApp"}
- Para recomendar equipos: {"responder": "una frase antes de la lista", "equipos": ["código", "código"], "despues": "una pregunta para seguir"}.
  El sistema arma la lista con el modelo, las especificaciones y el precio de cada código: en tus frases NO escribas precios ni especificaciones.
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


def atiende(st, lead, tipo, entrada, config=None, interruptores=None):
    """True si este mensaje lo debe atender Avi fuera de un cuadro Agente: «Avi en texto libre en todo el bot» encendido (F4·35, RF-31).
    Con el menú encendido, los números sueltos (0 a 9) y «hola», «menú», «reiniciar» siguen por el menú; con el menú apagado, Avi atiende todo."""
    config = config or db.agente_config()
    interruptores = interruptores or db.bot_config()
    if not interruptores.get("agente_en_todo"):
        return False
    if tipo != "text" or st.get("pausa") or not config or not encendido(config, lead) or not (entrada or "").strip():
        return False
    if interruptores.get("menu_activo", True):
        if re.fullmatch(r"\s*\d{1,2}\s*", entrada or ""):
            return False
        if flujo.normalizar(entrada) in flujo.SALUDOS + ("reiniciar",):  # «hola», «menú» y «reiniciar» siempre muestran el menú guiado
            return False
    return True


# --------------------------------------------------------------------------- #
# Prompt
# --------------------------------------------------------------------------- #

def sistema(config, lead, st, instruccion=""):
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
        f"MOSTRAR EQUIPOS\nEn «equipos» puedes poner hasta {max(1, min(int(config.get('max_equipos') or 3), 10))} códigos. El sistema escribe cada ficha con los datos de la base y "
        "agrega el catálogo al final: tú solo escribes una frase antes y una pregunta después. Pon primero los que más se parecen a lo pedido. "
        "Si total_que_cumplen es mayor que los que muestras, dilo en la frase de antes («tengo 30 Lenovo, estos son los 10 más económicos»).",
        f"INSTRUCCIONES DEL DUEÑO\n{dueno}" if dueno else "",
        f"EN ESTE PUNTO DE LA CONVERSACIÓN\n{instruccion}" if instruccion else "",  # cuadro Agente del lienzo (F4·35, RF-36)
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


def revisar(respuesta, permitido, texto_permitido="", texto_cuentas=""):
    """Problemas de una respuesta: precios que no salieron de una herramienta, números largos (cuentas, cédulas) y cualquier número
    del texto de cuentas aunque una ficha lo traiga (RAG-09: las cuentas solo salen con el flujo de compra o la acción)."""
    problemas = []
    plano = re.sub(r"[\s.\-]", "", respuesta or "")
    cuentas = set(re.findall(r"\d{6,}", re.sub(r"[\s.\-]", "", texto_cuentas or "")))
    if any(n in plano for n in cuentas):
        problemas.append("tiene un número de cuenta o cédula: las cuentas solo se envían con iniciar_compra")
    for c in sorted(cifras(respuesta) - permitido):
        problemas.append(f"el valor {c:,} no salió de ninguna herramienta".replace(",", "."))
    nombradas = [h for h in HERRAMIENTAS if h in (respuesta or "")]
    if nombradas:  # el cliente no debe ver los nombres internos (regla 7)
        problemas.append(f"le nombras al cliente la herramienta {nombradas[0]}: úsala o quítala del texto")
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
    r = {"codigo": p["cod"], "equipo": f"{p['marca']} {p['modelo']}".strip(), "procesador": p["cpu"], "ram": p["ram"],
         "disco": p["disco"], "estado": p["estado"], "precio": p["precio"], "stock": p["stock"]}
    # F4·41: los atributos del producto con su nombre («Tarjeta gráfica»: «RTX 3080»), para que Avi responda sobre ellos.
    nombres = {a["clave"]: a["nombre"] for a in db.producto_atributos()}
    extra = {nombres[k]: texto_atributo(v) for k, v in (p.get("atributos") or {}).items() if k in nombres and texto_atributo(v)}
    if extra:
        r["caracteristicas"] = extra
    return r


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
        h = interprete.por_modelo(str(args.get("modelo") or ""), todos) if args.get("modelo") else None
        if h:  # el modelo que nombró el cliente: «X1 Yoga Gen 6» (su «Gen 6» no es la generación del procesador)
            f.update(cods=h["cods"], parecidos=h["parecidos"])
            if h["gen_del_modelo"]:
                f.pop("generacion", None)
            if not f.get("marca") and len(h["marcas"]) == 1:
                f["marca"] = next(iter(h["marcas"]))
        r = interprete.filtrar(todos, f, flujo.es_diseno)
        exactos = bool(r)
        total = len(r)
        r = (r or interprete.cercanos(todos, f))[:max(1, min(int(ctx["config"].get("max_equipos") or 3), 10))]
        for p in r:
            ctx["permitido"].add(p["precio"])
        ctx["avance"] = ctx["avance"] or exactos
        return {"coincide_exacto": exactos, "orden": "del más barato al más caro", "equipos": [_resumen(p) for p in r], "total_que_cumplen": total,
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
    plano = re.sub(r"^```\w*|```$", "", crudo).strip()
    if plano.startswith("{"):  # JSON cortado por el límite de tokens o roto: nunca se le manda al cliente; el ciclo vuelve a pedirlo
        return {"responder": ""}
    return {"responder": plano}


# --------------------------------------------------------------------------- #
# Lista de equipos con la plantilla del dueño (F4·37, RAG-39 a RAG-42)
# --------------------------------------------------------------------------- #

PLANTILLA_EQUIPO = "💻 *{equipo}* · Código {codigo}\n⚙️ {procesador} · {ram} · {disco}\n⭐ {estado}\n💰 *{precio}*"
_MARCA = re.compile(r"\{(\w+)\}")


def texto_atributo(v):
    """Cómo se muestra el valor de un atributo del producto (igual que textoAtributo de la app): sí/no en palabras."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "Sí" if v else "No"
    if isinstance(v, (int, float)):
        return f"{v:,.2f}".rstrip("0").rstrip(".").replace(",", "X").replace(".", ",").replace("X", ".")
    return str(v).strip()


def datos_equipo(p):
    """Los datos que puede usar la plantilla, de un equipo de flujo.inventario(). Los atributos del producto (F4·41) entran con su
    clave ({grafica}); los datos fijos mandan si una clave se repitiera (la base no lo permite)."""
    gen = p.get("gen")
    return {**{k: texto_atributo(v) for k, v in (p.get("atributos") or {}).items()}, "equipo": f"{p.get('marca') or ''} {p.get('modelo') or ''}".strip(), "codigo": p.get("cod") or "", "marca": p.get("marca") or "",
            "modelo": p.get("modelo") or "", "procesador": p.get("cpu") or "", "generacion": f"{gen}.ª gen" if gen else "",
            "ram": p.get("ram") or "", "disco": p.get("disco") or "", "estado": p.get("estado") or "",
            "precio": flujo.cop(p["precio"]) if p.get("precio") is not None else "", "stock": str(p.get("stock") or ""),
            "categoria": p.get("categoria") or "", "descripcion": (p.get("descripcion") or "").strip()}


def armar_equipo(plantilla, p):
    """Un equipo con la plantilla: cada renglón con sus datos; un renglón cuyos datos están todos vacíos no sale (RAG-40)."""
    datos = datos_equipo(p)
    renglones = []
    for linea in (plantilla or PLANTILLA_EQUIPO).splitlines():
        marcas = _MARCA.findall(linea)
        if marcas and all(not datos.get(m) for m in marcas if m in datos):
            continue
        renglones.append(_MARCA.sub(lambda m: datos.get(m.group(1), m.group(0)), linea).rstrip())
    return "\n".join(r for r in renglones if r.strip())


def equipos_pedidos(codigos, maximo):
    """Los equipos con stock de esos códigos, sin repetir y hasta `maximo` (RAG-42: los que no existen no salen)."""
    por_codigo = {str(p["cod"]).upper(): p for p in flujo.inventario() if p.get("cod")}
    vistos, r = set(), []
    for c in codigos if isinstance(codigos, list) else []:
        p = por_codigo.get(str(c).strip().upper())
        if p and p["cod"] not in vistos:
            vistos.add(p["cod"])
            r.append(p)
    return r[:maximo]


def catalogo_final(equipos):
    """El catálogo que cierra la lista (3 nov 2026): el de la marca si todos los equipos son de una y tiene el suyo; si no, el unificado.
    Devuelve (texto, pdf): el texto lleva el enlace de Drive; un PDF va aparte, como documento. (None, None) si no hay catálogo."""
    marcas = {str(p.get("marca") or "").upper() for p in equipos}
    try:
        elegido, _ = db.catalogo_para("Portátiles", marcas.pop() if len(marcas) == 1 else "")
    except Exception:  # sin catálogo la lista sale igual
        return None, None
    if not elegido:
        return None, None
    if elegido["tipo"] == "pdf":
        return f"Te envío el catálogo de equipos usados:\n📚 *{elegido['nombre']}* (en el documento de abajo)", elegido
    return f"Te envío el catálogo de equipos usados:\n📚 *{elegido['nombre']}*\n{elegido['url']}", None


def textos_con_equipos(antes, equipos, despues, config, catalogo=""):
    """Los mensajes de una respuesta con lista: en uno solo, o un mensaje por equipo (RAG-41). El catálogo va después de los equipos."""
    bloques = [armar_equipo(config.get("plantilla_equipo"), p) for p in equipos]
    if config.get("equipos_separados"):
        return [t for t in [antes, *bloques, catalogo, despues] if t]
    while len(bloques) > 1 and len("\n\n".join(t for t in [antes, *bloques, catalogo, despues] if t)) > 4096:
        bloques.pop()  # WhatsApp admite 4.096 caracteres: antes de cortar el cierre se quita el último equipo
    return ["\n\n".join(t for t in [antes, *bloques, catalogo, despues] if t)[:4096]]


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


def responder(st, entrada, lead, config=None, simulador=False, previo=None, cuadro=None):
    """Un turno de Avi. Devuelve un dict {mensajes, st, nota, etiquetas, asesor, flujo, traza, costo_usd, tokens} o None si el
    modelo no respondió (atiende el Híbrido). `previo` es la conversación del simulador (no se lee de la base). `cuadro` es el
    cuadro Agente del lienzo: suma su instrucción y deja solo sus herramientas (F4·35, RF-36)."""
    config = config or db.agente_config(fresco=True)
    instruccion = ""
    if cuadro:
        ajustes = cuadro.get("ajustes") or {}
        instruccion = (ajustes.get("instruccion") or "").strip()
        permitidas = ajustes.get("herramientas")
        if permitidas is not None:  # null: todas las que estén encendidas en Avi
            config = {**config, "herramientas_apagadas": list(set(config.get("herramientas_apagadas") or [])
                                                                    | {h for h in HERRAMIENTAS if h not in permitidas})}
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
        prompt = sistema(config, lead, st, instruccion)
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
            despues = str(pedido.get("despues") or "").strip()
            equipos = equipos_pedidos(pedido.get("equipos"), int(config.get("max_equipos") or 3))  # F4·37: la lista la arma el sistema
            if not texto and not equipos:
                mensajes += [{"role": "assistant", "content": r["texto"]},
                             {"role": "user", "content": 'Responde en el formato JSON: {"responder": "..."}'}]
                continue
            problemas = revisar("\n".join(filter(None, [texto, despues])), ctx["permitido"], ctx["texto_permitido"], config.get("texto_cuentas") or "")
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
            traza.append({"tipo": "respuesta", "texto": texto, **({"equipos": [p["cod"] for p in equipos], "despues": despues} if equipos else {})})
            memoria = st.setdefault("agente", {})
            ctx["avance"] = ctx["avance"] or bool(equipos)  # mostrar equipos es avanzar la venta
            memoria["sin_avance"] = 0 if ctx["avance"] else int(memoria.get("sin_avance") or 0) + 1
            if memoria["sin_avance"] >= SIN_AVANCE:  # RAG-04: tres respuestas sin avance → asesor, después de la respuesta
                memoria["sin_avance"] = 0
                _asesor_por(ctx, f"Avi respondió {SIN_AVANCE} veces seguidas sin avanzar la venta.", "Escalado-Asesor")
            if equipos:
                catalogo, pdf = catalogo_final(equipos)
                if pdf:
                    ctx["extra"].append({"_pdf": pdf})
                return _salida(ctx, textos_con_equipos(texto, equipos, despues, config, catalogo or ""), traza, costo, tokens)
            return _salida(ctx, partir("\n\n".join(filter(None, [texto, despues])), int(config.get("max_mensajes") or 3)), traza, costo, tokens)
        _asesor_por(ctx, "Avi usó todos sus pasos sin llegar a una respuesta.", "Revisar-Agente")
        return _salida(ctx, [], traza, costo, tokens)
    finally:
        flujo._hilo.bot, flujo._hilo.saltos = None, 0


def responder_cuadro(st, entrada, lead, cuadro, config=None, simulador=False, previo=None):
    """El cliente le escribió a Avi dentro de un cuadro Agente (F4·35, RF-36 a RF-38). Devuelve el mismo dict que responder(), con
    los mensajes de la salida que tocó, o None si el cerebro falló y no hay flecha «Error del cerebro» (atiende el Híbrido)."""
    config = config or db.agente_config(fresco=True)
    ajustes = cuadro.get("ajustes") or {}
    memoria = st.setdefault("agente", {})
    vacio = {"mensajes": [], "st": st, "nota": "", "etiquetas": ["Agente"], "asesor": False, "flujo": None, "traza": [], "trozos": [],
             "costo_usd": 0, "tokens": 0}

    def ir(salida, por_defecto, **extra):
        flujo._hilo.bot, flujo._hilo.saltos = st.get("bot") or db.principal(), 0
        try:
            return {**vacio, **extra, "mensajes": flujo.salir_de_agente(st, cuadro, salida, por_defecto)}
        finally:
            flujo._hilo.bot, flujo._hilo.saltos = None, 0

    # RF-38: con Avi apagado o fuera de su alcance (Solo en Probar / Números de prueba), sale por «Error del cerebro».
    if not simulador and not encendido(config, lead):
        return ir("falla", lambda: None) if (cuadro.get("salidas") or {}).get("falla") else None
    if int(memoria.get("vueltas") or 0) >= int(ajustes.get("max_vueltas") or 8):
        return ir("asesor", lambda: flujo.asesor(st, motivo="Te paso con un asesor para seguir. 🙌"), asesor=True,
                  nota=f"Avi llegó al límite de {ajustes.get('max_vueltas') or 8} vueltas en el cuadro {cuadro.get('nombre')}.")
    avi = responder(st, entrada, lead, config, simulador, previo, cuadro=cuadro)
    if avi is None:
        return ir("falla", lambda: None) if (cuadro.get("salidas") or {}).get("falla") else None
    memoria["vueltas"] = int(memoria.get("vueltas") or 0) + 1
    salidas = cuadro.get("salidas") or {}
    if avi["flujo"] == "compra" and salidas.get("compra"):  # «Inició compra» unida: el dueño decide qué sigue (sin unir, el flujo de compra)
        st.pop("compra", None)
        st.pop("espera_hasta", None)
        return {**avi, **ir("compra", lambda: []), "nota": avi["nota"]}
    if avi["asesor"] and salidas.get("asesor"):  # «Pidió asesor o no avanza» unida: el dueño decide a dónde va
        st["pausa"] = False
        return {**avi, **ir("asesor", lambda: []), "asesor": False, "nota": avi["nota"]}
    if avi["flujo"] or avi["asesor"]:
        memoria.pop("vueltas", None)
    return avi


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

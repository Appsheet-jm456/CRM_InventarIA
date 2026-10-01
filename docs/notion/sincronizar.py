#!/usr/bin/env python3
"""
Crea (o actualiza) la estructura del proyecto en Notion desde los documentos
de este repositorio. Git manda: Notion es el espejo.

    python3 docs/notion/sincronizar.py            # sincronizacion inicial: crea todo
    python3 docs/notion/sincronizar.py --revisar  # muestra que haria, sin escribir
    python3 docs/notion/sincronizar.py --todo     # el dia a dia: --tareas + --paginas
    python3 docs/notion/sincronizar.py --tareas   # Fases y Tareas: solo las filas que cambiaron
    python3 docs/notion/sincronizar.py --paginas  # portada, modelo, reglas y decisiones: solo los bloques que cambian
    python3 docs/notion/sincronizar.py --version  # copia nueva del brief (solo con autorizacion) + --paginas

Requiere .env.notion en la raiz con:
    NOTION_TOKEN=ntn_...
    NOTION_PARENT_PAGE=<id>     (opcional: si falta, se busca la pagina compartida)

La integracion debe estar conectada a la pagina padre en Notion:
    abrir la pagina -> menu ··· -> Connections -> agregar la integracion
"""

import csv
import http.client
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DOCS = RAIZ / "docs"
API = "https://api.notion.com/v1"
VERSION = "2022-06-28"
SIMULAR = "--revisar" in sys.argv

PROYECTO = "CRM InventarIA"   # título de la portada, colgando de NOTION_PARENT_PAGE
ICONO = "💬"
REPOSITORIO = "github.com/Appsheet-jm456/CRM_InventarIA (privado) · /home/atlasjm/chat_bot-inventario"


# --------------------------------------------------------------------------- #
# Cliente HTTP
# --------------------------------------------------------------------------- #

def cargar_env():
    ruta = RAIZ / ".env.notion"
    if not ruta.exists():
        sys.exit(f"✗ Falta {ruta}. Ver la cabecera de este script.")
    env = {}
    for linea in ruta.read_text().splitlines():
        if "=" in linea and not linea.strip().startswith("#"):
            k, _, v = linea.partition("=")
            env[k.strip()] = v.strip()
    if not env.get("NOTION_TOKEN"):
        sys.exit("✗ Falta NOTION_TOKEN en .env.notion")
    return env


ENV = cargar_env()


_ULTIMA_LLAMADA = [0.0]
_INTERVALO_MIN = 0.35  # Notion documenta ~3 req/s de promedio; por debajo evitamos
                       # el 429 y los cortes de conexion que dispara ese limite.


def api(metodo, ruta, cuerpo=None, intentos=4):
    # Con cientos de bloques (DELETE secuencial por bloque en reemplazar_contenido)
    # una rafaga sin throttle dispara el limite de tasa de Notion, que corta la
    # conexion a mitad de camino (http.client.RemoteDisconnected) o responde 429/5xx.
    # No es un error del pedido -> se autolimita la tasa y se reintenta con backoff.
    for intento in range(1, intentos + 1):
        espera = _INTERVALO_MIN - (time.monotonic() - _ULTIMA_LLAMADA[0])
        if espera > 0:
            time.sleep(espera)
        req = urllib.request.Request(
            f"{API}{ruta}",
            method=metodo,
            data=json.dumps(cuerpo).encode() if cuerpo else None,
            headers={
                "Authorization": f"Bearer {ENV['NOTION_TOKEN']}",
                "Notion-Version": VERSION,
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                _ULTIMA_LLAMADA[0] = time.monotonic()
                return json.load(r)
        except urllib.error.HTTPError as e:
            _ULTIMA_LLAMADA[0] = time.monotonic()
            # Un 429 o un gateway error puede venir sin cuerpo JSON (o vacio) —
            # json.load(e) explotaba con JSONDecodeError y tumbaba el script
            # entero a mitad de una corrida larga. Se degrada a {} si no parsea.
            texto_error = e.read()
            try:
                detalle = json.loads(texto_error)
            except ValueError:
                detalle = {}
            # Un DELETE que Notion rechaza por validacion no es un fallo real: el
            # objetivo es que el bloque deje de existir, y estos errores dicen que
            # ya no se puede borrar porque efectivamente ya no esta.
            #   · "archived": el reintento repitio un DELETE que la vez anterior si
            #     se proceso, aunque la respuesta no nos llegara por el corte.
            #   · "Invalid ancestor path": el bloque se fue con su ancestro.
            # Abortar aqui tumbaba la corrida entera a mitad del borrado.
            if metodo == "DELETE" and detalle.get("code") == "validation_error":
                return {"omitido": detalle.get("message", "")}
            if e.code == 429 or e.code >= 500:
                if intento == intentos:
                    sys.exit(f"✗ Notion {e.code} tras {intentos} intentos ({metodo} {ruta}): "
                             f"{detalle.get('message') or texto_error[:200] or e.reason}")
                pausa = float(e.headers.get("Retry-After", 0)) or (0.5 * intento)
                time.sleep(pausa)
                continue
            sys.exit(f"✗ Notion {e.code}: {detalle.get('code')} — {detalle.get('message')}")
        except (http.client.RemoteDisconnected, http.client.IncompleteRead,
                ConnectionError, urllib.error.URLError, TimeoutError) as e:
            if intento == intentos:
                sys.exit(f"✗ Notion no respondio tras {intentos} intentos ({metodo} {ruta}): {e}")
            time.sleep(0.5 * intento)


# --------------------------------------------------------------------------- #
# Markdown -> bloques de Notion
# --------------------------------------------------------------------------- #

def texto_rico(s, limite=2000):
    """Convierte **negrita**, `codigo` y [enlaces](url) en rich text."""
    piezas, resto = [], s[:limite]
    patron = re.compile(r"\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)")
    pos = 0
    for m in patron.finditer(resto):
        if m.start() > pos:
            piezas.append({"type": "text", "text": {"content": resto[pos:m.start()]}})
        if m.group(1):
            piezas.append({"type": "text", "text": {"content": m.group(1)},
                           "annotations": {"bold": True}})
        elif m.group(2):
            piezas.append({"type": "text", "text": {"content": m.group(2)},
                           "annotations": {"code": True}})
        else:
            # Notion solo acepta URLs absolutas. Un enlace relativo —a otra
            # decision, a una migracion— no lo puede seguir nadie desde alli, y
            # ademas la API responde 400 y **aborta la publicacion entera**, con
            # el agravante de que ya creo la pagina de la version: la portada se
            # queda vieja y parece que funciono. Se degrada a texto plano.
            destino = m.group(4).strip()
            if destino.startswith(("http://", "https://", "mailto:")):
                piezas.append({"type": "text",
                               "text": {"content": m.group(3), "link": {"url": destino}}})
            else:
                piezas.append({"type": "text", "text": {"content": m.group(3)}})
        pos = m.end()
    if pos < len(resto):
        piezas.append({"type": "text", "text": {"content": resto[pos:]}})
    return piezas or [{"type": "text", "text": {"content": ""}}]


def celdas(linea):
    return [c.strip() for c in linea.strip().strip("|").split("|")]


def markdown_a_bloques(md):
    """Soporta encabezados, parrafos, listas, citas, separadores, codigo y tablas."""
    bloques, lineas, i = [], md.splitlines(), 0

    def simple(tipo, contenido, extra=None):
        b = {"object": "block", "type": tipo, tipo: {"rich_text": texto_rico(contenido)}}
        if extra:
            b[tipo].update(extra)
        return b

    while i < len(lineas):
        ln = lineas[i]
        s = ln.strip()

        if not s:
            i += 1
            continue

        # Separador
        if re.fullmatch(r"-{3,}", s):
            bloques.append({"object": "block", "type": "divider", "divider": {}})
            i += 1
            continue

        # Bloque de codigo
        if s.startswith("```"):
            lenguaje = s[3:].strip() or "plain text"
            i += 1
            cuerpo = []
            while i < len(lineas) and not lineas[i].strip().startswith("```"):
                cuerpo.append(lineas[i])
                i += 1
            i += 1
            bloques.append({"object": "block", "type": "code", "code": {
                "rich_text": [{"type": "text", "text": {"content": "\n".join(cuerpo)[:2000]}}],
                "language": lenguaje if lenguaje in ("bash", "sql", "javascript", "typescript",
                                                     "python", "json", "mermaid") else "plain text",
            }})
            continue

        # Tabla
        if s.startswith("|") and i + 1 < len(lineas) and re.match(r"^\|[\s:|-]+\|$", lineas[i + 1].strip()):
            encabezado = celdas(s)
            i += 2
            filas = []
            while i < len(lineas) and lineas[i].strip().startswith("|"):
                filas.append(celdas(lineas[i]))
                i += 1
            ancho = len(encabezado)
            def fila_bloque(vals):
                vals = (vals + [""] * ancho)[:ancho]
                return {"object": "block", "type": "table_row",
                        "table_row": {"cells": [texto_rico(v) for v in vals]}}
            bloques.append({"object": "block", "type": "table", "table": {
                "table_width": ancho, "has_column_header": True, "has_row_header": False,
                "children": [fila_bloque(encabezado)] + [fila_bloque(f) for f in filas],
            }})
            continue

        # Encabezados
        m = re.match(r"^(#{1,3})\s+(.*)", s)
        if m:
            nivel = len(m.group(1))
            bloques.append(simple(f"heading_{nivel}", m.group(2)))
            i += 1
            continue

        # Cita
        if s.startswith("> "):
            bloques.append(simple("quote", s[2:]))
            i += 1
            continue

        # Lista con casilla
        m = re.match(r"^[-*]\s+\[([ xX])\]\s+(.*)", s)
        if m:
            bloques.append(simple("to_do", m.group(2),
                                  {"checked": m.group(1).lower() == "x"}))
            i += 1
            continue

        # Lista numerada / con vinetas
        if re.match(r"^\d+\.\s+", s):
            bloques.append(simple("numbered_list_item", re.sub(r"^\d+\.\s+", "", s)))
            i += 1
            continue
        if re.match(r"^[-*]\s+", s):
            bloques.append(simple("bulleted_list_item", s[2:]))
            i += 1
            continue

        bloques.append(simple("paragraph", s))
        i += 1

    return bloques


# --------------------------------------------------------------------------- #
# Creacion
# --------------------------------------------------------------------------- #

def pagina_padre():
    if ENV.get("NOTION_PARENT_PAGE"):
        return ENV["NOTION_PARENT_PAGE"].replace("-", "")
    r = api("POST", "/search", {"filter": {"property": "object", "value": "page"},
                                "page_size": 10})
    if not r.get("results"):
        sys.exit("✗ La integracion no tiene ninguna pagina compartida.\n"
                 "  En Notion: abre la pagina → menu ··· → Connections → agrega la integracion.")
    return r["results"][0]["id"]


def crear_pagina(padre_id, titulo, bloques, icono=None):
    cuerpo = {
        "parent": {"page_id": padre_id},
        "properties": {"title": [{"type": "text", "text": {"content": titulo}}]},
        "children": bloques[:100],
    }
    if icono:
        cuerpo["icon"] = {"type": "emoji", "emoji": icono}
    pagina = api("PATCH" if False else "POST", "/pages", cuerpo)
    # Notion acepta 100 bloques por llamada; el resto va por lotes.
    for j in range(100, len(bloques), 100):
        api("PATCH", f"/blocks/{pagina['id']}/children",
            {"children": bloques[j:j + 100]})
    return pagina


def opciones(valores, colores):
    return [{"name": v, "color": colores.get(v, "default")} for v in valores]


def crear_base(padre_id, titulo, propiedades, icono):
    return api("POST", "/databases", {
        "parent": {"type": "page_id", "page_id": padre_id},
        "icon": {"type": "emoji", "emoji": icono},
        "title": [{"type": "text", "text": {"content": titulo}}],
        "properties": propiedades,
    })


def texto_prop(v):
    return {"rich_text": [{"type": "text", "text": {"content": (v or "")[:2000]}}]}


PRESERVAR = ("child_page", "child_database", "column_list")


def listar_hijos(bloque_id):
    # Paginar: el indice de decisiones pasa de los 800 bloques, y quedarse con la
    # primera pagina borraba solo 100 y dejaba el resto huerfano, con el contenido
    # nuevo escrito encima. La pagina crecia en cada corrida en vez de reescribirse
    # —asi llego a 11.370 bloques— y de paso provocaba los cortes de conexion.
    cursor, hijos = None, []
    while True:
        ruta = f"/blocks/{bloque_id}/children?page_size=100"
        if cursor:
            ruta += f"&start_cursor={cursor}"
        r = api("GET", ruta)
        hijos += r.get("results", [])
        if not r.get("has_more"):
            return hijos
        cursor = r.get("next_cursor")


def reemplazar_contenido(pagina_id, bloques):
    """Vacía una página y la reescribe. Solo como último recurso: ver sincronizar_contenido.

    Respeta lo que no salió de este repositorio: las bases de datos, las
    subpáginas y la disposición en columnas se saltan.
    """
    borrables = [b for b in listar_hijos(pagina_id) if b["type"] not in PRESERVAR]
    # Notion no tiene borrado por lote: es un DELETE por bloque, a ~3 req/s. Con
    # cientos de bloques son minutos, asi que conviene ver que avanza.
    for n, b in enumerate(borrables, 1):
        api("DELETE", f"/blocks/{b['id']}")
        if n % 100 == 0 or n == len(borrables):
            print(f"     borrando… {n}/{len(borrables)}", flush=True)
    for i in range(0, len(bloques), 100):
        api("PATCH", f"/blocks/{pagina_id}/children", {"children": bloques[i:i + 100]})


def _firma_texto(rich_text):
    """Rich text comparable entre lo que se envía y lo que Notion devuelve: une los
    tramos contiguos con el mismo formato y descarta los vacíos."""
    tramos = []
    for p in rich_text:
        texto = p.get("text", {}).get("content", p.get("plain_text", ""))
        if not texto:
            continue
        ann = p.get("annotations", {})
        formato = (bool(ann.get("bold")), bool(ann.get("code")),
                   (p.get("text", {}).get("link") or {}).get("url"))
        if tramos and tramos[-1][1] == formato:
            tramos[-1] = (tramos[-1][0] + texto, formato)
        else:
            tramos.append((texto, formato))
    return tuple(tramos)


def firma(bloque, filas=None):
    """Lo que importa de un bloque para saber si cambió. `filas`: las de una tabla
    existente, que Notion no devuelve con el bloque."""
    tipo = bloque["type"]
    d = bloque.get(tipo, {})
    if tipo == "divider":
        return (tipo,)
    if tipo == "code":
        return (tipo, "".join(t for t, _ in _firma_texto(d.get("rich_text", []))), d.get("language"))
    if tipo == "table":
        filas = d.get("children", []) if filas is None else filas
        return (tipo, d.get("table_width"),
                tuple(tuple(_firma_texto(c) for c in f["table_row"]["cells"]) for f in filas))
    return (tipo, _firma_texto(d.get("rich_text", [])), d.get("checked"))


def _editable_en_su_lugar(viejo, nuevo):
    """Un bloque de texto que solo cambió su contenido se edita (PATCH) en vez de borrarlo y crearlo."""
    tipo = nuevo["type"]
    return viejo["type"] == tipo and tipo not in ("table", "divider") and not nuevo.get(tipo, {}).get("children")


def sincronizar_contenido(pagina_id, nuevos):
    """Deja la página igual al documento tocando solo los bloques que cambiaron.

    Compara bloque a bloque (difflib) los de Notion con los del documento: lo igual no se toca, un texto que cambió
    se edita en su lugar y solo se borra o se inserta lo que de verdad sale o entra. Antes se reemplazaba todo el
    tramo entre el primer y el último cambio: dos cambios lejanos movían decenas de bloques (el dueño, 30 sep 2026:
    "solo modifica los bloques que cambie"). Devuelve un resumen para imprimir; con --revisar no escribe.
    """
    import difflib

    existentes = listar_hijos(pagina_id)
    viejos = [b for b in existentes if b["type"] not in PRESERVAR]

    def firma_vieja(b):
        filas = listar_hijos(b["id"]) if b["type"] == "table" else None
        return firma(b, filas)

    fv = [firma_vieja(b) for b in viejos]
    fn = [firma(b) for b in nuevos]
    pasos = [op for op in difflib.SequenceMatcher(None, fv, fn, autojunk=False).get_opcodes() if op[0] != "equal"]
    if not pasos:
        return "sin cambios"

    editados = borrados = insertados = 0
    # Notion solo inserta "después de" un bloque: el ancla es el último que queda antes de cada cambio. Si el cambio
    # está al principio, sirve el bloque que no sale del repositorio (base o subpágina) que lo preceda.
    pos0 = next((k for k, b in enumerate(existentes) if viejos and b["id"] == viejos[0]["id"]), len(existentes))
    ancla_inicial = existentes[pos0 - 1]["id"] if pos0 else None
    plan = []
    for tipo, i1, i2, j1, j2 in pasos:
        ancla = viejos[i1 - 1]["id"] if i1 else ancla_inicial
        if tipo == "replace" and i2 - i1 == j2 - j1 and all(
                _editable_en_su_lugar(viejos[i1 + k], nuevos[j1 + k]) for k in range(i2 - i1)):
            plan += [("editar", viejos[i1 + k], nuevos[j1 + k]) for k in range(i2 - i1)]
            continue
        plan += [("borrar", v, None) for v in viejos[i1:i2]]
        if j2 > j1:
            if ancla is None and i1 < len(viejos):
                # Insertar arriba de todo sin ancla no se puede: Notion lo pondría al final.
                if SIMULAR:
                    return "cambio al principio sin ancla: se reescribiría"
                reemplazar_contenido(pagina_id, nuevos)
                return f"reescrita ({len(nuevos)} bloques)"
            plan.append(("insertar", ancla, nuevos[j1:j2]))

    for accion, a, b in plan:
        if accion == "editar":
            editados += 1
        elif accion == "borrar":
            borrados += 1
        else:
            insertados += len(b)
    resumen = f"~{editados} editados, −{borrados}, +{insertados} bloques"
    if SIMULAR:
        return "(ensayo) " + resumen

    for accion, a, b in plan:
        if accion == "editar":
            tipo = b["type"]
            api("PATCH", f"/blocks/{a['id']}", {tipo: {k: v for k, v in b[tipo].items() if k != "children"}})
        elif accion == "borrar":
            api("DELETE", f"/blocks/{a['id']}")
        else:
            ancla = a
            for k in range(0, len(b), 100):
                cuerpo = {"children": b[k:k + 100]}
                if ancla:
                    cuerpo["after"] = ancla
                r = api("PATCH", f"/blocks/{pagina_id}/children", cuerpo)
                ancla = (r.get("results") or [{}])[-1].get("id", ancla)
    return resumen


def titulo_version(brief):
    """'v2.0 — 25 sep 2026', leído de la línea de versión de 00-BRIEF.md."""
    m = re.search(r"`(v[\d.]+)`\s*·\s*([^·]+)·", brief)
    version = m.group(1) if m else "sin-version"
    fecha = m.group(2).strip() if m else ""
    return f"{version} — {fecha}" if fecha else version


def buscar_portada():
    """La portada del proyecto colgando de la página padre (o de sus columnas)."""
    return buscar_subpagina(pagina_padre(), PROYECTO)


def buscar_padre_brief():
    # Las páginas se buscan DENTRO de la portada, nunca con /search: el mismo
    # workspace tiene a ClaudePyme Restaurante con su propio "Brief del proyecto"
    # y "Decisiones tecnicas", y /search devolvía el de otro proyecto.
    portada = buscar_portada()
    if not portada:
        sys.exit(f"✗ No se encontró la portada '{PROYECTO}'. ¿Se corrió la sincronización inicial?")
    padre_brief = buscar_subpagina(portada, "Brief del proyecto")
    if not padre_brief:
        sys.exit("✗ No se encontró la página 'Brief del proyecto' dentro de la portada.")
    return padre_brief


def publicar_version():
    """Copia del brief como versión propia ('v2.3 — 26 sep 2026'). Solo cuando el
    dueño la autoriza; el día a día actualiza la portada con --paginas.

        python3 docs/notion/sincronizar.py --version

    La versión sale de la primera línea de 00-BRIEF.md. Las versiones anteriores
    no se tocan.
    """
    brief = (DOCS / "00-BRIEF.md").read_text(encoding="utf-8")
    titulo = titulo_version(brief)
    padre_brief = buscar_padre_brief()

    # ¿Ya existe esta versión? Si sí, se actualiza en vez de duplicar.
    existente = None
    for b in api("GET", f"/blocks/{padre_brief}/children?page_size=100").get("results", []):
        if b["type"] == "child_page" and b["child_page"]["title"].strip() == titulo:
            existente = b["id"]

    bloques = markdown_a_bloques(brief)
    if existente:
        print(f"  ✅ {titulo}: {sincronizar_contenido(existente, bloques)}")
    else:
        crear_pagina(padre_brief, titulo, bloques, "📄")
        print(f"  ✅ {titulo} creada ({len(bloques)} bloques)")


def actualizar_decisiones():
    """'Decisiones tecnicas': todas las decisiones en una página, como índice."""
    decisiones = sorted((DOCS / "decisiones").glob("*.md"))
    bloques = []
    for d in decisiones:
        bloques += markdown_a_bloques(d.read_text(encoding="utf-8"))
        bloques.append({"object": "block", "type": "divider", "divider": {}})

    padre_brief = buscar_padre_brief()
    pagina = buscar_subpagina(padre_brief, "Decisiones tecnicas")
    if pagina:
        print(f"  ✅ Decisiones tecnicas ({len(decisiones)}): {sincronizar_contenido(pagina, bloques)}")
    else:
        crear_pagina(padre_brief, "Decisiones tecnicas", bloques, "🧭")
        print(f"  ✅ Decisiones tecnicas creada ({len(decisiones)} decisiones)")


def actualizar_portada():
    """Reescribe el one-pager con el brief actual.

        python3 docs/notion/sincronizar.py --portada

    Es el paso 4 del versionado que faltaba automatizar: `--version` creaba la
    subpágina de la versión nueva, pero la portada se quedaba con el texto de la
    primera vez. Llevaba cuatro versiones desactualizada.

    Las bases de Fases y Tareas, la columna de diseño y las subpáginas no se
    tocan: se saltan.
    """
    brief = (DOCS / "00-BRIEF.md").read_text(encoding="utf-8")

    # Se busca colgando de la página padre, no por `/search`: el workspace es
    # compartido con otros proyectos y un título repetido reescribiría el ajeno.
    portada = buscar_portada()

    if not portada:
        sys.exit("✗ No se encontró la portada colgando de la página padre.\n"
                 "  ¿Se corrió la sincronización inicial?")

    print(f"  ✅ Portada: {sincronizar_contenido(portada, markdown_a_bloques(brief))}")


def buscar_subpagina(raiz_id, titulo):
    """Busca una subpágina por título bajando también dentro de las columnas.

    Notion trata una disposición en columnas como bloques `column_list` →
    `column` → contenido, así que una página arrastrada a una columna deja de
    ser hija directa. Buscar solo en el primer nivel la daba por inexistente y
    creaba un duplicado — que es justo lo que pasó la primera vez.
    """
    pendientes = [raiz_id]
    while pendientes:
        actual = pendientes.pop(0)
        for b in api("GET", f"/blocks/{actual}/children?page_size=100").get("results", []):
            if b["type"] == "child_page" and b["child_page"]["title"].strip() == titulo:
                return b["id"]
            # Solo se baja por la maquetación, no por las subpáginas: dentro de
            # otra página podría haber una sección con el mismo nombre.
            if b["type"] in ("column_list", "column"):
                pendientes.append(b["id"])
    return None


def buscar_base(pagina_id, titulo):
    """Busca una base de datos hija directa de la página, por su título."""
    for b in api("GET", f"/blocks/{pagina_id}/children?page_size=100").get("results", []):
        if b["type"] == "child_database" and b["child_database"]["title"].strip() == titulo:
            return b["id"]
    return None


def consultar_base(database_id):
    """Todas las filas de una base, paginando (Notion da 100 por llamada)."""
    filas, cursor = [], None
    while True:
        cuerpo = {"page_size": 100}
        if cursor:
            cuerpo["start_cursor"] = cursor
        r = api("POST", f"/databases/{database_id}/query", cuerpo)
        filas += r.get("results", [])
        if not r.get("has_more"):
            break
        cursor = r.get("next_cursor")
    return filas


def titulo_de(pagina, propiedad):
    return "".join(t["plain_text"] for t in pagina["properties"][propiedad]["title"])


ESTADOS_TAREA = {"Pendiente", "En curso", "Bloqueada", "Hecha"}
ESTADOS_FASE = {"Completada", "En curso", "Pendiente", "Bloqueada"}
PRIORIDADES = {"Alta", "Media", "Baja"}


def validar_csv(fases, tareas):
    """Aborta antes de escribir si alguna fila no cuadra.

    Notion crea sin quejarse cualquier opción de select que le llegue, así que
    una coma sin comillas en un título corre las columnas y deja en Notion una
    tarea con Estado = 'Catálogos' y opciones basura en el esquema. Pasó.
    """
    nombres_fase = {f["Fase"] for f in fases}
    errores = [f"fase '{f['Fase']}': estado '{f['Estado']}'"
               for f in fases if f["Estado"] not in ESTADOS_FASE]
    for t in tareas:
        if (t["Estado"] not in ESTADOS_TAREA or t["Prioridad"] not in PRIORIDADES
                or t["Fase"] not in nombres_fase or None in t.values()):
            errores.append(f"tarea '{t['Tarea']}': fase '{t['Fase']}', "
                           f"estado '{t['Estado']}', prioridad '{t['Prioridad']}'")
    if errores:
        sys.exit("✗ CSV con filas inválidas (¿una coma sin comillas?):\n  "
                 + "\n  ".join(errores))


def actualizar_fases_y_tareas():
    """Actualiza las bases de Fases y Tareas desde los CSV, sin duplicar filas.

        python3 docs/notion/sincronizar.py --tareas

    Empareja cada fila por su título (columna `Fase` o `Tarea`): si ya existe en
    Notion, actualiza sus propiedades; si no, la crea. No borra ni archiva filas
    que dejen de estar en el CSV — un título pudo cambiar de forma legítima y
    archivar de más pierde el historial de la tarea; si sobra alguna se archiva
    a mano desde Notion.
    """
    portada = buscar_portada()
    if not portada:
        sys.exit("✗ No se encontró la portada colgando de la página padre.")
    base_fases = buscar_base(portada, "Fases")
    base_tareas = buscar_base(portada, "Tareas")
    if not base_fases or not base_tareas:
        sys.exit("✗ No se encontraron las bases 'Fases' y 'Tareas' colgando de la portada.\n"
                  "  ¿Se corrió la sincronización inicial?")

    fases = list(csv.DictReader((DOCS / "notion" / "fases.csv").open(encoding="utf-8")))
    tareas = list(csv.DictReader((DOCS / "notion" / "tareas.csv").open(encoding="utf-8")))
    validar_csv(fases, tareas)

    filas_fases = [{
        "Fase": {"title": [{"type": "text", "text": {"content": f["Fase"]}}]},
        "Orden": {"number": int(f["Orden"])},
        "Estado": {"select": {"name": f["Estado"]}},
        "Criterio de cierre": texto_prop(f["Criterio de cierre"]),
        "Documento": texto_prop(f["Documento"]),
    } for f in fases]
    filas_tareas = [{
        "Tarea": {"title": [{"type": "text", "text": {"content": t["Tarea"]}}]},
        "Estado": {"select": {"name": t["Estado"]}},
        "Prioridad": {"select": {"name": t["Prioridad"]}},
        "Fase": {"select": {"name": t["Fase"]}},
        "Módulo": {"select": {"name": t["Módulo"]}},
        "Notas": texto_prop(t["Notas"]),
        "Referencia": texto_prop(t["Referencia"]),
    } for t in tareas]
    print(f"  ✅ Fases: {sincronizar_filas(base_fases, 'Fase', filas_fases)}")
    print(f"  ✅ Tareas: {sincronizar_filas(base_tareas, 'Tarea', filas_tareas)}")


def valor_prop(prop):
    """El valor de una propiedad, igual si la armamos nosotros o la devuelve Notion."""
    for clave in ("title", "rich_text"):
        if clave in prop:
            return "".join(t.get("text", {}).get("content", t.get("plain_text", "")) for t in prop[clave])
    if "select" in prop:
        return (prop["select"] or {}).get("name")
    return prop.get("number")


def sincronizar_filas(database_id, titulo, filas):
    """Crea las filas nuevas y actualiza solo las que difieren de Notion."""
    existentes = {titulo_de(p, titulo): p for p in consultar_base(database_id)}
    nuevas = actualizadas = 0
    for props in filas:
        pagina = existentes.get(valor_prop(props[titulo]))
        if pagina is None:
            api("POST", "/pages", {"parent": {"database_id": database_id}, "properties": props})
            nuevas += 1
        elif any(valor_prop(pagina["properties"][k]) != valor_prop(v) for k, v in props.items()):
            api("PATCH", f"/pages/{pagina['id']}", {"properties": props})
            actualizadas += 1
    return f"{actualizadas} actualizadas, {nuevas} nuevas, {len(filas) - actualizadas - nuevas} sin cambios"


def actualizar_modelo_datos():
    """Reescribe 'Modelado de Datos' desde docs/notion_modelado_datos.md.

        python3 docs/notion/sincronizar.py --modelo

    Esta página no la crea la sincronización inicial: cuelga de la portada del
    proyecto. Documenta el esquema vivo, no el brief; el documento en git es la
    fuente de verdad, como manda CLAUDE.md.
    """
    # La misma búsqueda acotada que usa `actualizar_portada`.
    portada = buscar_portada()
    if not portada:
        sys.exit("✗ No se encontró la portada colgando de la página padre.")

    # Las reglas del negocio viajan con el modelo: el modelo las implementa y
    # quien lee uno necesita el otro a mano.
    for archivo, titulo, icono in [
        ("MODELO_DE_DATOS.md", "Modelado de Datos", "🗄️"),
        ("REGLAS_DEL_NEGOCIO.md", "Reglas del negocio", "📏"),
        ("ARBOL-DE-RESPUESTA.md", "Árbol de respuesta del bot", "🌳"),
        ("SIMULACION-CHAT.md", "Simulación del chat", "💬"),
    ]:
        fuente = DOCS / archivo
        if not fuente.exists():
            # En el CRM se escriben en la Fase 2: mientras tanto no hay página.
            print(f"  ·  {titulo}: aún no existe {archivo}, se omite")
            continue
        pagina = buscar_subpagina(portada, titulo)
        bloques = markdown_a_bloques(fuente.read_text(encoding="utf-8"))
        if pagina:
            print(f"  ✅ {titulo}: {sincronizar_contenido(pagina, bloques)}")
        else:
            crear_pagina(portada, titulo, bloques, icono)
            print(f"  ✅ {titulo} creada ({len(bloques)} bloques)")


def actualizar_paginas():
    actualizar_portada()
    actualizar_modelo_datos()
    actualizar_decisiones()


def main():
    inicio = time.monotonic()
    modos = {
        "--version": ("Copia nueva del brief y páginas", [publicar_version, actualizar_paginas]),
        "--todo":    ("Tareas y páginas", [actualizar_fases_y_tareas, actualizar_paginas]),
        "--tareas":  ("Fases y Tareas", [actualizar_fases_y_tareas]),
        "--paginas": ("Portada, modelo, reglas y decisiones", [actualizar_paginas]),
    }
    for bandera, (nombre, pasos) in modos.items():
        if bandera in sys.argv:
            print(f"Notion · {nombre}\n")
            for paso in pasos:
                paso()
            print(f"\n  ⏱  {time.monotonic() - inicio:.0f} s")
            return

    if "--modelo" in sys.argv:
        print("Actualizando Modelado de Datos y Reglas del negocio en Notion\n")
        actualizar_modelo_datos()
        return

    if "--portada" in sys.argv:
        print("Actualizando la portada en Notion\n")
        actualizar_portada()
        return

    print(f"{'SIMULACION — no se escribe nada' if SIMULAR else 'Sincronizando con Notion'}\n")

    padre = pagina_padre()
    print(f"  pagina padre: {padre}")

    brief = (DOCS / "00-BRIEF.md").read_text(encoding="utf-8")
    bloques_brief = markdown_a_bloques(brief)
    print(f"  brief: {len(bloques_brief)} bloques")

    fases = list(csv.DictReader((DOCS / "notion" / "fases.csv").open(encoding="utf-8")))
    tareas = list(csv.DictReader((DOCS / "notion" / "tareas.csv").open(encoding="utf-8")))
    print(f"  fases: {len(fases)}   tareas: {len(tareas)}")

    decisiones = sorted((DOCS / "decisiones").glob("*.md"))
    print(f"  decisiones: {len(decisiones)}")

    # La portada puede existir ya (creada a mano, vacía). Se reutiliza: crear
    # otra con el mismo título dejaría dos y las búsquedas acotadas tomarían
    # la primera que encuentren.
    existente = buscar_portada()
    if existente:
        hijos = api("GET", f"/blocks/{existente}/children?page_size=100").get("results", [])
        if any(b["type"] == "child_database" for b in hijos):
            sys.exit(f"✗ '{PROYECTO}' ya tiene sus bases en Notion: la sincronización inicial ya "
                     "corrió.\n  Para refrescar el brief: --version (o --portada).")

    if SIMULAR:
        print("\n  Se crearia:")
        print(f"    📄 {PROYECTO} (one-pager){'  ← reutiliza la página existente' if existente else ''}")
        print("       🗂️  Fases            ->", len(fases), "registros")
        print("       🗂️  Tareas           ->", len(tareas), "registros")
        print(f"       📄 Brief del proyecto -> {titulo_version(brief)} + Decisiones tecnicas")
        print("       📄 Codigo del proyecto -> Arquitectura, Entorno, Repositorio")
        return

    # --- Pagina principal ---
    if existente:
        reemplazar_contenido(existente, bloques_brief)
        api("PATCH", f"/pages/{existente}", {"icon": {"type": "emoji", "emoji": ICONO}})
        principal = api("GET", f"/pages/{existente}")
        print(f"\n  ✅ Pagina principal completada (ya existía)")
    else:
        principal = crear_pagina(padre, PROYECTO, bloques_brief, ICONO)
        print(f"\n  ✅ Pagina principal creada")
    pid = principal["id"]

    # --- Base de Fases ---
    base_fases = crear_base(pid, "Fases", {
        "Fase": {"title": {}},
        "Orden": {"number": {}},
        "Estado": {"select": {"options": opciones(
            ["Completada", "En curso", "Pendiente", "Bloqueada"],
            {"Completada": "green", "En curso": "blue",
             "Pendiente": "gray", "Bloqueada": "red"})}},
        "Criterio de cierre": {"rich_text": {}},
        "Documento": {"rich_text": {}},
    }, "🚦")
    for f in fases:
        api("POST", "/pages", {
            "parent": {"database_id": base_fases["id"]},
            "properties": {
                "Fase": {"title": [{"type": "text", "text": {"content": f["Fase"]}}]},
                "Orden": {"number": int(f["Orden"])},
                "Estado": {"select": {"name": f["Estado"]}},
                "Criterio de cierre": texto_prop(f["Criterio de cierre"]),
                "Documento": texto_prop(f["Documento"]),
            },
        })
    print(f"  ✅ Fases: {len(fases)} registros")

    # --- Base de Tareas ---
    modulos = sorted({t["Módulo"] for t in tareas})
    fases_t = sorted({t["Fase"] for t in tareas})
    base_tareas = crear_base(pid, "Tareas", {
        "Tarea": {"title": {}},
        "Estado": {"select": {"options": opciones(
            ["Pendiente", "En curso", "Bloqueada", "Hecha"],
            {"Pendiente": "gray", "En curso": "blue",
             "Bloqueada": "red", "Hecha": "green"})}},
        "Prioridad": {"select": {"options": opciones(
            ["Alta", "Media", "Baja"],
            {"Alta": "red", "Media": "yellow", "Baja": "gray"})}},
        "Fase": {"select": {"options": opciones(fases_t, {})}},
        "Módulo": {"select": {"options": opciones(modulos, {})}},
        "Notas": {"rich_text": {}},
        "Referencia": {"rich_text": {}},
    }, "✅")
    for t in tareas:
        api("POST", "/pages", {
            "parent": {"database_id": base_tareas["id"]},
            "properties": {
                "Tarea": {"title": [{"type": "text", "text": {"content": t["Tarea"]}}]},
                "Estado": {"select": {"name": t["Estado"]}},
                "Prioridad": {"select": {"name": t["Prioridad"]}},
                "Fase": {"select": {"name": t["Fase"]}},
                "Módulo": {"select": {"name": t["Módulo"]}},
                "Notas": texto_prop(t["Notas"]),
                "Referencia": texto_prop(t["Referencia"]),
            },
        })
    print(f"  ✅ Tareas: {len(tareas)} registros")

    # --- Subpagina: Brief del proyecto ---
    sub_brief = crear_pagina(pid, "Brief del proyecto", [
        {"object": "block", "type": "paragraph", "paragraph": {
            "rich_text": texto_rico("Una subpagina por version. Al subir version se crea una "
                                    "pagina nueva; no se sobrescribe la anterior.")}}
    ], "📋")
    crear_pagina(sub_brief["id"], titulo_version(brief), bloques_brief, "📄")
    bloques_dec = []
    for d in decisiones:
        bloques_dec += markdown_a_bloques(d.read_text(encoding="utf-8"))
        bloques_dec.append({"object": "block", "type": "divider", "divider": {}})
    crear_pagina(sub_brief["id"], "Decisiones tecnicas", bloques_dec, "🧭")
    print(f"  ✅ Brief del proyecto ({titulo_version(brief)} + decisiones)")

    # --- Subpagina: Codigo del proyecto ---
    sub_cod = crear_pagina(pid, "Codigo del proyecto", [
        {"object": "block", "type": "callout", "callout": {
            "rich_text": texto_rico("El codigo NO vive aqui. La fuente de verdad es el "
                                    "repositorio git; esta seccion documenta como esta hecho."),
            "icon": {"type": "emoji", "emoji": "⚠️"}}},
        {"object": "block", "type": "paragraph", "paragraph": {
            "rich_text": texto_rico(f"Repositorio: `{REPOSITORIO}`")}},
    ], "💻")
    for archivo, titulo, icono in [
        ("sdlc/2-diseno.md", "Arquitectura", "🏗️"),
        ("ENTORNO_LOCAL.md", "Entorno local", "🖥️"),
    ]:
        ruta = DOCS / archivo
        if ruta.exists():
            crear_pagina(sub_cod["id"], titulo,
                         markdown_a_bloques(ruta.read_text(encoding="utf-8")), icono)
    print("  ✅ Codigo del proyecto")

    print(f"\n  Abrir: {principal['url']}")
    print("\n  Falta crear las VISTAS a mano (la API de Notion no las soporta):")
    print("    · Tablero  : Board agrupado por Estado")
    print("    · Bloqueadas: Table filtrada por Estado = Bloqueada")
    print("    · Por fase : Board agrupado por Fase")


if __name__ == "__main__":
    main()

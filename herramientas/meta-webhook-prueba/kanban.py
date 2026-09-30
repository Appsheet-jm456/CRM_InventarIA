"""
Espejo de PRUEBA en el kanban de la v0 (puerto 3000): cada mensaje al número de prueba de Meta crea o
actualiza la tarjeta del cliente en CRM_Leads de Baserow, con los mismos campos que usa lib/crm.js.

Solo toca las filas de los números que le escriben al número de prueba (el dueño y los números que él
verifique en Meta). La conversación NO se ve en la tarjeta: la v0 la lee de Evolution, no de Meta.
"""

import json
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from flujo import _env_local

# Nombre de la etapa del árbol → nombre exacto en CRM_Etapas de la v0 (sin tildes allí).
ETAPA_V0 = {"Nuevo": "Nuevo", "En Conversación": "En Conversacion", "Cotización": "Cotizacion"}
ORDEN = ["nuevo", "en conversacion", "cotizacion", "negociacion", "confirmar transfer", "vendido"]


def _norm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


def _baserow(metodo, ruta, cuerpo=None):
    env = _env_local()
    base = env.get("BASEROW_API_URL") or "https://api.baserow.io"
    peticion = urllib.request.Request(
        f"{base}/api/database/rows/table/{env['CRM_LEADS_TABLE_ID']}/{ruta}", method=metodo,
        headers={"Authorization": f"Token {env['BASEROW_API_TOKEN']}", "Content-Type": "application/json",
                 "User-Agent": "crm-inventaria-prueba/1.0"},
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
    return json.load(urllib.request.urlopen(peticion, timeout=20))


def _buscar(telefono):
    filtro = urllib.parse.quote(telefono)
    datos = _baserow("GET", f"?user_field_names=true&filter__Telefono__equal={filtro}&size=1")
    return (datos.get("results") or [None])[0]


def sincronizar(telefono, nombre, ultimo, st):
    """Crea o actualiza la tarjeta. El embudo solo avanza, y Vendido o Perdido no se tocan."""
    ahora = datetime.now(timezone.utc).isoformat()
    campos = {
        "Ultimo mensaje": f"🤖 {ultimo}"[:500],
        "Fecha ultimo contacto": ahora,
        "Pausar bot": bool(st["pausa"]),
        "Paso menu": st["nodo"] or "",
    }
    if st["campos"].get("Código producto"):
        campos["Cotiz producto"] = st["campos"]["Código producto"]
    if st.get("valor"):
        campos["Valor estimado"] = st["valor"]

    fila = _buscar(telefono)
    nueva = ETAPA_V0.get(st["etapa"] or "Nuevo", "Nuevo")
    if fila is None:
        _baserow("POST", "?user_field_names=true",
                 {"Telefono": telefono, "Nombre": nombre or "", "Etapa": nueva, **campos})
        return f"tarjeta creada en {nueva}"

    actual = fila.get("Etapa")
    actual = actual.get("value") if isinstance(actual, dict) else actual
    if _norm(actual) not in ("vendido", "perdido"):
        i_actual = ORDEN.index(_norm(actual)) if _norm(actual) in ORDEN else -1
        if ORDEN.index(_norm(nueva)) > i_actual:
            campos["Etapa"] = nueva
    if nombre and not fila.get("Nombre"):
        campos["Nombre"] = nombre
    _baserow("PATCH", f"{fila['id']}/?user_field_names=true", campos)
    return f"tarjeta actualizada · etapa {campos.get('Etapa', actual)}"

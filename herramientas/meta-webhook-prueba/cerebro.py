"""
Cerebro del agente (F4·27, RAG-10, RAG-11, RAG-17, RAG-18): llama al modelo principal y, si falla o tarda, al de respaldo.

Sirve a cualquier proveedor: API compatible con OpenAI (DeepSeek, OpenAI, Gemini, local, otros) o Anthropic. La configuración sale de
agente_config (Configuración → Agente → Cerebro) y las llaves de Vault, que solo lee el servidor. Aquí no hay ninguna llave.
No decide qué responder (eso es F4·28): solo habla con el modelo, cuenta tokens y costo, y respeta el presupuesto del mes.
"""

import json
import time
import urllib.error
import urllib.request

import db


class CerebroError(Exception):
    """Ningún modelo respondió: el mensaje lo atiende el modo Híbrido (RAG-10)."""


class TopeAgotado(Exception):
    """Se llegó al presupuesto del mes: se ofrece asesor y el chat pasa a la Bandeja (RAG-17)."""


_cache = {"t": 0, "config": None, "llaves": None}


def cargar(forzar=False):
    """(config, llaves) del cerebro; se relee cada 30 s. Si la base no responde, conserva la última lectura buena."""
    if forzar or time.time() - _cache["t"] > 30:
        try:
            filas = db.pedir("agente_config?id=eq.1&select=*")
            _cache.update(config=filas[0] if filas else None, llaves=db.pedir("rpc/agente_llaves", "POST", {}))
        except Exception:
            pass
        _cache["t"] = time.time()
    return _cache["config"], _cache["llaves"] or {}


def modelo(config, llaves, respaldo=False):
    """Los datos para llamar a un modelo (o None si no hay respaldo)."""
    s = "_respaldo" if respaldo else ""
    if respaldo and not config.get("proveedor_respaldo"):
        return None
    return {
        "proveedor": config["proveedor_respaldo" if respaldo else "proveedor"],
        "modelo": config["modelo_respaldo" if respaldo else "modelo"],
        "url_base": config["url_base" + s],
        "protocolo": config["protocolo" + s],
        "entrada": float(config["precio_entrada_usd" + s] or 0),
        "salida": float(config["precio_salida_usd" + s] or 0),
        "llave": llaves.get("llave_respaldo" if respaldo else "llave"),
    }


def costo_usd(m, tokens_entrada, tokens_salida):
    return (tokens_entrada * m["entrada"] + tokens_salida * m["salida"]) / 1_000_000


def _llamar(m, mensajes, sistema, temperatura, tokens_max, espera):
    base = m["url_base"].rstrip("/")
    if not base.startswith(("http://", "https://")):
        raise CerebroError("dirección del modelo no válida")
    if not m["llave"] and m["proveedor"] != "local":
        raise CerebroError("falta la llave")
    anthropic = m["protocolo"] == "anthropic"
    if anthropic:
        url = f"{base}/v1/messages"
        cabeceras = {"Content-Type": "application/json", "x-api-key": m["llave"] or "", "anthropic-version": "2023-06-01"}
        cuerpo = {"model": m["modelo"], "max_tokens": tokens_max, "temperature": min(temperatura, 1.0), "messages": mensajes}
        if sistema:
            cuerpo["system"] = sistema
    else:
        url = f"{base}/chat/completions"
        cabeceras = {"Content-Type": "application/json"}
        if m["llave"]:
            cabeceras["Authorization"] = f"Bearer {m['llave']}"
        cuerpo = {"model": m["modelo"], "max_tokens": tokens_max, "temperature": temperatura,
                  "messages": ([{"role": "system", "content": sistema}] if sistema else []) + mensajes}
    peticion = urllib.request.Request(url, method="POST", headers=cabeceras, data=json.dumps(cuerpo).encode())
    t0 = time.time()
    try:
        with urllib.request.urlopen(peticion, timeout=espera) as r:
            j = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise CerebroError(f"{m['proveedor']} respondió {e.code}") from e
    except Exception as e:  # sin red, tiempo agotado, JSON roto
        raise CerebroError(f"{m['proveedor']} no respondió: {type(e).__name__}") from e
    if anthropic:
        texto = "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text")
        ent, sal = j.get("usage", {}).get("input_tokens", 0), j.get("usage", {}).get("output_tokens", 0)
    else:
        try:
            texto = j["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as e:
            raise CerebroError(f"{m['proveedor']} devolvió una respuesta sin texto") from e
        ent, sal = j.get("usage", {}).get("prompt_tokens", 0), j.get("usage", {}).get("completion_tokens", 0)
    if not texto.strip():
        raise CerebroError(f"{m['proveedor']} devolvió una respuesta vacía")
    return {"texto": texto.strip(), "tokens_entrada": int(ent or 0), "tokens_salida": int(sal or 0),
            "costo_usd": round(costo_usd(m, ent or 0, sal or 0), 6), "ms": int((time.time() - t0) * 1000),
            "proveedor": m["proveedor"], "modelo": m["modelo"]}


def tope():
    """Gasto del mes contra el presupuesto: {gasto, presupuesto, porcentaje, agotado, turnos_mes}."""
    return db.pedir("rpc/agente_tope", "POST", {})


def completar(mensajes, sistema="", lead_id=None, config=None, llaves=None, simulador=False, detalle=None):
    """Respuesta del modelo a la conversación (lista de {role, content}). Principal, luego respaldo (RAG-10).

    Lanza TopeAgotado si ya se gastó el presupuesto (no llama a ningún modelo de pago) y CerebroError si fallan todos.
    Cada intento, bueno o malo, queda en agente_turnos (RAG-18); los del simulador se marcan aparte y no cuentan para el tope."""
    if config is None:
        config, llaves = cargar()
    if not config:
        raise CerebroError("sin configuración del agente")
    if not simulador and config["proveedor"] != "local" and tope().get("agotado"):
        registrar(lead_id, {"proveedor": config["proveedor"], "modelo": config["modelo"]}, "tope", detalle=detalle)
        raise TopeAgotado()
    errores = []
    for respaldo in (False, True):
        m = modelo(config, llaves, respaldo)
        if m is None:
            continue
        try:
            r = _llamar(m, mensajes, sistema, float(config["temperatura"]), int(config["tokens_max"]), int(config["espera_segundos"]))
        except CerebroError as e:
            errores.append(str(e))
            registrar(lead_id, m, "simulador" if simulador else "error", detalle={**(detalle or {}), "error": str(e), "respaldo": respaldo})
            continue
        registrar(lead_id, m, "simulador" if simulador else "respondido", r, {**(detalle or {}), "respaldo": respaldo})
        r["respaldo"] = respaldo
        return r
    raise CerebroError("; ".join(errores) or "sin modelo configurado")


def registrar(lead_id, m, resultado, r=None, detalle=None):
    """Un turno en agente_turnos. Nunca lanza: el registro no puede tumbar una respuesta."""
    try:
        db.pedir("agente_turnos", "POST", {
            "lead_id": lead_id, "proveedor": m["proveedor"], "modelo": m["modelo"],
            "tokens_entrada": (r or {}).get("tokens_entrada", 0), "tokens_salida": (r or {}).get("tokens_salida", 0),
            "costo_usd": (r or {}).get("costo_usd", 0), "ms": (r or {}).get("ms"), "resultado": resultado,
            "detalle": detalle or {}}, prefer="return=minimal")
    except Exception:
        pass

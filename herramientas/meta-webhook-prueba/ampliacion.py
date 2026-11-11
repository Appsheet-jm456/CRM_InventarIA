"""
Aumentar RAM o disco en el pedido del bot (F4·73, docs/AMPLIACIONES-RAM-DISCO.md, RAM-01 a RAM-08).

Qué se le puede ampliar a un equipo y a qué precio, según sus atributos (ram_ranuras, ram_velocidad, disco_tipo), su RAM y su disco
actuales y la tabla `ampliaciones` (Agente → Compra). El flujo con el cliente está en compra.py.
"""

import re

import db
import flujo


def gb(texto):
    """«8GB» → 8, «16 GB DDR4» → 16, «512GB SSD» → 512, «1TB» → 1024, «256» → 256. None si no se entiende."""
    t = str(texto or "").upper()
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(TB|GB)", t)
    if m:
        n = float(m.group(1).replace(",", "."))
        return int(n * 1024) if m.group(2) == "TB" else int(n)
    m = re.fullmatch(r"\s*(\d+)\s*", t)
    return int(m.group(1)) if m else None


def texto_gb(n):
    return f"{n // 1024}TB" if n >= 1024 and n % 1024 == 0 else f"{n}GB"


def _attr(p, clave):
    v = (p.get("atributos") or {}).get(clave)
    return v.strip() if isinstance(v, str) else v


def disponible(c, cfg):
    """RAM-01: interruptor encendido, renglones activos y al menos un equipo del inventario en el pedido."""
    if not cfg.get("ampliacion_activa", True):
        return False
    if not any(not i.get("libre") for i in (c.get("equipos") or [])) and not c.get("codigo"):
        return False
    try:
        return bool(db.ampliaciones())
    except Exception:
        return False


def estado_ram(p):
    """RAM-02: «ok» si tiene ranuras, «onboard» si es soldada sin ranura, «sin_datos» si nadie llenó las ranuras."""
    ranuras = _attr(p, "ram_ranuras")
    if not ranuras:
        return "sin_datos"
    return "onboard" if flujo.normalizar(ranuras) in ("ninguna", "0", "no") else "ok"


def velocidad(p):
    """RAM-03: el atributo; si falta, la velocidad escrita en la RAM («DDR4 3200»); si falta, la generación Intel (≤ 7.ª → 2400)."""
    v = _attr(p, "ram_velocidad")
    if v in ("2400", "2666-3200"):
        return v
    ram = str(p.get("ram") or "")
    if re.search(r"\b2400\b", ram):
        return "2400"
    if re.search(r"\b(2666|2933|3200)\b", ram):
        return "2666-3200"
    gen = p.get("gen")
    if isinstance(gen, int) and gen > 0:
        return "2400" if gen <= 7 else "2666-3200"
    return None


def es_nvme(p):
    """RAM-04: el atributo «Tipo de disco»; si falta, «NVMe» en el texto del disco."""
    t = _attr(p, "disco_tipo")
    if t in ("SATA", "NVMe"):
        return t == "NVMe"
    return "nvme" in flujo.normalizar(p.get("disco") or "")


def opciones_ram(p):
    """Las opciones de RAM para su RAM actual y su velocidad. None si no se sabe la velocidad (lo confirma un asesor)."""
    v = velocidad(p)
    if v is None:
        return None
    actual = gb(p.get("ram"))
    filas = [a for a in db.ampliaciones() if a["tipo"] == "ram" and a["desde_gb"] == actual]
    return [{"tipo": "ram", "desde": a["desde_gb"], "hasta": a["hasta_gb"],
             "precio": int(a["precio_rapida"] if v != "2400" and a.get("precio_rapida") else a["precio"]), "detalle": f"{v} MHz"}
            for a in filas]


def opciones_disco(p, cfg):
    """Las opciones de disco para su disco actual; con NVMe, el adicional de Agente → Compra."""
    actual = gb(p.get("disco"))
    nvme = es_nvme(p)
    extra = int(cfg.get("ampliacion_nvme") or 0) if nvme else 0
    return [{"tipo": "disco", "desde": a["desde_gb"], "hasta": a["hasta_gb"], "precio": int(a["precio"]) + extra,
             "detalle": "NVMe" if nvme else "SSD SATA"}
            for a in db.ampliaciones() if a["tipo"] == "disco" and a["desde_gb"] == actual]


def renglon(op, equipo, codigo):
    """RAM-06: el renglón del pedido. Sin stock ni código de inventario (libre); `ampliacion` dice de qué equipo es."""
    que = "RAM" if op["tipo"] == "ram" else "disco"
    extra = " NVMe" if op["tipo"] == "disco" and op.get("detalle") == "NVMe" else ""
    return {"codigo": f"AMP-{op['tipo'].upper()}-{codigo}", "libre": True, "precio": op["precio"],
            "equipo": f"Aumento {que} {texto_gb(op['desde'])} → {texto_gb(op['hasta'])}{extra} ({equipo})",
            "ampliacion": {"tipo": op["tipo"], "de": codigo, "desde": op["desde"], "hasta": op["hasta"]}}

"""
Mensajes al cliente del alistamiento (F4·50 bloque C, docs/ALISTAMIENTO-Y-VIDEO-TECNICO.md, RAL-07).

El asesor pulsa un botón en la ficha del cliente; la base registra y permite (alistamiento_para_enviar / alistamiento_guia) y el receptor,
por /interno/alistamiento, arma aquí los mensajes y los envía. Este módulo solo arma: no habla con Meta ni con la base, para poder probarlo.
"""

LIMITE_VIDEO = 16 * 1024 * 1024  # WhatsApp: video hasta 16 MB; más grande se manda como documento (hasta 100 MB)
TIENDA = "📍 CC La Pasarela, local 2-107, Cali – Valle."
CAMPO = {"video": "video_enviado_en", "documento": "documento_enviado_en", "guia": "guia_enviada_en", "listo_tienda": "aviso_tienda_en"}


def nombre_documento(tipo):
    return "factura electrónica (FVE)" if tipo == "FVE" else "orden de garantía (OP)"


def videos_a_enviar(videos):
    """El último video listo de cada equipo, en el orden de los equipos."""
    ultimo = {}
    for v in sorted(videos, key=lambda v: v["subido_en"]):
        if v["estado"] == "listo" and v.get("ruta"):
            ultimo[v["equipo_codigo"]] = v
    return list(ultimo.values())


def mensaje_video(media_id, peso, nombre_equipo):
    pie = f"🎥 Revisión de tu {nombre_equipo}"
    if (peso or 0) > LIMITE_VIDEO:
        return {"type": "document", "document": {"id": media_id, "filename": "Video de revision.mp4", "caption": pie}}
    return {"type": "video", "video": {"id": media_id, "caption": pie}}


def texto_video():
    return {"type": "text", "text": {"body": "🛠️ Así quedó tu equipo después de la revisión de nuestro servicio técnico. ✅\n"
                                             "Te compartimos el video de soporte técnico 👇"}}


def texto_documento(a):
    return {"type": "text", "text": {"body": f"🧾 Tu {nombre_documento(a['doc_tipo'])} es la N.° *{a['doc_numero']}*.\n"
                                             "Guárdala: la necesitas para cualquier garantía. 🙌"}}


def pie_guia(a):
    lineas = ["📦 *¡Tu pedido va en camino!*", f"🚚 Transportadora: *{a['transportadora']}*", f"🔢 Guía N.° *{a['numero_guia']}*"]
    if a.get("doc_numero"):
        lineas.append(f"🧾 {nombre_documento(a['doc_tipo']).capitalize()}: N.° {a['doc_numero']}")
    lineas.append("Con el número de guía puedes rastrear tu envío en la página de la transportadora.")
    return "\n".join(lineas)[:1024]


def texto_listo_tienda(horario=""):
    cuerpo = f"🔔 *¡Tu equipo está listo!* 🙌\nYa pasó por la revisión de nuestro servicio técnico y puedes recogerlo en la tienda:\n{TIENDA}"
    return {"type": "text", "text": {"body": cuerpo + (f"\n\n{horario}" if horario else "")}}

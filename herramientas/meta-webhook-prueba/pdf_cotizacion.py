"""
PDF de la cotización (F4·26, RAG-27). HTML → PDF con wkhtmltopdf (ya instalado en el servidor), con los colores y el logo
de Apariencia (F4·19). Sin red: el logo va embebido en el HTML.
"""

import base64
import html
import subprocess
from datetime import datetime

# Los de la marca (crm/src/lib/marca.ts) cuando Apariencia no tiene colores propios.
PANEL, PRINCIPAL, ACENTO = "#0F1E33", "#2563C9", "#F2A23A"


def cop(n):
    return "$" + f"{float(n):,.0f}".replace(",", ".")


def numero(consecutivo):
    return f"COT-{int(consecutivo):06d}"


def _e(s):
    return html.escape(str(s or ""))


def armar_html(c, apariencia=None, logo=None, logo_mime="image/png", recargo_tarjeta=6, ahora=None):
    """c: la fila de cotizaciones (consecutivo, nombre, cedula, celular, tipo_cliente, items, cargos, subtotal, total,
    valida_hasta). items: [{codigo, nombre, detalle, cantidad, precio}]."""
    a = apariencia or {}
    panel, principal, acento = a.get("color_panel") or PANEL, a.get("color_principal") or PRINCIPAL, a.get("color_acento") or ACENTO
    ahora = ahora or datetime.now()
    vence = c["valida_hasta"] if isinstance(c["valida_hasta"], datetime) else datetime.fromisoformat(str(c["valida_hasta"]))
    marca = (f'<img class="logo" src="data:{logo_mime};base64,{base64.b64encode(logo).decode()}">' if logo
             else f'<div class="mono-logo" style="color:{principal}">VV<span style="background:{acento}"></span></div>')
    filas = "".join(
        f"<tr><td class='cod'>{_e(i['codigo'])}</td><td><b>{_e(i['nombre'])}</b><br><small>{_e(i.get('detalle'))}</small></td>"
        f"<td class='n'>{int(i['cantidad'])}</td><td class='n'>{cop(i['precio'])}</td><td class='n'>{cop(i['precio'] * int(i['cantidad']))}</td></tr>"
        for i in c["items"])
    cargos = "".join(f"<tr><td>{_e(x['concepto'])}</td><td class='n'>{cop(x['valor'])}</td></tr>" for x in c.get("cargos") or [])
    tipo = "Distribuidor" if c["tipo_cliente"] == "distribuidor" else "Cliente final"
    tarjeta = cop(float(c["total"]) * (1 + recargo_tarjeta / 100)) if recargo_tarjeta else None
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  @page {{ margin: 0 }}
  html {{ zoom: 1.4 }}  /* wkhtmltopdf 0.12.6 ignora --zoom: la escala va en la página */
  * {{ box-sizing: border-box }}
  body {{ margin: 0; font-family: 'DejaVu Sans', Arial, sans-serif; color: #182231; font-size: 11.5px }}
  .banda {{ background: {panel}; color: #fff; padding: 26px 40px; }}
  .banda table {{ width: 100%; border-collapse: collapse }}
  .logo {{ height: 54px; max-width: 160px; background: #fff; border-radius: 10px; padding: 5px }}
  .mono-logo {{ position: relative; display: inline-block; width: 54px; height: 54px; line-height: 54px; text-align: center;
               background: #fff; border-radius: 12px; font-weight: bold; font-size: 20px }}
  .mono-logo span {{ position: absolute; right: -4px; bottom: -4px; width: 14px; height: 14px; border-radius: 7px; border: 3px solid {panel} }}
  .empresa {{ font-size: 17px; font-weight: bold; padding-left: 14px }}
  .empresa small {{ display: block; font-weight: normal; font-size: 11px; color: #A9B6C9 }}
  .doc {{ text-align: right }}
  .doc b {{ font-size: 20px; display: block }}
  .doc span {{ color: #A9B6C9 }}
  .cuerpo {{ padding: 26px 40px 10px }}
  .cliente {{ width: 100%; border-collapse: collapse; margin-bottom: 20px }}
  .cliente td {{ padding: 6px 0; vertical-align: top; width: 25% }}
  .cliente small {{ display: block; color: #5C6B7E; font-size: 9.5px; text-transform: uppercase; letter-spacing: .6px }}
  table.items {{ width: 100%; border-collapse: collapse }}
  .items th {{ text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: .6px; color: #5C6B7E;
              border-bottom: 2px solid {principal}; padding: 8px 6px }}
  .items td {{ padding: 10px 6px; border-bottom: 1px solid #DCE2EA; vertical-align: top }}
  .items small {{ color: #5C6B7E }}
  .cod {{ font-family: 'DejaVu Sans Mono', monospace; font-size: 10.5px; white-space: nowrap }}
  .n {{ text-align: right; white-space: nowrap }}
  .totales {{ width: 46%; margin-left: 54%; border-collapse: collapse; margin-top: 12px }}
  .totales td {{ padding: 6px }}
  .totales .total td {{ border-top: 2px solid {principal}; font-size: 15px; font-weight: bold; color: {principal}; padding-top: 10px }}
  .notas {{ margin-top: 24px; padding: 14px 16px; background: #F4F6F9; border-left: 4px solid {acento}; border-radius: 4px; line-height: 1.6 }}
  .pie {{ padding: 16px 40px; color: #5C6B7E; font-size: 9.5px }}
</style></head><body>
<div class="banda"><table><tr>
  <td style="width:70px">{marca}</td>
  <td class="empresa">Ventas Virtuales Colombia<small>Portátiles y equipos de cómputo</small></td>
  <td class="doc"><b>Cotización</b>{numero(c['consecutivo'])}<br><span>{ahora:%d/%m/%Y %H:%M}</span></td>
</tr></table></div>
<div class="cuerpo">
  <table class="cliente"><tr>
    <td><small>Cliente</small>{_e(c['nombre'])}</td>
    <td><small>Cédula / NIT</small>{_e(c['cedula'])}</td>
    <td><small>Celular</small>{_e(c['celular'])}</td>
    <td><small>Tipo</small>{tipo}</td>
  </tr></table>
  <table class="items">
    <tr><th>Código</th><th>Equipo</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Valor</th></tr>
    {filas}
  </table>
  <table class="totales">
    <tr><td>Subtotal</td><td class="n">{cop(c['subtotal'])}</td></tr>
    {cargos}
    <tr class="total"><td>Total</td><td class="n">{cop(c['total'])}</td></tr>
  </table>
  <div class="notas">
    <b>Válida hasta el {vence:%d/%m/%Y a las %H:%M}</b> o hasta agotar existencias: la disponibilidad se confirma al pagar.<br>
    {f'Pago con tarjeta de crédito (datáfono o link de pago): valor adicional del {recargo_tarjeta:g} %, total {tarjeta}.<br>' if tarjeta else ''}
    Para comprar, escríbenos <b>«quiero comprar»</b> por WhatsApp y te enviamos los datos para pagar.
  </div>
</div>
<div class="pie">Precios en pesos colombianos (COP). Documento generado automáticamente por CRM InventarIA.</div>
</body></html>"""


def generar(c, apariencia=None, logo=None, logo_mime="image/png", recargo_tarjeta=6):
    """Devuelve los bytes del PDF (tamaño carta)."""
    contenido = armar_html(c, apariencia, logo, logo_mime, recargo_tarjeta).encode("utf-8")
    r = subprocess.run(["wkhtmltopdf", "--quiet", "--encoding", "utf-8", "--page-size", "Letter",
                        "--margin-top", "0", "--margin-bottom", "0", "--margin-left", "0", "--margin-right", "0", "-", "-"],
                       input=contenido, capture_output=True, timeout=60)
    if r.returncode not in (0, 1) or not r.stdout.startswith(b"%PDF"):  # 1 = avisos sin importancia
        raise RuntimeError(f"wkhtmltopdf falló: {r.stderr.decode()[:300]}")
    return r.stdout

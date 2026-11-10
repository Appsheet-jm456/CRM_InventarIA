// F4·54 (docs/PEDIDOS.md, RPD-01 a RPD-05, RPD-16, RPD-17): lo que se deduce de los datos del pedido, sin llamar a nadie.

export type Entrega = 'envio' | 'tienda' | null

export type Datos = {
  numero: number
  estado: 'por_revisar' | 'en_revision' | 'listo'
  doc_tipo: 'OP' | 'FVE' | null
  doc_numero: string | null
  doc_ruta?: string | null // F4·63: el PDF o la foto del documento
  doc_nombre?: string | null
  creado_en: string
  tomado_en: string | null
  listo_en: string | null
  guia_en: string | null
  guia_enviada_en: string | null
  documento_enviado_en: string | null
  video_enviado_en: string | null
  primer_documento_en: string | null
  primer_video_en: string | null
  aviso_tienda_en: string | null
  entregado_en: string | null
  cancelado_en: string | null
  correccion_documento_en?: string | null
  correccion_video_en?: string | null
}

export const HORAS_REENVIO = 24

export const numeroPedido = (n: number) => `PED-${String(n).padStart(4, '0')}`
export const nombreDocumento = (t: 'OP' | 'FVE' | null) => (t === 'OP' ? 'OP de garantía' : 'FVE')

export type Paso = { clave: string; titulo: string; hecho: boolean; actual: boolean; cuando: string | null; detalle: string | null }

// Barra de pasos (RPD-02): Pago → Alistamiento → Listo → Enviado → Entregado. En envío son cuatro: la guía cierra el pedido (Vendido).
export function pasos(d: Datos, entrega: Entrega): Paso[] {
  const base: Omit<Paso, 'actual' | 'detalle'>[] = [
    { clave: 'pago', titulo: 'Pago', hecho: true, cuando: d.creado_en },
    { clave: 'alistamiento', titulo: 'Alistamiento', hecho: !!d.tomado_en, cuando: d.tomado_en },
    { clave: 'listo', titulo: 'Listo', hecho: d.estado === 'listo', cuando: d.listo_en },
    entrega === 'tienda'
      ? { clave: 'enviado', titulo: 'Aviso de recogida', hecho: !!d.aviso_tienda_en, cuando: d.aviso_tienda_en }
      : { clave: 'enviado', titulo: 'Enviado', hecho: !!d.guia_enviada_en, cuando: d.guia_enviada_en },
  ]
  if (entrega === 'tienda') base.push({ clave: 'entregado', titulo: 'Entregado', hecho: !!d.entregado_en, cuando: d.entregado_en })
  const primero = base.findIndex((p) => !p.hecho)
  return base.map((p, i) => ({
    ...p,
    actual: !d.cancelado_en && i === primero,
    detalle: !d.cancelado_en && i === primero
      ? (p.clave === 'alistamiento' ? 'Por tomar' : p.clave === 'listo' && d.estado === 'en_revision' ? 'En revisión' : null)
      : null,
  }))
}

export type Siguiente = { texto: string; seccion: 'tecnico' | 'documento' | 'enviar' | null; tono: 'aviso' | 'info' | 'ok' }

// «Siguiente paso» (RPD-03): una sola acción sugerida. Los envíos van en orden: video → documento → guía o aviso de recogida.
export function siguiente(d: Datos, entrega: Entrega, ctx: { videosListos: boolean; videos: number; equipos: number }): Siguiente | null {
  if (d.cancelado_en) return null
  // RPD-31: una corrección que el cliente aún no recibió va primero
  if (d.correccion_video_en && (!d.video_enviado_en || d.video_enviado_en < d.correccion_video_en)) {
    return { texto: 'Envía al cliente el video corregido', seccion: 'enviar', tono: 'aviso' }
  }
  if (d.correccion_documento_en && (!d.documento_enviado_en || d.documento_enviado_en < d.correccion_documento_en)) {
    return { texto: `Envía al cliente su ${nombreDocumento(d.doc_tipo)} corregida`, seccion: 'enviar', tono: 'aviso' }
  }
  // F4·63: el documento ya no detiene al técnico; se pide cuando el equipo está revisado (antes de enviar o entregar).
  if (d.estado === 'por_revisar') return { texto: 'Esperando que el servicio técnico tome el pedido', seccion: 'tecnico', tono: 'info' }
  if (d.estado === 'en_revision') {
    return { texto: `El servicio técnico está revisando · ${Math.min(ctx.videos, ctx.equipos)} de ${ctx.equipos} videos`, seccion: 'tecnico', tono: 'info' }
  }
  if (!d.doc_numero) return { texto: 'Falta el documento: escribe el OP o la FVE y sube su PDF', seccion: 'documento', tono: 'aviso' }
  if (!entrega) return { texto: 'Marca en la pestaña Principal si la venta es online o en tienda', seccion: null, tono: 'aviso' }
  if (!d.video_enviado_en && ctx.videosListos) return { texto: 'Envía al cliente el video de la revisión', seccion: 'enviar', tono: 'aviso' }
  if (!d.documento_enviado_en) return { texto: `Envía al cliente su ${nombreDocumento(d.doc_tipo)}`, seccion: 'enviar', tono: 'aviso' }
  if (entrega === 'envio') {
    if (!d.guia_enviada_en) {
      return { texto: d.guia_en ? 'La guía quedó registrada pero no llegó al cliente: reintenta el envío' : 'Sube la foto de la guía y envíala', seccion: 'enviar', tono: 'aviso' }
    }
  } else {
    if (!d.aviso_tienda_en) return { texto: 'Avisa al cliente que ya puede recoger su equipo', seccion: 'enviar', tono: 'aviso' }
    if (!d.entregado_en) return { texto: 'Marca «Entregado» cuando el cliente recoja el equipo', seccion: 'enviar', tono: 'info' }
  }
  return { texto: 'Pedido completo', seccion: null, tono: 'ok' }
}

export type Ventana = { estado: 'nuevo' | 'reenviable' | 'cerrado'; hasta: string | null }

// RPD-17: video y documento se pueden reenviar 24 h desde el primer envío y mientras el pedido siga abierto (la base lo vuelve a comprobar).
export function ventana(enviado: string | null, primero: string | null, abierta: boolean, ahora = Date.now()): Ventana {
  if (!enviado) return { estado: 'nuevo', hasta: null }
  const inicio = new Date(primero ?? enviado).getTime()
  const limite = inicio + HORAS_REENVIO * 3600_000
  return abierta && ahora <= limite ? { estado: 'reenviable', hasta: new Date(limite).toISOString() } : { estado: 'cerrado', hasta: null }
}

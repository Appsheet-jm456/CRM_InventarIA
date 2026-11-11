'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

// F4·50 (RAL-06, RAL-08): el servicio técnico usa un solo usuario; cada acción lleva el nombre elegido en «¿Quién eres?» y la base lo valida.
async function llamar(funcion: string, argumentos: Record<string, unknown>, ok: string): Promise<Resultado> {
  const { error } = await crearCliente().rpc(funcion, argumentos)
  if (error) return { error: error.code === '42501' ? 'No tienes permiso para esta operación.' : error.message }
  revalidatePath('/servicio-tecnico')
  return { ok }
}

export async function tomarPedido(id: number, tecnico: string) {
  return llamar('alistamiento_tomar', { p_id: id, p_tecnico: tecnico }, 'Pedido tomado: queda a tu nombre.')
}

export async function marcarChecklist(id: number, clave: string, valor: boolean, tecnico: string) {
  return llamar('alistamiento_checklist', { p_id: id, p_clave: clave, p_valor: valor, p_tecnico: tecnico }, valor ? 'Marcado.' : 'Desmarcado.')
}

export async function marcarListo(id: number, tecnico: string) {
  return llamar('alistamiento_listo', { p_id: id, p_tecnico: tecnico }, 'Listo para despachar. El asesor ya lo ve.')
}

// Bloque B (RAL-05): el video ya está en el bucket; la base comprueba que llegó, que el equipo es del pedido y quién lo subió.
export async function registrarVideo(id: number, codigo: string, ruta: string, peso: number, tecnico: string) {
  return llamar('alistamiento_video_registrar', { p_id: id, p_codigo: codigo, p_ruta: ruta, p_peso: peso, p_tecnico: tecnico },
    'Video subido. Se está preparando (tarda uno o dos minutos).')
}

export async function reabrirPedido(id: number, tecnico: string) {
  return llamar('alistamiento_reabrir', { p_id: id, p_tecnico: tecnico }, 'Revisión abierta de nuevo.')
}

// Desde la ficha del cliente: el asesor pone el OP o la FVE que le da contabilidad (RAL-03).
export async function guardarDocumento(id: number, lead: number, tipo: string, numero: string) {
  const r = await llamar('alistamiento_documento', { p_id: id, p_tipo: tipo, p_numero: numero }, 'Documento guardado.')
  if (!r.error) revalidatePath(`/leads/${lead}`)
  return r
}

// --------------------------------------------------------------------------- //
// Bloque C (RAL-07): lo que el asesor le manda al cliente. La base permite y registra; el receptor envía por WhatsApp.
// --------------------------------------------------------------------------- //
type Pedido = { lead: number; alistamiento: number; que: string }

async function enviarPorReceptor(pedido: Pedido): Promise<Resultado> {
  if (!process.env.CRM_INTERNO_URL || !process.env.CRM_INTERNO_TOKEN) return { error: 'Falta la conexión con el receptor del bot.' }
  try {
    const r = await fetch(`${process.env.CRM_INTERNO_URL}/interno/alistamiento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Interno-Token': process.env.CRM_INTERNO_TOKEN },
      body: JSON.stringify(pedido),
      cache: 'no-store',
      signal: AbortSignal.timeout(120000), // subir los videos a Meta puede tardar
    })
    if (r.status === 404) return { error: 'El receptor no encontró el pedido o el teléfono del cliente.' }
    if (!r.ok) return { error: `El receptor del bot respondió ${r.status}. Si lo acaban de actualizar, reinícialo.` }
    const d = (await r.json()) as { ok: boolean; error?: string; aviso?: string | null }
    return d.ok ? { ok: d.aviso ? `Enviado. ${d.aviso}` : 'Enviado al cliente por WhatsApp.' } : { error: d.error ?? 'No se pudo enviar.' }
  } catch {
    return { error: 'El receptor del bot no responde.' }
  }
}

export async function enviarAlCliente(id: number, lead: number, que: 'video' | 'documento' | 'listo_tienda' | 'guia'): Promise<Resultado> {
  const { data, error } = await crearCliente().rpc('alistamiento_para_enviar', { p_id: id, p_que: que })
  if (error) return { error: error.code === '42501' ? 'No tienes permiso o la atiende otro asesor.' : error.message }
  const r = await enviarPorReceptor(data as Pedido)
  revalidatePath(`/leads/${lead}`)
  return r
}

// «📦 Enviar guía»: la base guarda la guía y pasa la oportunidad a Despachado y Vendido; luego se le manda la foto al cliente.
export async function registrarGuia(id: number, lead: number, ruta: string, transportadora: string, numero: string): Promise<Resultado> {
  const { data, error } = await crearCliente().rpc('alistamiento_guia', { p_id: id, p_ruta: ruta, p_transportadora: transportadora, p_numero: numero })
  if (error) return { error: error.code === '42501' ? 'No tienes permiso o la atiende otro asesor.' : error.message }
  revalidatePath(`/leads/${lead}`)
  revalidatePath('/servicio-tecnico')
  const r = await enviarPorReceptor(data as Pedido)
  return r.error ? { error: `La guía quedó registrada (Despachado y Vendido), pero no se le pudo enviar al cliente: ${r.error} Usa «Reintentar envío».` }
    : { ok: 'Guía enviada al cliente. El pedido quedó Despachado y Vendido.' }
}

// F4·67 (RPD-57 a RPD-60): el administrador elimina un pedido de prueba; la base devuelve el stock que su pago descontó y dice qué
// archivos quedaron sin dueño (guía, documento, videos, soportes a mano), que se borran aquí con la clave de servicio.
export async function eliminarPedido(id: number, lead: number, motivo: string): Promise<Resultado> {
  const { data, error } = await crearCliente().rpc('pedido_eliminar', { p_id: id, p_motivo: motivo })
  if (error) return { error: error.code === '42501' ? 'Solo un administrador puede eliminar pedidos.' : error.message }
  const r = data as { numero: number; repuestos: string[]; archivos: Record<string, string[]> }
  const admin = crearClienteAdmin()
  for (const [bucket, rutas] of Object.entries(r.archivos ?? {})) {
    if (rutas?.length) await admin.storage.from(bucket).remove(rutas)
  }
  revalidatePath('/pedidos')
  revalidatePath(`/leads/${lead}`)
  revalidatePath('/servicio-tecnico')
  revalidatePath('/inventario')
  const numero = `PED-${String(r.numero).padStart(4, '0')}`
  return { ok: r.repuestos?.length ? `${numero} eliminado. Volvió al stock: ${r.repuestos.join(', ')}.` : `${numero} eliminado. No había stock que devolver.` }
}

// F4·54 (RPD-19): cancelar el pedido con motivo antes de que salga la guía; la oportunidad queda Perdida.
export async function cancelarPedido(id: number, lead: number, motivo: string): Promise<Resultado> {
  const r = await llamar('alistamiento_cancelar', { p_id: id, p_motivo: motivo }, 'Pedido cancelado. La oportunidad quedó Perdida.')
  revalidatePath(`/leads/${lead}`)
  revalidatePath('/servicio-tecnico')
  return r
}

// F4·54 (RPD-29): pedido cerrado. Corregir el documento, o autorizar que el técnico suba un video corregido; siempre con motivo.
export async function corregirDocumento(id: number, lead: number, tipo: string, numero: string, motivo: string): Promise<Resultado> {
  const r = await llamar('alistamiento_corregir_documento', { p_id: id, p_tipo: tipo, p_numero: numero, p_motivo: motivo },
    'Documento corregido. Puedes enviárselo al cliente una vez.')
  revalidatePath(`/leads/${lead}`)
  return r
}

export async function autorizarVideoCorregido(id: number, lead: number | null, motivo: string): Promise<Resultado> {
  const r = await llamar('alistamiento_corregir_video', { p_id: id, p_motivo: motivo },
    'Autorizado: el técnico ya puede subir el video corregido en Servicio técnico → Cerrados.')
  if (lead) revalidatePath(`/leads/${lead}`)
  return r
}

export async function marcarEntregado(id: number, lead: number): Promise<Resultado> {
  const r = await llamar('alistamiento_entregado', { p_id: id }, 'Entregado en tienda: el pedido quedó Vendido.')
  revalidatePath(`/leads/${lead}`)
  return r
}

// F4·63: el PDF o la foto del OP / FVE. Se sube con la sesión del asesor (la política del bucket pide gestionar_oportunidades),
// la base revisa el pedido y lo registra; el archivo anterior se borra.
const DOCUMENTO_MIME: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }
export async function subirArchivoDocumento(id: number, lead: number, datos: FormData): Promise<Resultado> {
  const archivo = datos.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) return { error: 'Elige el PDF o la foto del documento.' }
  const ext = DOCUMENTO_MIME[archivo.type]
  if (!ext) return { error: 'El documento debe ser PDF, JPG o PNG.' }
  if (archivo.size > 10 * 1024 * 1024) return { error: 'El documento pesa más de 10 MB.' }
  const limpio = (archivo.name || `documento.${ext}`).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)
  const ruta = `${id}/${Date.now()}-${limpio}`
  const sb = crearCliente()
  const { error: errSubida } = await sb.storage.from('documentos').upload(ruta, archivo, { contentType: archivo.type })
  if (errSubida) return { error: /policy|security/i.test(errSubida.message) ? 'No tienes permiso para subir documentos.' : `No se pudo subir: ${errSubida.message}` }
  const { data: anterior, error } = await sb.rpc('alistamiento_documento_archivo', { p_id: id, p_ruta: ruta, p_mime: archivo.type, p_nombre: archivo.name })
  if (error) {
    await crearClienteAdmin().storage.from('documentos').remove([ruta])
    return { error: error.code === '42501' ? 'No tienes permiso para esta operación.' : error.message }
  }
  if (anterior) await crearClienteAdmin().storage.from('documentos').remove([anterior as string])
  revalidatePath(`/leads/${lead}`)
  revalidatePath('/pedidos')
  return { ok: 'Archivo del documento guardado. Se envía al cliente con «Enviar» en «Enviar al cliente».' }
}

'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

// La ficha usa las funciones de la base (0034 y las de la Bandeja): mismos permisos y todo queda en el historial.
async function llamar(funcion: string, argumentos: Record<string, unknown>, lead: number): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await crearCliente().rpc(funcion, argumentos)
  if (error) return { error: error.code === '42501' ? 'No tienes permiso o la atiende otro asesor.' : error.message }
  revalidatePath(`/leads/${lead}`)
  return { data }
}

export async function editarLead(lead: number, cambios: { nombre?: string; valor?: number | null }): Promise<Resultado> {
  return llamar('lead_editar', { p_lead: lead, p_nombre: cambios.nombre ?? null, p_valor: cambios.valor ?? null }, lead)
}

export async function guardarAtributos(lead: number, cambios: Record<string, unknown>): Promise<Resultado & { atributos?: Record<string, unknown> }> {
  const r = await llamar('lead_guardar_atributos', { p_lead: lead, p_cambios: cambios }, lead)
  return r.error ? r : { atributos: r.data as Record<string, unknown> }
}

// «Guardar cambios» (F4·33, RL-25): nombre, valor y atributos juntos. `antes` es lo que el asesor vio al abrir; si otro lo cambió
// mientras tanto, la base no guarda y devuelve los conflictos (con `forzar`, guarda igual).
export type Guardado = Resultado & {
  conflictos?: Record<string, unknown>
  lead?: { atributos: Record<string, unknown>; nombre: string; valor: number | null }
}
export async function guardarFicha(lead: number, cambios: Record<string, unknown>, antes: Record<string, unknown>, forzar = false): Promise<Guardado> {
  const r = await llamar('lead_guardar_ficha', { p_lead: lead, p_cambios: cambios, p_antes: antes, p_forzar: forzar }, lead)
  if (r.error) return r
  const d = r.data as { conflictos?: Record<string, unknown>; atributos: Record<string, unknown>; nombre: string; valor: number | null }
  if (d.conflictos) return { conflictos: d.conflictos }
  revalidatePath('/leads')
  return { ok: 'Cambios guardados.', lead: { atributos: d.atributos, nombre: d.nombre, valor: d.valor } }
}

export async function notaLead(lead: number, texto: string): Promise<Resultado> {
  if (!texto.trim()) return { error: 'Escribe la nota.' }
  const r = await llamar('lead_nota', { p_lead: lead, p_texto: texto }, lead)
  return r.error ? r : { ok: 'Nota guardada. Solo la ve el equipo.' }
}

export async function crearTarea(lead: number, t: { tipo: string; que: string; vence: string; asignado?: string | null }): Promise<Resultado> {
  if (!t.que.trim()) return { error: 'Escribe qué hay que hacer.' }
  if (!t.vence) return { error: 'Elige para cuándo.' }
  const r = await llamar('crear_tarea', { p_lead: lead, p_tipo: t.tipo, p_que: t.que, p_vence: `${t.vence}:00-05:00`, p_asignado: t.asignado || null }, lead)
  return r.error ? r : { ok: 'Tarea creada.' }
}

export async function cumplirTarea(lead: number, id: number, resultado: string): Promise<Resultado> {
  const r = await llamar('cumplir_tarea', { p_id: id, p_resultado: resultado }, lead)
  return r.error ? r : { ok: 'Tarea cumplida.' }
}

export async function etiquetaLead(lead: number, etiqueta: string, poner: boolean): Promise<Resultado> {
  const r = await llamar('leads_en_grupo', { p_accion: poner ? 'etiqueta_poner' : 'etiqueta_quitar', p_ids: [lead], p_dato: { etiqueta } }, lead)
  if (r.error) return r
  const g = r.data as { errores: { error: string }[] }
  return g.errores.length ? { error: g.errores[0].error } : {}
}

export async function archivoLead(lead: number, accion: 'archivar' | 'desarchivar' | 'eliminar' | 'restaurar'): Promise<Resultado> {
  const r = await llamar('leads_en_grupo', { p_accion: accion, p_ids: [lead], p_dato: {} }, lead)
  if (r.error) return r
  const g = r.data as { hechos: number }
  if (!g.hechos) return { error: accion === 'restaurar'
    ? 'No se pudo restaurar: ya hay otro lead activo con ese teléfono (el cliente volvió a escribir).'
    : 'No se pudo: no tienes permiso o ya estaba así.' }
  revalidatePath('/leads')
  return { ok: { archivar: 'Archivado.', desarchivar: 'Desarchivado.', eliminar: 'Enviado a la papelera.', restaurar: 'Restaurado.' }[accion] }
}

// Borrado inmediato a pedido del cliente (Ley 1581): la base exige el permiso y el teléfono escrito (lead_borrar_ya, 0035) y devuelve
// los archivos; se quitan del almacenamiento con la llave del servidor, solo después de que la base borró al cliente.
export async function borrarYa(lead: number, confirmacion: string): Promise<Resultado> {
  const { data, error } = await crearCliente().rpc('lead_borrar_ya', { p_lead: lead, p_confirmacion: confirmacion })
  if (error) return { error: error.code === '42501' ? 'Solo el administrador puede borrar datos de un cliente.' : error.message }
  const r = data as { media: string[]; cotizaciones: string[] }
  const almacen = crearClienteAdmin().storage
  if (r.media.length) await almacen.from('media').remove(r.media)
  if (r.cotizaciones.length) await almacen.from('cotizaciones').remove(r.cotizaciones)
  revalidatePath('/leads')
  return { ok: 'Borrado.' }
}

'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'
import { TIPOS, type TipoAtributo } from './tipos'

export type Resultado = { error?: string; ok?: string }
export type CambiosAtributo = {
  nombre?: string
  seccion?: string
  opciones?: string[]
  obligatorio?: 'no' | 'etapa'
  etapas_obligatorio?: string[]
  visible_lista?: boolean
  llenable_bot?: boolean
  solo_venta_online?: boolean
}

const CON_OPCIONES: TipoAtributo[] = ['lista', 'multiseleccion']

// La clave se saca del nombre y no cambia nunca: es la llave del valor dentro de leads.atributos (0032).
function clave(nombre: string) {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36)
  return /^[a-z]/.test(base) ? base : `a_${base}`.slice(0, 36)
}

function limpiarOpciones(opciones: string[]) {
  return [...new Set(opciones.map((o) => o.trim()).filter(Boolean))]
}

// RLS: administrar_atributos (0032). La base valida además la clave, el tipo y que una lista tenga opciones.
export async function crearAtributo(d: { nombre: string; tipo: TipoAtributo; seccion: string; opciones: string[] }): Promise<Resultado> {
  const nombre = d.nombre.trim()
  if (!nombre || nombre.length > 60) return { error: 'El nombre va de 1 a 60 caracteres.' }
  if (!TIPOS.some((t) => t.id === d.tipo)) return { error: 'Elige un tipo de la lista.' }
  const opciones = limpiarOpciones(d.opciones)
  if (CON_OPCIONES.includes(d.tipo) && !opciones.length) return { error: 'Una lista necesita al menos una opción.' }
  const supabase = crearCliente()
  const { data: existentes } = await supabase.from('lead_atributos').select('clave, orden, seccion')
  const usadas = new Set((existentes ?? []).map((a) => a.clave))
  let k = clave(nombre)
  if (k.length < 2) return { error: 'El nombre necesita al menos dos letras o números.' }
  for (let i = 2; usadas.has(k); i++) k = `${clave(nombre)}_${i}`
  const seccion = d.seccion.trim() || 'Datos del cliente'
  const orden = Math.max(0, ...(existentes ?? []).filter((a) => a.seccion === seccion).map((a) => a.orden)) + 1
  const { error } = await supabase.from('lead_atributos').insert({
    clave: k, nombre, tipo: d.tipo, seccion, orden, opciones: CON_OPCIONES.includes(d.tipo) ? opciones : [],
  })
  if (error) return { error: error.code === '42501' ? 'No tienes permiso para crear atributos.' : error.message }
  revalidatePath('/atributos')
  return { ok: `Atributo «${nombre}» creado. Ya se puede llenar en la ficha de cada cliente.` }
}

// Quitar una opción que algún cliente ya tiene guardada rompería la edición de ese cliente: se avisa cuántos la usan.
async function opcionesEnUso(supabase: ReturnType<typeof crearCliente>, k: string, tipo: TipoAtributo, quitadas: string[]) {
  const enUso: string[] = []
  for (const o of quitadas) {
    const consulta = supabase.from('leads').select('id', { count: 'exact', head: true })
    const { count } = tipo === 'multiseleccion'
      ? await consulta.contains('atributos', { [k]: [o] })
      : await consulta.eq(`atributos->>${k}`, o)
    if (count) enUso.push(`«${o}» (${count} ${count === 1 ? 'cliente' : 'clientes'})`)
  }
  return enUso
}

export async function editarAtributo(id: number, c: CambiosAtributo): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: actual } = await supabase.from('lead_atributos').select('clave, tipo, opciones').eq('id', id).maybeSingle()
  if (!actual) return { error: 'Ese atributo ya no existe.' }
  const cambios: Record<string, unknown> = {}
  if (c.nombre !== undefined) {
    if (!c.nombre.trim() || c.nombre.trim().length > 60) return { error: 'El nombre va de 1 a 60 caracteres.' }
    cambios.nombre = c.nombre.trim()
  }
  if (c.seccion !== undefined) cambios.seccion = c.seccion.trim() || 'Datos del cliente'
  if (c.opciones !== undefined) {
    const opciones = limpiarOpciones(c.opciones)
    if (!opciones.length) return { error: 'Una lista necesita al menos una opción.' }
    const quitadas = (actual.opciones as string[]).filter((o) => !opciones.includes(o))
    const enUso = await opcionesEnUso(supabase, actual.clave, actual.tipo as TipoAtributo, quitadas)
    if (enUso.length) return { error: `No se puede quitar ${enUso.join(', ')}: cámbiala primero en esos clientes.` }
    cambios.opciones = opciones
  }
  if (c.obligatorio !== undefined) {
    if (c.obligatorio === 'etapa' && !c.etapas_obligatorio?.length) return { error: 'Elige al menos una etapa en la que sea obligatorio.' }
    cambios.obligatorio = c.obligatorio
    cambios.etapas_obligatorio = c.obligatorio === 'etapa' ? c.etapas_obligatorio : []
  }
  if (c.visible_lista !== undefined) cambios.visible_lista = c.visible_lista
  if (c.llenable_bot !== undefined) cambios.llenable_bot = c.llenable_bot
  if (c.solo_venta_online !== undefined) cambios.solo_venta_online = c.solo_venta_online
  const { data, error } = await supabase.from('lead_atributos').update(cambios).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'No tienes permiso para cambiar atributos.' }
  revalidatePath('/atributos')
  return { ok: 'Guardado.' }
}

// RL-08: eliminar = archivar. Los datos de cada cliente se conservan y se puede restaurar.
export async function archivarAtributo(id: number, archivar: boolean): Promise<Resultado> {
  const { data, error } = await crearCliente().from('lead_atributos')
    .update({ archivado_en: archivar ? new Date().toISOString() : null }).eq('id', id).select('nombre')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'No tienes permiso para cambiar atributos.' }
  revalidatePath('/atributos')
  return { ok: archivar ? `«${data[0].nombre}» archivado: ya no se ve, pero sus datos se conservan.` : `«${data[0].nombre}» restaurado.` }
}

// Sube o baja un atributo dentro de su sección intercambiando el orden con el vecino.
export async function moverAtributo(id: number, direccion: -1 | 1): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: este } = await supabase.from('lead_atributos').select('id, seccion, orden').eq('id', id).maybeSingle()
  if (!este) return { error: 'Ese atributo ya no existe.' }
  const { data: hermanos } = await supabase.from('lead_atributos').select('id, orden')
    .eq('seccion', este.seccion).is('archivado_en', null).order('orden').order('id')
  const lista = hermanos ?? []
  const i = lista.findIndex((a) => a.id === id)
  const j = i + direccion
  if (i < 0 || j < 0 || j >= lista.length) return {}
  // Se renumera la sección completa para que nunca queden dos con el mismo orden.
  const nuevo = [...lista]
  ;[nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]]
  for (const [n, a] of nuevo.entries()) {
    if (a.orden !== n + 1) {
      const { error } = await supabase.from('lead_atributos').update({ orden: n + 1 }).eq('id', a.id)
      if (error) return { error: error.message }
    }
  }
  revalidatePath('/atributos')
  return {}
}

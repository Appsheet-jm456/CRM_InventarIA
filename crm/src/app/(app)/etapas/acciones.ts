'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

const COLORES = ['Gris', 'Azul', 'Amarillo', 'Naranja', 'Morado', 'Verde', 'Rojo']
const CIERRES = ['', 'ganada', 'perdida']

// Todo con la sesión del usuario: el RLS pide administrar_embudo (decisión 0020).
function listo(error: { code?: string; message: string } | null, filas: unknown[] | null, ok?: string): Resultado {
  if (error) {
    if (error.code === '23505') return { error: 'Ya hay una etapa o un embudo con ese nombre.' }
    if (error.code === '23503') return { error: 'Esa etapa tiene oportunidades: muévelas a otra antes de borrarla (RB-06).' }
    return { error: error.message }
  }
  if (!filas?.length) return { error: 'No tienes permiso para cambiar las etapas.' }
  revalidatePath('/etapas')
  revalidatePath('/embudo')
  return ok ? { ok } : {}
}

export async function crearEtapa(_: Resultado, datos: FormData): Promise<Resultado> {
  const embudo = Number(datos.get('embudo_id'))
  const nombre = String(datos.get('nombre') ?? '').trim()
  const color = String(datos.get('color') ?? 'Gris')
  if (!nombre) return { error: 'Escribe el nombre de la etapa.' }
  if (!COLORES.includes(color)) return { error: 'Elige un color de la lista.' }
  const supabase = crearCliente()
  if (!embudo) return { error: 'Elige el embudo.' }
  const { data: ultima } = await supabase.from('etapas').select('orden').eq('embudo_id', embudo).order('orden', { ascending: false }).limit(1)
  const { data, error } = await supabase
    .from('etapas')
    .insert({ embudo_id: embudo, nombre, color, orden: (ultima?.[0]?.orden ?? 0) + 1 })
    .select('id')
  return listo(error, data, `Etapa ${nombre} creada al final del embudo.`)
}

export async function editarEtapa(id: number, cambios: { nombre?: string; color?: string; cierre?: string }): Promise<Resultado> {
  if (cambios.nombre !== undefined && !cambios.nombre.trim()) return { error: 'El nombre no puede quedar vacío.' }
  if (cambios.color !== undefined && !COLORES.includes(cambios.color)) return { error: 'Color no válido.' }
  if (cambios.cierre !== undefined && !CIERRES.includes(cambios.cierre)) return { error: 'Cierre no válido.' }
  const limpio = { ...cambios, ...(cambios.nombre !== undefined ? { nombre: cambios.nombre.trim() } : {}) }
  const { data, error } = await crearCliente().from('etapas').update(limpio).eq('id', id).select('id')
  return listo(error, data)
}

// Intercambia el orden con la vecina de arriba o de abajo.
export async function moverOrden(id: number, direccion: -1 | 1): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: propia } = await supabase.from('etapas').select('embudo_id').eq('id', id).maybeSingle()
  const { data: todas } = await supabase.from('etapas').select('id, orden').eq('embudo_id', propia?.embudo_id ?? 0).order('orden')
  const lista = todas ?? []
  const i = lista.findIndex((e) => e.id === id)
  const j = i + direccion
  if (i < 0 || j < 0 || j >= lista.length) return {}
  const a = await supabase.from('etapas').update({ orden: lista[j].orden }).eq('id', lista[i].id).select('id')
  if (a.error || !a.data?.length) return listo(a.error, a.data)
  const b = await supabase.from('etapas').update({ orden: lista[i].orden }).eq('id', lista[j].id).select('id')
  return listo(b.error, b.data)
}

export async function borrarEtapa(id: number): Promise<Resultado> {
  const { data, error } = await crearCliente().from('etapas').delete().eq('id', id).select('id')
  return listo(error, data, 'Etapa borrada.')
}

// Embudos (RE-01): los crea y edita quien tiene administrar_embudo. No se borran: se desactivan.
export async function crearEmbudo(_: Resultado, datos: FormData): Promise<Resultado> {
  const nombre = String(datos.get('nombre') ?? '').trim()
  const descripcion = String(datos.get('descripcion') ?? '').trim()
  if (!nombre) return { error: 'Escribe el nombre del embudo.' }
  const supabase = crearCliente()
  const { data: ultimo } = await supabase.from('embudos').select('orden').order('orden', { ascending: false }).limit(1)
  const { data, error } = await supabase.from('embudos').insert({ nombre, descripcion, orden: (ultimo?.[0]?.orden ?? 0) + 1 }).select('id')
  if (!error && data?.length) {
    // Arranca con dos etapas de cierre para que se pueda usar; el resto se agrega aquí mismo.
    await supabase.from('etapas').insert([
      { embudo_id: data[0].id, nombre: 'Nuevo', orden: 1, color: 'Gris', cierre: '' },
      { embudo_id: data[0].id, nombre: 'Ganado', orden: 2, color: 'Verde', cierre: 'ganada' },
      { embudo_id: data[0].id, nombre: 'Perdido', orden: 3, color: 'Rojo', cierre: 'perdida' },
    ])
  }
  return listo(error, data, `Embudo ${nombre} creado con las etapas Nuevo, Ganado y Perdido.`)
}

export async function editarEmbudo(id: number, cambios: { nombre?: string; descripcion?: string; etiqueta_bot?: string; activo?: boolean }): Promise<Resultado> {
  if (cambios.nombre !== undefined && !cambios.nombre.trim()) return { error: 'El nombre no puede quedar vacío.' }
  const limpio = Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))
  const { data, error } = await crearCliente().from('embudos').update(limpio).eq('id', id).select('id')
  return listo(error, data)
}

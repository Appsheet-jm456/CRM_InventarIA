'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

const COLORES = ['Gris', 'Azul', 'Amarillo', 'Naranja', 'Morado', 'Verde', 'Rojo']
const CIERRES = ['', 'ganada', 'perdida']

// Todo con la sesión del usuario: el RLS pide administrar_embudo (decisión 0020).
function listo(error: { code?: string; message: string } | null, filas: unknown[] | null, ok?: string): Resultado {
  if (error) {
    if (error.code === '23505') return { error: 'Ya hay una etapa con ese nombre.' }
    if (error.code === '23503') return { error: 'Esa etapa tiene clientes: muévelos a otra antes de borrarla (RB-06).' }
    return { error: error.message }
  }
  if (!filas?.length) return { error: 'No tienes permiso para cambiar las etapas.' }
  revalidatePath('/etapas')
  revalidatePath('/embudo')
  return ok ? { ok } : {}
}

export async function crearEtapa(_: Resultado, datos: FormData): Promise<Resultado> {
  const nombre = String(datos.get('nombre') ?? '').trim()
  const color = String(datos.get('color') ?? 'Gris')
  if (!nombre) return { error: 'Escribe el nombre de la etapa.' }
  if (!COLORES.includes(color)) return { error: 'Elige un color de la lista.' }
  const supabase = crearCliente()
  const { data: ultima } = await supabase.from('etapas').select('orden').order('orden', { ascending: false }).limit(1)
  const { data, error } = await supabase
    .from('etapas')
    .insert({ nombre, color, orden: (ultima?.[0]?.orden ?? 0) + 1 })
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
  const { data: todas } = await supabase.from('etapas').select('id, orden').order('orden')
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

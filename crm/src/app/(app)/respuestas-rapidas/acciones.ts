'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

function listo(error: { code?: string; message: string } | null, filas: unknown[] | null, ok?: string): Resultado {
  if (error) {
    if (error.code === '23505') return { error: 'Ya hay una respuesta con ese atajo.' }
    if (error.code === '23514') return { error: 'El atajo va en minúsculas, sin espacios (letras, números, - o _), hasta 30 caracteres.' }
    return { error: error.message }
  }
  if (!filas?.length) return { error: 'No tienes permiso para cambiar las respuestas rápidas.' }
  revalidatePath('/respuestas-rapidas')
  revalidatePath('/bandeja')
  return ok ? { ok } : {}
}

export async function crearRespuesta(datos: { atajo: string; titulo: string; texto: string }): Promise<Resultado> {
  const atajo = datos.atajo.trim().toLowerCase().replace(/^\//, '')
  if (!atajo || !datos.titulo.trim() || !datos.texto.trim()) return { error: 'Completa el atajo, el título y el texto.' }
  const { data, error } = await crearCliente()
    .from('respuestas_rapidas')
    .insert({ atajo, titulo: datos.titulo.trim(), texto: datos.texto.trim() })
    .select('id')
  return listo(error, data, `Respuesta /${atajo} creada.`)
}

export async function editarRespuesta(id: number, cambios: { titulo?: string; texto?: string; activo?: boolean }): Promise<Resultado> {
  if (cambios.titulo !== undefined && !cambios.titulo.trim()) return { error: 'El título no puede quedar vacío.' }
  if (cambios.texto !== undefined && !cambios.texto.trim()) return { error: 'El texto no puede quedar vacío.' }
  const { data, error } = await crearCliente().from('respuestas_rapidas').update(cambios).eq('id', id).select('id')
  return listo(error, data, 'Guardado.')
}

export async function borrarRespuesta(id: number): Promise<Resultado> {
  const { data, error } = await crearCliente().from('respuestas_rapidas').delete().eq('id', id).select('id')
  return listo(error, data, 'Respuesta borrada.')
}

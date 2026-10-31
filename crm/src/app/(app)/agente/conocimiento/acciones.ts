'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

const TIPOS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' }
const MAX_BYTES = 5 * 1024 * 1024 // el límite del bucket conocimiento (migración 0024)

function listo(error: { code?: string; message: string } | null, filas: unknown[] | null, ok?: string): Resultado {
  if (error) {
    if (error.code === '23514') return { error: 'Para activarla, escribe la respuesta o adjunta una imagen o PDF.' }
    return { error: error.message }
  }
  if (!filas?.length) return { error: 'No tienes permiso para cambiar el conocimiento del agente.' }
  revalidatePath('/agente/conocimiento')
  return ok ? { ok } : {}
}

// Todo con la sesión del usuario: el RLS de conocimiento y del bucket pide administrar_agente (0024).
export async function crearFicha(datos: { categoria: string; titulo: string }): Promise<Resultado> {
  const categoria = datos.categoria.trim()
  const titulo = datos.titulo.trim()
  if (!categoria || !titulo) return { error: 'Escribe la categoría y el título.' }
  const supabase = crearCliente()
  const { data: ultima } = await supabase.from('conocimiento').select('orden').eq('categoria', categoria)
    .order('orden', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await supabase.from('conocimiento')
    .insert({ categoria, titulo, orden: (ultima?.orden ?? 0) + 1 }).select('id')
  return listo(error, data, `Ficha «${titulo}» creada. Escribe la respuesta y actívala.`)
}

export async function guardarFicha(id: number, cambios: { titulo?: string; respuesta?: string; activa?: boolean }): Promise<Resultado> {
  if (cambios.titulo !== undefined && !cambios.titulo.trim()) return { error: 'El título no puede quedar vacío.' }
  const fila = {
    ...cambios,
    ...(cambios.titulo !== undefined ? { titulo: cambios.titulo.trim() } : {}),
    ...(cambios.respuesta !== undefined ? { respuesta: cambios.respuesta.trim() } : {}),
    actualizado_en: new Date().toISOString(),
  }
  const { data, error } = await crearCliente().from('conocimiento').update(fila).eq('id', id).select('id')
  return listo(error, data, cambios.activa === true ? 'Ficha activa: el bot ya la puede usar.' : cambios.activa === false ? 'Ficha apagada.' : 'Guardado.')
}

// Imagen o PDF de una política (RAG-24: «responder imagen o PDF»). Cada subida es una ruta nueva y borra la anterior.
export async function subirArchivo(id: number, datos: FormData): Promise<Resultado> {
  const archivo = datos.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) return { error: 'Elige un archivo.' }
  const ext = TIPOS[archivo.type]
  if (!ext) return { error: 'El archivo tiene que ser PNG, JPG, WebP o PDF.' }
  if (archivo.size > MAX_BYTES) return { error: 'El archivo pesa más de 5 MB.' }
  const supabase = crearCliente()
  const { data: antes } = await supabase.from('conocimiento').select('archivo').eq('id', id).maybeSingle()
  const ruta = `conocimiento/${Date.now()}.${ext}`
  const { error: subida } = await supabase.storage.from('conocimiento').upload(ruta, archivo, { contentType: archivo.type })
  if (subida) return { error: 'No se pudo subir el archivo. ¿Tienes permiso para cambiar el conocimiento?' }
  const { data, error } = await supabase.from('conocimiento')
    .update({ archivo: ruta, actualizado_en: new Date().toISOString() }).eq('id', id).select('id')
  if (error || !data?.length) {
    await supabase.storage.from('conocimiento').remove([ruta])
    return listo(error, data)
  }
  if (antes?.archivo) await supabase.storage.from('conocimiento').remove([antes.archivo])
  return listo(null, data, 'Archivo adjunto.')
}

export async function quitarArchivo(id: number): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: antes } = await supabase.from('conocimiento').select('archivo').eq('id', id).maybeSingle()
  const { data, error } = await supabase.from('conocimiento')
    .update({ archivo: null, actualizado_en: new Date().toISOString() }).eq('id', id).select('id')
  if (!error && data?.length && antes?.archivo) await supabase.storage.from('conocimiento').remove([antes.archivo])
  return listo(error, data, 'Archivo quitado.')
}

export async function borrarFicha(id: number): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: antes } = await supabase.from('conocimiento').select('archivo').eq('id', id).maybeSingle()
  const { data, error } = await supabase.from('conocimiento').delete().eq('id', id).select('id')
  if (!error && data?.length && antes?.archivo) await supabase.storage.from('conocimiento').remove([antes.archivo])
  return listo(error, data, 'Ficha borrada.')
}

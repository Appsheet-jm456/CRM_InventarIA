'use server'

import { revalidatePath } from 'next/cache'
import { MARCA, FUENTE_MARCA, esColor, esFuente, type Colores } from '@/lib/marca'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

const TIPOS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const MAX_BYTES = 1024 * 1024 // RA-12: el mismo límite del bucket marca

// Un valor igual al de la marca se guarda como null: así «Restaurar» y «elegir el mismo» son lo mismo.
function leerColor(datos: FormData, campo: keyof Colores): string | null | { error: string } {
  const v = String(datos.get(campo) ?? '').trim().toUpperCase()
  if (!v || v === MARCA[campo]) return null
  return esColor(v) ? v : { error: 'Los colores van en formato #RRGGBB.' }
}

// Colores, fuente y logo, con la sesión del usuario: el RLS de apariencia y del bucket marca pide
// administrar_apariencia (migración 0023).
export async function guardarApariencia(_: Resultado, datos: FormData): Promise<Resultado> {
  const fila: Record<string, string | null> = {}
  for (const campo of ['panel', 'principal', 'acento'] as const) {
    const c = leerColor(datos, campo)
    if (c && typeof c === 'object') return c
    fila[`color_${campo}`] = c
  }
  const fuente = String(datos.get('fuente') ?? '')
  if (!esFuente(fuente)) return { error: 'Elige una de las fuentes de la lista.' }
  fila.fuente = fuente === FUENTE_MARCA ? null : fuente

  const supabase = crearCliente()
  const archivo = datos.get('logo')
  let subida: string | null = null
  if (archivo instanceof File && archivo.size > 0) {
    const ext = TIPOS[archivo.type]
    if (!ext) return { error: 'El logo tiene que ser PNG, JPG o WebP (PNG con fondo transparente se ve mejor).' }
    if (archivo.size > MAX_BYTES) return { error: 'El logo pesa más de 1 MB. Redúcelo e inténtalo otra vez.' }
    // Cada subida es una ruta nueva: la caché del navegador nunca muestra el logo viejo.
    subida = `logo/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('marca').upload(subida, archivo, { contentType: archivo.type })
    if (error) return { error: 'No se pudo subir el logo. ¿Tienes permiso para cambiar la apariencia?' }
    fila.logo = subida
  }

  const { data: antes } = await supabase.from('apariencia').select('logo').eq('id', 1).single()
  const { data, error } = await supabase.from('apariencia').update(fila).eq('id', 1).select('id')
  if (error || !data?.length) {
    if (subida) await supabase.storage.from('marca').remove([subida])
    return { error: error ? 'No se pudo guardar la apariencia.' : 'No tienes permiso para cambiar la apariencia.' }
  }
  // RA-14: subir uno nuevo borra el anterior.
  if (subida && antes?.logo) await supabase.storage.from('marca').remove([antes.logo])

  revalidatePath('/', 'layout')
  return { ok: 'Apariencia guardada.' }
}

// RA-14: vuelve al monograma «VV» y borra el archivo.
export async function quitarLogo(): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: antes } = await supabase.from('apariencia').select('logo').eq('id', 1).single()
  const { data, error } = await supabase.from('apariencia').update({ logo: null }).eq('id', 1).select('id')
  if (error) return { error: 'No se pudo quitar el logo.' }
  if (!data?.length) return { error: 'No tienes permiso para cambiar la apariencia.' }
  if (antes?.logo) await supabase.storage.from('marca').remove([antes.logo])
  revalidatePath('/', 'layout')
  return { ok: 'Se volvió al logo «VV».' }
}

// RA-06: cada usuario guarda su propio modo. null = seguir al equipo (RA-07).
export async function guardarModoOscuro(oscuro: boolean | null): Promise<Resultado> {
  if (oscuro !== null && typeof oscuro !== 'boolean') return { error: 'Modo no válido.' }
  const { error } = await crearCliente().rpc('guardar_modo_oscuro', { p_oscuro: oscuro })
  if (error) return { error: 'No se pudo guardar el modo.' }
  revalidatePath('/', 'layout')
  return { ok: oscuro === null ? 'Tu pantalla sigue al equipo.' : `Tu pantalla queda en modo ${oscuro ? 'oscuro' : 'claro'}.` }
}

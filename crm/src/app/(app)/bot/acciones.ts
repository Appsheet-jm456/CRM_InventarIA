'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }
export type Opcion = { id: string; titulo: string }

// Todo con la sesión del usuario: el RLS y los triggers de la base piden administrar_bot (decisión 0023).
function listo(error: { code?: string; message: string } | null, filas: unknown[] | null, ok?: string): Resultado {
  if (error) {
    if (error.code === '23505') return { error: 'Ya existe.' }
    return { error: error.message }
  }
  if (!filas?.length) return { error: 'No tienes permiso para cambiar el bot o el horario.' }
  revalidatePath('/bot')
  return ok ? { ok } : {}
}

export async function guardarNodo(clave: string, texto: string, opciones: Opcion[] | null): Promise<Resultado> {
  if (!texto.trim()) return { error: 'El mensaje no puede quedar vacío.' }
  const cambios: { texto: string; opciones?: Opcion[] } = { texto }
  if (opciones) cambios.opciones = opciones.map((o) => ({ id: o.id, titulo: o.titulo.trim() }))
  const { data, error } = await crearCliente().from('bot_nodos').update(cambios).eq('clave', clave).select('clave')
  return listo(error, data, 'Guardado. El bot lo usa en menos de 30 segundos.')
}

export async function restaurarNodo(clave: string): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: nodo } = await supabase.from('bot_nodos').select('texto_original, opciones_original').eq('clave', clave).maybeSingle()
  if (!nodo) return { error: 'No se encontró el mensaje.' }
  const { data, error } = await supabase
    .from('bot_nodos')
    .update({ texto: nodo.texto_original, opciones: nodo.opciones_original })
    .eq('clave', clave)
    .select('clave')
  return listo(error, data, 'Restaurado al texto original.')
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

export async function crearFranja(dia: number, abre: string, cierra: string): Promise<Resultado> {
  if (!HORA.test(abre) || !HORA.test(cierra)) return { error: 'Escribe la hora como 08:00.' }
  if (cierra <= abre) return { error: 'El cierre debe ser después de la apertura.' }
  const { data, error } = await crearCliente().from('horario_atencion').insert({ dia, abre, cierra }).select('id')
  return listo(error, data)
}

export async function editarFranja(id: number, abre: string, cierra: string): Promise<Resultado> {
  if (!HORA.test(abre) || !HORA.test(cierra)) return { error: 'Escribe la hora como 08:00.' }
  if (cierra <= abre) return { error: 'El cierre debe ser después de la apertura.' }
  const { data, error } = await crearCliente().from('horario_atencion').update({ abre, cierra }).eq('id', id).select('id')
  return listo(error, data)
}

export async function borrarFranja(id: number): Promise<Resultado> {
  const { data, error } = await crearCliente().from('horario_atencion').delete().eq('id', id).select('id')
  return listo(error, data)
}

export async function crearFestivo(fecha: string, nombre: string): Promise<Resultado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Elige la fecha.' }
  if (!nombre.trim()) return { error: 'Escribe el nombre del festivo.' }
  const { data, error } = await crearCliente().from('festivos').insert({ fecha, nombre: nombre.trim() }).select('fecha')
  if (error?.code === '23505') return { error: 'Esa fecha ya es festivo.' }
  return listo(error, data)
}

export async function borrarFestivo(fecha: string): Promise<Resultado> {
  const { data, error } = await crearCliente().from('festivos').delete().eq('fecha', fecha).select('fecha')
  return listo(error, data)
}

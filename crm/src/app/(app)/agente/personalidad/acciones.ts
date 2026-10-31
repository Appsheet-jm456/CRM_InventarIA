'use server'

import { revalidatePath } from 'next/cache'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }
export type DatosAvi = {
  estado: 'apagado' | 'simulador' | 'lista_blanca' | 'todos'
  lista_blanca: string
  nombre: string
  tono: 'amigable' | 'cercano' | 'formal'
  emojis: 'si' | 'pocos' | 'no'
  trato: 'tu' | 'usted'
  largo: 'corto' | 'medio'
  prompt: string
  herramientas_apagadas: string[]
  memoria_mensajes: number
  max_pasos: number
  max_mensajes: number
  max_turnos_dia: number
  buffer_segundos: number
}

const entre = (n: number, a: number, b: number) => Number.isInteger(n) && n >= a && n <= b

// Personalidad, límites y encendido de Avi (F4·28, RAG-13, RAG-16). RLS: administrar_agente (0024); la base exige llave y presupuesto para clientes reales.
export async function guardarAvi(d: DatosAvi): Promise<Resultado> {
  if (!d.nombre.trim()) return { error: 'El agente necesita un nombre.' }
  if (d.prompt.length > 4000) return { error: 'Las instrucciones tienen máximo 4.000 caracteres.' }
  if (!entre(d.memoria_mensajes, 4, 60)) return { error: 'La memoria va de 4 a 60 mensajes.' }
  if (!entre(d.max_pasos, 1, 12)) return { error: 'Los pasos por turno van de 1 a 12.' }
  if (!entre(d.max_mensajes, 1, 5)) return { error: 'Los mensajes por turno van de 1 a 5.' }
  if (!entre(d.max_turnos_dia, 1, 200)) return { error: 'Los turnos por día van de 1 a 200.' }
  if (!entre(d.buffer_segundos, 0, 60)) return { error: 'La espera para juntar mensajes va de 0 a 60 segundos.' }
  const numeros = d.lista_blanca.split(/[\n,;]+/).map((n) => n.replace(/\D/g, '')).filter(Boolean)
  if (numeros.some((n) => n.length < 10 || n.length > 15)) return { error: 'Cada número de prueba lleva entre 10 y 15 dígitos, con el indicativo (57…).' }
  if (d.estado === 'lista_blanca' && !numeros.length) return { error: 'Para encenderlo solo para números de prueba, escribe al menos uno.' }
  const { data, error } = await crearCliente().from('agente_config').update({
    estado: d.estado, lista_blanca: [...new Set(numeros)], nombre: d.nombre.trim(), tono: d.tono, emojis: d.emojis, trato: d.trato,
    largo: d.largo, prompt: d.prompt.trim(), herramientas_apagadas: d.herramientas_apagadas, memoria_mensajes: d.memoria_mensajes,
    max_pasos: d.max_pasos, max_mensajes: d.max_mensajes, max_turnos_dia: d.max_turnos_dia, buffer_segundos: d.buffer_segundos,
  }).eq('id', 1).select('id')
  if (error) {
    return { error: error.message.includes('agente_config_listo_para_clientes') || error.message.includes('agente_config_check')
      ? 'Para atender clientes reales falta la llave de la IA y un presupuesto mayor que 0 (pestaña Cerebro).' : error.message }
  }
  if (!data?.length) return { error: 'No tienes permiso para cambiar al agente.' }
  revalidatePath('/agente/personalidad')
  return { ok: 'Guardado. El bot usa los cambios en menos de 30 s.' }
}

// Cómo atiende cada bot (RAG-14). La tabla bots no deja escribir con la sesión: se verifica el permiso y se escribe con la llave del servidor.
export async function cambiarModoBot(bot: number, modo: 'menu' | 'hibrido' | 'agente'): Promise<Resultado> {
  const sesion = await obtenerSesion()
  if (!sesion || !puede(sesion, ['administrar_agente'])) return { error: 'No tienes permiso para cambiar cómo atiende un bot.' }
  if (!['menu', 'hibrido', 'agente'].includes(modo)) return { error: 'Modo no válido.' }
  const { error } = await crearClienteAdmin().from('bots').update({ modo }).eq('id', bot)
  if (error) return { error: error.message }
  revalidatePath('/agente/personalidad')
  return { ok: 'Listo. El bot cambia de modo en menos de 30 s.' }
}

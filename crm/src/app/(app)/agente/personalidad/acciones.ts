'use server'

import { revalidatePath } from 'next/cache'
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
  escribiendo: boolean // F4·36, RAG-35 a RAG-37: responder como una persona
  espera_primera_ms: number
  pausa_mensajes_ms: number
  plantilla_equipo: string // F4·37, RAG-39 a RAG-41: cómo se muestra cada equipo
  max_equipos: number
  equipos_separados: boolean
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
  if (!entre(d.espera_primera_ms, 0, 5000) || !entre(d.pausa_mensajes_ms, 0, 5000)) return { error: 'Las pausas van de 0 a 5 segundos.' }
  const plantilla = d.plantilla_equipo.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim()).join('\n')
  if (!plantilla || plantilla.length > 1000) return { error: 'La plantilla de equipos va de 1 a 1.000 caracteres.' }
  if (!entre(d.max_equipos, 1, 10)) return { error: 'Los equipos por respuesta van de 1 a 10.' }
  const numeros = d.lista_blanca.split(/[\n,;]+/).map((n) => n.replace(/\D/g, '')).filter(Boolean)
  if (numeros.some((n) => n.length < 10 || n.length > 15)) return { error: 'Cada número de prueba lleva entre 10 y 15 dígitos, con el indicativo (57…).' }
  if (d.estado === 'lista_blanca' && !numeros.length) return { error: 'Para encenderlo solo para números de prueba, escribe al menos uno.' }
  const { data, error } = await crearCliente().from('agente_config').update({
    estado: d.estado, lista_blanca: [...new Set(numeros)], nombre: d.nombre.trim(), tono: d.tono, emojis: d.emojis, trato: d.trato,
    largo: d.largo, prompt: d.prompt.trim(), herramientas_apagadas: d.herramientas_apagadas, memoria_mensajes: d.memoria_mensajes,
    max_pasos: d.max_pasos, max_mensajes: d.max_mensajes, max_turnos_dia: d.max_turnos_dia, buffer_segundos: d.buffer_segundos,
    escribiendo: d.escribiendo, espera_primera_ms: d.espera_primera_ms, pausa_mensajes_ms: d.pausa_mensajes_ms,
    plantilla_equipo: plantilla, max_equipos: d.max_equipos, equipos_separados: d.equipos_separados,
  }).eq('id', 1).select('id')
  if (error) {
    return { error: error.message.includes('agente_config_listo_para_clientes') || error.message.includes('agente_config_check')
      ? 'Para atender clientes reales falta la llave de la IA y un presupuesto mayor que 0 (pestaña Cerebro).' : error.message }
  }
  if (!data?.length) return { error: 'No tienes permiso para cambiar al agente.' }
  revalidatePath('/agente/personalidad')
  return { ok: 'Guardado. El bot usa los cambios en menos de 30 s.' }
}

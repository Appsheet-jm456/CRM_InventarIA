'use server'

import { enviarPlantilla, enviarTexto, listarPlantillas, llenarPlantilla, type Plantilla } from '@/lib/meta'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

const VENTANA_MS = 24 * 60 * 60 * 1000

// Todas pasan por funciones de la base, que verifican el permiso y que la conversación sea de quien pide.
async function llamar(funcion: string, argumentos: Record<string, unknown>): Promise<Resultado> {
  const { error } = await crearCliente().rpc(funcion, argumentos)
  return error ? { error: error.message } : {}
}

export async function tomar(lead: number) {
  return llamar('tomar_conversacion', { p_lead: lead })
}

export async function liberar(lead: number) {
  return llamar('liberar_conversacion', { p_lead: lead })
}

export async function asignar(lead: number, usuario: string) {
  return llamar('asignar_conversacion', { p_lead: lead, p_usuario: usuario })
}

export async function cerrar(lead: number) {
  return llamar('cerrar_conversacion', { p_lead: lead })
}

export async function reanudarBot(lead: number) {
  return llamar('reanudar_bot', { p_lead: lead })
}

export async function moverOportunidad(oportunidad: number, etapa: number, motivo?: string) {
  return llamar('mover_oportunidad', { p_oportunidad: oportunidad, p_etapa: etapa, p_motivo: motivo || null })
}

export async function abrirOportunidad(lead: number, embudo: number) {
  return llamar('abrir_oportunidad', { p_lead: lead, p_embudo: embudo })
}

// RB-02 y RB-03: dentro de la ventana de 24 h, primero Meta y solo si lo acepta se registra.
export async function responder(lead: number, texto: string): Promise<Resultado> {
  const limpio = texto.trim()
  if (!limpio) return { error: 'Escribe el mensaje.' }
  if (limpio.length > 4096) return { error: 'El mensaje es muy largo (máximo 4.096 caracteres).' }

  const supabase = crearCliente()
  // Si no la ve, no la atiende (RLS): no se envía nada.
  const { data: fila } = await supabase.from('leads').select('telefono').eq('id', lead).maybeSingle()
  if (!fila) return { error: 'Esta conversación la atiende otro asesor.' }

  const { data: ultimo } = await supabase
    .from('mensajes')
    .select('creado_en')
    .eq('lead_id', lead)
    .eq('lado', 'cliente')
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!ultimo || Date.now() - new Date(ultimo.creado_en).getTime() > VENTANA_MS)
    return { error: 'Pasaron más de 24 horas desde el último mensaje del cliente: Meta solo deja escribirle con una plantilla (F3·6).' }

  const envio = await enviarTexto(fila.telefono, limpio)
  if (envio.error) return { error: envio.error }
  const { error } = await supabase.rpc('registrar_mensaje_asesor', { p_lead: lead, p_texto: limpio, p_wamid: envio.wamid ?? '' })
  if (error) return { error: `Se envió, pero no se pudo registrar: ${error.message}` }
  return {}
}

// RS-06: fuera de la ventana solo plantillas aprobadas, con sus variables llenas.
export async function plantillasParaEnviar(): Promise<{ plantillas: Plantilla[]; error?: string }> {
  const { plantillas, error } = await listarPlantillas()
  return { plantillas: plantillas.filter((p) => p.usable), error }
}

export async function responderConPlantilla(lead: number, nombre: string, idioma: string, valores: string[]): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: fila } = await supabase.from('leads').select('telefono').eq('id', lead).maybeSingle()
  if (!fila) return { error: 'Esta conversación la atiende otro asesor.' }

  const { plantillas } = await listarPlantillas()
  const plantilla = plantillas.find((p) => p.nombre === nombre && p.idioma === idioma && p.usable)
  if (!plantilla) return { error: 'Esa plantilla no está aprobada en Meta.' }
  const limpios = valores.slice(0, plantilla.variables).map((v) => v.trim())
  if (limpios.length < plantilla.variables || limpios.some((v) => !v)) return { error: 'Llena todos los datos de la plantilla.' }

  const envio = await enviarPlantilla(fila.telefono, nombre, idioma, limpios)
  if (envio.error) return { error: envio.error }
  const texto = `📋 ${llenarPlantilla(plantilla.cuerpo, limpios)}`
  const { error } = await supabase.rpc('registrar_mensaje_asesor', { p_lead: lead, p_texto: texto, p_wamid: envio.wamid ?? '', p_tipo: 'template' })
  if (error) return { error: `Se envió, pero no se pudo registrar: ${error.message}` }
  return {}
}

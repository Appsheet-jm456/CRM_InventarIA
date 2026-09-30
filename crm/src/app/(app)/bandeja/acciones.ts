'use server'

import { enviarTexto } from '@/lib/meta'
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

export async function moverEtapa(lead: number, etapa: string, motivo?: string) {
  return llamar('mover_etapa', { p_lead: lead, p_etapa: etapa, p_motivo: motivo || null })
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

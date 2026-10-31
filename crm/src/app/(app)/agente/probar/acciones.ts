'use server'

import { obtenerSesion, puede } from '@/lib/sesion'

export type Paso = { tipo: string; nombre?: string; args?: unknown; resultado?: unknown; texto?: string; problemas?: string[]; detalle?: string }
export type Turno = {
  error?: string
  hibrido?: boolean
  textos?: string[]
  traza?: Paso[]
  asesor?: boolean
  flujo?: string | null
  costo_usd?: number
  tokens?: number
  nota?: string
  estado?: unknown
}

// Un turno de Avi con la conversación de la pantalla (F4·28). El receptor no escribe en la base ni envía a WhatsApp.
export async function probarAvi(mensajes: { role: 'user' | 'assistant'; content: string }[], estado: unknown): Promise<Turno> {
  const sesion = await obtenerSesion()
  if (!sesion || !puede(sesion, ['administrar_agente'])) return { error: 'No tienes permiso para probar al agente.' }
  if (!process.env.CRM_INTERNO_URL || !process.env.CRM_INTERNO_TOKEN) return { error: 'Falta la conexión con el receptor del bot.' }
  try {
    const r = await fetch(`${process.env.CRM_INTERNO_URL}/interno/agente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Interno-Token': process.env.CRM_INTERNO_TOKEN },
      body: JSON.stringify({ mensajes, estado }),
      cache: 'no-store',
      signal: AbortSignal.timeout(90000),
    })
    if (!r.ok) return { error: `El receptor del bot respondió ${r.status}.` }
    return (await r.json()) as Turno
  } catch {
    return { error: 'El receptor del bot no responde o Avi tardó demasiado.' }
  }
}

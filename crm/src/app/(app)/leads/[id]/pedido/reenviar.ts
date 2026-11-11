'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

// F4·73c (docs/AMPLIACIONES-RAM-DISCO.md, RAM-12): reenviar al cliente el «🧾 Resumen de tu pedido» sin tocar la compra ni el chat.
// La base revisa el permiso, la conversación y las 24 h y deja el registro; el receptor arma el mismo resumen y lo envía.
export async function reenviarResumen(alistamiento: number): Promise<{ error?: string; ok?: string }> {
  if (!process.env.CRM_INTERNO_URL || !process.env.CRM_INTERNO_TOKEN) return { error: 'Falta la conexión con el receptor del bot.' }
  const supabase = crearCliente()
  const { data: lead, error } = await supabase.rpc('pedido_reenviar_resumen', { p_alistamiento: alistamiento })
  if (error) return { error: error.code === '42501' ? 'No tienes permiso o la conversación la atiende otro asesor.' : error.message }
  const { data: { user } } = await supabase.auth.getUser()
  try {
    const r = await fetch(`${process.env.CRM_INTERNO_URL}/interno/herramienta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Interno-Token': process.env.CRM_INTERNO_TOKEN },
      body: JSON.stringify({ lead, tipo: 'resumen', ref: String(alistamiento), usuario: user?.id ?? null }),
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    })
    if (!r.ok) return { error: `El receptor del bot respondió ${r.status}: no se envió.` }
    const d = (await r.json()) as { ok: boolean; error?: string }
    if (!d.ok) return { error: d.error ?? 'No se pudo enviar.' }
  } catch {
    return { error: 'El receptor del bot no responde: no se envió.' }
  }
  revalidatePath(`/leads/${lead}`)
  return { ok: 'Resumen del pedido reenviado al cliente.' }
}

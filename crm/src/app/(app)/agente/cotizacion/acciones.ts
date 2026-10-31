'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

// Reglas de la cotización (F4·26), en agente_config. RLS: administrar_agente (0024).
export async function guardarReglas(d: { validez_cotizacion_h: number; recargo_tarjeta_pct: number }): Promise<Resultado> {
  if (!Number.isInteger(d.validez_cotizacion_h) || d.validez_cotizacion_h < 1 || d.validez_cotizacion_h > 720)
    return { error: 'La validez va entre 1 hora y 720 horas (30 días).' }
  if (!(d.recargo_tarjeta_pct >= 0 && d.recargo_tarjeta_pct <= 30)) return { error: 'El recargo con tarjeta va entre 0 % y 30 %.' }
  const { data, error } = await crearCliente().from('agente_config')
    .update({ validez_cotizacion_h: d.validez_cotizacion_h, recargo_tarjeta_pct: d.recargo_tarjeta_pct }).eq('id', 1).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'No tienes permiso para cambiar las reglas de cotización.' }
  revalidatePath('/agente/cotizacion')
  return { ok: 'Guardado. Las cotizaciones nuevas usan estas reglas en menos de 30 s.' }
}

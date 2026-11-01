'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }
export type DatosCompra = {
  texto_cuentas: string
  texto_comprobante: string
  texto_sigue_interesado: string
  texto_cancelacion: string
  horas_sin_respuesta: number
  cargo_configuracion: number
  compra_bot_despues: number | null // F4·34, RF-28: bot del lienzo después del comprobante (null: al asesor como antes)
}

const MAX_WHATSAPP = 4096

// Textos y tiempos del flujo de compra (F4·25), en agente_config. RLS: administrar_agente (0024).
export async function guardarCompra(d: DatosCompra): Promise<Resultado> {
  for (const [campo, nombre] of [['texto_comprobante', 'comprobante recibido'], ['texto_sigue_interesado', '¿sigues interesado?'],
    ['texto_cancelacion', 'cancelación']] as const) {
    if (!d[campo].trim()) return { error: `El texto de ${nombre} no puede quedar vacío.` }
  }
  if ([d.texto_cuentas, d.texto_comprobante, d.texto_sigue_interesado, d.texto_cancelacion].some((t) => t.length > MAX_WHATSAPP))
    return { error: 'Un mensaje de WhatsApp tiene máximo 4.096 caracteres.' }
  if (!Number.isInteger(d.horas_sin_respuesta) || d.horas_sin_respuesta < 1 || d.horas_sin_respuesta > 23)
    return { error: 'El recordatorio va entre 1 y 23 horas (WhatsApp solo deja escribir libre 24 h después del último mensaje del cliente).' }
  if (!(d.cargo_configuracion >= 0)) return { error: 'El cargo de configuración no puede ser negativo.' }
  const { data, error } = await crearCliente().from('agente_config').update({
    texto_cuentas: d.texto_cuentas.trim(),
    texto_comprobante: d.texto_comprobante.trim(),
    texto_sigue_interesado: d.texto_sigue_interesado.trim(),
    texto_cancelacion: d.texto_cancelacion.trim(),
    horas_sin_respuesta: d.horas_sin_respuesta,
    cargo_configuracion: Math.round(d.cargo_configuracion),
    compra_bot_despues: d.compra_bot_despues,
  }).eq('id', 1).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'No tienes permiso para cambiar la configuración de compra.' }
  revalidatePath('/agente/compra')
  revalidatePath('/agente/acciones')
  return { ok: 'Guardado. El bot usa los textos nuevos en menos de 30 s.' }
}

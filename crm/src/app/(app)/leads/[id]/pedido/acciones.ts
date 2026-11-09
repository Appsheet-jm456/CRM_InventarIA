'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

type Resultado = { ok?: string; error?: string }

// F4·54 (RPD-34): pago subido a mano con su soporte (el archivo ya está en el bucket «pagos»).
export async function registrarPago(oportunidad: number, lead: number, d: {
  valor: number; medio: string; fecha: string; referencia: string; nota: string; ruta: string; mime: string
}): Promise<Resultado> {
  const { error } = await crearCliente().rpc('pago_registrar', {
    p_oportunidad: oportunidad, p_valor: d.valor, p_medio: d.medio, p_fecha: d.fecha, p_referencia: d.referencia,
    p_ruta: d.ruta, p_mime: d.mime, p_nota: d.nota,
  })
  if (error) return { error: error.code === '42501' ? 'No tienes permiso para registrar pagos.' : error.message }
  revalidatePath(`/leads/${lead}`)
  revalidatePath('/pedidos')
  return { ok: 'Pago registrado.' }
}

// RPD-36: un pago equivocado no se borra, se anula con motivo.
export async function anularPago(id: number, lead: number, motivo: string): Promise<Resultado> {
  const { error } = await crearCliente().rpc('pago_anular', { p_id: id, p_motivo: motivo })
  if (error) return { error: error.code === '42501' ? 'No tienes permiso para anular pagos.' : error.message }
  revalidatePath(`/leads/${lead}`)
  revalidatePath('/pedidos')
  return { ok: 'Pago anulado.' }
}

'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

// F4·50 (RAL-06, RAL-08): el servicio técnico usa un solo usuario; cada acción lleva el nombre elegido en «¿Quién eres?» y la base lo valida.
async function llamar(funcion: string, argumentos: Record<string, unknown>, ok: string): Promise<Resultado> {
  const { error } = await crearCliente().rpc(funcion, argumentos)
  if (error) return { error: error.code === '42501' ? 'No tienes permiso para esta operación.' : error.message }
  revalidatePath('/servicio-tecnico')
  return { ok }
}

export async function tomarPedido(id: number, tecnico: string) {
  return llamar('alistamiento_tomar', { p_id: id, p_tecnico: tecnico }, 'Pedido tomado: queda a tu nombre.')
}

export async function marcarChecklist(id: number, clave: string, valor: boolean, tecnico: string) {
  return llamar('alistamiento_checklist', { p_id: id, p_clave: clave, p_valor: valor, p_tecnico: tecnico }, valor ? 'Marcado.' : 'Desmarcado.')
}

export async function marcarListo(id: number, tecnico: string) {
  return llamar('alistamiento_listo', { p_id: id, p_tecnico: tecnico }, 'Listo para despachar. El asesor ya lo ve.')
}

export async function reabrirPedido(id: number, tecnico: string) {
  return llamar('alistamiento_reabrir', { p_id: id, p_tecnico: tecnico }, 'Revisión abierta de nuevo.')
}

// Desde la ficha del cliente: el asesor pone el OP o la FVE que le da contabilidad (RAL-03).
export async function guardarDocumento(id: number, lead: number, tipo: string, numero: string) {
  const r = await llamar('alistamiento_documento', { p_id: id, p_tipo: tipo, p_numero: numero }, 'Documento guardado.')
  if (!r.error) revalidatePath(`/leads/${lead}`)
  return r
}

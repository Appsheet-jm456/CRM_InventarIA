'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

// Escriben las funciones de la base, que verifican el permiso (RS-02, RS-03).
async function llamar(funcion: string, argumentos: Record<string, unknown>, ok?: string): Promise<Resultado> {
  const { error } = await crearCliente().rpc(funcion, argumentos)
  if (error) return { error: error.message }
  revalidatePath('/seguimientos')
  revalidatePath('/')
  return ok ? { ok } : {}
}

export async function agendar(lead: number, que: string, vence: string, asignado?: string) {
  if (!que.trim()) return { error: 'Escribe qué hay que hacer.' }
  const fecha = new Date(vence)
  if (Number.isNaN(fecha.getTime())) return { error: 'La fecha no es válida.' }
  return llamar('crear_seguimiento', { p_lead: lead, p_que: que, p_vence: fecha.toISOString(), p_asignado: asignado || null }, 'Seguimiento agendado.')
}

export async function marcarHecho(id: number, nota = '') {
  return llamar('cerrar_seguimiento', { p_id: id, p_estado: 'hecho', p_nota: nota })
}

export async function cancelar(id: number, nota = '') {
  return llamar('cerrar_seguimiento', { p_id: id, p_estado: 'cancelado', p_nota: nota })
}

export async function reprogramar(id: number, vence: string) {
  const fecha = new Date(vence)
  if (Number.isNaN(fecha.getTime())) return { error: 'La fecha no es válida.' }
  return llamar('reprogramar_seguimiento', { p_id: id, p_vence: fecha.toISOString() })
}

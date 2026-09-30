'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

// Todo con la sesión del administrador: el RLS pide administrar_usuarios y los triggers impiden
// dejar el sistema sin quien administre (decisión 0018).
export async function alternarPermiso(rolId: number, permiso: string, activar: boolean): Promise<Resultado> {
  const supabase = crearCliente()
  const { data, error } = activar
    ? await supabase.from('rol_permisos').insert({ rol_id: rolId, permiso }).select('rol_id')
    : await supabase.from('rol_permisos').delete().eq('rol_id', rolId).eq('permiso', permiso).select('rol_id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'No tienes permiso para cambiar roles.' }
  revalidatePath('/roles')
  revalidatePath('/', 'layout')
  return {}
}

export async function crearRol(_: Resultado, datos: FormData): Promise<Resultado> {
  const nombre = String(datos.get('nombre') ?? '').trim().toLowerCase()
  if (!nombre) return { error: 'Escribe el nombre del rol.' }
  const { error } = await crearCliente().from('roles').insert({ nombre })
  if (error) return { error: error.code === '23505' ? `Ya existe el rol ${nombre}.` : error.message }
  revalidatePath('/roles')
  return { ok: `Rol ${nombre} creado, sin permisos: actívale los que necesite.` }
}

export async function borrarRol(rolId: number): Promise<Resultado> {
  const { data, error } = await crearCliente().from('roles').delete().eq('id', rolId).select('id')
  if (error)
    return { error: error.code === '23503' ? 'Ese rol tiene usuarios: cámbialos de rol antes de borrarlo.' : error.message }
  if (!data?.length) return { error: 'No tienes permiso para borrar roles.' }
  revalidatePath('/roles')
  return {}
}

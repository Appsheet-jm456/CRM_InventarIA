'use server'

import { redirect } from 'next/navigation'
import { crearCliente } from '@/lib/supabase/server'
import { correoDeUsuario } from '@/lib/usuario'

export type EstadoLogin = { error?: string }

export async function iniciarSesion(_: EstadoLogin, datos: FormData): Promise<EstadoLogin> {
  const usuario = String(datos.get('usuario') ?? '').trim()
  const clave = String(datos.get('clave') ?? '')
  if (!usuario || !clave) return { error: 'Escribe tu usuario y tu contraseña.' }

  const supabase = crearCliente()
  const { data, error } = await supabase.auth.signInWithPassword({ email: correoDeUsuario(usuario), password: clave })
  if (error || !data.user) return { error: 'Usuario o contraseña incorrectos.' }

  // Sin perfil activo no entra: el RLS solo le deja leer su perfil si está activo.
  const { data: perfil } = await supabase.from('usuarios').select('activo').eq('id', data.user.id).maybeSingle()
  if (!perfil?.activo) {
    await supabase.auth.signOut()
    return { error: 'Este usuario no tiene acceso. Pídele al administrador que lo active.' }
  }
  redirect('/')
}

export async function cerrarSesion() {
  await crearCliente().auth.signOut()
  redirect('/login')
}

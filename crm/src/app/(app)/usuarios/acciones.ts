'use server'

import { revalidatePath } from 'next/cache'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearCliente } from '@/lib/supabase/server'
import { correoDeUsuario, PATRON_USUARIO } from '@/lib/usuario'

export type Resultado = { error?: string; ok?: string }

const MINIMO_CLAVE = 8

// La llave de servicio solo se usa después de que la base confirma el permiso de quien pide.
async function esAdministradorDeUsuarios() {
  const sesion = await obtenerSesion()
  return sesion && puede(sesion, ['administrar_usuarios']) ? sesion : null
}

export async function crearUsuario(_: Resultado, datos: FormData): Promise<Resultado> {
  if (!(await esAdministradorDeUsuarios())) return { error: 'No tienes permiso para crear usuarios.' }

  const nombre = String(datos.get('nombre') ?? '').trim()
  const usuario = String(datos.get('usuario') ?? '').trim().toLowerCase()
  const clave = String(datos.get('clave') ?? '')
  const rolId = Number(datos.get('rol_id'))
  if (!nombre) return { error: 'Escribe el nombre de la persona.' }
  if (!PATRON_USUARIO.test(usuario))
    return { error: 'El usuario lleva de 3 a 30 letras minúsculas, números, punto, guion o guion bajo, sin espacios.' }
  if (clave.length < MINIMO_CLAVE) return { error: `La contraseña necesita al menos ${MINIMO_CLAVE} caracteres.` }
  if (!rolId) return { error: 'Elige un rol.' }

  const admin = crearClienteAdmin()
  const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
    email: correoDeUsuario(usuario),
    password: clave,
    email_confirm: true,
  })
  if (errorAuth || !creado.user) {
    const repetido = errorAuth?.message.toLowerCase().includes('already')
    return { error: repetido ? `Ya existe el usuario ${usuario}.` : `No se pudo crear: ${errorAuth?.message}` }
  }

  // El perfil lo escribe la sesión del administrador: el RLS vuelve a verificar el permiso.
  const { error } = await crearCliente().from('usuarios').insert({ id: creado.user.id, nombre, rol_id: rolId })
  if (error) {
    await admin.auth.admin.deleteUser(creado.user.id)
    return { error: `No se pudo crear: ${error.message}` }
  }
  revalidatePath('/usuarios')
  return { ok: `Usuario ${usuario} creado.` }
}

async function actualizarPerfil(id: string, cambios: { rol_id?: number; activo?: boolean }): Promise<Resultado> {
  const { data, error } = await crearCliente().from('usuarios').update(cambios).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'No tienes permiso para cambiar usuarios.' }
  revalidatePath('/usuarios')
  return {}
}

export async function cambiarRol(id: string, rolId: number): Promise<Resultado> {
  return actualizarPerfil(id, { rol_id: rolId })
}

export async function cambiarActivo(id: string, activo: boolean): Promise<Resultado> {
  const sesion = await obtenerSesion()
  if (sesion?.id === id && !activo) return { error: 'No puedes desactivar tu propio usuario.' }
  return actualizarPerfil(id, { activo })
}

export async function cambiarClave(id: string, clave: string): Promise<Resultado> {
  if (!(await esAdministradorDeUsuarios())) return { error: 'No tienes permiso para cambiar contraseñas.' }
  if (clave.length < MINIMO_CLAVE) return { error: `La contraseña necesita al menos ${MINIMO_CLAVE} caracteres.` }
  const { error } = await crearClienteAdmin().auth.admin.updateUserById(id, { password: clave })
  if (error) return { error: `No se pudo cambiar: ${error.message}` }
  return { ok: 'Contraseña cambiada.' }
}

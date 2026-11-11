import 'server-only'
import { cache } from 'react'
import { crearCliente } from '@/lib/supabase/server'
import { usuarioDeCorreo } from '@/lib/usuario'

export type Sesion = {
  id: string
  usuario: string
  nombre: string
  rol: string
  permisos: string[]
}

// Una sola consulta por petición. Si el perfil no existe o está inactivo, no hay sesión: el RLS
// tampoco le deja ver nada (es_usuario_activo).
export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const supabase = crearCliente()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('nombre, activo, roles(nombre, rol_permisos(permiso))') // perfil, rol y permisos en un solo viaje
    .eq('id', user.id)
    .maybeSingle()
  if (!perfil?.activo) return null

  const rol = perfil.roles as unknown as { nombre: string; rol_permisos: { permiso: string }[] | null } | null

  return {
    id: user.id,
    usuario: usuarioDeCorreo(user.email),
    nombre: perfil.nombre,
    rol: rol?.nombre ?? '',
    permisos: (rol?.rol_permisos ?? []).map((p) => p.permiso),
  }
})

// Vacío = cualquier usuario activo; si no, basta uno de la lista.
export function puede(sesion: Sesion, permisos: readonly string[]) {
  return permisos.length === 0 || permisos.some((p) => sesion.permisos.includes(p))
}

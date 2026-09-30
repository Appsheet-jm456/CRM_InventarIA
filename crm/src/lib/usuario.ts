// Se entra con un usuario, no con un correo (RU-02, decisión 0018). Supabase Auth pide correo,
// así que el usuario se guarda como <usuario>@inventaria.local: no recibe correos.
export const DOMINIO_USUARIOS = 'inventaria.local'

export const PATRON_USUARIO = /^[a-z0-9._-]{3,30}$/

export function correoDeUsuario(usuario: string) {
  const u = usuario.trim().toLowerCase()
  return u.includes('@') ? u : `${u}@${DOMINIO_USUARIOS}`
}

export function usuarioDeCorreo(correo: string | undefined | null) {
  if (!correo) return ''
  const sufijo = `@${DOMINIO_USUARIOS}`
  return correo.endsWith(sufijo) ? correo.slice(0, -sufijo.length) : correo
}

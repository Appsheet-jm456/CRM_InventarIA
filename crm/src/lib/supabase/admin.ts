import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Llave de servicio: se salta el RLS. Solo para lo que Supabase Auth no deja hacer con la sesión
// del usuario (crear cuentas, cambiar contraseñas), y siempre después de verificar el permiso.
export function crearClienteAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { COOKIE_SESION } from '@/lib/supabase/cookie'

// Cliente con la sesión del usuario: la base aplica su rol en RLS y en cada función.
export function crearCliente() {
  const almacen = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: COOKIE_SESION },
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => almacen.set(name, value, options))
          } catch {
            // Un Server Component no puede escribir cookies; el middleware refresca la sesión.
          }
        },
      },
    },
  )
}

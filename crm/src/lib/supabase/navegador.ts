'use client'

import { createBrowserClient } from '@supabase/ssr'
import { COOKIE_SESION } from '@/lib/supabase/cookie'

// Cliente del navegador, solo para el tiempo real y las lecturas de la Bandeja: la sesión del usuario
// va en las cookies y el RLS decide qué ve (decisión 0020). La API se busca en el mismo equipo por el
// que se abrió la app, así sirve por la red local y por Tailscale.
let cliente: ReturnType<typeof createBrowserClient> | null = null

export function clienteNavegador() {
  if (!cliente) {
    const url = `${window.location.protocol}//${window.location.hostname}:${process.env.NEXT_PUBLIC_SUPABASE_PORT ?? '8020'}`
    cliente = createBrowserClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: { name: COOKIE_SESION } })
  }
  return cliente
}

// Realtime revisa el RLS con el token con que se unió el canal. Si el canal se abre antes de leer la
// sesión de las cookies, se une como anónimo y no le llega nada: primero se fija el token del usuario.
export async function prepararTiempoReal() {
  const supabase = clienteNavegador()
  const { data } = await supabase.auth.getSession()
  if (data.session) await supabase.realtime.setAuth(data.session.access_token)
  return supabase
}

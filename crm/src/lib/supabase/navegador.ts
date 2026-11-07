'use client'

import { createBrowserClient } from '@supabase/ssr'
import { COOKIE_SESION } from '@/lib/supabase/cookie'

// Cliente del navegador, solo para el tiempo real y las lecturas de la Bandeja: la sesión del usuario
// va en las cookies y el RLS decide qué ve (decisión 0020). La API se busca en el mismo equipo por el
// que se abrió la app, así sirve por la red local y por Tailscale.
let cliente: ReturnType<typeof createBrowserClient> | null = null

// Por la dirección pública (crm.<dominio>, detrás de Cloudflare Access) no hay puerto 8020: el túnel envía /auth/v1, /rest/v1,
// /realtime/v1 y /storage/v1 a la base por la misma dirección (docs/TUNEL-WEBHOOK.md). Por red local y Tailscale sigue el puerto.
export function urlApi() {
  const { protocol, hostname, origin } = window.location
  return hostname.startsWith('crm.') && hostname.endsWith('.shop') ? origin : `${protocol}//${hostname}:${process.env.NEXT_PUBLIC_SUPABASE_PORT ?? '8020'}`
}

export function clienteNavegador() {
  if (!cliente) cliente = createBrowserClient(urlApi(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: { name: COOKIE_SESION } })
  return cliente
}

// F4·50: sube un archivo grande directo al almacenamiento con la sesión del usuario (el RLS del bucket decide), avisando el avance.
// La app no lo recibe: sus acciones aceptan 21 MB y un video de celular pesa más.
export async function subirConAvance(bucket: string, ruta: string, archivo: File, alAvanzar: (porcentaje: number) => void): Promise<string | null> {
  const { data } = await clienteNavegador().auth.getSession()
  if (!data.session) return 'Tu sesión venció: recarga la página.'
  return new Promise((resolver) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${urlApi()}/storage/v1/object/${bucket}/${ruta.split('/').map(encodeURIComponent).join('/')}`)
    xhr.setRequestHeader('Authorization', `Bearer ${data.session!.access_token}`)
    xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    xhr.setRequestHeader('Content-Type', archivo.type || 'video/mp4')
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) alAvanzar(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolver(null)
      let mensaje = `El servidor no aceptó el archivo (${xhr.status}).`
      try { mensaje = JSON.parse(xhr.responseText).message || mensaje } catch { /* sin detalle */ }
      if (xhr.status === 413 || /too large|exceeded/i.test(mensaje)) mensaje = 'El video pesa demasiado: grábalo más corto (hasta 2 minutos) o en 720p.'
      resolver(mensaje)
    }
    xhr.onerror = () => resolver('Se cortó la conexión mientras subía el video: intenta de nuevo.')
    xhr.send(archivo)
  })
}

// Realtime revisa el RLS con el token con que se unió el canal. Si el canal se abre antes de leer la
// sesión de las cookies, se une como anónimo y no le llega nada: primero se fija el token del usuario.
export async function prepararTiempoReal() {
  const supabase = clienteNavegador()
  const { data } = await supabase.auth.getSession()
  if (data.session) await supabase.realtime.setAuth(data.session.access_token)
  return supabase
}

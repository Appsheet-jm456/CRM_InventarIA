import 'server-only'
import { API } from '@/lib/meta'

// Prueba de la conexión contra Meta antes de guardarla (RC-03). Nunca devuelve ni escribe secretos en el resultado.
export type Paso = {
  clave: string
  titulo: string
  estado: 'ok' | 'mal' | 'aviso' | 'omitido'
  detalle: string
  critico: boolean
}
export type Prueba = {
  ok: boolean
  pasos: Paso[]
  numero?: string
  nombre?: string
  calidad?: string
  callback?: string
}
export type DatosMeta = { appId: string; wabaId: string; phoneNumberId: string; token: string; appSecret: string }

async function graph(ruta: string, opciones: { token?: string; params?: Record<string, string> } = {}) {
  const url = new URL(`${API}/${ruta}`)
  for (const [k, v] of Object.entries(opciones.params ?? {})) url.searchParams.set(k, v)
  try {
    const r = await fetch(url, {
      headers: opciones.token ? { Authorization: `Bearer ${opciones.token}` } : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    const data = await r.json().catch(() => ({}))
    return { ok: r.ok, data, error: r.ok ? '' : String(data?.error?.message ?? r.status) }
  } catch {
    return { ok: false, data: {}, error: 'No se pudo conectar con Meta.' }
  }
}

export async function probarConexion(d: DatosMeta): Promise<Prueba> {
  const pasos: Paso[] = []
  const limpiar = (t: string) => t.split(d.token).join('••••').split(d.appSecret).join('••••')
  const anotar = (p: Paso) => pasos.push({ ...p, detalle: limpiar(p.detalle) })
  const tokenApp = `${d.appId}|${d.appSecret}`
  const prueba: Prueba = { ok: false, pasos }

  // 1. El App Secret corresponde a ese App ID
  const secreto = await graph('oauth/access_token', {
    params: { client_id: d.appId, client_secret: d.appSecret, grant_type: 'client_credentials' },
  })
  const secretoOk = secreto.ok && !!secreto.data?.access_token
  anotar({
    clave: 'app_secret', titulo: 'El App Secret corresponde a esa app', critico: true,
    estado: secretoOk ? 'ok' : 'mal',
    detalle: secretoOk ? 'Meta aceptó el App ID con ese secreto.' : `Meta no lo aceptó: ${secreto.error}`,
  })

  // 2. El token es válido, no vence y trae los permisos de WhatsApp
  if (secretoOk) {
    const dep = await graph('debug_token', { params: { input_token: d.token, access_token: tokenApp } })
    const info = dep.data?.data ?? {}
    const scopes: string[] = info.scopes ?? []
    const faltan = ['whatsapp_business_messaging', 'whatsapp_business_management'].filter((s) => !scopes.includes(s))
    let estado: Paso['estado'] = 'ok'
    let detalle = info.expires_at === 0 ? 'Válido y no vence.' : `Válido hasta ${new Date(info.expires_at * 1000).toLocaleDateString('es-CO')}.`
    if (!dep.ok || !info.is_valid) {
      estado = 'mal'
      detalle = `El token no es válido: ${info.error?.message ?? dep.error ?? 'Meta lo rechazó'}`
    } else if (String(info.app_id) !== d.appId) {
      estado = 'mal'
      detalle = 'El token pertenece a otra app, no a ese App ID.'
    } else if (faltan.length) {
      estado = 'mal'
      detalle = `Al token le faltan permisos: ${faltan.join(', ')}.`
    } else if (info.expires_at !== 0) {
      estado = 'aviso'
    }
    anotar({ clave: 'token', titulo: 'El token es válido y trae los permisos de WhatsApp', critico: true, estado, detalle })
  } else {
    anotar({ clave: 'token', titulo: 'El token es válido y trae los permisos de WhatsApp', critico: true, estado: 'omitido', detalle: 'Se revisa cuando el App Secret sea correcto.' })
  }

  // 3. El número está conectado
  const num = await graph(d.phoneNumberId, {
    token: d.token, params: { fields: 'display_phone_number,verified_name,status,quality_rating' },
  })
  if (num.ok) {
    prueba.numero = num.data.display_phone_number
    prueba.nombre = num.data.verified_name
    prueba.calidad = num.data.quality_rating
  }
  const conectado = num.ok && num.data.status === 'CONNECTED'
  anotar({
    clave: 'numero', titulo: 'El número está conectado', critico: true,
    estado: conectado ? 'ok' : 'mal',
    detalle: num.ok
      ? `${num.data.display_phone_number} · ${num.data.verified_name} · estado ${num.data.status} · calidad ${num.data.quality_rating ?? 'sin dato'}`
      : `Meta no devolvió el número: ${num.error}`,
  })

  // 4. El número pertenece a esa WABA
  const lista = await graph(`${d.wabaId}/phone_numbers`, { token: d.token, params: { fields: 'id' } })
  const pertenece = lista.ok && (lista.data.data ?? []).some((x: { id: string }) => x.id === d.phoneNumberId)
  anotar({
    clave: 'waba', titulo: 'El número pertenece a esa cuenta de WhatsApp (WABA)', critico: true,
    estado: pertenece ? 'ok' : 'mal',
    detalle: pertenece ? 'El número está en la WABA.' : lista.ok ? 'Ese número no está en esa WABA.' : `Meta no devolvió la WABA: ${lista.error}`,
  })

  // 5. La app está suscrita a la WABA (aviso: se puede suscribir desde la pantalla)
  const subs = await graph(`${d.wabaId}/subscribed_apps`, { token: d.token })
  const suscrita = subs.ok && (subs.data.data ?? []).some((x: { whatsapp_business_api_data?: { id?: string } }) => x.whatsapp_business_api_data?.id === d.appId)
  anotar({
    clave: 'suscripcion', titulo: 'La app está suscrita a la WABA', critico: false,
    estado: suscrita ? 'ok' : 'aviso',
    detalle: suscrita ? 'Los mensajes de la WABA llegan a esta app.' : 'Todavía no: sin esto Meta no envía los mensajes a la app. Se suscribe desde esta pantalla.',
  })

  // 6. El webhook de la app
  if (secretoOk) {
    const web = await graph(`${d.appId}/subscriptions`, { params: { access_token: tokenApp } })
    const wa = (web.data?.data ?? []).find((x: { object: string }) => x.object === 'whatsapp_business_account')
    prueba.callback = wa?.callback_url
    anotar({
      clave: 'webhook', titulo: 'La app tiene un webhook de WhatsApp', critico: false,
      estado: wa?.callback_url ? 'ok' : 'aviso',
      detalle: wa?.callback_url ? `Apunta a ${wa.callback_url}` : 'La app todavía no tiene webhook. Se registra desde esta pantalla.',
    })
  }

  prueba.ok = pasos.filter((p) => p.critico).every((p) => p.estado === 'ok' || p.estado === 'aviso')
  return prueba
}

// Suscribe la app a la WABA (la comprobación 5).
export async function suscribirApp(wabaId: string, token: string) {
  try {
    const r = await fetch(`${API}/${wabaId}/subscribed_apps`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
    })
    const d = await r.json().catch(() => ({}))
    return r.ok && d.success ? {} : { error: String(d?.error?.message ?? r.status) }
  } catch {
    return { error: 'No se pudo conectar con Meta.' }
  }
}

// Registra la URL del webhook de la app y su token de verificación (lo que hacía tunel.py).
export async function registrarWebhook(appId: string, appSecret: string, verifyToken: string, url: string) {
  const cuerpo = new URLSearchParams({
    object: 'whatsapp_business_account', callback_url: url, verify_token: verifyToken,
    fields: 'messages', access_token: `${appId}|${appSecret}`,
  })
  try {
    const r = await fetch(`${API}/${appId}/subscriptions`, {
      method: 'POST', body: cuerpo, cache: 'no-store', signal: AbortSignal.timeout(30000),
    })
    const d = await r.json().catch(() => ({}))
    return r.ok && d.success ? {} : { error: String(d?.error?.message ?? r.status) }
  } catch {
    return { error: 'No se pudo conectar con Meta.' }
  }
}

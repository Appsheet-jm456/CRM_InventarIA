'use server'

import { revalidatePath } from 'next/cache'
import { canalSeguro } from '@/lib/canalSeguro'
import { conexionMeta, olvidarConexionMeta } from '@/lib/metaConexion'
import { probarConexion, registrarWebhook, suscribirApp, type Paso } from '@/lib/metaPrueba'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'

// Configuración → Meta (F4·16, decisión 0029). Los secretos solo entran: ninguna acción los devuelve (RC-01).
// El permiso lo vuelve a exigir la base en cada función (administrar_meta).
export type Resultado = { error?: string; ok?: string; pasos?: Paso[]; verifyToken?: string }

const ID = /^[0-9]{5,25}$/

async function esAdministrador() {
  const sesion = await obtenerSesion()
  return !!sesion && puede(sesion, ['administrar_meta'])
}

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()

// Probar o guardar. El botón que se pulsó llega en el campo `accion`.
export async function enviarMeta(_: Resultado, datos: FormData): Promise<Resultado> {
  if (!(await esAdministrador())) return { error: 'No tienes permiso para cambiar la conexión con Meta.' }
  const canal = canalSeguro()
  if (!canal.seguro) return { error: canal.motivo }

  const accion = texto(datos, 'accion')
  const appId = texto(datos, 'app_id')
  const wabaId = texto(datos, 'waba_id')
  const phoneNumberId = texto(datos, 'phone_number_id')
  if (![appId, wabaId, phoneNumberId].every((v) => ID.test(v)))
    return { error: 'App ID, WABA ID y Phone Number ID son números de 5 a 25 dígitos.' }

  // Un secreto vacío conserva el que ya hay (RC-01). Si lo que hay es el de .env.meta, al guardar se importa a la base.
  const actual = await conexionMeta()
  const token = texto(datos, 'token') || actual?.token || ''
  const appSecret = texto(datos, 'app_secret') || actual?.appSecret || ''
  if (!token) return { error: 'Falta el token de acceso.' }
  if (!appSecret) return { error: 'Falta el App Secret.' }

  const prueba = await probarConexion({ appId, wabaId, phoneNumberId, token, appSecret })
  const resumen = { ok: prueba.ok, pasos: prueba.pasos.map((p) => ({ clave: p.clave, estado: p.estado, detalle: p.detalle })) }
  const supabase = crearCliente()

  if (accion !== 'guardar') {
    await supabase.rpc('meta_anotar_prueba', { p_prueba: resumen })
    revalidatePath('/meta')
    return prueba.ok
      ? { ok: 'La prueba salió bien. Ya puedes guardar.', pasos: prueba.pasos }
      : { error: 'La prueba falló: revisa lo marcado en rojo.', pasos: prueba.pasos }
  }

  if (!prueba.ok) return { error: 'No se guardó: la prueba contra Meta falló.', pasos: prueba.pasos }
  const importar = actual?.origen === 'entorno'
  const { data, error } = await supabase.rpc('meta_guardar', {
    p_app_id: appId, p_waba_id: wabaId, p_phone_number_id: phoneNumberId,
    p_token: texto(datos, 'token') || (importar ? token : null),
    p_app_secret: texto(datos, 'app_secret') || (importar ? appSecret : null),
    p_numero_visible: prueba.numero ?? null, p_nombre_verificado: prueba.nombre ?? null, p_calidad: prueba.calidad ?? null,
    p_prueba: resumen,
  })
  if (error) return { error: `No se pudo guardar: ${error.message}`, pasos: prueba.pasos }
  olvidarConexionMeta()
  revalidatePath('/meta')
  return {
    ok: 'Conexión guardada. El bot y la app la usan en menos de 30 segundos, sin reiniciar.',
    pasos: prueba.pasos,
    verifyToken: (data as string | null) ?? undefined,
  }
}

// Un token de verificación nuevo: se muestra una sola vez (hay que registrarlo de nuevo en Meta).
export async function nuevoTokenVerificacion(): Promise<Resultado> {
  if (!(await esAdministrador())) return { error: 'No tienes permiso.' }
  const { data, error } = await crearCliente().rpc('meta_nuevo_verify_token')
  if (error) return { error: error.message }
  olvidarConexionMeta()
  revalidatePath('/meta')
  return { ok: 'Token de verificación nuevo. Cópialo ahora: no se vuelve a mostrar.', verifyToken: data as string }
}

export async function suscribirAWaba(): Promise<Resultado> {
  if (!(await esAdministrador())) return { error: 'No tienes permiso.' }
  const c = await conexionMeta()
  if (!c?.wabaId) return { error: 'Primero guarda la conexión.' }
  const r = await suscribirApp(c.wabaId, c.token)
  if (r.error) return { error: `Meta no la suscribió: ${r.error}` }
  revalidatePath('/meta')
  return { ok: 'La app quedó suscrita a la WABA.' }
}

export async function registrarElWebhook(_: Resultado, datos: FormData): Promise<Resultado> {
  if (!(await esAdministrador())) return { error: 'No tienes permiso.' }
  let url = texto(datos, 'url').replace(/\/+$/, '')
  if (!/^https:\/\/[^\s]+$/.test(url)) return { error: 'La dirección debe empezar por https:// (Meta no acepta http).' }
  if (!url.endsWith('/webhook')) url += '/webhook'
  const c = await conexionMeta()
  if (!c?.appId || !c.verifyToken) return { error: 'Primero guarda la conexión.' }
  const r = await registrarWebhook(c.appId, c.appSecret, c.verifyToken, url)
  if (r.error) return { error: `Meta no registró el webhook: ${r.error}` }
  revalidatePath('/meta')
  return { ok: `Webhook registrado: ${url}` }
}

export async function desconectarMeta(_: Resultado, datos: FormData): Promise<Resultado> {
  if (!(await esAdministrador())) return { error: 'No tienes permiso.' }
  if (texto(datos, 'confirmar') !== 'DESCONECTAR') return { error: 'Escribe DESCONECTAR para confirmar.' }
  const { error } = await crearCliente().rpc('meta_desconectar')
  if (error) return { error: error.message }
  olvidarConexionMeta()  // la página se recarga desde el cliente, después de mostrar este aviso
  return { ok: 'Conexión eliminada: los secretos se borraron.' }
}

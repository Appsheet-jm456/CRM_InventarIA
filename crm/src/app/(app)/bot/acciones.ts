'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'
import { obtenerSesion, puede } from '@/lib/sesion'

export type Resultado = { error?: string; ok?: string }
export type Opcion = { id: string; titulo: string }

// Todo con la sesión del usuario: el RLS y los triggers de la base piden administrar_bot (decisión 0023).
function listo(error: { code?: string; message: string } | null, filas: unknown[] | null, ok?: string): Resultado {
  if (error) {
    if (error.code === '23505') return { error: 'Ya existe.' }
    if (error.code === '42501') return { error: 'No tienes permiso para cambiar el bot o el horario.' }
    return { error: error.message }
  }
  if (!filas?.length) return { error: 'No tienes permiso para cambiar el bot o el horario.' }
  revalidatePath('/bot')
  return ok ? { ok } : {}
}

// La versión publicada se edita con funciones de la base: solo textos y títulos, nunca a dónde lleva cada opción
// (decisión 0026). Las opciones que manda el navegador solo aportan su título.
export async function guardarNodo(clave: string, texto: string | null, opciones: Opcion[] | null): Promise<Resultado> {
  if (texto !== null && !texto.trim()) return { error: 'El mensaje no puede quedar vacío.' }
  const { error } = await crearCliente().rpc('editar_cuadro', {
    p_clave: clave,
    p_texto: texto,
    p_titulos: opciones ? opciones.map((o) => ({ id: o.id, titulo: o.titulo.trim() })) : null,
  })
  return listo(error, [clave], 'Guardado. El bot lo usa en menos de 30 segundos.')
}

export async function restaurarNodo(clave: string): Promise<Resultado> {
  const { error } = await crearCliente().rpc('restaurar_cuadro', { p_clave: clave })
  return listo(error, [clave], 'Restaurado al texto original.')
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

export async function crearFranja(dia: number, abre: string, cierra: string): Promise<Resultado> {
  if (!HORA.test(abre) || !HORA.test(cierra)) return { error: 'Escribe la hora como 08:00.' }
  if (cierra <= abre) return { error: 'El cierre debe ser después de la apertura.' }
  const { data, error } = await crearCliente().from('horario_atencion').insert({ dia, abre, cierra }).select('id')
  return listo(error, data)
}

export async function editarFranja(id: number, abre: string, cierra: string): Promise<Resultado> {
  if (!HORA.test(abre) || !HORA.test(cierra)) return { error: 'Escribe la hora como 08:00.' }
  if (cierra <= abre) return { error: 'El cierre debe ser después de la apertura.' }
  const { data, error } = await crearCliente().from('horario_atencion').update({ abre, cierra }).eq('id', id).select('id')
  return listo(error, data)
}

export async function borrarFranja(id: number): Promise<Resultado> {
  const { data, error } = await crearCliente().from('horario_atencion').delete().eq('id', id).select('id')
  return listo(error, data)
}

export async function crearFestivo(fecha: string, nombre: string): Promise<Resultado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Elige la fecha.' }
  if (!nombre.trim()) return { error: 'Escribe el nombre del festivo.' }
  const { data, error } = await crearCliente().from('festivos').insert({ fecha, nombre: nombre.trim() }).select('fecha')
  if (error?.code === '23505') return { error: 'Esa fecha ya es festivo.' }
  return listo(error, data)
}

export async function borrarFestivo(fecha: string): Promise<Resultado> {
  const { data, error } = await crearCliente().from('festivos').delete().eq('fecha', fecha).select('fecha')
  return listo(error, data)
}

// --------------------------------------------------------------------------- //
// Lienzo (F4·6): todo sobre el borrador, con las funciones de la base (migración 0012)
// --------------------------------------------------------------------------- //
async function rpc(nombre: string, args: Record<string, unknown> = {}, ok?: string): Promise<Resultado & { dato?: unknown }> {
  const { data, error } = await crearCliente().rpc(nombre, args)
  const r = listo(error, [nombre], ok)
  return error ? r : { ...r, dato: data }
}

export async function crearBorrador() {
  return rpc('crear_borrador', {}, 'Borrador abierto: el bot sigue con la versión publicada hasta que publiques.')
}
export async function descartarBorrador() {
  return rpc('descartar_borrador', {}, 'Borrador descartado.')
}
export async function crearMensaje(x: number, y: number) {
  return rpc('borrador_crear_mensaje', { p_x: Math.round(x), p_y: Math.round(y) })
}
export async function guardarCuadro(clave: string, nombre: string | null, texto: string | null, opciones: { id: string; titulo: string; destino?: string | null }[] | null) {
  return rpc('borrador_guardar_cuadro', { p_clave: clave, p_nombre: nombre, p_texto: texto, p_opciones: opciones }, 'Cuadro guardado en el borrador.')
}
export async function conectar(clave: string, opcion: string, destino: string | null) {
  return rpc('borrador_conectar', { p_clave: clave, p_opcion: opcion, p_destino: destino })
}
export async function moverCuadro(clave: string, x: number, y: number) {
  const { error } = await crearCliente().rpc('borrador_mover', { p_clave: clave, p_x: Math.round(x), p_y: Math.round(y) })
  return error ? { error: error.message } : {}
}
export async function borrarCuadro(clave: string) {
  return rpc('borrador_borrar_cuadro', { p_clave: clave }, 'Cuadro borrado del borrador.')
}

// --------------------------------------------------------------------------- //
// Publicar e historial (F4·7, migración 0014)
// --------------------------------------------------------------------------- //
export async function publicar(nota: string, pisar: boolean): Promise<Resultado & { choque?: boolean; version?: number }> {
  const { data, error } = await crearCliente().rpc('publicar_borrador', { p_nota: nota, p_pisar: pisar })
  if (error?.message.startsWith('CHOQUE')) return { error: error.message.replace(/^CHOQUE:\s*/, ''), choque: true }
  if (error) return listo(error, null)
  revalidatePath('/bot')
  return { ok: `Versión ${data} publicada: el bot la usa en menos de 30 segundos.`, version: data as number }
}

export async function volverAVersion(version: number, reemplazar: boolean) {
  return rpc('borrador_desde_version', { p_version: version, p_reemplazar: reemplazar },
    `Borrador abierto a partir de la versión ${version}: revísalo y publícalo para que el bot vuelva a ella.`)
}

// --------------------------------------------------------------------------- //
// Simulador (F4·8, RF-07): el motor del bot en el receptor, sin escribir ni enviar a WhatsApp
// --------------------------------------------------------------------------- //
export type EstadoSimulado = Record<string, unknown> | null
export type Simulacion = { error?: string; mensajes?: Record<string, unknown>[]; avisos?: string[]; estado?: EstadoSimulado }

export async function simular(version: number, estado: EstadoSimulado, texto: string): Promise<Simulacion> {
  const sesion = await obtenerSesion()
  // El receptor lee con la llave de servicio: el permiso se revisa aquí antes de llamarlo.
  if (!sesion || !puede(sesion, ['administrar_bot'])) return { error: 'No tienes permiso para probar el bot.' }
  try {
    const r = await fetch(`${process.env.CRM_INTERNO_URL}/interno/simular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Interno-Token': process.env.CRM_INTERNO_TOKEN ?? '' },
      body: JSON.stringify({ version, estado, texto: texto.slice(0, 1000) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    })
    if (r.status === 404) return { error: 'Esa versión ya no existe (¿se descartó el borrador?). Recarga la página.' }
    if (!r.ok) throw new Error(String(r.status))
    return await r.json()
  } catch {
    return { error: 'El bot no responde (receptor en el 8095). Revisa que el servicio esté arriba.' }
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

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

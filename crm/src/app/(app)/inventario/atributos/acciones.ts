'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'
import { TIPOS_ATRIBUTO, type TipoAtributoProducto } from '@/lib/inventario'

export type Resultado = { error?: string; ok?: string }
export type CambiosAtributo = { nombre?: string; emoji?: string; opciones?: string[]; categorias?: string[] }

// Las marcas que ya usa la plantilla de Avi: la base tampoco las acepta como clave (0045).
const RESERVADAS = ['equipo', 'codigo', 'marca', 'modelo', 'procesador', 'generacion', 'ram', 'disco', 'estado', 'precio', 'stock',
  'categoria', 'descripcion', 'almacenamiento', 'foto', 'video', 'nombre']
const SIN_PERMISO = 'No tienes permiso para cambiar los atributos del inventario.'

function clave(nombre: string) {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36)
  return /^[a-z]/.test(base) ? base : `a_${base}`.slice(0, 36)
}
const limpiar = (lista: string[]) => [...new Set(lista.map((o) => o.trim()).filter(Boolean))]

function revalidar() {
  revalidatePath('/inventario', 'layout')
  revalidatePath('/agente', 'layout') // la plantilla de Avi ofrece los atributos como datos
}

// RLS: administrar_inventario (0045). La base valida además la clave, el tipo y que una lista tenga opciones.
export async function crearAtributo(d: { nombre: string; tipo: TipoAtributoProducto; emoji: string; opciones: string[]; categorias: string[] }): Promise<Resultado> {
  const nombre = d.nombre.trim()
  if (!nombre || nombre.length > 60) return { error: 'El nombre va de 1 a 60 caracteres.' }
  if (!TIPOS_ATRIBUTO.some((t) => t.id === d.tipo)) return { error: 'Elige un tipo de la lista.' }
  const opciones = limpiar(d.opciones)
  if (d.tipo === 'lista' && !opciones.length) return { error: 'Una lista necesita al menos una opción.' }
  if ([...d.emoji.trim()].length > 4) return { error: 'El emoji es uno solo (o vacío).' }
  const supabase = crearCliente()
  const { data: existentes } = await supabase.from('producto_atributos').select('clave, orden')
  const usadas = new Set([...(existentes ?? []).map((a) => a.clave), ...RESERVADAS])
  let k = clave(nombre)
  if (k.length < 2) return { error: 'El nombre necesita al menos dos letras o números.' }
  for (let i = 2; usadas.has(k); i++) k = `${clave(nombre)}_${i}`
  const orden = Math.max(0, ...(existentes ?? []).map((a) => a.orden)) + 1
  const { error } = await supabase.from('producto_atributos').insert({
    clave: k, nombre, tipo: d.tipo, emoji: d.emoji.trim(), orden,
    opciones: d.tipo === 'lista' ? opciones : [], categorias: limpiar(d.categorias),
  })
  if (error) return { error: error.code === '42501' ? SIN_PERMISO : error.message }
  revalidar()
  return { ok: `Atributo «${nombre}» creado: ya se llena en cada equipo, en el Excel (columna «${nombre}») y en las plantillas como {${k}}.` }
}

export async function editarAtributo(id: number, c: CambiosAtributo): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: actual } = await supabase.from('producto_atributos').select('clave, tipo, opciones').eq('id', id).maybeSingle()
  if (!actual) return { error: 'Ese atributo ya no existe.' }
  const cambios: Record<string, unknown> = {}
  if (c.nombre !== undefined) {
    if (!c.nombre.trim() || c.nombre.trim().length > 60) return { error: 'El nombre va de 1 a 60 caracteres.' }
    cambios.nombre = c.nombre.trim()
  }
  if (c.emoji !== undefined) {
    if ([...c.emoji.trim()].length > 4) return { error: 'El emoji es uno solo (o vacío).' }
    cambios.emoji = c.emoji.trim()
  }
  if (c.categorias !== undefined) cambios.categorias = limpiar(c.categorias)
  if (c.opciones !== undefined) {
    const opciones = limpiar(c.opciones)
    if (!opciones.length) return { error: 'Una lista necesita al menos una opción.' }
    // Quitar una opción que un equipo ya tiene dejaría ese equipo sin poder guardarse: se avisa cuántos la usan.
    const enUso: string[] = []
    for (const o of (actual.opciones as string[]).filter((x) => !opciones.includes(x))) {
      const { count } = await supabase.from('productos').select('id', { count: 'exact', head: true }).eq(`atributos->>${actual.clave}`, o)
      if (count) enUso.push(`«${o}» (${count} ${count === 1 ? 'equipo' : 'equipos'})`)
    }
    if (enUso.length) return { error: `No se puede quitar ${enUso.join(', ')}: cámbiala primero en esos equipos.` }
    cambios.opciones = opciones
  }
  const { data, error } = await supabase.from('producto_atributos').update(cambios).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: SIN_PERMISO }
  revalidar()
  return { ok: 'Guardado.' }
}

// Archivar no borra: los equipos conservan el dato y vuelve al restaurar.
export async function archivarAtributo(id: number, archivar: boolean): Promise<Resultado> {
  const { data, error } = await crearCliente().from('producto_atributos')
    .update({ archivado_en: archivar ? new Date().toISOString() : null }).eq('id', id).select('nombre')
  if (error) return { error: error.message }
  if (!data?.length) return { error: SIN_PERMISO }
  revalidar()
  return { ok: archivar ? `«${data[0].nombre}» archivado: ya no se ve ni sale en las plantillas, pero los equipos conservan el dato.` : `«${data[0].nombre}» restaurado.` }
}

export async function moverAtributo(id: number, direccion: -1 | 1): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: lista } = await supabase.from('producto_atributos').select('id, orden').is('archivado_en', null).order('orden').order('id')
  const filas = lista ?? []
  const i = filas.findIndex((a) => a.id === id)
  const j = i + direccion
  if (i < 0 || j < 0 || j >= filas.length) return {}
  const nuevo = [...filas]
  ;[nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]]
  for (const [n, a] of nuevo.entries()) {
    if (a.orden !== n + 1) {
      const { error } = await supabase.from('producto_atributos').update({ orden: n + 1 }).eq('id', a.id)
      if (error) return { error: error.code === '42501' ? SIN_PERMISO : error.message }
    }
  }
  revalidar()
  return {}
}

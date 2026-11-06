'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'
import { MAX_IMAGEN_ACCION, MAX_PDF_ACCION, pasoListo, type Condicion, type Paso } from './tipos'

export type Resultado = { error?: string; ok?: string }
export type Prueba = {
  accion: { id: number; nombre: string } | null
  apagada: { id: number; nombre: string } | null
  vacia?: boolean
  mensajes: Record<string, unknown>[]
  etiquetas?: string[]
  equipo?: { modelo: string; codigos: string[]; agotado: boolean } | null // F4·42: lo que encontró el disparador
}

function listo(error: { code?: string; message: string } | null, filas: unknown[] | null, ok?: string): Resultado {
  if (error) {
    if (error.code === '23514') return { error: 'Para activarla necesita al menos una frase en «Cuando» y un paso en «Hacer».' }
    if (error.message.includes('del sistema')) return { error: '«Pasar a asesor» es del sistema: siempre activa y primera.' }
    return { error: error.message }
  }
  if (!filas?.length) return { error: 'No tienes permiso para cambiar las acciones.' }
  revalidatePath('/agente/acciones')
  return ok ? { ok } : {}
}

// Limpia lo que llega de la pantalla: frases sin vacíos ni repetidas, pasos con sus datos.
function limpiar(cuando: Condicion[], hacer: Paso[]) {
  const vistos = new Set<string>()
  const c = cuando
    .map((x): Condicion => (x.forma === 'equipo'
      ? { ...x, texto: x.texto.trim() || 'un equipo del inventario', palabras: [...new Set(x.palabras.map((p) => p.trim()).filter(Boolean))] }
      : { forma: x.forma, texto: x.texto.trim() }))
    .filter((x) => x.texto && !vistos.has(`${x.forma}:${x.texto.toLowerCase()}`) && vistos.add(`${x.forma}:${x.texto.toLowerCase()}`))
  const h = hacer.filter((p) => {
    if (p.tipo === 'texto') return !!p.texto?.trim()
    if (p.tipo === 'conocimiento') return !!p.categoria
    if (p.tipo === 'etiqueta') return !!p.etiqueta?.trim()
    if (p.tipo === 'bot') return !!p.bot_id
    if (p.tipo === 'catalogo') return p.modo !== 'lista' || !!p.catalogo_id
    if (p.tipo === 'archivo') return !!p.archivo
    return true
  })
  return { cuando: c, hacer: h }
}

export async function guardarAccion(id: number, datos: { nombre: string; cuando: Condicion[]; hacer: Paso[] }): Promise<Resultado> {
  if (!datos.nombre.trim()) return { error: 'La acción necesita un nombre.' }
  const { cuando, hacer } = limpiar(datos.cuando, datos.hacer)
  const supabase = crearCliente()
  const { data: antes } = await supabase.from('acciones').select('activa, hacer').eq('id', id).maybeSingle()
  // Si quedó con un paso que todavía no existe, se apaga en lugar de fallar.
  const apagar = antes?.activa && !hacer.every(pasoListo)
  const { data, error } = await supabase.from('acciones')
    .update({ nombre: datos.nombre.trim(), cuando, hacer, ...(apagar ? { activa: false } : {}) }).eq('id', id).select('id')
  // Los archivos que la acción ya no usa (se cambiaron o se quitaron) se borran del almacenamiento (F4·43).
  if (!error && data?.length) await borrarArchivos(supabase, archivosDe((antes?.hacer as Paso[] | undefined) ?? []).filter((r) => !archivosDe(hacer).includes(r)))
  return listo(error, data, apagar ? 'Guardada y apagada: tiene un paso que llega en una tarea siguiente.' : 'Acción guardada. El bot la usa en menos de 30 s.')
}

export async function activarAccion(id: number, activa: boolean): Promise<Resultado> {
  const supabase = crearCliente()
  if (activa) {
    const { data: a } = await supabase.from('acciones').select('hacer').eq('id', id).maybeSingle()
    if (!((a?.hacer as Paso[] | undefined) ?? []).every(pasoListo))
      return { error: 'Tiene un paso que el bot no sabe hacer.' }
  }
  const { data, error } = await supabase.from('acciones').update({ activa }).eq('id', id).select('id')
  return listo(error, data, activa ? 'Acción activa: el bot la usa en menos de 30 s.' : 'Acción apagada.')
}

export async function crearAccion(nombre: string): Promise<Resultado> {
  if (!nombre.trim()) return { error: 'Escribe el nombre de la acción.' }
  const supabase = crearCliente()
  const { data: ultima } = await supabase.from('acciones').select('prioridad').order('prioridad', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await supabase.from('acciones')
    .insert({ nombre: nombre.trim(), prioridad: (ultima?.prioridad ?? 0) + 10 }).select('id')
  return listo(error, data, `Acción «${nombre.trim()}» creada al final. Agrega frases y pasos, y actívala.`)
}

export async function borrarAccion(id: number): Promise<Resultado> {
  const supabase = crearCliente()
  const { data, error } = await supabase.from('acciones').delete().eq('id', id).select('hacer')
  if (!error && data?.length) await borrarArchivos(supabase, archivosDe((data[0].hacer as Paso[]) ?? []))
  return listo(error, data, 'Acción borrada.')
}

// --------------------------------------------------------------------------- //
// Archivos de las acciones (F4·43, RAG-50): bucket privado conocimiento, carpeta acciones/
// --------------------------------------------------------------------------- //
const TIPOS_ARCHIVO: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const archivosDe = (hacer: Paso[]) => hacer.flatMap((p) => (p.tipo === 'archivo' && p.archivo.startsWith('acciones/') ? [p.archivo] : []))
async function borrarArchivos(supabase: ReturnType<typeof crearCliente>, rutas: string[]) {
  if (rutas.length) await supabase.storage.from('conocimiento').remove(rutas)
}

// Sube el archivo y devuelve su ruta; la acción lo guarda en el paso al pulsar Guardar (el archivo viejo se borra entonces).
export async function subirArchivoAccion(datos: FormData): Promise<{ error?: string; ruta?: string; nombre?: string }> {
  const archivo = datos.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) return { error: 'Elige un archivo.' }
  const ext = TIPOS_ARCHIVO[archivo.type]
  if (!ext) return { error: 'El archivo tiene que ser PDF, JPG, PNG o WEBP.' }
  if (ext === 'pdf' ? archivo.size > MAX_PDF_ACCION : archivo.size > MAX_IMAGEN_ACCION)
    return { error: ext === 'pdf' ? 'El PDF pesa más de 16 MB.' : 'La imagen pesa más de 5 MB.' }
  const ruta = `acciones/${Date.now()}.${ext}`
  const { error } = await crearCliente().storage.from('conocimiento').upload(ruta, archivo, { contentType: archivo.type })
  if (error) return { error: /policy|security|permission/i.test(error.message) ? 'No tienes permiso para cambiar las acciones.' : `No se pudo subir: ${error.message}` }
  return { ruta, nombre: archivo.name.replace(/\.[^.]+$/, '') }
}

// Sube o baja una acción intercambiando su prioridad con la vecina. «Pasar a asesor» (la primera) no se mueve.
export async function moverAccion(id: number, direccion: 'subir' | 'bajar'): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: todas } = await supabase.from('acciones').select('id, prioridad, sistema').order('prioridad')
  const lista = todas ?? []
  const i = lista.findIndex((a) => a.id === id)
  const j = direccion === 'subir' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= lista.length || lista[i].sistema || lista[j].sistema) return { error: 'No se puede mover más.' }
  const [a, b] = [lista[i], lista[j]]
  // Tres pasos por la prioridad única: la primera va a un valor libre mientras la otra toma su lugar.
  for (const [fila, prioridad] of [[a, -a.id], [b, a.prioridad], [a, b.prioridad]] as const) {
    const { error } = await supabase.from('acciones').update({ prioridad }).eq('id', fila.id)
    if (error) return { error: error.message }
  }
  revalidatePath('/agente/acciones')
  return {}
}

// «Probar con una frase» (RAG-26): el motor real del receptor, sin escribir ni enviar.
export async function probarFrase(texto: string): Promise<{ error?: string; prueba?: Prueba }> {
  if (!texto.trim()) return { error: 'Escribe una frase como la escribiría un cliente.' }
  if (!process.env.CRM_INTERNO_URL || !process.env.CRM_INTERNO_TOKEN) return { error: 'Falta la conexión con el receptor del bot.' }
  try {
    const r = await fetch(`${process.env.CRM_INTERNO_URL}/interno/acciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Interno-Token': process.env.CRM_INTERNO_TOKEN },
      body: JSON.stringify({ texto: texto.slice(0, 500) }),
      cache: 'no-store',
    })
    if (!r.ok) return { error: `El receptor del bot respondió ${r.status}.` }
    return { prueba: (await r.json()) as Prueba }
  } catch {
    return { error: 'El receptor del bot no responde. ¿Está encendido?' }
  }
}

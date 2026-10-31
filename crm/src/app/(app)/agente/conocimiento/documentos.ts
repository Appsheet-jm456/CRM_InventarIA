'use server'

import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }
export type Hallazgo = { fuente: 'ficha' | 'documento'; id: number; titulo: string; texto: string; puntaje: number }

// Documentos de conocimiento (F4·32, docs/AGENTE.md RAG-29 a RAG-33). Todo con la sesión del usuario: el RLS de las tablas y del
// bucket conocimiento pide administrar_agente (migraciones 0024 y 0029). El texto lo extrae el mismo script que se usa en consola.
const EXTRACTOR = path.resolve(process.cwd(), '..', 'herramientas', 'conocimiento', 'extraer_documento.py')
const TIPOS: Record<string, string> = {
  txt: 'text/plain', md: 'text/markdown', pdf: 'application/pdf', csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
const MAX_BYTES = 10 * 1024 * 1024

function leerArchivo(datos: FormData): { archivo: File; ext: string } | { error: string } {
  const archivo = datos.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) return { error: 'Elige un archivo.' }
  const ext = archivo.name.toLowerCase().split('.').pop() ?? ''
  if (!TIPOS[ext]) return { error: 'Sube un archivo .txt, .md, .pdf, .xlsx o .csv.' }
  if (archivo.size > MAX_BYTES) return { error: 'El archivo pesa más de 10 MB.' }
  return { archivo, ext }
}

async function extraer(archivo: File, ext: string): Promise<{ fragmentos?: string[]; aviso?: string | null; error?: string }> {
  const carpeta = await mkdtemp(path.join(tmpdir(), 'crm-doc-'))
  try {
    const ruta = path.join(carpeta, `documento.${ext}`)
    await writeFile(ruta, Buffer.from(await archivo.arrayBuffer()))
    const { stdout } = await promisify(execFile)('python3', [EXTRACTOR, ruta, '--json'], { timeout: 120000, maxBuffer: 50 * 1024 * 1024 })
    return JSON.parse(stdout)
  } catch {
    return { error: 'No se pudo leer el archivo. ¿Está dañado?' }
  } finally {
    await rm(carpeta, { recursive: true, force: true })
  }
}

// Sube el archivo, extrae el texto y guarda los trozos. Si `id` viene, reemplaza ese documento (los trozos y el archivo viejos se borran).
async function procesar(datos: FormData, id?: number): Promise<Resultado> {
  const leido = leerArchivo(datos)
  if ('error' in leido) return leido
  const { archivo, ext } = leido
  const supabase = crearCliente()
  const { data: { user } } = await supabase.auth.getUser()

  const extraido = await extraer(archivo, ext)
  if (extraido.error || !extraido.fragmentos?.length) return { error: extraido.error ?? 'El documento no tiene texto.' }

  const ruta = `documentos/${Date.now()}.${ext}`
  const { error: subida } = await supabase.storage.from('conocimiento').upload(ruta, archivo, { contentType: TIPOS[ext] })
  if (subida) return { error: 'No se pudo subir el archivo. ¿Tienes permiso para cambiar el conocimiento?' }

  let docId = id
  let archivoViejo: string | null = null
  if (id) {
    const { data: antes } = await supabase.from('conocimiento_documentos').select('archivo').eq('id', id).maybeSingle()
    archivoViejo = antes?.archivo ?? null
    const { data, error } = await supabase.from('conocimiento_documentos')
      .update({ nombre: archivo.name, tipo: ext, archivo: ruta, tamano: archivo.size, estado: 'procesando', error: null, fragmentos: 0,
        subido_por: user?.id ?? null, subido_en: new Date().toISOString(), procesado_en: null })
      .eq('id', id).select('id')
    if (error || !data?.length) {
      await supabase.storage.from('conocimiento').remove([ruta])
      return { error: error?.message ?? 'No tienes permiso para cambiar los documentos.' }
    }
    await supabase.from('conocimiento_fragmentos').delete().eq('documento_id', id)
  } else {
    const { data, error } = await supabase.from('conocimiento_documentos')
      .insert({ nombre: archivo.name, tipo: ext, archivo: ruta, tamano: archivo.size, subido_por: user?.id ?? null }).select('id').single()
    if (error || !data) {
      await supabase.storage.from('conocimiento').remove([ruta])
      return { error: error?.message ?? 'No tienes permiso para subir documentos.' }
    }
    docId = data.id
  }

  const filas = extraido.fragmentos.map((texto, i) => ({ documento_id: docId, orden: i + 1, texto }))
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from('conocimiento_fragmentos').insert(filas.slice(i, i + 500))
    if (error) {
      await supabase.from('conocimiento_documentos').update({ estado: 'error', error: 'No se pudieron guardar los trozos.' }).eq('id', docId)
      revalidatePath('/agente/conocimiento')
      return { error: `No se pudieron guardar los trozos: ${error.message}` }
    }
  }
  await supabase.from('conocimiento_documentos')
    .update({ estado: 'listo', fragmentos: filas.length, procesado_en: new Date().toISOString() }).eq('id', docId)
  if (archivoViejo) await supabase.storage.from('conocimiento').remove([archivoViejo])
  revalidatePath('/agente/conocimiento')
  const base = `«${archivo.name}» ${id ? 'reemplazado' : 'listo'}: ${filas.length} ${filas.length === 1 ? 'trozo' : 'trozos'} para el agente.`
  return { ok: extraido.aviso ? `${base} ${extraido.aviso}` : base }
}

export async function subirDocumento(_: Resultado, datos: FormData): Promise<Resultado> {
  return procesar(datos)
}

export async function reemplazarDocumento(id: number, datos: FormData): Promise<Resultado> {
  return procesar(datos, id)
}

export async function activarDocumento(id: number, activo: boolean): Promise<Resultado> {
  const { data, error } = await crearCliente().from('conocimiento_documentos').update({ activo }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'No tienes permiso para cambiar los documentos.' }
  revalidatePath('/agente/conocimiento')
  return { ok: activo ? 'Documento activo: el agente lo consulta.' : 'Documento apagado: el agente deja de consultarlo.' }
}

export async function borrarDocumento(id: number): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: antes } = await supabase.from('conocimiento_documentos').select('archivo').eq('id', id).maybeSingle()
  const { data, error } = await supabase.from('conocimiento_documentos').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'No tienes permiso para borrar documentos.' }
  if (antes?.archivo) await supabase.storage.from('conocimiento').remove([antes.archivo])
  revalidatePath('/agente/conocimiento')
  return { ok: 'Documento borrado con sus trozos.' }
}

export async function verTrozos(id: number): Promise<{ error?: string; trozos?: { orden: number; texto: string }[]; total?: number }> {
  const { data, error, count } = await crearCliente().from('conocimiento_fragmentos')
    .select('orden, texto', { count: 'exact' }).eq('documento_id', id).order('orden').limit(60)
  if (error) return { error: error.message }
  return { trozos: data ?? [], total: count ?? 0 }
}

// «Probar búsqueda» (RAG-29): lo mismo que consultará el agente.
export async function probarBusqueda(texto: string): Promise<{ error?: string; hallazgos?: Hallazgo[] }> {
  if (!texto.trim()) return { error: 'Escribe una pregunta como la haría un cliente.' }
  const { data, error } = await crearCliente().rpc('buscar_conocimiento', { p_texto: texto.slice(0, 300), p_limite: 5 })
  if (error) return { error: error.message }
  return { hallazgos: (data ?? []) as Hallazgo[] }
}

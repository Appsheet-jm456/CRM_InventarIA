'use server'

import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { crearCliente } from '@/lib/supabase/server'
import { CAMPOS_TEXTO } from '@/lib/inventario'

export type Resultado = { error?: string; ok?: string; id?: number } // id: el catálogo creado (lo elige el lienzo, F4·12)

const FOTOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_FOTO = 5 * 1024 * 1024
const MAX_PDF = 20 * 1024 * 1024
const SIN_PERMISO = 'No tienes permiso para cambiar el inventario.'

// El RLS decide (RI-01): si no devuelve la fila, es que no hubo permiso.
function mensaje(error: { message: string; code?: string }) {
  if (error.code === '42501' || /row-level security|permiso/i.test(error.message)) return SIN_PERMISO
  if (error.code === '23505') return 'Ya existe un equipo con ese código.'
  return error.message
}

function numero(valor: FormDataEntryValue | null) {
  const s = String(valor ?? '').trim().replace(/[$\s]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '')
  return s === '' ? NaN : Number(s.replace(',', '.'))
}

async function subirFoto(id: number, archivo: File, anterior: string): Promise<string | Resultado> {
  const ext = FOTOS[archivo.type]
  if (!ext) return { error: 'La foto tiene que ser JPG, PNG o WEBP.' }
  if (archivo.size > MAX_FOTO) return { error: 'La foto pesa más de 5 MB.' }
  const ruta = `${id}/${Date.now()}.${ext}`
  const supabase = crearCliente()
  const { error } = await supabase.storage.from('productos').upload(ruta, archivo, { contentType: archivo.type })
  if (error) return { error: /policy|security/i.test(error.message) ? SIN_PERMISO : `No se pudo subir la foto: ${error.message}` }
  if (anterior) await supabase.storage.from('productos').remove([anterior])
  return ruta
}

export async function guardarProducto(_: Resultado, datos: FormData): Promise<Resultado> {
  const id = Number(datos.get('id')) || null
  const codigo = String(datos.get('codigo') ?? '').trim()
  const precio = numero(datos.get('precio'))
  const stock = numero(datos.get('stock'))
  if (!id && !codigo) return { error: 'Escribe el código del equipo.' }
  if (!Number.isFinite(precio) || precio < 0) return { error: 'El precio tiene que ser un número (sin decimales raros).' }
  if (!Number.isInteger(stock) || stock < 0) return { error: 'El stock tiene que ser un número entero, 0 o más.' }

  const fila: Record<string, string | number> = { precio, stock }
  for (const c of CAMPOS_TEXTO) fila[c] = String(datos.get(c) ?? '').trim()
  const supabase = crearCliente()

  let productoId = id
  let fotoAnterior = String(datos.get('foto_ruta_actual') ?? '')
  if (id) {
    const { data, error } = await supabase.from('productos').update(fila).eq('id', id).select('id')
    if (error) return { error: mensaje(error) }
    if (!data?.length) return { error: SIN_PERMISO }
  } else {
    const { data, error } = await supabase.from('productos').insert({ ...fila, codigo }).select('id').single()
    if (error) return { error: mensaje(error) }
    productoId = data.id
    fotoAnterior = ''
  }

  const foto = datos.get('foto_archivo')
  if (foto instanceof File && foto.size > 0) {
    const subida = await subirFoto(productoId!, foto, fotoAnterior)
    if (typeof subida !== 'string') return subida
    const { error } = await supabase.from('productos').update({ foto_ruta: subida }).eq('id', productoId!)
    if (error) return { error: mensaje(error) }
  } else if (datos.get('quitar_foto') === '1' && fotoAnterior) {
    const { error } = await supabase.from('productos').update({ foto_ruta: '' }).eq('id', productoId!)
    if (error) return { error: mensaje(error) }
    await supabase.storage.from('productos').remove([fotoAnterior])
  }

  revalidatePath('/inventario')
  if (!id) redirect(`/inventario/${productoId}?creado=1`)
  revalidatePath(`/inventario/${id}`)
  return { ok: 'Cambios guardados.' }
}

// --------------------------------------------------------------------------- //
// Carga del Excel (RI-04): el mismo lector de consola y las reglas de la base
// --------------------------------------------------------------------------- //
export type FilaCarga = Record<string, string | number>
export type Previa = {
  error?: string
  productos?: FilaCarga[]
  ignoradas?: string[]
  resultado?: {
    aplicado: boolean
    total: number
    errores: { fila?: string; codigo?: string; error: string }[]
    nuevos: { codigo: string; marca: string; modelo: string; precio: number; stock: number }[]
    cambian: { codigo: string; cambios: Record<string, [unknown, unknown]> }[]
    sin_stock: { codigo: string; marca: string; modelo: string; stock: number }[]
  }
}

const LECTOR = path.resolve(process.cwd(), '..', 'herramientas', 'carga-inventario', 'cargar_inventario.py')

export async function previsualizarExcel(_: Previa, datos: FormData): Promise<Previa> {
  const hoja = datos.get('hoja')
  if (!(hoja instanceof File) || hoja.size === 0) return { error: 'Elige la hoja de Excel (.xlsx) o CSV.' }
  const nombre = hoja.name.toLowerCase()
  if (!/\.(xlsx|xlsm|csv)$/.test(nombre)) return { error: 'La hoja tiene que ser .xlsx o .csv.' }
  if (hoja.size > 10 * 1024 * 1024) return { error: 'La hoja pesa más de 10 MB.' }

  const carpeta = await mkdtemp(path.join(tmpdir(), 'crm-carga-'))
  let leida: { productos?: FilaCarga[]; errores?: string[]; ignoradas?: string[]; error?: string }
  try {
    const archivo = path.join(carpeta, nombre.endsWith('.csv') ? 'hoja.csv' : 'hoja.xlsx')
    await writeFile(archivo, Buffer.from(await hoja.arrayBuffer()))
    const { stdout } = await promisify(execFile)('python3', [LECTOR, archivo, '--json'], { timeout: 30000, maxBuffer: 20 * 1024 * 1024 })
    leida = JSON.parse(stdout)
  } catch {
    return { error: 'No se pudo leer la hoja. ¿Es un Excel válido?' }
  } finally {
    await rm(carpeta, { recursive: true, force: true })
  }
  if (leida.error) return { error: leida.error.replace(/^✗\s*/, '') }
  const productos = leida.productos ?? []
  // Los errores de lectura (sin código, repetido, precio que no es número) ya vienen con su fila.
  if (leida.errores?.length)
    return { ignoradas: leida.ignoradas, resultado: { aplicado: false, total: productos.length, nuevos: [], cambian: [], sin_stock: [],
      errores: leida.errores.map((e) => ({ error: e })) } }

  const { data, error } = await crearCliente().rpc('cargar_inventario', { p_productos: productos, p_aplicar: false })
  if (error) return { error: mensaje(error) }
  return { productos, ignoradas: leida.ignoradas, resultado: data }
}

export async function aplicarExcel(productos: FilaCarga[]): Promise<Previa> {
  const { data, error } = await crearCliente().rpc('cargar_inventario', { p_productos: productos, p_aplicar: true })
  if (error) return { error: mensaje(error) }
  revalidatePath('/inventario')
  return { resultado: data }
}

// --------------------------------------------------------------------------- //
// Catálogos (RI-05)
// --------------------------------------------------------------------------- //
export async function crearCatalogo(_: Resultado, datos: FormData): Promise<Resultado> {
  const nombre = String(datos.get('nombre') ?? '').trim()
  const tipo = String(datos.get('tipo') ?? '')
  const todos = datos.get('todos') === '1'
  if (!nombre) return { error: 'Ponle un nombre al catálogo.' }
  const fila = {
    nombre, tipo, todos,
    categoria: todos ? '' : String(datos.get('categoria') ?? '').trim(),
    marca: todos ? '' : String(datos.get('marca') ?? '').trim(),
    url: '', archivo: '',
  }
  const supabase = crearCliente()

  if (tipo === 'drive') {
    const url = String(datos.get('url') ?? '').trim()
    if (!/^https:\/\/(drive|docs)\.google\.com\//.test(url)) return { error: 'Pega un enlace de Google Drive (https://drive.google.com/…).' }
    fila.url = url
  } else if (tipo === 'pdf') {
    if (todos) return { error: 'El catálogo "Todos" es el enlace de Drive con todos los catálogos.' }
    const pdf = datos.get('pdf')
    if (!(pdf instanceof File) || pdf.size === 0) return { error: 'Elige el PDF.' }
    if (pdf.type !== 'application/pdf') return { error: 'El archivo tiene que ser PDF.' }
    if (pdf.size > MAX_PDF) return { error: 'El PDF pesa más de 20 MB.' }
    const limpio = pdf.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
    const ruta = `${Date.now()}-${limpio}`
    const { error } = await supabase.storage.from('catalogos').upload(ruta, pdf, { contentType: 'application/pdf' })
    if (error) return { error: /policy|security/i.test(error.message) ? SIN_PERMISO : `No se pudo subir el PDF: ${error.message}` }
    fila.archivo = ruta
  } else {
    return { error: 'Elige si es un PDF o un enlace de Drive.' }
  }

  const { data: creado, error } = await supabase.from('catalogos').insert(fila).select('id').single()
  if (error) {
    if (fila.archivo) await supabase.storage.from('catalogos').remove([fila.archivo])
    return { error: error.code === '23505' ? 'Ya hay un catálogo "Todos" activo: desactívalo primero.' : mensaje(error) }
  }
  revalidatePath('/inventario/catalogos')
  revalidatePath('/bot', 'layout') // el cuadro Catálogos del lienzo lo ofrece enseguida
  return { ok: `Catálogo ${nombre} agregado.`, id: creado.id }
}

export async function activarCatalogo(id: number, activo: boolean): Promise<Resultado> {
  const { data, error } = await crearCliente().from('catalogos').update({ activo }).eq('id', id).select('id')
  if (error) return { error: error.code === '23505' ? 'Ya hay un catálogo "Todos" activo: desactívalo primero.' : mensaje(error) }
  if (!data?.length) return { error: SIN_PERMISO }
  revalidatePath('/inventario/catalogos')
  return {}
}

export async function borrarCatalogo(id: number): Promise<Resultado> {
  const supabase = crearCliente()
  const { data, error } = await supabase.from('catalogos').delete().eq('id', id).select('archivo')
  if (error) return { error: mensaje(error) }
  if (!data?.length) return { error: SIN_PERMISO }
  if (data[0].archivo) await supabase.storage.from('catalogos').remove([data[0].archivo])
  revalidatePath('/inventario/catalogos')
  return {}
}

'use server'

import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { crearCliente } from '@/lib/supabase/server'
import { CAMPOS_TEXTO, ENLACE_DRIVE } from '@/lib/inventario'

export type Resultado = { error?: string; ok?: string; id?: number } // id: el catálogo creado (lo elige el lienzo, F4·12)

// RI-11 (F4·65): solo JPG o PNG. WhatsApp no manda WEBP como imagen (es de stickers) y la ficha no le llegaba al cliente.
const FOTOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' }
const MAX_FOTO = 5 * 1024 * 1024
const MAX_PDF = 20 * 1024 * 1024
const SIN_PERMISO = 'No tienes permiso para cambiar el inventario.'

// El RLS decide (RI-01): si no devuelve la fila, es que no hubo permiso.
function mensaje(error: { message: string; code?: string }) {
  if (error.code === '22023') return error.message // la validación de atributos de la base (0045) ya dice cuál y por qué
  if (error.code === '42501' || /row-level security|permiso/i.test(error.message)) return SIN_PERMISO
  if (error.code === '23505') return 'Ya existe un equipo con ese código.'
  return error.message
}

function numero(valor: FormDataEntryValue | null) {
  const s = String(valor ?? '').trim().replace(/[$\s]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '')
  return s === '' ? NaN : Number(s.replace(',', '.'))
}

function revisarFoto(archivo: File, n: number): string | null {
  if (!FOTOS[archivo.type]) return `La foto ${n} tiene que ser JPG o PNG (WhatsApp no envía WEBP).`
  if (archivo.size > MAX_FOTO) return `La foto ${n} pesa más de 5 MB.`
  return null
}

async function subirFoto(id: number, archivo: File, anterior: string, n = 1): Promise<string | Resultado> {
  const problema = revisarFoto(archivo, n)
  if (problema) return { error: problema }
  const ruta = `${id}/${Date.now()}${n > 1 ? `-${n}` : ''}.${FOTOS[archivo.type]}`
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

  const fila: Record<string, unknown> = { precio, stock }
  for (const c of CAMPOS_TEXTO) fila[c] = String(datos.get(c) ?? '').trim()
  // RI-13: carpeta de Drive con más fotos (opcional).
  const drive = String(datos.get('fotos_drive') ?? '').trim()
  if (drive && !ENLACE_DRIVE.test(drive)) return { error: 'El enlace de fotos tiene que ser de Google Drive (https://drive.google.com/…).' }
  fila.fotos_drive = drive
  // F4·75b: enlace de la tienda web a mano (opcional); vacío = el bot lo busca solo por el código.
  const web = String(datos.get('enlace_web') ?? '').trim()
  if (web && !/^https:\/\/\S+$/.test(web)) return { error: 'El enlace de la tienda web tiene que empezar por https:// y no llevar espacios.' }
  fila.enlace_web = web
  // RI-11: se revisan las tres fotos antes de guardar nada, para no dejar la ficha a medias.
  const archivos = [1, 2, 3].map((n) => { const f = datos.get(n === 1 ? 'foto_archivo' : `foto_archivo_${n}`); return f instanceof File && f.size > 0 ? f : null })
  for (const [i, f] of archivos.entries()) {
    const problema = f && revisarFoto(f, i + 1)
    if (problema) return { error: problema }
  }
  const supabase = crearCliente()

  // Atributos del producto (F4·41, RI-08): solo los que mostró el formulario; los demás (archivados, otra categoría) se conservan.
  const enFormulario = String(datos.get('atributos_formulario') ?? '').split(',').filter(Boolean)
  if (enFormulario.length) {
    const [{ data: defs }, { data: actual }] = await Promise.all([
      supabase.from('producto_atributos').select('clave, nombre, tipo').in('clave', enFormulario),
      id ? supabase.from('productos').select('atributos').eq('id', id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const atributos: Record<string, unknown> = { ...((actual?.atributos ?? {}) as Record<string, unknown>) }
    for (const d of defs ?? []) {
      const texto = String(datos.get(`atr_${d.clave}`) ?? '').trim()
      if (!texto) { delete atributos[d.clave]; continue }
      if (d.tipo === 'numero') {
        const n = numero(texto)
        if (!Number.isFinite(n)) return { error: `«${d.nombre}» tiene que ser un número.` }
        atributos[d.clave] = n
      } else if (d.tipo === 'si_no') atributos[d.clave] = texto === 'si'
      else atributos[d.clave] = texto
    }
    fila.atributos = atributos
  }

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

  const foto = archivos[0]
  if (foto) {
    const subida = await subirFoto(productoId!, foto, fotoAnterior)
    if (typeof subida !== 'string') return subida
    const { error } = await supabase.from('productos').update({ foto_ruta: subida }).eq('id', productoId!)
    if (error) return { error: mensaje(error) }
  } else if (datos.get('quitar_foto') === '1' && fotoAnterior) {
    const { error } = await supabase.from('productos').update({ foto_ruta: '' }).eq('id', productoId!)
    if (error) return { error: mensaje(error) }
    await supabase.storage.from('productos').remove([fotoAnterior])
  }

  // Fotos 2 y 3 (RI-12): cada casilla se sube, cambia o quita por separado; lo actual sale de la base, no del formulario.
  const { data: conExtra } = await supabase.from('productos').select('fotos_extra').eq('id', productoId!).maybeSingle()
  const antes: string[] = conExtra?.fotos_extra ?? []
  const casillas = [antes[0] ?? '', antes[1] ?? '']
  const sobran: string[] = []
  for (const n of [2, 3]) {
    const i = n - 2
    const nueva = archivos[n - 1]
    if (nueva) {
      const subida = await subirFoto(productoId!, nueva, '', n)
      if (typeof subida !== 'string') return subida
      if (casillas[i]) sobran.push(casillas[i])
      casillas[i] = subida
    } else if (datos.get(`quitar_foto_${n}`) === '1' && casillas[i]) {
      sobran.push(casillas[i])
      casillas[i] = ''
    }
  }
  const despues = casillas.filter(Boolean)
  if (despues.join('|') !== antes.join('|')) {
    const { error } = await supabase.from('productos').update({ fotos_extra: despues }).eq('id', productoId!)
    if (error) return { error: mensaje(error) }
    if (sobran.length) await supabase.storage.from('productos').remove(sobran)
  }

  revalidatePath('/inventario')
  if (!id) redirect(`/inventario/${productoId}?creado=1`)
  revalidatePath(`/inventario/${id}`)
  return { ok: 'Cambios guardados.' }
}

// --------------------------------------------------------------------------- //
// Carga del Excel (RI-04): el mismo lector de consola y las reglas de la base
// --------------------------------------------------------------------------- //
export type FilaCarga = Record<string, string | number | Record<string, string>> // atributos: {encabezado: celda} (F4·41)
export type Previa = {
  error?: string
  productos?: FilaCarga[]
  ignoradas?: string[]
  resultado?: {
    aplicado: boolean
    columnas_ignoradas?: string[]
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
  let leida: { productos?: FilaCarga[]; errores?: string[]; error?: string }
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
    return { resultado: { aplicado: false, total: productos.length, nuevos: [], cambian: [], sin_stock: [],
      errores: leida.errores.map((e) => ({ error: e })) } }

  const { data, error } = await crearCliente().rpc('cargar_inventario', { p_productos: productos, p_aplicar: false })
  if (error) return { error: mensaje(error) }
  // Las columnas que no son campos ni atributos las dice la base (F4·41, RI-09).
  return { productos, ignoradas: data?.columnas_ignoradas ?? [], resultado: data }
}

export async function aplicarExcel(productos: FilaCarga[]): Promise<Previa> {
  const { data, error } = await crearCliente().rpc('cargar_inventario', { p_productos: productos, p_aplicar: true })
  if (error) return { error: mensaje(error) }
  revalidatePath('/inventario')
  return { resultado: data }
}

// --------------------------------------------------------------------------- //
// Catálogos (RI-05; modificar y usos: F4·60, RI-11 a RI-16)
// --------------------------------------------------------------------------- //
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// RI-15: si la categoría o la marca ya existen escritas de otra forma (tildes, mayúsculas), se guarda la que ya está.
async function comoExiste(campo: 'categoria' | 'marca', valor: string) {
  if (!valor) return ''
  const supabase = crearCliente()
  const [{ data: p }, { data: c }] = await Promise.all([
    supabase.from('productos').select(campo).neq(campo, '').limit(2000),
    supabase.from('catalogos').select(campo).neq(campo, ''),
  ])
  const todas = [...(p ?? []), ...(c ?? [])].map((f) => String((f as Record<string, unknown>)[campo] ?? ''))
  return todas.find((x) => sinTildes(x) === sinTildes(valor)) ?? valor
}

async function subirPdf(pdf: File): Promise<string | Resultado> {
  if (pdf.type !== 'application/pdf') return { error: 'El archivo tiene que ser PDF.' }
  if (pdf.size > MAX_PDF) return { error: 'El PDF pesa más de 20 MB.' }
  const limpio = pdf.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
  const ruta = `${Date.now()}-${limpio}`
  const { error } = await crearCliente().storage.from('catalogos').upload(ruta, pdf, { contentType: 'application/pdf' })
  if (error) return { error: /policy|security/i.test(error.message) ? SIN_PERMISO : `No se pudo subir el PDF: ${error.message}` }
  return ruta
}

// Lo que comparten Agregar y Modificar: nombre, tipo, categoría, marca y el enlace (el PDF se resuelve aparte).
type DatosCatalogo = { nombre: string; tipo: string; todos: boolean; categoria: string; marca: string; url: string; mensaje: string }
async function leerCatalogo(datos: FormData): Promise<{ error: string } | { fila: DatosCatalogo }> {
  const nombre = String(datos.get('nombre') ?? '').trim()
  const tipo = String(datos.get('tipo') ?? '')
  const todos = datos.get('todos') === '1'
  if (!nombre) return { error: 'Ponle un nombre al catálogo.' }
  if (tipo !== 'drive' && tipo !== 'pdf') return { error: 'Elige si es un PDF o un enlace de Drive.' }
  if (tipo === 'pdf' && todos) return { error: 'El catálogo "Todos" es el enlace de Drive con todos los catálogos.' }
  let url = ''
  if (tipo === 'drive') {
    url = String(datos.get('url') ?? '').trim()
    if (!/^https:\/\/(drive|docs)\.google\.com\//.test(url)) return { error: 'Pega un enlace de Google Drive (https://drive.google.com/…).' }
  }
  const mensajeChat = String(datos.get('mensaje') ?? '').replace(/\r\n/g, '\n').trim()
  if (mensajeChat.length > 1500) return { error: 'El mensaje del chat es muy largo (máximo 1.500 caracteres).' }
  return { fila: {
    nombre, tipo, todos, url, mensaje: mensajeChat,
    categoria: todos ? '' : await comoExiste('categoria', String(datos.get('categoria') ?? '').trim()),
    marca: todos ? '' : await comoExiste('marca', String(datos.get('marca') ?? '').trim()),
  } }
}

function catalogosCambiaron() {
  revalidatePath('/inventario/catalogos')
  revalidatePath('/bot', 'layout') // el cuadro Catálogos del lienzo y las Acciones lo ven enseguida
  revalidatePath('/agente', 'layout')
}

export async function crearCatalogo(_: Resultado, datos: FormData): Promise<Resultado> {
  const r = await leerCatalogo(datos)
  if ('error' in r) return r
  const fila = { ...r.fila, archivo: '' }
  const supabase = crearCliente()

  if (fila.tipo === 'pdf') {
    const pdf = datos.get('pdf')
    if (!(pdf instanceof File) || pdf.size === 0) return { error: 'Elige el PDF.' }
    const subida = await subirPdf(pdf)
    if (typeof subida !== 'string') return subida
    fila.archivo = subida
  }

  const { data: creado, error } = await supabase.from('catalogos').insert(fila).select('id').single()
  if (error) {
    if (fila.archivo) await supabase.storage.from('catalogos').remove([fila.archivo])
    return { error: error.code === '23505' ? 'Ya hay un catálogo "Todos" activo: desactívalo primero.' : mensaje(error) }
  }
  catalogosCambiaron()
  return { ok: `Catálogo ${fila.nombre} agregado.`, id: creado.id }
}

// RI-12 y RI-13: modificar conserva el número del catálogo (el bot y las Acciones siguen enviándolo). Si cambia el archivo o el
// enlace, se borra el PDF anterior y se olvida la copia que Meta tenía guardada, para que el cliente reciba el nuevo.
export async function modificarCatalogo(_: Resultado, datos: FormData): Promise<Resultado> {
  const id = Number(datos.get('id'))
  if (!id) return { error: 'Falta el catálogo.' }
  const r = await leerCatalogo(datos)
  if ('error' in r) return r
  const leido = r.fila
  const supabase = crearCliente()
  const { data: actual } = await supabase.from('catalogos').select('tipo, archivo, url').eq('id', id).maybeSingle()
  if (!actual) return { error: 'Ese catálogo ya no existe.' }

  let archivo = ''
  let subido = ''
  if (leido.tipo === 'pdf') {
    const pdf = datos.get('pdf')
    if (pdf instanceof File && pdf.size > 0) {
      const subida = await subirPdf(pdf)
      if (typeof subida !== 'string') return subida
      archivo = subido = subida
    } else if (actual.tipo === 'pdf' && actual.archivo) {
      archivo = actual.archivo // se queda el mismo PDF
    } else {
      return { error: 'Elige el PDF.' }
    }
  }

  const cambiaContenido = archivo !== actual.archivo || leido.url !== actual.url
  const fila = { ...leido, archivo, ...(cambiaContenido ? { meta_media_id: '', meta_media_en: null } : {}) }
  const { data, error } = await supabase.from('catalogos').update(fila).eq('id', id).select('id')
  if (error || !data?.length) {
    if (subido) await supabase.storage.from('catalogos').remove([subido])
    if (error) return { error: error.code === '23505' ? 'Ya hay un catálogo "Todos" activo: desactívalo primero.' : mensaje(error) }
    return { error: SIN_PERMISO }
  }
  if (actual.archivo && actual.archivo !== archivo) await supabase.storage.from('catalogos').remove([actual.archivo])
  catalogosCambiaron()
  return { ok: `Catálogo ${leido.nombre} actualizado.`, id }
}

// RI-14: qué cuadros del bot (publicado o borrador) y qué Acciones lo envían por su número (migración 0063).
export async function usosCatalogo(id: number): Promise<{ usos: string[]; error?: string }> {
  const { data, error } = await crearCliente().rpc('catalogo_usos', { p_catalogo: id })
  if (error) return { usos: [], error: mensaje(error) }
  return { usos: ((data ?? []) as { donde: string }[]).map((u) => u.donde) }
}

export async function activarCatalogo(id: number, activo: boolean): Promise<Resultado> {
  const { data, error } = await crearCliente().from('catalogos').update({ activo }).eq('id', id).select('id')
  if (error) return { error: error.code === '23505' ? 'Ya hay un catálogo "Todos" activo: desactívalo primero.' : mensaje(error) }
  if (!data?.length) return { error: SIN_PERMISO }
  catalogosCambiaron()
  return {}
}

export async function borrarCatalogo(id: number): Promise<Resultado> {
  const supabase = crearCliente()
  const { data, error } = await supabase.from('catalogos').delete().eq('id', id).select('archivo')
  if (error) return { error: mensaje(error) }
  if (!data?.length) return { error: SIN_PERMISO }
  if (data[0].archivo) await supabase.storage.from('catalogos').remove([data[0].archivo])
  catalogosCambiaron()
  return {}
}

// F4·75 · Tienda web: dirección, catálogo y textos del renglón que el bot pone al final de la ficha.
export async function guardarTiendaWeb(_: Resultado, datos: FormData): Promise<Resultado> {
  const texto = (k: string) => String(datos.get(k) ?? '').trim()
  const url = texto('url').replace(/\/+$/, '')
  const catalogo = texto('catalogo_url')
  const tEquipo = texto('texto_equipo')
  const tCatalogo = texto('texto_catalogo')
  if (!/^https:\/\/[a-z0-9.-]+[a-z]$/i.test(url)) return { error: 'La dirección de la tienda debe ser como https://ventasvirtualcolombia.com (sin ruta al final).' }
  if (catalogo && !/^https:\/\/\S+$/.test(catalogo)) return { error: 'El enlace del catálogo debe empezar por https://.' }
  if (!tEquipo.includes('{enlace}') || !tCatalogo.includes('{enlace}')) return { error: 'Los dos textos deben llevar {enlace}, que es donde va el enlace.' }
  if (tEquipo.length > 200 || tCatalogo.length > 200) return { error: 'Cada texto admite hasta 200 caracteres.' }
  const supabase = crearCliente()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('tienda_web').update({
    activa: datos.get('activa') === 'on', url: url.toLowerCase(), catalogo_url: catalogo, texto_equipo: tEquipo, texto_catalogo: tCatalogo,
    actualizado_en: new Date().toISOString(), actualizado_por: user?.id ?? null,
  }).eq('id', 1).select('id')
  if (error) return { error: `No se pudo guardar: ${error.message}` }
  if (!data?.length) return { error: SIN_PERMISO }
  revalidatePath('/inventario', 'layout')
  return { ok: 'Guardado. El bot lo usa en menos de un minuto.' }
}

// Tipos y ayudas del inventario (F3·9, decisión 0025).

export type Producto = {
  id: number
  codigo: string
  categoria: string
  descripcion: string
  marca: string
  modelo: string
  procesador: string
  generacion: string
  ram: string
  almacenamiento: string
  estado: string
  precio: number
  stock: number
  foto: string
  foto_ruta: string
  fotos_extra: string[] // Fotos 2 y 3 (F4·65, RI-11)
  fotos_drive: string // carpeta de Drive con más fotos (RI-13)
  video: string
  atributos: Record<string, ValorAtributo>
  actualizado_en: string
}

// Atributos del producto (F4·41, RI-07 a RI-10): definiciones en producto_atributos, valores en productos.atributos.
export type TipoAtributoProducto = 'texto' | 'numero' | 'si_no' | 'lista'
export type ValorAtributo = string | number | boolean | null
export type AtributoProducto = {
  id: number
  clave: string
  nombre: string
  tipo: TipoAtributoProducto
  emoji: string
  orden: number
  opciones: string[]
  categorias: string[]
  archivado_en: string | null
}
export const COLUMNAS_ATRIBUTO = 'id, clave, nombre, tipo, emoji, orden, opciones, categorias, archivado_en'
export const TIPOS_ATRIBUTO: { id: TipoAtributoProducto; nombre: string; ejemplo: string }[] = [
  { id: 'texto', nombre: 'Texto', ejemplo: 'Tarjeta gráfica: RTX 3080' },
  { id: 'numero', nombre: 'Número', ejemplo: 'Frecuencia de la pantalla: 144' },
  { id: 'si_no', nombre: 'Sí / No', ejemplo: '¿Tiene lector de huella?' },
  { id: 'lista', nombre: 'Lista (una opción)', ejemplo: 'Panel: IPS, OLED, TN' },
]

// Cómo se muestra un valor (igual que agente.texto_atributo): sí/no en palabras y números sin decimales de sobra.
export function textoAtributo(v: ValorAtributo | undefined): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'number') return v.toLocaleString('es-CO', { maximumFractionDigits: 2 })
  return String(v).trim()
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

// Un atributo sin categorías aplica a todas; si tiene, solo a esas (sin tildes ni mayúsculas).
export const aplicaA = (a: Pick<AtributoProducto, 'categorias'>, categoria: string) =>
  !a.categorias.length || a.categorias.some((c) => sinTildes(c) === sinTildes(categoria))

export const COLUMNAS_PRODUCTO =
  'id, codigo, categoria, descripcion, marca, modelo, procesador, generacion, ram, almacenamiento, estado, precio, stock, foto, foto_ruta, fotos_extra, fotos_drive, video, atributos, actualizado_en'

export const CAMPOS_TEXTO = ['categoria', 'descripcion', 'marca', 'modelo', 'procesador', 'generacion', 'ram',
  'almacenamiento', 'estado', 'video'] as const

export const pesos = (n: number) =>
  Number(n).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

export const rutaArchivo = (bucket: 'productos' | 'catalogos', ruta: string) =>
  `/archivos/${bucket}/${ruta.split('/').map(encodeURIComponent).join('/')}`

// RI-13: la carpeta de Drive con más fotos (la base exige lo mismo, migración 0070).
export const ENLACE_DRIVE = /^https:\/\/(drive|docs)\.google\.com\/\S+$/i

// La foto subida manda (RI-03); si no hay, el enlace (los de Drive pasan a miniatura, como hace el bot).
export function fotoDe(p: Pick<Producto, 'foto' | 'foto_ruta'>) {
  if (p.foto_ruta) return rutaArchivo('productos', p.foto_ruta)
  const url = (p.foto || '').split(',')[0].trim()
  const drive = url.match(/\/d\/([\w-]+)|[?&]id=([\w-]+)/)
  if (drive && /drive\.google\.com|docs\.google\.com/.test(url))
    return `https://drive.google.com/thumbnail?id=${drive[1] || drive[2]}&sz=w800`
  return url || null
}

export const titulo = (p: Pick<Producto, 'marca' | 'modelo' | 'descripcion' | 'codigo'>) =>
  [p.marca, p.modelo].filter(Boolean).join(' ') || p.descripcion || p.codigo

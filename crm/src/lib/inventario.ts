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
  video: string
  actualizado_en: string
}

export const COLUMNAS_PRODUCTO =
  'id, codigo, categoria, descripcion, marca, modelo, procesador, generacion, ram, almacenamiento, estado, precio, stock, foto, foto_ruta, video, actualizado_en'

export const CAMPOS_TEXTO = ['categoria', 'descripcion', 'marca', 'modelo', 'procesador', 'generacion', 'ram',
  'almacenamiento', 'estado', 'video'] as const

export const pesos = (n: number) =>
  Number(n).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

export const rutaArchivo = (bucket: 'productos' | 'catalogos', ruta: string) =>
  `/archivos/${bucket}/${ruta.split('/').map(encodeURIComponent).join('/')}`

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

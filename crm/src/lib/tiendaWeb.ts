// F4·75 · Tienda web (ventasvirtualcolombia.com) en la ficha del equipo. Igual que el bot (flujo.renglon_web):
// la lista de publicados sale de los enlaces /producto/{código} de {url}/productos, guardada 5 minutos.

export type TiendaWeb = {
  activa: boolean
  url: string
  catalogo_url: string
  texto_equipo: string
  texto_catalogo: string
  actualizado_en?: string
}
export const COLUMNAS_TIENDA = 'activa, url, catalogo_url, texto_equipo, texto_catalogo, actualizado_en'

// null si la tienda no respondió (la ficha no muestra un enlace que puede estar roto).
export async function publicadosTienda(url: string): Promise<Set<string> | null> {
  try {
    const r = await fetch(`${url}/productos`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(4000) })
    if (!r.ok) return null
    const html = await r.text()
    return new Set([...html.matchAll(/href="\/producto\/([^"?#/]+)/g)].map((m) => decodeURIComponent(m[1]).trim().toLowerCase()))
  } catch {
    return null
  }
}

export const enlaceProducto = (t: TiendaWeb, codigo: string) => `${t.url}/producto/${encodeURIComponent(codigo.trim())}`

// El renglón que agrega el bot: la página del equipo si está publicado; si no, el catálogo web (ficha suelta).
export function renglonWeb(t: TiendaWeb | null, publicados: Set<string> | null, codigo: string): string {
  if (!t?.activa) return ''
  if (publicados?.has(codigo.trim().toLowerCase())) return t.texto_equipo.replace('{enlace}', enlaceProducto(t, codigo))
  return t.catalogo_url ? t.texto_catalogo.replace('{enlace}', t.catalogo_url) : ''
}

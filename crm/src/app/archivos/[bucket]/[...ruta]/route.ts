import { crearCliente } from '@/lib/supabase/server'

const BUCKETS = new Set(['productos', 'catalogos'])

// Foto de un equipo o catálogo PDF. Se baja con la sesión de quien pide: el RLS de storage deja leer a
// cualquier usuario activo (RI-01, migración 0009).
export async function GET(_: Request, { params }: { params: { bucket: string; ruta: string[] } }) {
  if (!BUCKETS.has(params.bucket)) return new Response('No encontrado', { status: 404 })
  const ruta = params.ruta.map(decodeURIComponent).join('/')
  const { data, error } = await crearCliente().storage.from(params.bucket).download(ruta)
  if (error || !data) return new Response('No encontrado', { status: 404 })
  const nombre = ruta.split('/').pop() ?? 'archivo'
  return new Response(data, {
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}

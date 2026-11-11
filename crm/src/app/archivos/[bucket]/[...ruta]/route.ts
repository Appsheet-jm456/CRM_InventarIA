import { crearCliente } from '@/lib/supabase/server'

const BUCKETS = new Set(['productos', 'catalogos', 'conocimiento', 'cotizaciones'])

// Foto de un equipo, catálogo PDF o imagen/PDF del conocimiento del agente (F4·23) o PDF de una cotización (F4·26). Se baja con la sesión de quien pide: el RLS de storage deja leer a
// cualquier usuario activo (RI-01, migración 0009).
export async function GET(_: Request, { params }: { params: { bucket: string; ruta: string[] } }) {
  if (!BUCKETS.has(params.bucket)) return new Response('No encontrado', { status: 404 })
  const ruta = params.ruta.map(decodeURIComponent).join('/')
  const { data, error } = await crearCliente().storage.from(params.bucket).download(ruta)
  if (error || !data) return new Response('No encontrado', { status: 404 })
  const nombre = ruta.split('/').pop() ?? 'archivo'
  // Solo se muestra en la página lo que el navegador no ejecuta; lo demás (html, svg, xml…) se descarga.
  const mime = (data.type || 'application/octet-stream').split(';')[0].trim().toLowerCase()
  const seMuestra = /^image\/(?!svg)/.test(mime) || mime === 'application/pdf'
  return new Response(data, {
    headers: {
      'Content-Type': seMuestra ? mime : 'application/octet-stream',
      'Content-Disposition': `${seMuestra ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      // El visor de PDF de Chrome no abre con sandbox; un PDF no ejecuta scripts de la página.
      ...(mime === 'application/pdf' ? {} : { 'Content-Security-Policy': 'sandbox' }),
    },
  })
}

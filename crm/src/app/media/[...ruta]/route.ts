import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearCliente } from '@/lib/supabase/server'

// Audio, imagen o documento de un cliente. Solo lo baja quien puede ver esa conversación: el RLS de
// mensajes lo decide; después se lee del bucket privado con la llave del servidor.
export async function GET(_: Request, { params }: { params: { ruta: string[] } }) {
  const ruta = params.ruta.map(decodeURIComponent).join('/')
  const { data } = await crearCliente().from('mensajes').select('media_mime, media_nombre').eq('media_ruta', ruta).limit(1)
  const mensaje = data?.[0]
  if (!mensaje) return new Response('No encontrado', { status: 404 })

  const { data: archivo, error } = await crearClienteAdmin().storage.from('media').download(ruta)
  if (error || !archivo) return new Response('No encontrado', { status: 404 })
  const nombre = mensaje.media_nombre || ruta.split('/').pop()
  return new Response(archivo, {
    headers: {
      'Content-Type': mensaje.media_mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombre ?? 'archivo')}`,
      'Cache-Control': 'private, no-store',
    },
  })
}

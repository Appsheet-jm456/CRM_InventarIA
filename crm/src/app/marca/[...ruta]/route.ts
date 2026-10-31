import { crearClienteAdmin } from '@/lib/supabase/admin'

// El logo de Apariencia (RA-15). Lo ve también el login, sin sesión: se lee con la llave de servicio y solo
// rutas con la forma que guarda la base (logo/<marca de tiempo>.<png|jpg|webp>). Cada subida es una ruta nueva,
// así que se puede guardar en caché mucho tiempo.
const RUTA = /^logo\/[0-9]+\.(png|jpg|webp)$/

export async function GET(_: Request, { params }: { params: { ruta: string[] } }) {
  const ruta = params.ruta.map(decodeURIComponent).join('/')
  if (!RUTA.test(ruta)) return new Response('No encontrado', { status: 404 })
  const { data, error } = await crearClienteAdmin().storage.from('marca').download(ruta)
  if (error || !data) return new Response('No encontrado', { status: 404 })
  return new Response(data, {
    headers: {
      'Content-Type': data.type || 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

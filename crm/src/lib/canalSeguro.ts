import 'server-only'
import { headers } from 'next/headers'

// Las pantallas que reciben secretos solo guardan por un canal cifrado (RC en docs/CONFIGURACION-META.md):
// HTTPS, o Tailscale (WireGuard cifra el tramo), o el propio servidor. Por la red local en http se bloquea.
export function canalSeguro(): { seguro: boolean; motivo: string } {
  const h = headers()
  const proto = (h.get('x-forwarded-proto') ?? '').split(',')[0].trim()
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(':')[0].toLowerCase()
  if (proto === 'https') return { seguro: true, motivo: '' }
  if (host === 'localhost' || host === '127.0.0.1') return { seguro: true, motivo: '' }
  if (host.endsWith('.ts.net')) return { seguro: true, motivo: '' }
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(host)) return { seguro: true, motivo: '' }
  return {
    seguro: false,
    motivo: `Estás entrando por http://${host}, que no va cifrado. Entra por la dirección de Tailscale (100.x.x.x) o por HTTPS para guardar secretos.`,
  }
}

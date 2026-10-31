import type { Metadata } from 'next'
import { Atkinson_Hyperlegible, Figtree, IBM_Plex_Mono, Nunito_Sans } from 'next/font/google'
import { leerApariencia, leerModoOscuro } from '@/lib/apariencia'
import { cssApariencia, modoDe, urlLogo } from '@/lib/marca'
import './globals.css'

// Las fuentes se descargan al compilar y las sirve la propia app: el servidor del negocio no depende de
// Google Fonts para verse bien. La que se usa la elige el administrador en Apariencia (F4·19).
const figtree = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--fuente-figtree', display: 'swap' })
const nunito = Nunito_Sans({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--fuente-nunito', display: 'swap' })
const atkinson = Atkinson_Hyperlegible({ subsets: ['latin'], weight: ['400', '700'], variable: '--fuente-atkinson', display: 'swap' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--fuente-mono', display: 'swap' })

// El ícono de la pestaña es el logo de Apariencia, si hay uno (RA-12).
export async function generateMetadata(): Promise<Metadata> {
  const logo = urlLogo((await leerApariencia()).logo)
  return {
    title: 'CRM InventarIA',
    description: 'CRM de WhatsApp de Ventas Virtuales Colombia',
    ...(logo ? { icons: { icon: logo } } : {}),
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Los colores y la fuente del administrador pisan los de globals.css; el modo es el del usuario.
  const [apariencia, oscuro] = await Promise.all([leerApariencia(), leerModoOscuro()])
  const css = cssApariencia(apariencia)
  const modo = modoDe(oscuro)
  return (
    <html
      lang="es"
      data-modo={modo ?? undefined}
      className={`${figtree.variable} ${nunito.variable} ${atkinson.variable} ${plexMono.variable}`}
    >
      <body>
        {css && <style id="apariencia" dangerouslySetInnerHTML={{ __html: css }} />}
        {children}
      </body>
    </html>
  )
}

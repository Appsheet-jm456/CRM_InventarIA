import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CRM InventarIA',
  description: 'CRM de WhatsApp de Ventas Virtuales Colombia',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* Sin internet caen a las fuentes del sistema: el servidor del negocio es local. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}

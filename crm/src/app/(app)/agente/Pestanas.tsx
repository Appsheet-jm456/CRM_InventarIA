'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Pestañas del módulo Agente (docs/AGENTE.md). Cerebro (F4·27) y Avi, Probar y Registro (F4·28).
const PESTANAS = [
  { ruta: '/agente/cerebro', texto: 'Cerebro' },
  { ruta: '/agente/personalidad', texto: 'Avi' },
  { ruta: '/agente/conocimiento', texto: 'Conocimiento' },
  { ruta: '/agente/acciones', texto: 'Acciones' },
  { ruta: '/agente/compra', texto: 'Compra' },
  { ruta: '/agente/cotizacion', texto: 'Cotización' },
  { ruta: '/agente/probar', texto: 'Probar' },
  { ruta: '/agente/registro', texto: 'Registro' },
]

export function Pestanas() {
  const ruta = usePathname()
  return (
    <nav className="pastillas" aria-label="Secciones del agente">
      {PESTANAS.map((p) => (
        <Link key={p.ruta} href={p.ruta} className={`pastilla${ruta.startsWith(p.ruta) ? ' activa' : ''}`}
          aria-current={ruta.startsWith(p.ruta) ? 'page' : undefined}>
          {p.texto}
        </Link>
      ))}
    </nav>
  )
}

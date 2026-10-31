'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Pestañas del módulo Agente (docs/AGENTE.md). Se suman a medida que se construyen: Acciones (F4·24), Compra y cotización
// (F4·25, F4·26), Cerebro (F4·27), Personalidad, Probar y Registro (F4·28).
const PESTANAS = [{ ruta: '/agente/conocimiento', texto: 'Conocimiento' }]

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

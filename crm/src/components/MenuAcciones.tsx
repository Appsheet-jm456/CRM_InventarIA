'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

// Un enlace (href) o una acción de la página (onClick, para lo que no es navegar: renombrar, archivar…).
export type Accion = { texto: string; href?: string; onClick?: () => void; nuevaPestana?: boolean; peligro?: boolean }

// Botón de una fila que despliega sus acciones (imprimir, editar…). Se cierra al elegir, al
// hacer clic fuera, con Escape o al desplazar. La lista va fija en pantalla, medida desde el
// botón: dentro de .tablewrap (que desplaza) la de la última fila quedaría recortada.
export function MenuAcciones({ acciones, etiqueta }: { acciones: Accion[]; etiqueta: string }) {
  const [lugar, setLugar] = useState<{ top: number; right: number } | null>(null)
  const abierto = lugar !== null
  const setAbierto = (si: boolean) => {
    const r = caja.current?.getBoundingClientRect()
    setLugar(si && r ? { top: r.bottom + 4, right: window.innerWidth - r.right } : null)
  }
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false)
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    const cerrar = () => setLugar(null)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    window.addEventListener('scroll', cerrar, true)
    window.addEventListener('resize', cerrar)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', cerrar, true)
      window.removeEventListener('resize', cerrar)
    }
  }, [abierto])

  return (
    <div className="menu-acciones" ref={caja}>
      <button type="button" className="btn chico" aria-haspopup="menu" aria-expanded={abierto} aria-label={etiqueta}
        onClick={() => setAbierto(!abierto)}>
        Acciones ▾
      </button>
      {abierto && (
        <div className="menu-acciones-lista" role="menu" style={{ top: lugar.top, right: lugar.right }}>
          {acciones.map((a) => a.href ? (
            <Link key={a.texto} role="menuitem" href={a.href} target={a.nuevaPestana ? '_blank' : undefined} onClick={() => setAbierto(false)}>
              {a.texto}
            </Link>
          ) : (
            <button key={a.texto} type="button" role="menuitem" className={a.peligro ? 'peligro' : undefined}
              onClick={() => { setAbierto(false); a.onClick?.() }}>
              {a.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

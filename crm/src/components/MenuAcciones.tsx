'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

// Un enlace (href) o una acción de la página (onClick, para lo que no es navegar: renombrar, archivar…).
export type Accion = { texto: string; href?: string; onClick?: () => void; nuevaPestana?: boolean; peligro?: boolean; deshabilitada?: boolean; detalle?: string }

// Botón de una fila que despliega sus acciones (imprimir, editar…). Se cierra al elegir, al
// hacer clic fuera, con Escape o al desplazar. La lista va fija en pantalla, medida desde el
// botón: dentro de .tablewrap (que desplaza) la de la última fila quedaría recortada.
export function MenuAcciones({ acciones, etiqueta, boton = 'Acciones ▾', clase = 'btn chico', desactivado = false }: {
  acciones: Accion[]; etiqueta: string; boton?: string; clase?: string; desactivado?: boolean
}) {
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
      <button type="button" className={clase} aria-haspopup="menu" aria-expanded={abierto} aria-label={etiqueta} disabled={desactivado}
        onClick={() => setAbierto(!abierto)}>
        {boton}
      </button>
      {abierto && (
        <div className="menu-acciones-lista" role="menu" style={{ top: lugar.top, right: lugar.right }}>
          {acciones.map((a) => a.href ? (
            <Link key={a.texto} role="menuitem" href={a.href} target={a.nuevaPestana ? '_blank' : undefined} onClick={() => setAbierto(false)}>
              {a.texto}
            </Link>
          ) : (
            <button key={a.texto} type="button" role="menuitem" className={a.peligro ? 'peligro' : undefined} disabled={a.deshabilitada}
              onClick={() => { setAbierto(false); a.onClick?.() }}>
              {a.texto}{a.detalle && <small>{a.detalle}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

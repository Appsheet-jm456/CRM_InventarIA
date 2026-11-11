'use client'

import { useEffect, useRef, useState } from 'react'
import type { TipoArchivo } from './Adjuntos'

// F4·70: botón «+» del chat, como en WhatsApp. Un clic abre hacia arriba las opciones de adjuntar (Documento, Fotos y videos, Audio)
// y las herramientas del asesor (Catálogos, Ficha del equipo, Acciones, Flujos, Respuestas rápidas). Lo usan la Bandeja y la Ficha → Chat.
type Grupo = 'catalogo' | 'equipo' | 'accion' | 'flujo' | 'rapida'

const ICONOS: Record<string, JSX.Element> = {
  documento: <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V9h5.5M8 13h8M8 17h6" />,
  fotos: <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 11 5-5 4 4 3-3 6 6M15.5 9.5h.01" />,
  audio: <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3" />,
  catalogo: <path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4Zm16 0h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6Z" />,
  carrito: <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2M9 20h.01M17 20h.01" />,
  equipo: <path d="M5 5h14a1 1 0 0 1 1 1v9H4V6a1 1 0 0 1 1-1Zm-3 10h20l-1.5 3a1 1 0 0 1-.9.5H4.4a1 1 0 0 1-.9-.5Z" />,
  accion: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
  flujo: <path d="M4 6h9a3 3 0 0 1 0 6h-2a3 3 0 0 0 0 6h9m-3-3 3 3-3 3" />,
  rapida: <path d="M4 5h16v10H9l-5 4Z" />,
}

const OPCIONES: { clave: string; texto: string; color: string; archivo?: TipoArchivo; grupo?: Grupo; carrito?: true; ayuda: string }[] = [
  { clave: 'documento', texto: 'Documento', color: '#7F66FF', archivo: 'documento', ayuda: 'PDF, Word, Excel o PowerPoint · hasta 20 MB' },
  { clave: 'fotos', texto: 'Fotos y videos', color: '#007BFC', archivo: 'fotos', ayuda: 'Imagen JPG o PNG 5 MB · video MP4 16 MB' },
  { clave: 'audio', texto: 'Audio', color: '#FA6533', archivo: 'audio', ayuda: 'Hasta 16 MB' },
  { clave: 'carrito', texto: 'Carrito del cliente', color: '#F05A28', carrito: true, ayuda: 'Armar el pedido (inventario, productos libres y precios) y enviarlo' },
  { clave: 'catalogo', texto: 'Catálogos', color: '#02A698', grupo: 'catalogo', ayuda: 'Los de Inventario → Catálogos' },
  { clave: 'equipo', texto: 'Ficha del equipo', color: '#1E88E5', grupo: 'equipo', ayuda: 'Ficha técnica con código, especificaciones y fotos de un equipo con stock' },
  { clave: 'accion', texto: 'Acciones', color: '#E5A00D', grupo: 'accion', ayuda: 'Ubicación, Cuentas para pagar, Garantía…' },
  { clave: 'flujo', texto: 'Flujos', color: '#D3396D', grupo: 'flujo', ayuda: 'Compra, cotización o un bot' },
  { clave: 'rapida', texto: 'Respuestas rápidas', color: '#FFB21A', grupo: 'rapida', ayuda: 'También escribiendo / en la caja' },
]

export function MenuMas({ activo, abrirArchivo, abrirGrupo, abrirCarrito, alAbrir }: {
  activo: boolean
  abrirArchivo: (tipo: TipoArchivo) => void
  abrirGrupo: (grupo: Grupo) => void
  abrirCarrito?: () => void // F4·72: la pestaña 🛒 Carrito de la Ficha
  alAbrir?: () => void // cierra los otros paneles (emojis, lista de herramientas) al abrir el menú
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  // Se cierra con un clic fuera o con Escape, como el de WhatsApp.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  if (!activo) return null

  function elegir(o: (typeof OPCIONES)[number]) {
    setAbierto(false)
    if (o.carrito) abrirCarrito?.()
    else if (o.archivo) abrirArchivo(o.archivo)
    else if (o.grupo) abrirGrupo(o.grupo)
  }

  return (
    <div className="mas" ref={caja}>
      <button type="button" className={`btn b-icono mas-boton${abierto ? ' on' : ''}`} aria-label="Adjuntar y herramientas" aria-haspopup="menu" aria-expanded={abierto}
        title="Adjuntar, catálogos, acciones y respuestas rápidas" onClick={() => { if (!abierto) alAbrir?.(); setAbierto(!abierto) }}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      {abierto && (
        <div className="mas-menu" role="menu">
          {OPCIONES.filter((o) => !o.carrito || abrirCarrito).map((o, i) => (
            <span key={o.clave} style={{ display: 'contents' }}>
              {i === 3 && <hr />}
              <button type="button" role="menuitem" title={o.ayuda} onClick={() => elegir(o)} autoFocus={i === 0}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={o.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {ICONOS[o.clave]}
                </svg>
                {o.texto}
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

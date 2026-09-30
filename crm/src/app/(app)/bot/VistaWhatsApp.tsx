'use client'

import { Fragment, type ReactNode } from 'react'
import { numerada, type Opcion } from '@/lib/bot'

// *negrita*, _cursiva_, ~tachado~ y ```monoespaciado```, como los muestra WhatsApp (sin HTML crudo).
const MARCAS: [RegExp, (hijos: ReactNode, k: number) => ReactNode][] = [
  [/```([^`]+)```/, (h, k) => <code key={k}>{h}</code>],
  [/\*([^*\n]+)\*/, (h, k) => <b key={k}>{h}</b>],
  [/(?<![\w])_([^_\n]+)_(?![\w])/, (h, k) => <i key={k}>{h}</i>],
  [/~([^~\n]+)~/, (h, k) => <s key={k}>{h}</s>],
]

export function formatoWhatsApp(texto: string, clave = 0): ReactNode[] {
  let primero: { i: number; m: RegExpExecArray; f: (h: ReactNode, k: number) => ReactNode } | null = null
  for (const [re, f] of MARCAS) {
    const m = re.exec(texto)
    if (m && (!primero || m.index < primero.i)) primero = { i: m.index, m, f }
  }
  if (!primero) return [<Fragment key={clave}>{texto}</Fragment>]
  const { i, m, f } = primero
  return [
    <Fragment key={`${clave}a`}>{texto.slice(0, i)}</Fragment>,
    f(formatoWhatsApp(m[1], clave * 10 + 1), clave * 10 + 2),
    ...formatoWhatsApp(texto.slice(i + m[0].length), clave * 10 + 3),
  ]
}

// Lo que recibe el cliente: el cuerpo (con las opciones numeradas si es menú) y los botones o la lista.
export function VistaWhatsApp({ cuerpo, forma, opciones, botonLista = 'Ver opciones', numerar = true, imagen, alElegir }: {
  cuerpo: string
  forma: 'botones' | 'lista' | 'texto'
  opciones: Opcion[]
  botonLista?: string
  numerar?: boolean // la ficha del equipo va sin las opciones numeradas en el texto
  imagen?: string // cabecera (la foto de la ficha)
  alElegir?: (o: Opcion) => void // simulador: tocar un botón o una fila responde como el cliente
}) {
  const texto = forma === 'texto' || !opciones.length || !numerar ? cuerpo : `${cuerpo}\n\n${opciones.map(numerada).join('\n')}`
  return (
    <div className="wa">
      <div className="wa-burbuja">
        {imagen && <div className="wa-imagen">{imagen}</div>}
        <div className="wa-texto">{formatoWhatsApp(texto)}</div>
        <time>10:24</time>
        {forma === 'botones' && opciones.map((o) => alElegir
          ? <button key={o.id} type="button" className="wa-boton" onClick={() => alElegir(o)}>{o.titulo}</button>
          : <div key={o.id} className="wa-boton">{o.titulo}</div>)}
        {forma === 'lista' && <div className="wa-boton">☰ {botonLista}</div>}
      </div>
      {forma === 'lista' && (
        <div className="wa-lista" aria-label="Lista que se abre al tocar el botón">
          <div className="wa-lista-h">{botonLista}</div>
          {opciones.map((o) => {
            const contenido = (<><span><b>{o.titulo}</b>{o.descripcion && <small>{o.descripcion}</small>}</span><span className="wa-radio" aria-hidden /></>)
            return alElegir
              ? <button key={o.id} type="button" className="wa-fila" onClick={() => alElegir(o)}>{contenido}</button>
              : <div key={o.id} className="wa-fila">{contenido}</div>
          })}
        </div>
      )}
    </div>
  )
}

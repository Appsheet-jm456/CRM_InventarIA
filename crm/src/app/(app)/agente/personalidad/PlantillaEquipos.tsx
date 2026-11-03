'use client'

import { VistaWhatsApp } from '../../bot/VistaWhatsApp'

// Los datos de un equipo que puede usar la plantilla (agente.datos_equipo, F4·37, RAG-40), con el emoji que se sugiere al agregarlo.
export const DATOS_EQUIPO: { clave: string; nombre: string; emoji: string }[] = [
  { clave: 'equipo', nombre: 'Equipo (marca y modelo)', emoji: '💻' },
  { clave: 'codigo', nombre: 'Código', emoji: '🔖' },
  { clave: 'marca', nombre: 'Marca', emoji: '🏷' },
  { clave: 'modelo', nombre: 'Modelo', emoji: '🏷' },
  { clave: 'procesador', nombre: 'Procesador', emoji: '⚙️' },
  { clave: 'generacion', nombre: 'Generación', emoji: '🧬' },
  { clave: 'ram', nombre: 'Memoria RAM', emoji: '🧠' },
  { clave: 'disco', nombre: 'Disco', emoji: '💾' },
  { clave: 'estado', nombre: 'Estado o grado', emoji: '⭐' },
  { clave: 'precio', nombre: 'Precio', emoji: '💰' },
  { clave: 'stock', nombre: 'Unidades disponibles', emoji: '📦' },
  { clave: 'categoria', nombre: 'Categoría', emoji: '📂' },
  { clave: 'descripcion', nombre: 'Descripción', emoji: '📝' },
]
export type EquipoEjemplo = Record<string, string>

// Igual que agente.armar_equipo: cada renglón con sus datos; un renglón cuyos datos están todos vacíos no sale.
export function armarEquipo(plantilla: string, datos: EquipoEjemplo) {
  return plantilla.split('\n').flatMap((linea) => {
    const marcas = [...linea.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
    if (marcas.length && marcas.filter((m) => m in datos).every((m) => !datos[m])) return []
    const r = linea.replace(/\{(\w+)\}/g, (t, m: string) => (m in datos ? datos[m] : t)).trimEnd()
    return r.trim() ? [r] : []
  }).join('\n')
}

// Editor de la plantilla por atributos (renglones): modificar, agregar, quitar y ordenar (F4·37, RAG-40 y RAG-41).
export function PlantillaEquipos({ plantilla, maxEquipos, separados, ejemplo, ocupado, cambiar }: {
  plantilla: string
  maxEquipos: number
  separados: boolean
  ejemplo: EquipoEjemplo | null
  ocupado: boolean
  cambiar: (c: { plantilla_equipo?: string; max_equipos?: number; equipos_separados?: boolean }) => void
}) {
  const lineas = plantilla.split('\n')
  const poner = (nuevas: string[]) => cambiar({ plantilla_equipo: nuevas.join('\n') })
  const mover = (i: number, d: number) => {
    const n = [...lineas]
    ;[n[i], n[i + d]] = [n[i + d], n[i]]
    poner(n)
  }
  const raras = [...new Set([...plantilla.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((m) => !DATOS_EQUIPO.some((d) => d.clave === m)))]
  const bloque = ejemplo ? armarEquipo(plantilla, ejemplo) : ''
  const vista = ejemplo
    ? (separados ? ['Te recomiendo estas opciones 👇', bloque, '¿Te mando la ficha?'] : [`Te recomiendo estas opciones 👇\n\n${bloque}\n\n¿Te mando la ficha?`])
    : []

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="plantilla-renglones">
        {lineas.map((l, i) => (
          <div key={i} className="plantilla-renglon">
            <input value={l} disabled={ocupado} aria-label={`Atributo ${i + 1}`} maxLength={200}
              onChange={(e) => poner(lineas.map((x, j) => (j === i ? e.target.value : x)))} />
            <select value="" disabled={ocupado} aria-label={`Agregar un dato al atributo ${i + 1}`}
              onChange={(e) => { if (e.target.value) poner(lineas.map((x, j) => (j === i ? `${x}${x.trim() ? ' · ' : ''}{${e.target.value}}` : x))) }}>
              <option value="">+ dato</option>
              {DATOS_EQUIPO.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
            </select>
            <button type="button" className="btn chico" disabled={ocupado || i === 0} aria-label="Subir" onClick={() => mover(i, -1)}>↑</button>
            <button type="button" className="btn chico" disabled={ocupado || i === lineas.length - 1} aria-label="Bajar" onClick={() => mover(i, 1)}>↓</button>
            <button type="button" className="btn chico peligro" disabled={ocupado || lineas.length === 1} aria-label="Quitar atributo"
              onClick={() => poner(lineas.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <select value="" disabled={ocupado || lineas.length >= 15} aria-label="Agregar atributo" className="chico" style={{ justifySelf: 'start' }}
          onChange={(e) => {
            const d = DATOS_EQUIPO.find((x) => x.clave === e.target.value)
            if (d) poner([...lineas, `${d.emoji} {${d.clave}}`])
          }}>
          <option value="">+ Agregar atributo…</option>
          {DATOS_EQUIPO.map((d) => <option key={d.clave} value={d.clave}>{d.emoji} {d.nombre}</option>)}
        </select>
      </div>
      <small className="muted">
        Cada renglón es un atributo: escribe el emoji y el texto que quieras y usa «+ dato» para poner un dato del equipo. *negrita* · _cursiva_.
        Un renglón cuyo dato está vacío no sale. Los precios siempre salen de la base.
      </small>
      {raras.length > 0 && <div className="aviso bad">El bot no reemplaza {raras.map((m) => `{${m}}`).join(', ')}: usa «+ dato».</div>}
      <div className="row" style={{ gap: 16, alignItems: 'flex-end' }}>
        <label className="field deslizador" style={{ flex: '1 1 220px' }}>
          <span className="row" style={{ justifyContent: 'space-between' }}>Máximo de equipos por respuesta <b>{maxEquipos}</b></span>
          <input type="range" min={1} max={10} value={maxEquipos} disabled={ocupado} onChange={(e) => cambiar({ max_equipos: Number(e.target.value) })} />
        </label>
        <div className="interruptor-fila" style={{ flex: '1 1 260px' }}>
          <button type="button" className={`toggle${separados ? ' on' : ''}`} aria-pressed={separados} aria-label="Un mensaje por equipo" disabled={ocupado}
            onClick={() => cambiar({ equipos_separados: !separados })} />
          <div><b>Un mensaje por equipo</b>
            <small className="muted" style={{ display: 'block' }}>{separados ? 'Cada equipo en su mensaje, con la pausa y el «escribiendo…».' : 'Todos los equipos en un solo mensaje.'}</small>
          </div>
        </div>
      </div>
      {ejemplo && (
        <div className="lienzo-vista">
          <strong>Así lo ve el cliente (con un equipo real del inventario)</strong>
          {vista.map((t, i) => <VistaWhatsApp key={i} cuerpo={t} forma="texto" opciones={[]} numerar />)}
        </div>
      )}
    </div>
  )
}

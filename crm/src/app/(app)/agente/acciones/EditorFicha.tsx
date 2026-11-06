'use client'

import { VistaWhatsApp } from '../../bot/VistaWhatsApp'
import { DATOS_EQUIPO, armarEquipo, type DatoEquipo, type EquipoEjemplo } from '../personalidad/PlantillaEquipos'
import { CONDICION_EQUIPO, type Condicion, type PasoFicha } from './tipos'

type Equipo = Extract<Condicion, { forma: 'equipo' }>

// El disparador «nombra un equipo del inventario» (F4·42, RAG-43): exigir una palabra de interés y aceptar la marca sola.
export function EditorCondicionEquipo({ c, cambiar, disabled }: { c: Equipo; cambiar: (c: Equipo) => void; disabled: boolean }) {
  return (
    <div className="accion-paso" style={{ marginTop: 8 }}>
      <b>🔎 El mensaje nombra un equipo del inventario</b>
      <small className="muted">Por su código (100-102-1041, PU-23) o su modelo («Legion 7», «Latitude 5420»), sin IA. Si es un equipo agotado o un código que no existe, también dispara para avisarlo.</small>
      <label className="check">
        <input type="checkbox" checked={c.exigir} disabled={disabled} onChange={(e) => cambiar({ ...c, exigir: e.target.checked })} />
        <span>Solo si además escribe una de estas palabras</span>
      </label>
      {c.exigir && (
        <input value={c.palabras.join(', ')} disabled={disabled} aria-label="Palabras de interés, separadas por coma"
          placeholder={CONDICION_EQUIPO.forma === 'equipo' ? CONDICION_EQUIPO.palabras.join(', ') : ''}
          onChange={(e) => cambiar({ ...c, palabras: e.target.value.split(',') })} />
      )}
      <label className="check">
        <input type="checkbox" checked={c.marca} disabled={disabled} onChange={(e) => cambiar({ ...c, marca: e.target.checked })} />
        <span>También con la marca sola («¿tienen Lenovo?» → lista de esa marca)</span>
      </label>
    </div>
  )
}

function Campo({ etiqueta, valor, filas = 2, cambiar, disabled, ayuda }: {
  etiqueta: string; valor: string; filas?: number; cambiar: (v: string) => void; disabled: boolean; ayuda?: string
}) {
  return (
    <label className="field">{etiqueta}
      <textarea rows={filas} value={valor} maxLength={1000} disabled={disabled} onChange={(e) => cambiar(e.target.value)} />
      {ayuda && <small className="muted">{ayuda}</small>}
    </label>
  )
}

// El paso «Responder la ficha del equipo» (RAG-44 a RAG-47), con vista previa con un equipo real.
export function EditorFicha({ p, cambiar, disabled, atributos, ejemplo }: {
  p: PasoFicha; cambiar: (p: PasoFicha) => void; disabled: boolean; atributos: DatoEquipo[]; ejemplo: EquipoEjemplo | null
}) {
  const datos = [...DATOS_EQUIPO, ...atributos.map((a) => ({ ...a, emoji: a.emoji || '•' }))]
  const pon = (c: Partial<PasoFicha>) => cambiar({ ...p, ...c })
  const conNombre = (s: string) => s.replace(/\{nombre\}/g, 'Ana')
  const vista = ejemplo
    ? [p.encabezado, p.plantilla, p.cierre].map((s) => armarEquipo(conNombre(s), ejemplo)).filter((s) => s.trim()).join('\n\n')
    : ''
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
      <Campo etiqueta="Encabezado" valor={p.encabezado} cambiar={(v) => pon({ encabezado: v })} disabled={disabled}
        ayuda="{nombre} es el nombre del cliente (si no se sabe, queda «¡Hola!»); {equipo} es marca y modelo." />
      <label className="field">Renglones del equipo (uno por atributo)
        <textarea rows={7} value={p.plantilla} maxLength={1000} disabled={disabled} onChange={(e) => pon({ plantilla: e.target.value })} />
        <select value="" disabled={disabled} aria-label="Agregar un renglón" className="chico" style={{ justifySelf: 'start' }}
          onChange={(e) => { const d = datos.find((x) => x.clave === e.target.value); if (d) pon({ plantilla: `${p.plantilla.trimEnd()}\n${d.emoji} {${d.clave}}` }) }}>
          <option value="">+ Agregar renglón…</option>
          {datos.map((d) => <option key={d.clave} value={d.clave}>{d.emoji} {d.nombre}</option>)}
        </select>
        <small className="muted">Un renglón cuyo dato está vacío no sale. Los atributos (tarjeta gráfica, teclado…) se crean en Inventario → Atributos. El precio sale de la base.</small>
      </label>
      <Campo etiqueta="Cierre" valor={p.cierre} cambiar={(v) => pon({ cierre: v })} disabled={disabled} ayuda="{codigo} es el código del equipo." />
      <label className="check">
        <input type="checkbox" checked={p.foto} disabled={disabled} onChange={(e) => pon({ foto: e.target.checked })} />
        <span>Enviar la foto del equipo con la ficha (si tiene)</span>
      </label>
      <details>
        <summary className="muted" style={{ cursor: 'pointer' }}>Si coinciden varios equipos o está agotado</summary>
        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <Campo etiqueta="Antes de la lista (varios)" valor={p.varios} filas={1} cambiar={(v) => pon({ varios: v })} disabled={disabled}
            ayuda="{modelo} es lo que nombró el cliente. La lista usa la plantilla y el máximo de Agente → Avi → «Cómo muestra los equipos»." />
          <Campo etiqueta="Después de la lista" valor={p.cierre_varios} filas={1} cambiar={(v) => pon({ cierre_varios: v })} disabled={disabled} />
          <Campo etiqueta="Agotado o código que no existe" valor={p.agotado} filas={1} cambiar={(v) => pon({ agotado: v })} disabled={disabled} />
          <label className="field">Y después del aviso de agotado
            <select value={p.si_agotado} disabled={disabled} onChange={(e) => pon({ si_agotado: e.target.value as PasoFicha['si_agotado'] })}>
              <option value="parecidos">Ofrecer equipos de la misma marca con stock</option>
              <option value="asesor">Pasar a un asesor</option>
              <option value="nada">Nada más</option>
            </select>
          </label>
        </div>
      </details>
      {ejemplo && (
        <div className="lienzo-vista">
          <strong>Así lo ve el cliente (con {ejemplo.equipo}, un equipo real)</strong>
          <VistaWhatsApp cuerpo={vista} forma="texto" opciones={[]} numerar />
        </div>
      )}
    </div>
  )
}

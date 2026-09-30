'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { aplicarExcel, previsualizarExcel, type Previa } from '../acciones'

const NOMBRES: Record<string, string> = { almacenamiento: 'disco', generacion: 'generación', categoria: 'categoría', descripcion: 'descripción' }
const valor = (c: string, v: unknown) =>
  c === 'precio' ? `$${Number(v).toLocaleString('es-CO', { maximumFractionDigits: 0 })}` : v === '' || v == null ? '(vacío)' : String(v)

function Revisar() {
  const { pending } = useFormStatus()
  return <button className="btn primary" disabled={pending}>{pending ? 'Leyendo la hoja…' : 'Ver qué cambia'}</button>
}

// RI-04: primero la vista previa (no escribe nada); cargar solo si no hay errores.
export function CargaExcel() {
  const [previa, revisar] = useFormState<Previa, FormData>(previsualizarExcel, {})
  const [final, setFinal] = useState<Previa | null>(null)
  const [cargando, iniciar] = useTransition()
  const r = previa.resultado
  const puedeCargar = !!r && r.errores.length === 0 && !!previa.productos && (r.nuevos.length + r.cambian.length + r.sin_stock.length) > 0

  if (final?.resultado?.aplicado) {
    const f = final.resultado
    return (
      <section className="panel">
        <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
          <div className="aviso ok">Inventario cargado: {f.nuevos.length} nuevos, {f.cambian.length} actualizados y {f.sin_stock.length} quedaron en stock 0.</div>
          <div className="row"><Link className="btn primary" href="/inventario">Ver el inventario</Link>
            <button className="btn" onClick={() => location.reload()}>Cargar otra hoja</button></div>
        </div>
      </section>
    )
  }

  return (
    <>
      <section className="panel">
        <form action={(d) => { setFinal(null); revisar(d) }} className="panel-b" style={{ display: 'grid', gap: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            La hoja se empareja por <b>código</b>: crea los nuevos y actualiza los demás. Los equipos que no vienen en la
            hoja quedan con <b>stock 0</b> (no se borran). Una columna que no viene no se toca. Si hay un error, no se carga nada.
          </p>
          <div className="row">
            <input type="file" name="hoja" accept=".xlsx,.xlsm,.csv" required />
            <Revisar />
          </div>
          {previa.error && <div className="aviso bad" role="alert">{previa.error}</div>}
          {final?.error && <div className="aviso bad" role="alert">{final.error}</div>}
        </form>
      </section>

      {r && (
        <section className="panel">
          <div className="panel-h">
            <div><h2>Vista previa · {r.total} equipos en la hoja</h2>
              <small>Todavía no se escribió nada.{previa.ignoradas?.length ? ` Columnas que no se usan: ${previa.ignoradas.join(', ')}.` : ''}</small></div>
            <div className="row">
              <span className="chip acc">{r.nuevos.length} nuevos</span>
              <span className="chip warn">{r.cambian.length} cambian</span>
              <span className="chip neu">{r.sin_stock.length} a stock 0</span>
              <button className="btn primary" disabled={!puedeCargar || cargando}
                onClick={() => iniciar(async () => setFinal(await aplicarExcel(previa.productos!)))}>
                {cargando ? 'Cargando…' : 'Cargar inventario'}
              </button>
            </div>
          </div>
          <div className="panel-b" style={{ display: 'grid', gap: 14 }}>
            {r.errores.length > 0 && (
              <div className="aviso bad" role="alert">
                <b>La hoja tiene {r.errores.length} error{r.errores.length > 1 ? 'es' : ''}; corrígelos y vuelve a subirla:</b>
                <ul>{r.errores.map((e, i) => <li key={i}>{e.fila ? `Fila ${e.fila}: ` : ''}{e.codigo ? `${e.codigo} — ` : ''}{e.error}</li>)}</ul>
              </div>
            )}
            {r.errores.length === 0 && !puedeCargar && <div className="aviso ok">La hoja coincide con el inventario: no hay nada que cargar.</div>}
            {r.nuevos.length > 0 && (
              <div className="tablewrap"><table>
                <thead><tr><th>Nuevo</th><th>Equipo</th><th className="r">Precio</th><th className="r">Stock</th></tr></thead>
                <tbody>{r.nuevos.map((n) => (
                  <tr key={n.codigo}><td className="mono">{n.codigo}</td><td>{n.marca} {n.modelo}</td>
                    <td className="r mono">{valor('precio', n.precio)}</td><td className="r mono">{n.stock}</td></tr>))}</tbody>
              </table></div>
            )}
            {r.cambian.length > 0 && (
              <div className="tablewrap"><table>
                <thead><tr><th>Cambia</th><th>Qué cambia</th></tr></thead>
                <tbody>{r.cambian.map((c) => (
                  <tr key={c.codigo}><td className="mono">{c.codigo}</td>
                    <td>{Object.entries(c.cambios).map(([k, [a, d]]) => (
                      <div key={k}><span className="muted">{NOMBRES[k] ?? k}:</span> {valor(k, a)} → <b>{valor(k, d)}</b></div>))}</td></tr>))}</tbody>
              </table></div>
            )}
            {r.sin_stock.length > 0 && (
              <div className="tablewrap"><table>
                <thead><tr><th>Queda en stock 0</th><th>Equipo</th><th className="r">Stock hoy</th></tr></thead>
                <tbody>{r.sin_stock.map((s) => (
                  <tr key={s.codigo}><td className="mono">{s.codigo}</td><td>{s.marca} {s.modelo}</td><td className="r mono">{s.stock} → 0</td></tr>))}</tbody>
              </table></div>
            )}
          </div>
        </section>
      )}
    </>
  )
}

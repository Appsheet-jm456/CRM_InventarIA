'use client'

import Link from 'next/link'
import { useState } from 'react'
import { guardarReglas, type Resultado } from './acciones'

type Reglas = { validez_cotizacion_h: number; recargo_tarjeta_pct: number }
type Fila = {
  id: number; consecutivo: number; nombre: string; cedula: string; celular: string; tipo_cliente: string
  items: { codigo: string; nombre: string; cantidad: number }[]; total: number; valida_hasta: string; pdf: string | null
  creado_en: string; telefono: string
}

const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const numero = (c: number) => `COT-${String(c).padStart(6, '0')}`
const fecha = (iso: string) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })
// La ruta guardada ya empieza por «cotizaciones/» (la carpeta dentro del bucket del mismo nombre).
const urlPdf = (ruta: string) => `/archivos/cotizaciones/${ruta.split('/').map(encodeURIComponent).join('/')}`

export function Cotizacion({ reglas, cargo, cotizaciones, disparo }: {
  reglas: Reglas; cargo: number; cotizaciones: Fila[]; disparo: { nombre: string; activa: boolean } | null
}) {
  const [r, setR] = useState<Reglas>(reglas)
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const cambio = JSON.stringify(r) !== JSON.stringify(reglas)
  const ahora = Date.now()

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Flujo de cotización</h2>
            <small>
              Sin IA: pide nombre, cédula o NIT, celular (ofrece el de WhatsApp), equipo (el de la última ficha si lo vio) y cantidad, pregunta
              distribuidor o cliente final, y envía un PDF con tu logo. El cliente pasa a la etapa Cotización y, si escribe «quiero comprar»,
              sigue la compra con ese equipo.
            </small>
          </div>
          {disparo ? (
            <span className={`chip ${disparo.activa ? 'ok' : 'warn'}`}>Acción «{disparo.nombre}»: {disparo.activa ? 'activa' : 'apagada'}</span>
          ) : (
            <span className="chip warn">Ninguna acción inicia la cotización</span>
          )}
        </div>
        {disparo && !disparo.activa && (
          <div className="panel-b" style={{ paddingTop: 0 }}>
            <small className="muted">Para usarla, activa la acción en <Link href="/agente/acciones">Acciones</Link>.</small>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-h"><div><h2>Reglas</h2><small>Precio: siempre el del inventario al momento de cotizar.</small></div></div>
        {(aviso.error || aviso.ok) && (
          <div className="panel-b" style={{ paddingBottom: 0 }}>
            <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
          </div>
        )}
        <form className="panel-b" style={{ display: 'grid', gap: 14 }}
          onSubmit={async (e) => { e.preventDefault(); setOcupado(true); setAviso(await guardarReglas(r)); setOcupado(false) }}>
          <div className="row">
            <label className="field" style={{ flex: '0 1 200px' }}>
              Validez (horas)
              <input type="number" min={1} max={720} value={r.validez_cotizacion_h} disabled={ocupado}
                onChange={(e) => setR({ ...r, validez_cotizacion_h: Number(e.target.value) })} />
            </label>
            <label className="field" style={{ flex: '0 1 220px' }}>
              Recargo con tarjeta (%)
              <input type="number" min={0} max={30} step={0.5} value={r.recargo_tarjeta_pct} disabled={ocupado}
                onChange={(e) => setR({ ...r, recargo_tarjeta_pct: Number(e.target.value) })} />
            </label>
          </div>
          <small className="muted">
            Distribuidor: precio del inventario. Cliente final: + {cop(cargo)} de configuración por equipo (se cambia en{' '}
            <Link href="/agente/compra">Compra</Link>). El recargo con tarjeta se muestra en el PDF como opción, no se suma al total (0 = no se muestra).
          </small>
          <div className="row">
            <button className="btn primary" disabled={ocupado || !cambio}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
            {cambio && <button type="button" className="btn" disabled={ocupado} onClick={() => setR(reglas)}>Deshacer</button>}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-h">
          <div><h2>Cotizaciones enviadas</h2><small>Las 50 más recientes.</small></div>
          <span className="chip neu">{cotizaciones.length}</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Equipo</th><th className="r">Total</th><th>Vigencia</th><th></th></tr></thead>
            <tbody>
              {cotizaciones.map((c) => {
                const vigente = new Date(c.valida_hasta).getTime() > ahora
                return (
                  <tr key={c.id}>
                    <td className="mono">{numero(c.consecutivo)}</td>
                    <td>{fecha(c.creado_en)}</td>
                    <td>
                      {c.nombre}<br />
                      <small className="muted">CC {c.cedula} · {c.celular} · {c.tipo_cliente === 'distribuidor' ? 'Distribuidor' : 'Cliente final'}</small>
                    </td>
                    <td>{c.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(', ')}<br /><small className="muted mono">{c.items.map((i) => i.codigo).join(', ')}</small></td>
                    <td className="r num">{cop(c.total)}</td>
                    <td><span className={`chip ${vigente ? 'ok' : 'neu'}`}>{vigente ? `Hasta ${fecha(c.valida_hasta)}` : 'Vencida'}</span></td>
                    <td>{c.pdf ? <a className="btn chico" href={urlPdf(c.pdf)} target="_blank" rel="noreferrer">PDF</a> : <small className="muted">sin PDF</small>}</td>
                  </tr>
                )
              })}
              {!cotizaciones.length && <tr><td colSpan={7} className="muted">Todavía no hay cotizaciones.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

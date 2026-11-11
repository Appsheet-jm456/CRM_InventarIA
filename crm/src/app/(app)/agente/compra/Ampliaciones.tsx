'use client'

import { useState } from 'react'
import { pesos } from '@/lib/inventario'
import { guardarAmpliaciones, type Ampliacion, type DatosAmpliaciones } from './ampliacionesAcciones'

// F4·73 (docs/AMPLIACIONES-RAM-DISCO.md): precios de «Aumentar RAM o disco» en el resumen del pedido del bot.
const gbTexto = (n: number) => (n >= 1024 && n % 1024 === 0 ? `${n / 1024} TB` : `${n} GB`)
const numero = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0

export function Ampliaciones({ datos }: { datos: DatosAmpliaciones }) {
  const [d, setD] = useState(datos)
  const [aviso, setAviso] = useState<{ error?: string; ok?: string }>({})
  const [ocupado, setOcupado] = useState(false)
  const cambio = JSON.stringify(d) !== JSON.stringify(datos)
  const poner = (k: number, c: Partial<Ampliacion>) => { setD({ ...d, filas: d.filas.map((f, j) => (j === k ? { ...f, ...c } : f)) }); setAviso({}) }
  const nueva = (tipo: Ampliacion['tipo']) => setD({ ...d, filas: [...d.filas, { tipo, desde_gb: tipo === 'ram' ? 8 : 256, hasta_gb: tipo === 'ram' ? 16 : 512, precio: 0, precio_rapida: tipo === 'ram' ? 0 : null, activa: true }] })

  async function guardar() {
    setOcupado(true)
    const r = await guardarAmpliaciones(d)
    setOcupado(false)
    setAviso(r)
  }

  const tabla = (tipo: Ampliacion['tipo']) => (
    <div className="tablewrap">
      <table>
        <thead>
          <tr><th>Desde (GB)</th><th>Hasta (GB)</th>{tipo === 'ram' ? <><th>2400 MHz</th><th>2666-3200 MHz</th></> : <th>SSD SATA</th>}<th>Activa</th><th /></tr>
        </thead>
        <tbody>
          {d.filas.map((f, k) => f.tipo !== tipo ? null : (
            <tr key={k}>
              <td><input inputMode="numeric" style={{ width: 80 }} aria-label="Desde GB" value={f.desde_gb || ''} onChange={(e) => poner(k, { desde_gb: numero(e.target.value) })} /></td>
              <td><input inputMode="numeric" style={{ width: 80 }} aria-label="Hasta GB" value={f.hasta_gb || ''} onChange={(e) => poner(k, { hasta_gb: numero(e.target.value) })} />
                <small className="muted"> {f.hasta_gb > f.desde_gb ? `+${gbTexto(f.hasta_gb - f.desde_gb)}` : ''}</small></td>
              <td><input inputMode="numeric" style={{ width: 110 }} aria-label="Precio" value={f.precio ? f.precio.toLocaleString('es-CO') : ''} onChange={(e) => poner(k, { precio: numero(e.target.value) })} /></td>
              {tipo === 'ram' && <td><input inputMode="numeric" style={{ width: 110 }} aria-label="Precio 2666-3200" value={f.precio_rapida ? f.precio_rapida.toLocaleString('es-CO') : ''} onChange={(e) => poner(k, { precio_rapida: numero(e.target.value) })} /></td>}
              <td><input type="checkbox" aria-label="Activa" checked={f.activa} onChange={(e) => poner(k, { activa: e.target.checked })} /></td>
              <td><button type="button" className="iconbtn" aria-label="Quitar renglón" onClick={() => setD({ ...d, filas: d.filas.filter((_, j) => j !== k) })}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn-link" onClick={() => nueva(tipo)}>+ Renglón de {tipo === 'ram' ? 'RAM' : 'disco'}</button>
    </div>
  )

  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>⚡ Aumentos de RAM y disco</h2>
          <small className="muted">
            Opción «Aumentar RAM o disco» del resumen del carrito. La RAM solo se ofrece si el equipo tiene llenas sus <b>Ranuras de RAM</b> en
            Inventario («Ninguna» = soldada, no se amplía). La velocidad sale del atributo o del procesador (6.ª-7.ª gen → 2400). El disco se
            ofrece según su tamaño actual; NVMe suma el adicional.
          </small>
        </div>
      </div>
      <div className="panel-b">
      <fieldset className="f-seccion" disabled={ocupado}>
        <label className="inline">
          <input type="checkbox" checked={d.activa} onChange={(e) => setD({ ...d, activa: e.target.checked })} /> Ofrecer aumentos en el resumen del pedido
        </label>
        <h3>🧠 RAM DDR4</h3>
        {tabla('ram')}
        <h3>💽 Disco</h3>
        {tabla('disco')}
        <label className="field" style={{ maxWidth: 260 }}>
          Adicional si el disco es NVMe (COP)
          <input inputMode="numeric" value={d.nvme.toLocaleString('es-CO')} onChange={(e) => setD({ ...d, nvme: numero(e.target.value) })} />
          <small className="muted">Hoy: {pesos(d.nvme)} sobre el precio SATA</small>
        </label>
      </fieldset>
      {aviso.error && <div className="aviso bad" role="alert">{aviso.error}</div>}
      {aviso.ok && <div className="aviso ok">{aviso.ok}</div>}
      <div className="row">
        <button type="button" className="btn primary" disabled={ocupado || !cambio} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar aumentos'}</button>
        {cambio && <button type="button" className="btn" disabled={ocupado} onClick={() => setD(datos)}>Deshacer</button>}
      </div>
      </div>
    </section>
  )
}

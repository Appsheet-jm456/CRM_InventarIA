'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { borrarEtapa, crearEtapa, editarEtapa, moverOrden, type Resultado } from './acciones'

type Etapa = { id: number; nombre: string; orden: number; color: string; cierre: string; clientes: number }

const COLORES = ['Gris', 'Azul', 'Amarillo', 'Naranja', 'Morado', 'Verde', 'Rojo']
const CIERRES: Record<string, string> = { '': 'Abierta', ganada: 'Cierra ganada', perdida: 'Cierra perdida (pide motivo)' }

function Crear() {
  const { pending } = useFormStatus()
  return <button className="btn primary" disabled={pending}>{pending ? 'Creando…' : 'Agregar etapa'}</button>
}

export function ListaEtapas({ etapas }: { etapas: Etapa[] }) {
  const [estado, accion] = useFormState<Resultado, FormData>(crearEtapa, {})
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado.ok) form.current?.reset()
  }, [estado])

  async function hacer(accion: () => Promise<Resultado>) {
    setOcupado(true)
    setAviso(await accion())
    setOcupado(false)
  }

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Etapas del embudo</h2>
            <small>En orden, de la primera a la última. Renombrar una etapa arrastra a sus clientes; una etapa con clientes no se borra (RB-06).</small>
          </div>
        </div>
        {(aviso.error || aviso.ok) && (
          <div className="panel-b" style={{ paddingBottom: 0 }}>
            <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
          </div>
        )}
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Orden</th>
                <th>Nombre</th>
                <th>Color</th>
                <th>Tipo</th>
                <th className="r">Clientes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {etapas.map((e, i) => (
                <tr key={e.id}>
                  <td>
                    <div className="inline">
                      <button className="btn chico" disabled={ocupado || i === 0} onClick={() => hacer(() => moverOrden(e.id, -1))} aria-label="Subir">↑</button>
                      <button className="btn chico" disabled={ocupado || i === etapas.length - 1} onClick={() => hacer(() => moverOrden(e.id, 1))} aria-label="Bajar">↓</button>
                    </div>
                  </td>
                  <td>
                    <div className="inline">
                      <input defaultValue={e.nombre} aria-label="Nombre" disabled={ocupado}
                        onBlur={(ev) => ev.target.value.trim() !== e.nombre && hacer(() => editarEtapa(e.id, { nombre: ev.target.value }))} />
                    </div>
                  </td>
                  <td>
                    <div className="inline">
                      <select value={e.color} disabled={ocupado} aria-label="Color" onChange={(ev) => hacer(() => editarEtapa(e.id, { color: ev.target.value }))}>
                        {COLORES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </td>
                  <td>
                    <div className="inline">
                      <select value={e.cierre} disabled={ocupado} aria-label="Tipo" onChange={(ev) => hacer(() => editarEtapa(e.id, { cierre: ev.target.value }))}>
                        {Object.entries(CIERRES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="r num">{e.clientes}</td>
                  <td className="r">
                    <button className="btn chico peligro" disabled={ocupado || e.clientes > 0}
                      title={e.clientes > 0 ? 'Tiene clientes: muévelos antes' : 'Borrar'}
                      onClick={() => confirm(`¿Borrar la etapa ${e.nombre}?`) && hacer(() => borrarEtapa(e.id))}>Borrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h"><div><h2>Nueva etapa</h2><small>Queda al final; después la subes a su lugar.</small></div></div>
        <form ref={form} action={accion} className="panel-b" style={{ display: 'grid', gap: 12 }}>
          <div className="row">
            <label className="field" style={{ flex: '1 1 220px' }}>
              Nombre
              <input name="nombre" required placeholder="Ej.: Seguimiento" />
            </label>
            <label className="field" style={{ flex: '0 1 160px' }}>
              Color
              <select name="color" defaultValue="Gris">{COLORES.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <div style={{ alignSelf: 'flex-end' }}><Crear /></div>
          </div>
          {estado.error && <div className="aviso bad">{estado.error}</div>}
          {estado.ok && <div className="aviso ok">{estado.ok}</div>}
        </form>
      </section>
    </>
  )
}

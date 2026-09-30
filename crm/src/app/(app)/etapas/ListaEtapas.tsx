'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { borrarEtapa, crearEmbudo, crearEtapa, editarEmbudo, editarEtapa, moverOrden, type Resultado } from './acciones'

type Etapa = { id: number; nombre: string; orden: number; color: string; cierre: string; clientes: number }
type Embudo = { id: number; nombre: string; descripcion: string; etiqueta_bot: string; predeterminado: boolean; activo: boolean }

const COLORES = ['Gris', 'Azul', 'Amarillo', 'Naranja', 'Morado', 'Verde', 'Rojo']
const CIERRES: Record<string, string> = { '': 'Abierta', ganada: 'Cierra ganada', perdida: 'Cierra perdida (pide motivo)' }

function Crear() {
  const { pending } = useFormStatus()
  return <button className="btn primary" disabled={pending}>{pending ? 'Creando…' : 'Agregar etapa'}</button>
}

export function ListaEtapas({ embudos, embudo, etapas }: { embudos: Embudo[]; embudo: number; etapas: Etapa[] }) {
  const [estado, accion] = useFormState<Resultado, FormData>(crearEtapa, {})
  const [estadoEmbudo, accionEmbudo] = useFormState<Resultado, FormData>(crearEmbudo, {})
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
      <div className="embudos-tabs">
        {embudos.map((e) => (
          <Link key={e.id} href={`/etapas?e=${e.id}`} className={`pastilla${e.id === embudo ? ' activa' : ''}`}>
            {e.nombre}{e.activo ? '' : ' (inactivo)'}
          </Link>
        ))}
      </div>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Etapas de {embudos.find((e) => e.id === embudo)?.nombre ?? 'el embudo'}</h2>
            <small>En orden, de la primera a la última. Una etapa con oportunidades no se borra (RB-06). El tipo decide si cierra la oportunidad como ganada o perdida.</small>
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
                <th className="r">Oportunidades</th>
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
                      title={e.clientes > 0 ? 'Tiene oportunidades: muévelas antes' : 'Borrar'}
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
          <input type="hidden" name="embudo_id" value={embudo} />
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

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Embudos</h2>
            <small>Cada embudo tiene sus etapas (RE-01). La etiqueta del bot abre la oportunidad cuando el bot se la pone al cliente (RE-04). No se borran: se desactivan.</small>
          </div>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Nombre</th><th>Para qué</th><th>Etiqueta del bot</th><th>Activo</th></tr></thead>
            <tbody>
              {embudos.map((e) => (
                <tr key={e.id}>
                  <td><div className="inline"><input defaultValue={e.nombre} aria-label="Nombre" disabled={ocupado}
                    onBlur={(ev) => ev.target.value.trim() !== e.nombre && hacer(() => editarEmbudo(e.id, { nombre: ev.target.value }))} />
                    {e.predeterminado && <span className="chip acc">Predeterminado</span>}</div></td>
                  <td><div className="inline"><input defaultValue={e.descripcion} aria-label="Para qué" disabled={ocupado}
                    onBlur={(ev) => ev.target.value.trim() !== e.descripcion && hacer(() => editarEmbudo(e.id, { descripcion: ev.target.value }))} /></div></td>
                  <td><div className="inline"><input defaultValue={e.etiqueta_bot} aria-label="Etiqueta del bot" placeholder="Sin etiqueta" disabled={ocupado}
                    onBlur={(ev) => ev.target.value.trim() !== e.etiqueta_bot && hacer(() => editarEmbudo(e.id, { etiqueta_bot: ev.target.value }))} /></div></td>
                  <td><button className={`toggle${e.activo ? ' on' : ''}`} disabled={ocupado || e.predeterminado} aria-label="Activo"
                    onClick={() => hacer(() => editarEmbudo(e.id, { activo: !e.activo }))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={accionEmbudo} className="panel-b" style={{ display: 'grid', gap: 12 }}>
          <div className="row">
            <label className="field" style={{ flex: '1 1 200px' }}>Nuevo embudo<input name="nombre" required placeholder="Ej.: Empresas" /></label>
            <label className="field" style={{ flex: '2 1 260px' }}>Para qué<input name="descripcion" placeholder="Ej.: Ventas a empresas con factura" /></label>
            <div style={{ alignSelf: 'flex-end' }}><button className="btn primary">Crear embudo</button></div>
          </div>
          {estadoEmbudo.error && <div className="aviso bad">{estadoEmbudo.error}</div>}
          {estadoEmbudo.ok && <div className="aviso ok">{estadoEmbudo.ok}</div>}
        </form>
      </section>
    </>
  )
}

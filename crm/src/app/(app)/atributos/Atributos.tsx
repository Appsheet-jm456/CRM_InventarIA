'use client'

import { useState } from 'react'
import { archivarAtributo, crearAtributo, editarAtributo, moverAtributo, type Resultado } from './acciones'
import { TIPOS, nombreTipo, type TipoAtributo } from './tipos'

type Atributo = {
  id: number
  clave: string
  nombre: string
  tipo: TipoAtributo
  seccion: string
  orden: number
  opciones: string[]
  obligatorio: 'no' | 'etapa'
  etapas_obligatorio: string[]
  visible_lista: boolean
  llenable_bot: boolean
  solo_venta_online: boolean
  archivado_en: string | null
  usos: number
}

const conOpciones = (t: TipoAtributo) => t === 'lista' || t === 'multiseleccion'

function Obligatorio({ a, etapas, ocupado, hacer }: {
  a: Atributo; etapas: string[]; ocupado: boolean; hacer: (f: () => Promise<Resultado>) => void
}) {
  const [elegidas, setElegidas] = useState<string[]>(a.etapas_obligatorio)
  const cambio = JSON.stringify([...elegidas].sort()) !== JSON.stringify([...a.etapas_obligatorio].sort())
  return (
    <details className="obligatorio">
      <summary>{a.obligatorio === 'etapa' ? `Para pasar a ${a.etapas_obligatorio.join(', ')}` : 'No'}</summary>
      <div className="panel-b" style={{ display: 'grid', gap: 6, minWidth: 220 }}>
        <small className="muted">Obligatorio para pasar a:</small>
        {etapas.map((e) => (
          <label key={e} style={{ cursor: 'pointer' }}>
            <input type="checkbox" disabled={ocupado} checked={elegidas.includes(e)}
              onChange={(ev) => setElegidas(ev.target.checked ? [...elegidas, e] : elegidas.filter((x) => x !== e))} /> {e}
          </label>
        ))}
        <button className="btn chico primary" disabled={ocupado || !cambio}
          onClick={() => hacer(() => editarAtributo(a.id, elegidas.length
            ? { obligatorio: 'etapa', etapas_obligatorio: elegidas } : { obligatorio: 'no' }))}>
          Guardar
        </button>
        <small className="muted">El bot nunca se frena por esto: lo pide la ficha cuando una persona cambia la etapa.</small>
      </div>
    </details>
  )
}

export function Atributos({ atributos, etapas }: { atributos: Atributo[]; etapas: string[] }) {
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', tipo: 'texto' as TipoAtributo, seccion: '', opciones: '' })

  const activos = atributos.filter((a) => !a.archivado_en)
  const archivados = atributos.filter((a) => a.archivado_en)
  const secciones = [...new Set(activos.map((a) => a.seccion))]

  async function hacer(accion: () => Promise<Resultado>) {
    setOcupado(true)
    const r = await accion()
    if (r.error || r.ok) setAviso(r)
    setOcupado(false)
  }

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Atributos del lead</h2>
            <small>Los campos que se llenan en la ficha de cada cliente, además de nombre, teléfono, etapa, responsable, valor y etiquetas (esos son del sistema).
              El tipo no se cambia después de crear el atributo; si hace falta otro, se crea uno nuevo. Archivar no borra lo que ya tienen los clientes.</small>
          </div>
        </div>
        {(aviso.error || aviso.ok) && (
          <div className="panel-b" style={{ paddingBottom: 0 }}>
            <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
          </div>
        )}
      </section>

      {secciones.map((s) => {
        const filas = activos.filter((a) => a.seccion === s)
        return (
          <section className="panel" key={s}>
            <div className="panel-h"><div><h2>{s}</h2><small>{filas.length} {filas.length === 1 ? 'atributo' : 'atributos'}</small></div></div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Orden</th><th>Nombre</th><th>Tipo</th><th>Opciones</th><th>Obligatorio</th>
                    <th title="Se ve como columna en la lista de leads">En la lista</th>
                    <th title="El bot o el agente lo pueden llenar">Lo llena el bot</th>
                    <th title="Se ve y es obligatorio solo cuando el lead es Venta online (F4·33)">Solo venta online</th>
                    <th className="r">Clientes</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((a, i) => (
                    <tr key={a.id}>
                      <td>
                        <div className="inline">
                          <button className="btn chico" disabled={ocupado || i === 0} onClick={() => hacer(() => moverAtributo(a.id, -1))} aria-label="Subir">↑</button>
                          <button className="btn chico" disabled={ocupado || i === filas.length - 1} onClick={() => hacer(() => moverAtributo(a.id, 1))} aria-label="Bajar">↓</button>
                        </div>
                      </td>
                      <td>
                        <div className="inline" style={{ display: 'grid', gap: 4 }}>
                          <input defaultValue={a.nombre} aria-label="Nombre" disabled={ocupado} maxLength={60}
                            onBlur={(e) => e.target.value.trim() !== a.nombre && hacer(() => editarAtributo(a.id, { nombre: e.target.value }))} />
                          <input defaultValue={a.seccion} aria-label="Sección" list="secciones" disabled={ocupado} maxLength={40}
                            title="Sección: escribe otra para moverlo" style={{ fontSize: 12 }}
                            onBlur={(e) => e.target.value.trim() !== a.seccion && hacer(() => editarAtributo(a.id, { seccion: e.target.value }))} />
                        </div>
                      </td>
                      <td>{nombreTipo(a.tipo)}</td>
                      <td>
                        {conOpciones(a.tipo) ? (
                          <input defaultValue={a.opciones.join(', ')} aria-label="Opciones, separadas por coma" disabled={ocupado}
                            title="Separadas por coma"
                            onBlur={(e) => e.target.value !== a.opciones.join(', ')
                              && hacer(() => editarAtributo(a.id, { opciones: e.target.value.split(',') }))} />
                        ) : <span className="muted">—</span>}
                      </td>
                      <td><Obligatorio a={a} etapas={etapas} ocupado={ocupado} hacer={hacer} /></td>
                      <td><button className={`toggle${a.visible_lista ? ' on' : ''}`} disabled={ocupado} aria-label="Visible en la lista"
                        onClick={() => hacer(() => editarAtributo(a.id, { visible_lista: !a.visible_lista }))} /></td>
                      <td><button className={`toggle${a.llenable_bot ? ' on' : ''}`} disabled={ocupado} aria-label="Lo llena el bot"
                        onClick={() => hacer(() => editarAtributo(a.id, { llenable_bot: !a.llenable_bot }))} /></td>
                      <td><button className={`toggle${a.solo_venta_online ? ' on' : ''}`} disabled={ocupado} aria-label="Solo venta online"
                        onClick={() => hacer(() => editarAtributo(a.id, { solo_venta_online: !a.solo_venta_online }))} /></td>
                      <td className="r num">{a.usos}</td>
                      <td className="r">
                        <button className="btn chico peligro" disabled={ocupado}
                          onClick={() => confirm(`¿Archivar «${a.nombre}»?${a.usos ? ` ${a.usos} ${a.usos === 1 ? 'cliente lo tiene' : 'clientes lo tienen'} lleno: el dato se conserva y vuelve si lo restauras.` : ''}`)
                            && hacer(() => archivarAtributo(a.id, true))}>Archivar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
      <datalist id="secciones">{secciones.map((s) => <option key={s} value={s} />)}</datalist>

      <section className="panel">
        <div className="panel-h"><div><h2>Nuevo atributo</h2><small>Queda al final de su sección; después lo subes a su lugar.</small></div></div>
        <form className="panel-b" style={{ display: 'grid', gap: 12 }} onSubmit={async (e) => {
          e.preventDefault()
          setOcupado(true)
          const r = await crearAtributo({ ...nuevo, opciones: nuevo.opciones.split(/\n|,/) })
          setAviso(r)
          if (r.ok) setNuevo({ nombre: '', tipo: 'texto', seccion: nuevo.seccion, opciones: '' })
          setOcupado(false)
        }}>
          <div className="row">
            <label className="field" style={{ flex: '2 1 220px' }}>
              Nombre
              <input required maxLength={60} value={nuevo.nombre} disabled={ocupado} placeholder="Ej.: Correo para la factura"
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
            </label>
            <label className="field" style={{ flex: '1 1 200px' }}>
              Tipo
              <select value={nuevo.tipo} disabled={ocupado} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as TipoAtributo })}>
                {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
              <small className="muted">Ej.: {TIPOS.find((t) => t.id === nuevo.tipo)?.ejemplo}</small>
            </label>
            <label className="field" style={{ flex: '1 1 200px' }}>
              Sección
              <input list="secciones" maxLength={40} value={nuevo.seccion} disabled={ocupado} placeholder="Datos del cliente"
                onChange={(e) => setNuevo({ ...nuevo, seccion: e.target.value })} />
            </label>
          </div>
          {conOpciones(nuevo.tipo) && (
            <label className="field">
              Opciones (una por línea)
              <textarea rows={4} value={nuevo.opciones} disabled={ocupado} placeholder={'Transferencia\nTarjeta\nEfectivo'}
                onChange={(e) => setNuevo({ ...nuevo, opciones: e.target.value })} />
            </label>
          )}
          <div className="row"><button className="btn primary" disabled={ocupado || !nuevo.nombre.trim()}>{ocupado ? 'Creando…' : 'Crear atributo'}</button></div>
        </form>
      </section>

      {archivados.length > 0 && (
        <section className="panel">
          <details>
            <summary className="panel-h" style={{ cursor: 'pointer' }}>
              <div><h2>Archivados ({archivados.length})</h2><small>No se ven en la ficha ni en la lista; sus datos siguen guardados.</small></div>
            </summary>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Nombre</th><th>Sección</th><th>Tipo</th><th className="r">Clientes con dato</th><th></th></tr></thead>
                <tbody>
                  {archivados.map((a) => (
                    <tr key={a.id}>
                      <td>{a.nombre}</td><td>{a.seccion}</td><td>{nombreTipo(a.tipo)}</td><td className="r num">{a.usos}</td>
                      <td className="r"><button className="btn chico" disabled={ocupado} onClick={() => hacer(() => archivarAtributo(a.id, false))}>Restaurar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}
    </>
  )
}

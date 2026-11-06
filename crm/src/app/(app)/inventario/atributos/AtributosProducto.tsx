'use client'

import { useState } from 'react'
import { TIPOS_ATRIBUTO, type AtributoProducto, type TipoAtributoProducto } from '@/lib/inventario'
import { archivarAtributo, crearAtributo, editarAtributo, moverAtributo, type Resultado } from './acciones'

type Fila = AtributoProducto & { usos: number }
const nombreTipo = (t: string) => TIPOS_ATRIBUTO.find((x) => x.id === t)?.nombre ?? t
const lista = (s: string) => s.split(/\n|,/)

// Inventario → Atributos (F4·41, RI-07): crear, editar, ordenar, archivar y restaurar.
export function AtributosProducto({ atributos, categorias }: { atributos: Fila[]; categorias: string[] }) {
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const vacio = { nombre: '', tipo: 'texto' as TipoAtributoProducto, emoji: '', opciones: '', categorias: '' }
  const [nuevo, setNuevo] = useState(vacio)

  const activos = atributos.filter((a) => !a.archivado_en)
  const archivados = atributos.filter((a) => a.archivado_en)

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
            <h2>Atributos del producto</h2>
            <small>Datos de cada equipo además de los fijos (procesador, RAM, disco, estado…): tarjeta gráfica, pantalla, teclado, batería.
              Se llenan en la ficha del equipo o en el Excel (una columna con el nombre del atributo) y salen en las plantillas del bot
              con su marca, por ejemplo <code>{'{grafica}'}</code>. El tipo no se cambia después de crearlo. Archivar no borra lo que tienen los equipos.</small>
          </div>
        </div>
        {(aviso.error || aviso.ok) && (
          <div className="panel-b" style={{ paddingBottom: 0 }}>
            <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
          </div>
        )}
        {activos.length === 0 ? <div className="panel-b muted">No hay atributos activos.</div> : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Orden</th><th>Emoji</th><th>Nombre</th><th>Marca</th><th>Tipo</th><th>Opciones</th>
                  <th title="Vacío = todas las categorías">Categorías</th><th className="r">Equipos</th><th></th>
                </tr>
              </thead>
              <tbody>
                {activos.map((a, i) => (
                  <tr key={a.id}>
                    <td>
                      <div className="inline">
                        <button className="btn chico" disabled={ocupado || i === 0} onClick={() => hacer(() => moverAtributo(a.id, -1))} aria-label="Subir">↑</button>
                        <button className="btn chico" disabled={ocupado || i === activos.length - 1} onClick={() => hacer(() => moverAtributo(a.id, 1))} aria-label="Bajar">↓</button>
                      </div>
                    </td>
                    <td>
                      <input defaultValue={a.emoji} aria-label={`Emoji de ${a.nombre}`} disabled={ocupado} maxLength={16} style={{ width: 52, textAlign: 'center' }}
                        onBlur={(e) => e.target.value.trim() !== a.emoji && hacer(() => editarAtributo(a.id, { emoji: e.target.value }))} />
                    </td>
                    <td>
                      <input defaultValue={a.nombre} aria-label="Nombre" disabled={ocupado} maxLength={60}
                        onBlur={(e) => e.target.value.trim() !== a.nombre && hacer(() => editarAtributo(a.id, { nombre: e.target.value }))} />
                    </td>
                    <td className="mono">{`{${a.clave}}`}</td>
                    <td>{nombreTipo(a.tipo)}</td>
                    <td>
                      {a.tipo === 'lista' ? (
                        <input defaultValue={a.opciones.join(', ')} aria-label="Opciones, separadas por coma" disabled={ocupado} title="Separadas por coma"
                          onBlur={(e) => e.target.value !== a.opciones.join(', ') && hacer(() => editarAtributo(a.id, { opciones: lista(e.target.value) }))} />
                      ) : <span className="muted">—</span>}
                    </td>
                    <td>
                      <input defaultValue={a.categorias.join(', ')} aria-label="Categorías, separadas por coma" disabled={ocupado} list="categorias-inv"
                        placeholder="Todas" title="Vacío = todas. Separadas por coma."
                        onBlur={(e) => e.target.value !== a.categorias.join(', ') && hacer(() => editarAtributo(a.id, { categorias: lista(e.target.value) }))} />
                    </td>
                    <td className="r num">{a.usos}</td>
                    <td className="r">
                      <button className="btn chico peligro" disabled={ocupado}
                        onClick={() => confirm(`¿Archivar «${a.nombre}»?${a.usos ? ` ${a.usos} ${a.usos === 1 ? 'equipo lo tiene' : 'equipos lo tienen'} lleno: el dato se conserva y vuelve si lo restauras.` : ''} Deja de salir en las plantillas.`)
                          && hacer(() => archivarAtributo(a.id, true))}>Archivar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <datalist id="categorias-inv">{categorias.map((c) => <option key={c} value={c} />)}</datalist>

      <section className="panel">
        <div className="panel-h"><div><h2>Nuevo atributo</h2><small>Queda al final; después lo subes a su lugar.</small></div></div>
        <form className="panel-b" style={{ display: 'grid', gap: 12 }} onSubmit={async (e) => {
          e.preventDefault()
          setOcupado(true)
          const r = await crearAtributo({ ...nuevo, opciones: lista(nuevo.opciones), categorias: lista(nuevo.categorias) })
          setAviso(r)
          if (r.ok) setNuevo(vacio)
          setOcupado(false)
        }}>
          <div className="row">
            <label className="field" style={{ flex: '0 0 80px' }}>
              Emoji
              <input maxLength={16} value={nuevo.emoji} disabled={ocupado} placeholder="🚀" style={{ textAlign: 'center' }}
                onChange={(e) => setNuevo({ ...nuevo, emoji: e.target.value })} />
            </label>
            <label className="field" style={{ flex: '2 1 220px' }}>
              Nombre
              <input required maxLength={60} value={nuevo.nombre} disabled={ocupado} placeholder="Ej.: Tarjeta gráfica"
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
            </label>
            <label className="field" style={{ flex: '1 1 180px' }}>
              Tipo
              <select value={nuevo.tipo} disabled={ocupado} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as TipoAtributoProducto })}>
                {TIPOS_ATRIBUTO.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
              <small className="muted">Ej.: {TIPOS_ATRIBUTO.find((t) => t.id === nuevo.tipo)?.ejemplo}</small>
            </label>
            <label className="field" style={{ flex: '1 1 200px' }}>
              Categorías
              <input value={nuevo.categorias} disabled={ocupado} list="categorias-inv" placeholder="Todas"
                onChange={(e) => setNuevo({ ...nuevo, categorias: e.target.value })} />
              <small className="muted">Vacío = todas. Separadas por coma.</small>
            </label>
          </div>
          {nuevo.tipo === 'lista' && (
            <label className="field">
              Opciones (una por línea)
              <textarea rows={4} value={nuevo.opciones} disabled={ocupado} placeholder={'IPS\nOLED\nTN'}
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
              <div><h2>Archivados ({archivados.length})</h2><small>No se ven en la ficha ni salen en las plantillas; los equipos conservan el dato.</small></div>
            </summary>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Nombre</th><th>Marca</th><th>Tipo</th><th className="r">Equipos con dato</th><th></th></tr></thead>
                <tbody>
                  {archivados.map((a) => (
                    <tr key={a.id}>
                      <td>{a.emoji} {a.nombre}</td><td className="mono">{`{${a.clave}}`}</td><td>{nombreTipo(a.tipo)}</td><td className="r num">{a.usos}</td>
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

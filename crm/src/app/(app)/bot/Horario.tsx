'use client'

import { useState } from 'react'
import { borrarFestivo, borrarFranja, crearFestivo, crearFranja, editarFranja, type Resultado } from './acciones'

type Franja = { id: number; dia: number; abre: string; cierra: string }
type Festivo = { fecha: string; nombre: string }

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const ORDEN = [1, 2, 3, 4, 5, 6, 0]

function fechaLarga(f: string) {
  return new Date(`${f}T12:00:00-05:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' })
}

export function Horario({ franjas, festivos }: { franjas: Franja[]; festivos: Festivo[] }) {
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const [fecha, setFecha] = useState('')
  const [nombre, setNombre] = useState('')
  const anio = new Date().getFullYear()
  const anios = Array.from(new Set(festivos.map((f) => Number(f.fecha.slice(0, 4)))))
  const faltaSiguiente = !anios.includes(anio + 1)

  async function correr(accion: () => Promise<Resultado>) {
    setOcupado(true)
    setAviso(await accion())
    setOcupado(false)
  }

  return (
    <>
      {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Horario de atención</h2>
            <small>Lo usan el bot (aviso fuera de horario) y el SLA (minutos hábiles). Un día sin franjas es un día cerrado; puedes poner varias franjas por día (RBOT-06, RBOT-07).</small>
          </div>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Día</th><th>Franjas</th></tr></thead>
            <tbody>
              {ORDEN.map((d) => (
                <tr key={d}>
                  <td>{DIAS[d]}</td>
                  <td>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {franjas.filter((f) => f.dia === d).map((f) => (
                        <FilaFranja key={`${f.id}-${f.abre}-${f.cierra}`} f={f} ocupado={ocupado} correr={correr} />
                      ))}
                      {!franjas.some((f) => f.dia === d) && <small className="muted">Cerrado</small>}
                      <NuevaFranja dia={d} ocupado={ocupado} correr={correr} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Festivos</h2>
            <small>Ese día no hay atención ni corre el SLA.</small>
          </div>
        </div>
        {faltaSiguiente && (
          <div className="panel-b" style={{ paddingBottom: 0 }}>
            <div className="aviso bad">Faltan los festivos de {anio + 1}: sin ellos el bot y el SLA los tratarán como días hábiles.</div>
          </div>
        )}
        <form className="panel-b row" onSubmit={(e) => { e.preventDefault(); correr(async () => { const r = await crearFestivo(fecha, nombre); if (!r.error) { setFecha(''); setNombre('') } return r }) }}>
          <label className="field" style={{ flex: '0 1 180px' }}>Fecha<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></label>
          <label className="field" style={{ flex: '1 1 220px' }}>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Navidad" required /></label>
          <div style={{ alignSelf: 'flex-end' }}><button className="btn primary" disabled={ocupado}>Agregar festivo</button></div>
        </form>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Fecha</th><th>Nombre</th><th></th></tr></thead>
            <tbody>
              {festivos.map((f) => (
                <tr key={f.fecha}>
                  <td>{fechaLarga(f.fecha)} {f.fecha.slice(0, 4)}</td>
                  <td>{f.nombre}</td>
                  <td className="r"><button className="btn chico peligro" disabled={ocupado} onClick={() => confirm(`¿Quitar el festivo ${f.nombre}?`) && correr(() => borrarFestivo(f.fecha))}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function FilaFranja({ f, ocupado, correr }: { f: Franja; ocupado: boolean; correr: (a: () => Promise<Resultado>) => void }) {
  const [abre, setAbre] = useState(f.abre)
  const [cierra, setCierra] = useState(f.cierra)
  return (
    <div className="inline">
      <input type="time" value={abre} disabled={ocupado} onChange={(e) => setAbre(e.target.value)} aria-label="Abre" />
      <span>a</span>
      <input type="time" value={cierra} disabled={ocupado} onChange={(e) => setCierra(e.target.value)} aria-label="Cierra" />
      <button className="btn chico" disabled={ocupado || (abre === f.abre && cierra === f.cierra)} onClick={() => correr(() => editarFranja(f.id, abre, cierra))}>Guardar</button>
      <button className="btn chico peligro" disabled={ocupado} onClick={() => correr(() => borrarFranja(f.id))}>Quitar</button>
    </div>
  )
}

function NuevaFranja({ dia, ocupado, correr }: { dia: number; ocupado: boolean; correr: (a: () => Promise<Resultado>) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [abre, setAbre] = useState('08:00')
  const [cierra, setCierra] = useState('18:00')
  if (!abierto) return <div><button className="btn chico" onClick={() => setAbierto(true)}>+ Franja</button></div>
  return (
    <div className="inline">
      <input type="time" value={abre} onChange={(e) => setAbre(e.target.value)} aria-label="Abre" />
      <span>a</span>
      <input type="time" value={cierra} onChange={(e) => setCierra(e.target.value)} aria-label="Cierra" />
      <button className="btn chico primary" disabled={ocupado} onClick={() => { correr(() => crearFranja(dia, abre, cierra)); setAbierto(false) }}>Agregar</button>
      <button className="btn chico" onClick={() => setAbierto(false)}>Cancelar</button>
    </div>
  )
}

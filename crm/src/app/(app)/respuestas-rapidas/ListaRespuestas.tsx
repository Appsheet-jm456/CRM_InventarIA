'use client'

import { useState } from 'react'
import { borrarRespuesta, crearRespuesta, editarRespuesta, type Resultado } from './acciones'

type Respuesta = { id: number; atajo: string; titulo: string; texto: string; activo: boolean }

function Fila({ r, ocupado, correr }: { r: Respuesta; ocupado: boolean; correr: (a: () => Promise<Resultado>) => void }) {
  const [titulo, setTitulo] = useState(r.titulo)
  const [texto, setTexto] = useState(r.texto)
  const cambio = titulo !== r.titulo || texto !== r.texto
  return (
    <tr>
      <td><code>/{r.atajo}</code></td>
      <td style={{ minWidth: 160 }}><input value={titulo} disabled={ocupado} onChange={(e) => setTitulo(e.target.value)} aria-label="Título" /></td>
      <td style={{ minWidth: 280 }}><textarea rows={2} value={texto} disabled={ocupado} onChange={(e) => setTexto(e.target.value)} aria-label="Texto" style={{ width: '100%' }} /></td>
      <td>
        <input type="checkbox" checked={r.activo} disabled={ocupado} aria-label="Activa" onChange={(e) => correr(() => editarRespuesta(r.id, { activo: e.target.checked }))} />
      </td>
      <td className="r">
        <div className="inline">
          <button className="btn chico primary" disabled={ocupado || !cambio} onClick={() => correr(() => editarRespuesta(r.id, { titulo, texto }))}>Guardar</button>
          <button className="btn chico peligro" disabled={ocupado} onClick={() => confirm(`¿Borrar /${r.atajo}?`) && correr(() => borrarRespuesta(r.id))}>Borrar</button>
        </div>
      </td>
    </tr>
  )
}

export function ListaRespuestas({ respuestas }: { respuestas: Respuesta[] }) {
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const [atajo, setAtajo] = useState('')
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')

  async function correr(accion: () => Promise<Resultado>) {
    setOcupado(true)
    setAviso(await accion())
    setOcupado(false)
  }

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Respuestas rápidas</h2>
            <small>En la Bandeja escribes <code>/</code> y eliges una: el texto se inserta para que lo revises antes de enviar (RBOT-08). <code>{'{nombre}'}</code> se cambia por el primer nombre del cliente.</small>
          </div>
        </div>
        {(aviso.error || aviso.ok) && (
          <div className="panel-b" style={{ paddingBottom: 0 }}>
            <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
          </div>
        )}
        <div className="tablewrap">
          <table>
            <thead><tr><th>Atajo</th><th>Título</th><th>Texto</th><th>Activa</th><th></th></tr></thead>
            <tbody>
              {respuestas.map((r) => <Fila key={`${r.id}-${r.titulo}-${r.texto}`} r={r} ocupado={ocupado} correr={correr} />)}
              {respuestas.length === 0 && <tr><td colSpan={5} className="muted">Aún no hay respuestas rápidas.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-h"><div><h2>Nueva respuesta</h2></div></div>
        <form className="panel-b" style={{ display: 'grid', gap: 12 }}
          onSubmit={(e) => { e.preventDefault(); correr(async () => { const r = await crearRespuesta({ atajo, titulo, texto }); if (!r.error) { setAtajo(''); setTitulo(''); setTexto('') } return r }) }}>
          <div className="row">
            <label className="field" style={{ flex: '0 1 180px' }}>Atajo<input value={atajo} onChange={(e) => setAtajo(e.target.value)} placeholder="precio" required /></label>
            <label className="field" style={{ flex: '1 1 240px' }}>Título<input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Consulta de precio" required /></label>
          </div>
          <label className="field">Texto<textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} required /></label>
          <div><button className="btn primary" disabled={ocupado}>Agregar respuesta</button></div>
        </form>
      </section>
    </>
  )
}

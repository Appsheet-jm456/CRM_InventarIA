'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { MenuAcciones } from '@/components/MenuAcciones'
import { archivarBot, marcarPrincipal, nuevoBot, renombrarBot, type Resultado } from './acciones'

export type BotFila = {
  id: number
  nombre: string
  principal: boolean
  archivado: boolean
  publicada: number | null // versión en el bot, si ya se publicó
  borrador: number | null // versión del borrador abierto
  cuadros: number // cuadros de la versión que se ve (publicada o, si no hay, borrador)
  cambio: string | null // última publicación o borrador
  por: string | null
}

const cuando = (t: string | null) => t
  ? new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' })
  : '—'

type Modal = { modo: 'nuevo' } | { modo: 'duplicar'; bot: BotFila } | { modo: 'renombrar'; bot: BotFila }

// RF-16: la lista de bots. Cada uno se abre en su propio lienzo; uno es el principal.
export function Bots({ bots }: { bots: BotFila[] }) {
  const router = useRouter()
  const [modal, setModal] = useState<Modal | null>(null)
  const [aviso, setAviso] = useState<Resultado>({})
  const [verArchivados, setVerArchivados] = useState(false)
  const [ocupado, iniciar] = useTransition()
  const visibles = bots.filter((b) => verArchivados || !b.archivado)
  const archivados = bots.filter((b) => b.archivado).length

  function hacer(accion: () => Promise<Resultado>) {
    iniciar(async () => {
      const r = await accion()
      setAviso(r)
      if (!r.error) router.refresh()
    })
  }

  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>Bots del flujo</h2>
          <small>
            Cada bot tiene su propio lienzo, borrador y versiones. El ⭐ principal atiende a todos los clientes; los demás se
            alcanzan desde el principal (próximamente con el cuadro «Ir a otro bot»).
          </small>
        </div>
        <div className="row">
          {archivados > 0 && (
            <label className="inline"><input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} /> Ver archivados ({archivados})</label>
          )}
          <button className="btn primary" onClick={() => setModal({ modo: 'nuevo' })}>+ Nuevo bot</button>
        </div>
      </div>
      {(aviso.error || aviso.ok) && (
        <div className="panel-b" style={{ paddingBottom: 0 }}>
          <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
        </div>
      )}
      <div className="tablewrap">
        <table>
          <thead><tr><th>Bot</th><th>Estado</th><th>En el bot</th><th className="r">Cuadros</th><th>Último cambio</th><th></th></tr></thead>
          <tbody>
            {visibles.map((b) => (
              <tr key={b.id} className={b.archivado ? 'muted' : undefined}>
                <td>
                  <Link href={`/bot/flujo/${b.id}`}><b>{b.principal ? '⭐ ' : ''}{b.nombre}</b></Link>
                  {b.principal && <small className="muted"> · atiende a los clientes</small>}
                </td>
                <td>
                  {b.archivado ? <span className="chip neu">Archivado</span>
                    : b.publicada ? <span className="chip ok">Publicado</span>
                    : <span className="chip warn">Sin publicar</span>}
                  {b.borrador && !b.archivado && <> <span className="chip acc" title="Hay cambios sin publicar">Borrador v{b.borrador}</span></>}
                </td>
                <td className="mono">{b.publicada ? `v${b.publicada}` : <span className="muted">—</span>}</td>
                <td className="r mono">{b.cuadros}</td>
                <td>{cuando(b.cambio)}{b.por && <small className="muted"> · {b.por}</small>}</td>
                <td className="r">
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <Link className="btn chico" href={`/bot/flujo/${b.id}`}>{b.archivado ? 'Ver' : 'Abrir'}</Link>
                    <MenuAcciones etiqueta={`Acciones de ${b.nombre}`} acciones={[
                      ...(!b.archivado ? [{ texto: 'Renombrar', onClick: () => setModal({ modo: 'renombrar', bot: b }) }] : []),
                      { texto: 'Duplicar', onClick: () => setModal({ modo: 'duplicar', bot: b }) },
                      ...(!b.archivado && !b.principal && b.publicada ? [{
                        texto: 'Marcar como principal',
                        onClick: () => confirm(`¿Que «${b.nombre}» pase a atender a todos los clientes? El principal actual deja de hacerlo.`) && hacer(() => marcarPrincipal(b.id)),
                      }] : []),
                      ...(!b.principal ? [{
                        texto: b.archivado ? 'Desarchivar' : 'Archivar', peligro: !b.archivado,
                        onClick: () => (b.archivado || confirm(`¿Archivar «${b.nombre}»? Deja de poder editarse; se puede desarchivar.`)) && hacer(() => archivarBot(b.id, !b.archivado)),
                      }] : []),
                    ]} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <FormularioBot modal={modal} bots={bots} ocupado={ocupado} alCerrar={() => setModal(null)}
        alEnviar={(accion) => iniciar(async () => {
          const r = await accion()
          if (r.error) return // el formulario ya muestra el error
          setModal(null)
          setAviso(r)
          const id = (r as Resultado & { id?: number }).id
          if (id) router.push(`/bot/flujo/${id}`)
          else router.refresh()
        })} />}
    </section>
  )
}

function FormularioBot({ modal, bots, ocupado, alCerrar, alEnviar }: {
  modal: Modal
  bots: BotFila[]
  ocupado: boolean
  alCerrar: () => void
  alEnviar: (accion: () => Promise<Resultado & { id?: number }>) => void
}) {
  const [nombre, setNombre] = useState(modal.modo === 'renombrar' ? modal.bot.nombre : modal.modo === 'duplicar' ? `${modal.bot.nombre} (copia)` : '')
  const [desde, setDesde] = useState<string>(modal.modo === 'duplicar' ? String(modal.bot.id) : '')
  const [error, setError] = useState('')
  const titulo = modal.modo === 'nuevo' ? 'Nuevo bot' : modal.modo === 'duplicar' ? `Duplicar «${modal.bot.nombre}»` : `Renombrar «${modal.bot.nombre}»`

  return (
    <div className="modal" onClick={alCerrar}>
      <form className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}
        onSubmit={(e) => {
          e.preventDefault()
          if (!nombre.trim()) { setError('Escribe el nombre del bot.'); return }
          alEnviar(async () => {
            const r = modal.modo === 'renombrar' ? await renombrarBot(modal.bot.id, nombre) : await nuevoBot(nombre, desde ? Number(desde) : null)
            if (r.error) setError(r.error)
            return r as Resultado & { id?: number }
          })
        }}>
        <h3>{titulo}</h3>
        <label className="field">Nombre
          <input value={nombre} maxLength={60} autoFocus onChange={(e) => { setNombre(e.target.value); setError('') }} placeholder="Distribuidores" />
        </label>
        {modal.modo !== 'renombrar' && (
          <label className="field">Cómo empieza
            <select value={desde} disabled={modal.modo === 'duplicar'} onChange={(e) => setDesde(e.target.value)}>
              <option value="">En blanco: un saludo y lo que el bot necesita siempre</option>
              {bots.filter((b) => !b.archivado || modal.modo === 'duplicar').map((b) => <option key={b.id} value={b.id}>Copia de «{b.nombre}»</option>)}
            </select>
            <small className="muted">
              {desde ? 'Copia la versión publicada (o el borrador si nunca se publicó). El bot nuevo queda como borrador: no atiende a nadie hasta que lo publiques.'
                : 'El bot nuevo queda como borrador: no atiende a nadie hasta que lo publiques.'}
            </small>
          </label>
        )}
        {error && <div className="aviso bad" role="alert">{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
          <button className="btn primary" disabled={ocupado}>{ocupado ? 'Guardando…' : modal.modo === 'renombrar' ? 'Cambiar nombre' : 'Crear bot'}</button>
        </div>
      </form>
    </div>
  )
}

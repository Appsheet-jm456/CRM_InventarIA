'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { fotoDe, pesos, titulo } from '@/lib/inventario'
import { buscarEnInventario, type Respuesta } from './acciones'

type Turno = { id: number; pregunta: string; respuesta?: Respuesta }

const EJEMPLOS = ['Dell i7 de 11', 'Equipos con 16 GB hasta 1.500.000', 'El más barato', '100-102-1041']
const FUENTE: Record<string, string> = { codigo: 'por código', reglas: 'por reglas', ia: 'con IA' }

export function Chat() {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [texto, setTexto] = useState('')
  const [buscando, iniciar] = useTransition()
  const fin = useRef<HTMLDivElement>(null)
  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' })
  }, [turnos])

  function preguntar(pregunta: string) {
    if (!pregunta.trim() || buscando) return
    const id = Date.now()
    setTurnos((t) => [...t, { id, pregunta }])
    setTexto('')
    iniciar(async () => {
      const respuesta = await buscarEnInventario(pregunta)
      setTurnos((t) => t.map((x) => (x.id === id ? { ...x, respuesta } : x)))
    })
  }

  return (
    <section className="panel chat-inv">
      <div className="panel-h">
        <div><h2>Pregúntale al inventario</h2>
          <small>Entiende como el bot de WhatsApp: marca, procesador, generación, RAM, presupuesto o código. Los precios y el stock salen siempre de la base.</small></div>
      </div>
      <div className="panel-b chat-inv-hilo" aria-live="polite">
        {turnos.length === 0 && (
          <div className="row">
            <span className="muted">Por ejemplo:</span>
            {EJEMPLOS.map((e) => <button key={e} className="pastilla" onClick={() => preguntar(e)}>{e}</button>)}
          </div>
        )}
        {turnos.map((t) => (
          <div key={t.id} className="chat-inv-turno">
            <div className="m asesor">{t.pregunta}</div>
            {!t.respuesta ? (
              <div className="m bot muted">Buscando… (si hace falta la IA, tarda unos segundos)</div>
            ) : t.respuesta.error ? (
              <div className="aviso bad" role="alert">{t.respuesta.error}</div>
            ) : (
              <div className="chat-inv-resp">
                <div className="m bot">{t.respuesta.texto}
                  {t.respuesta.fuente && FUENTE[t.respuesta.fuente] && <small className="muted"> · entendido {FUENTE[t.respuesta.fuente]}</small>}
                </div>
                {!!t.respuesta.productos?.length && (
                  <div className="tarjetas-equipo">
                    {t.respuesta.productos.map((p) => {
                      const foto = fotoDe(p)
                      return (
                        <Link key={p.id} href={`/inventario/${p.id}`} className="tarjeta-equipo">
                          <div className="tarjeta-equipo-foto">{foto ? <img src={foto} alt="" loading="lazy" /> : <span className="muted">Sin foto</span>}</div>
                          <b>{titulo(p)}</b>
                          <small className="muted">{p.procesador} · {p.ram} · {p.almacenamiento}</small>
                          <div className="row" style={{ justifyContent: 'space-between' }}>
                            <span className="mono">{pesos(p.precio)}</span>
                            <span className={`chip ${p.stock > 0 ? 'ok' : 'neu'}`}>{p.stock > 0 ? `${p.stock} en stock` : 'Agotado'}</span>
                          </div>
                          <small className="mono muted">{p.codigo}</small>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={fin} />
      </div>
      <form className="panel-b chat-inv-escribir" onSubmit={(e) => { e.preventDefault(); preguntar(texto) }}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="¿Qué equipo buscas?" aria-label="Pregunta" maxLength={500} disabled={buscando} />
        <button className="btn primary" disabled={buscando || !texto.trim()}>{buscando ? 'Buscando…' : 'Preguntar'}</button>
      </form>
    </section>
  )
}

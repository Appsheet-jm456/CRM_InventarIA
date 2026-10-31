'use client'

import { useState } from 'react'
import { probarAvi, type Paso, type Turno } from './acciones'

type Burbuja = { lado: 'cliente' | 'avi'; texto: string }
const usd = (n: number) => `US$ ${n.toLocaleString('es-CO', { maximumFractionDigits: 5 })}`

function PasoVista({ p }: { p: Paso }) {
  if (p.tipo === 'herramienta') return <li><b>{p.nombre}</b> <code>{JSON.stringify(p.args)}</code><br /><span className="muted">{JSON.stringify(p.resultado).slice(0, 300)}</span></li>
  if (p.tipo === 'bloqueado') return <li><span className="chip warn">Bloqueado</span> {p.problemas?.join('; ')}<br /><span className="muted">«{p.texto}»</span></li>
  if (p.tipo === 'tope') return <li><span className="chip warn">Presupuesto agotado</span></li>
  if (p.tipo === 'error') return <li><span className="chip bad">El modelo no respondió</span> {p.detalle}</li>
  return <li><span className="chip ok">Respuesta</span></li>
}

export function Probar() {
  const [chat, setChat] = useState<Burbuja[]>([])
  const [estado, setEstado] = useState<unknown>(null)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [ultimo, setUltimo] = useState<Turno | null>(null)
  const [total, setTotal] = useState(0)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const mensaje = texto.trim()
    if (!mensaje || ocupado) return
    const nuevo: Burbuja[] = [...chat, { lado: 'cliente', texto: mensaje }]
    setChat(nuevo); setTexto(''); setOcupado(true)
    const r = await probarAvi(nuevo.map((b) => ({ role: b.lado === 'cliente' ? 'user' : 'assistant', content: b.texto })), estado)
    setUltimo(r); setOcupado(false)
    if (r.error) return
    if (r.hibrido) { setChat([...nuevo, { lado: 'avi', texto: '(El modelo no respondió: en la vida real atendería el modo Híbrido.)' }]); return }
    setEstado(r.estado); setTotal(total + (r.costo_usd ?? 0))
    setChat([...nuevo, ...(r.textos ?? []).map((t): Burbuja => ({ lado: 'avi', texto: t }))])
  }

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <section className="panel" style={{ flex: '2 1 420px' }}>
        <div className="panel-h">
          <div><h2>Probar a Avi</h2><small>Una conversación de prueba: no se guarda, no se envía a WhatsApp y no cuenta para el presupuesto. Usa el inventario real.</small></div>
          <button className="btn" onClick={() => { setChat([]); setEstado(null); setUltimo(null); setTotal(0) }} disabled={ocupado}>Nueva conversación</button>
        </div>
        <div className="panel-b" style={{ display: 'grid', gap: 8, minHeight: 280 }}>
          {chat.length === 0 && <span className="muted">Escribe como un cliente: «busco un Dell i5 para diseño, hasta 2 millones».</span>}
          {chat.map((b, i) => (
            <div key={i} style={{ justifySelf: b.lado === 'cliente' ? 'end' : 'start', maxWidth: '85%', whiteSpace: 'pre-wrap', padding: '8px 12px', borderRadius: 12,
              background: b.lado === 'cliente' ? 'var(--accent, #2563eb)' : 'var(--surface-2, #f3f4f6)', color: b.lado === 'cliente' ? '#fff' : 'inherit' }}>
              {b.texto}
            </div>
          ))}
          {ocupado && <span className="muted">Avi está pensando…</span>}
          {ultimo?.error && <div className="aviso bad" role="alert">{ultimo.error}</div>}
        </div>
        <form className="panel-b row" onSubmit={enviar}>
          <input style={{ flex: 1 }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe como un cliente…" disabled={ocupado} aria-label="Mensaje del cliente" />
          <button className="btn primary" disabled={ocupado || !texto.trim()}>Enviar</button>
        </form>
      </section>

      <section className="panel" style={{ flex: '1 1 300px' }}>
        <div className="panel-h"><div><h2>Qué hizo Avi</h2><small>Herramientas, bloqueos y costo del último turno.</small></div></div>
        <div className="panel-b" style={{ display: 'grid', gap: 10 }}>
          {!ultimo || ultimo.error ? <span className="muted">Aún no hay turnos.</span> : (
            <>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>{(ultimo.traza ?? []).map((p, i) => <PasoVista key={i} p={p} />)}</ol>
              {ultimo.flujo && <span className="chip acc">Entregó el chat al flujo {ultimo.flujo === 'iniciar_compra' ? 'de compra' : 'de cotización'}</span>}
              {ultimo.asesor && <span className="chip warn">Pasó el chat a un asesor</span>}
              {ultimo.nota && <small className="muted">Nota para el asesor: {ultimo.nota}</small>}
              <small className="muted">{(ultimo.tokens ?? 0).toLocaleString('es-CO')} tokens · {usd(ultimo.costo_usd ?? 0)} este turno · {usd(total)} en la conversación</small>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { herramientasChat, usarHerramienta, type Herramienta, type Resultado } from './acciones'

// F4·61 (RB-07 a RB-12): con «/» o el menú «+» (F4·70) el asesor envía un catálogo, dispara una Acción (Ubicación, Cuentas para pagar…) o
// un flujo (compra, cotización, un bot), además de las respuestas rápidas de siempre. La usan la Bandeja y la Ficha del lead.
export type Rapida = { id: number; atajo: string; titulo: string; texto: string }
type Item = (Herramienta & { rapida?: undefined }) | { tipo: 'rapida'; ref: string; nombre: string; detalle: string; rapida: Rapida }

const GRUPOS: { tipo: Item['tipo']; titulo: string; clave: string }[] = [
  { tipo: 'catalogo', titulo: '📚 Catálogos', clave: 'catalogo catalogos' },
  { tipo: 'accion', titulo: '⚡ Acciones', clave: 'accion acciones' },
  { tipo: 'flujo', titulo: '🧭 Flujos', clave: 'flujo flujos bot' },
  { tipo: 'rapida', titulo: '💬 Respuestas rápidas', clave: 'rapida respuesta' },
]
const ICONO: Record<Item['tipo'], string> = { catalogo: '📚', accion: '⚡', flujo: '🧭', rapida: '💬' }
const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

let guardadas: Herramienta[] | null = null // se piden una vez por pestaña del navegador y al abrir la lista se refrescan

export function useHerramientas({ lead, texto, setTexto, nombreCliente, rapidas, activo, alEnviar }: {
  lead: number; texto: string; setTexto: (t: string) => void; nombreCliente: string; rapidas: Rapida[]; activo: boolean
  alEnviar: (r: Resultado) => void
}) {
  const [lista, setLista] = useState<Herramienta[]>(guardadas ?? [])
  const [boton, setBoton] = useState(false) // abierta desde el menú «+» (sin escribir «/»)
  const [grupo, setGrupo] = useState<Item['tipo'] | null>(null) // el menú «+» abre un solo grupo (Catálogos, Acciones…)
  const [pendiente, setPendiente] = useState<Herramienta | null>(null)
  const [alTerminar, setAlTerminar] = useState<'asesor' | 'bot'>('asesor')
  const [enviando, setEnviando] = useState(false)
  const pedido = useRef(false)

  const barra = activo ? /^\/([^\n]*)$/.exec(texto) : null
  const abierta = activo && !pendiente && (boton || !!barra)

  const cargar = useCallback(async () => {
    const r = await herramientasChat()
    if (!r.error) { guardadas = r.herramientas; setLista(r.herramientas) }
  }, [])
  useEffect(() => {
    if (abierta && !pedido.current) { pedido.current = true; cargar() }
    if (!abierta) pedido.current = false
  }, [abierta, cargar])
  useEffect(() => { setPendiente(null); setBoton(false) }, [lead])
  useEffect(() => { if (!abierta) setGrupo(null) }, [abierta])

  const palabras = limpio(barra?.[1] ?? '').split(/\s+/).filter(Boolean)
  const todos: Item[] = [
    ...lista,
    ...rapidas.map((r): Item => ({ tipo: 'rapida', ref: String(r.id), nombre: `/${r.atajo} · ${r.titulo}`, detalle: r.texto.slice(0, 60), rapida: r })),
  ]
  const items = !abierta ? [] : todos.filter((i) => !grupo || barra || i.tipo === grupo).filter((i) => {
    const donde = limpio(`${GRUPOS.find((g) => g.tipo === i.tipo)!.clave} ${i.nombre}`)
    return palabras.every((p) => donde.split(/[\s/·«»]+/).some((w) => w.startsWith(p)))
  }).slice(0, palabras.length ? 12 : 40)

  function elegir(i: Item) {
    setBoton(false)
    if (i.tipo === 'rapida') {
      setTexto(i.rapida.texto.replaceAll('{nombre}', nombreCliente.trim().split(/\s+/)[0] || 'cliente'))
      return
    }
    setTexto('')
    setAlTerminar('asesor')
    setPendiente(i)
  }

  async function confirmar() {
    if (!pendiente || enviando) return
    setEnviando(true)
    const r = await usarHerramienta(lead, pendiente, alTerminar)
    setEnviando(false)
    setPendiente(null)
    alEnviar(r)
  }

  // Enter o Tab con la lista abierta elige el primero; con la confirmación abierta, Enter envía y Escape cancela.
  function tecla(e: React.KeyboardEvent): boolean {
    if (pendiente) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmar(); return true }
      if (e.key === 'Escape') { e.preventDefault(); setPendiente(null); return true }
      return false
    }
    if (!abierta) return false
    if (e.key === 'Escape') { e.preventDefault(); setBoton(false); if (barra) setTexto(''); return true }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && items.length > 0) { e.preventDefault(); elegir(items[0]); return true }
    return false
  }

  // Desde el menú «+»: abre la lista de un grupo (o todos). Con «/» en la caja se sigue buscando en todos.
  function abrir(tipo: Item['tipo'] | null = null) {
    setPendiente(null); setGrupo(tipo); setBoton(true)
  }

  const panel = pendiente ? (
    <div className="herr-confirmar" role="dialog" aria-label="Confirmar envío">
      <div><b>{ICONO[pendiente.tipo]} {pendiente.nombre}</b>{pendiente.detalle && <small className="muted"> · {pendiente.detalle}</small>}</div>
      {pendiente.tipo === 'flujo' ? (
        <>
          <small className="muted">El bot atiende este tramo con el cliente. Si escribes en el chat, el flujo se detiene y la conversación vuelve a ti.</small>
          <div className="row">
            <span>Al terminar:</span>
            <label className="inline"><input type="radio" checked={alTerminar === 'asesor'} onChange={() => setAlTerminar('asesor')} /> Vuelve a mí</label>
            <label className="inline"><input type="radio" checked={alTerminar === 'bot'} onChange={() => setAlTerminar('bot')} /> Sigue el bot</label>
          </div>
        </>
      ) : (
        <small className="muted">Se envía tal como está configurado{pendiente.tipo === 'accion' ? ' en Agente → Acciones' : ' en Inventario → Catálogos'}, a tu nombre.</small>
      )}
      <div className="row">
        <button type="button" className="btn primary chico" disabled={enviando} onClick={confirmar} autoFocus>
          {enviando ? 'Enviando…' : pendiente.tipo === 'flujo' ? 'Iniciar flujo' : 'Enviar al cliente'}
        </button>
        <button type="button" className="btn chico" disabled={enviando} onClick={() => setPendiente(null)}>Cancelar</button>
        <small className="muted">Enter envía · Esc cancela</small>
      </div>
    </div>
  ) : abierta ? (
    <div className="herr-lista" role="listbox" aria-label="Catálogos, acciones, flujos y respuestas rápidas">
      {items.length === 0 && <small className="muted" style={{ padding: 6 }}>{guardadas === null ? 'Cargando…' : grupo && !barra ? 'No hay nada configurado en este grupo.' : 'Nada coincide. Prueba «/catalogo», «/accion» o «/flujo».'}</small>}
      {GRUPOS.map((g) => {
        const del = items.filter((i) => i.tipo === g.tipo)
        if (!del.length) return null
        return (
          <div key={g.tipo} className="herr-grupo">
            <small>{g.titulo}</small>
            {del.map((i) => (
              <button key={`${i.tipo}-${i.ref}`} type="button" role="option" aria-selected={i === items[0]} className={i === items[0] ? 'on' : undefined} onClick={() => elegir(i)}>
                <b>{i.nombre}</b>{i.detalle && <span className="muted"> — {i.detalle}</span>}
              </button>
            ))}
          </div>
        )
      })}
    </div>
  ) : null

  return { panel, abrir, cerrar: () => setBoton(false), tecla, abierta: abierta || !!pendiente }
}

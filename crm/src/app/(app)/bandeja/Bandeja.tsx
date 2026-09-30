'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clienteNavegador, prepararTiempoReal } from '@/lib/supabase/navegador'
import { asignar, cerrar, liberar, moverEtapa, reanudarBot, responder, tomar, type Resultado } from './acciones'
import { ComponerPlantilla } from './Plantilla'
import { SeguimientosCliente } from './SeguimientosCliente'
import { activarAvisos, avisosActivos } from '@/components/avisos'

type Lead = {
  id: number
  telefono: string
  nombre: string
  etapa: string
  estado_chat: 'bot' | 'cola' | 'asignada' | 'cerrada'
  asignado_a: string | null
  ultimo_mensaje: string
  fecha_ultimo_contacto: string | null
  en_cola_desde: string | null
  primera_respuesta_en: string | null
  minutos_espera: number | null
  paso_menu: string
  categoria_interes: string
  uso_equipo: string
  presupuesto: string
  marca_interes: string
  cotiz_producto: string
  valor_estimado: number | null
  etiquetas: string[]
  motivo_perdido: string | null
  notas: string
}

type Mensaje = {
  id: number
  lado: 'cliente' | 'bot' | 'asesor'
  tipo: string
  texto: string
  creado_en: string
  usuario_id: string | null
  media_ruta: string
  media_mime: string
  media_nombre: string
}

type Persona = { id: string; nombre: string }
type Etapa = { nombre: string; cierre: string; color: string }
type Filtro = 'cola' | 'mias' | 'bot' | 'todas' | 'cerradas'

const COLUMNAS =
  'id, telefono, nombre, etapa, estado_chat, asignado_a, ultimo_mensaje, fecha_ultimo_contacto, en_cola_desde, ' +
  'primera_respuesta_en, paso_menu, categoria_interes, uso_equipo, presupuesto, marca_interes, cotiz_producto, ' +
  'valor_estimado, etiquetas, motivo_perdido, notas, minutos_espera'
const VENTANA_MS = 24 * 60 * 60 * 1000
const MOTIVOS = ['Precio', 'Sin respuesta', 'No calificado', 'Compró en otro lado', 'Solo preguntaba', 'Otro']
const ESTADOS: Record<Lead['estado_chat'], { texto: string; clase: string }> = {
  bot: { texto: 'Bot', clase: 'ok' },
  cola: { texto: 'En cola', clase: 'warn' },
  asignada: { texto: 'Asignada', clase: 'acc' },
  cerrada: { texto: 'Cerrada', clase: 'neu' },
}

const hora = (t: string) => {
  const d = new Date(t)
  const hoy = new Date().toDateString() === d.toDateString()
  return d.toLocaleString('es-CO', hoy
    ? { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' }
    : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' })
}
const iniciales = (s: string) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const pesos = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// El bot guarda las opciones de sus listas y botones al final: "texto\n\n[Ver: A · B]".
function partirOpciones(texto: string) {
  const k = texto.lastIndexOf('\n\n[')
  if (k < 0 || !texto.endsWith(']')) return { cuerpo: texto, opciones: [] as string[] }
  const dentro = texto.slice(k + 3, -1).trim()
  const lista = dentro.includes(': ') ? dentro.split(': ').slice(1).join(': ') : dentro
  return { cuerpo: texto.slice(0, k), opciones: lista.split(' · ').filter(Boolean) }
}

function Media({ m }: { m: Mensaje }) {
  const src = `/media/${m.media_ruta.split('/').map(encodeURIComponent).join('/')}`
  if (m.media_mime.startsWith('image/')) return <a href={src} target="_blank" rel="noreferrer"><img className="m-img" src={src} alt={m.media_nombre || 'Imagen del cliente'} /></a>
  if (m.media_mime.startsWith('audio/')) return <audio className="m-audio" controls preload="none" src={src} />
  if (m.media_mime.startsWith('video/')) return <video className="m-img" controls preload="none" src={src} />
  return <a className="btn chico" href={src} target="_blank" rel="noreferrer">📄 {m.media_nombre || 'Abrir documento'}</a>
}

export function Bandeja({ yo, usuarios, asesores, etapas, inicial }: {
  yo: { id: string; verTodas: boolean; moverEtapas: boolean }
  usuarios: Persona[]
  asesores: Persona[]
  etapas: Etapa[]
  inicial: number | null
}) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [cargado, setCargado] = useState(false)
  const [filtro, setFiltro] = useState<Filtro | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [sel, setSel] = useState<number | null>(inicial)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<Resultado>({})
  const [vivo, setVivo] = useState(false)
  const [perdido, setPerdido] = useState<string | null>(null)
  const [verFicha, setVerFicha] = useState(false)
  const [avisos, setAvisos] = useState(true)
  useEffect(() => setAvisos(avisosActivos()), [])
  const [, tic] = useState(0)
  const selRef = useRef<number | null>(inicial)
  const chat = useRef<HTMLDivElement>(null)
  const nombres = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nombre])), [usuarios])

  const cargarLista = useCallback(async () => {
    const { data } = await clienteNavegador()
      .from('leads')
      .select(COLUMNAS)
      .order('fecha_ultimo_contacto', { ascending: false, nullsFirst: false })
      .limit(300)
    setLeads((data ?? []) as unknown as Lead[])
    setCargado(true)
  }, [])

  const cargarMensajes = useCallback(async (id: number) => {
    const { data } = await clienteNavegador()
      .from('mensajes')
      .select('id, lado, tipo, texto, creado_en, usuario_id, media_ruta, media_mime, media_nombre')
      .eq('lead_id', id)
      .order('creado_en')
      .limit(500)
    if (selRef.current === id) setMensajes((data ?? []) as Mensaje[])
  }, [])

  // Tiempo real: cada cambio en leads recarga la lista (el RLS decide qué llega); un mensaje nuevo de la
  // conversación abierta se agrega al chat. Cada 30 s se recarga igual, por si la conexión se cayó.
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined
    const programar = () => {
      clearTimeout(espera)
      espera = setTimeout(cargarLista, 250)
    }
    cargarLista()
    let canal: ReturnType<ReturnType<typeof clienteNavegador>['channel']> | null = null
    let vigente = true
    prepararTiempoReal().then((supabase) => {
      if (!vigente) return
      canal = supabase
      .channel('bandeja')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, programar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, (p: { new: Record<string, unknown> }) => {
        const nuevo = p.new as unknown as Mensaje & { lead_id: number }
        if (nuevo.lead_id === selRef.current)
          setMensajes((ms) => (ms.some((m) => m.id === nuevo.id) ? ms : [...ms, nuevo]))
        programar()
      })
      .subscribe((estado: string) => setVivo(estado === 'SUBSCRIBED'))
    })
    const respaldo = setInterval(() => {
      cargarLista()
      if (selRef.current) cargarMensajes(selRef.current)
    }, 30000)
    const reloj = setInterval(() => tic((n) => n + 1), 30000)
    return () => {
      clearTimeout(espera)
      clearInterval(respaldo)
      clearInterval(reloj)
      vigente = false
      if (canal) clienteNavegador().removeChannel(canal)
    }
  }, [cargarLista, cargarMensajes])

  useEffect(() => {
    selRef.current = sel
    setMensajes([])
    setAviso({})
    setTexto('')
    if (sel) cargarMensajes(sel)
    const url = new URL(window.location.href)
    if (sel) url.searchParams.set('c', String(sel))
    else url.searchParams.delete('c')
    window.history.replaceState(null, '', url)
  }, [sel, cargarMensajes])

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight })
  }, [mensajes])

  const cuenta = (f: Filtro) => leads.filter((l) => enFiltro(l, f)).length
  function enFiltro(l: Lead, f: Filtro) {
    if (f === 'cola') return l.estado_chat === 'cola'
    if (f === 'mias') return l.estado_chat === 'asignada' && l.asignado_a === yo.id
    if (f === 'bot') return l.estado_chat === 'bot'
    if (f === 'cerradas') return l.estado_chat === 'cerrada'
    return l.estado_chat !== 'cerrada'
  }
  const filtroActivo: Filtro = filtro ?? (cuenta('cola') > 0 ? 'cola' : 'todas')
  const q = busqueda.trim().toLowerCase()
  const visibles = leads.filter(
    (l) => enFiltro(l, filtroActivo) && (!q || l.nombre.toLowerCase().includes(q) || l.telefono.includes(q)),
  )
  const lead = leads.find((l) => l.id === sel) ?? null

  const ultimoCliente = [...mensajes].reverse().find((m) => m.lado === 'cliente')
  const enVentana = !!ultimoCliente && Date.now() - new Date(ultimoCliente.creado_en).getTime() < VENTANA_MS

  async function hacer(accion: () => Promise<Resultado>, ok?: string) {
    setOcupado(true)
    setAviso({})
    const r = await accion()
    setOcupado(false)
    setAviso(r.error ? r : ok ? { ok } : {})
    await cargarLista()
    return !r.error
  }

  async function enviar() {
    if (!lead || !texto.trim() || ocupado) return
    const escrito = texto
    setTexto('')
    const bien = await hacer(() => responder(lead.id, escrito))
    if (!bien) setTexto(escrito)
    else cargarMensajes(lead.id)
  }

  function cambiarEtapa(etapa: string) {
    if (!lead || etapa === lead.etapa) return
    if (etapas.find((e) => e.nombre === etapa)?.cierre === 'perdida') setPerdido(etapa)
    else hacer(() => moverEtapa(lead.id, etapa), `Movido a ${etapa}.`)
  }

  const filtros: { clave: Filtro; texto: string }[] = [
    { clave: 'cola', texto: 'Cola' },
    { clave: 'mias', texto: 'Mías' },
    { clave: 'bot', texto: 'Bot' },
    { clave: 'todas', texto: 'Todas' },
    { clave: 'cerradas', texto: 'Cerradas' },
  ]

  return (
    <section className="bandeja" data-vista={lead ? 'chat' : 'lista'} data-ficha={verFicha && lead ? '1' : '0'}>
      <div className="col b-lista">
        <div className="col-h">
          <h2>Conversaciones</h2>
          {!avisos && (
            <button className="btn chico" onClick={async () => setAvisos(await activarAvisos())} title="Activar sonido y notificación al entrar a la cola y al pasar el SLA">
              🔔 Avisos
            </button>
          )}
          <span className={`vivo${vivo ? '' : ' off'}`} title={vivo ? 'Se actualiza al instante' : 'Reconectando; se actualiza cada 30 s'}>
            {vivo ? 'En vivo' : 'Sin conexión'}
          </span>
        </div>
        <div className="b-filtros">
          {filtros.map((f) => (
            <button key={f.clave} className={`pastilla${filtroActivo === f.clave ? ' activa' : ''}`} onClick={() => setFiltro(f.clave)}>
              {f.texto} <b>{cuenta(f.clave)}</b>
            </button>
          ))}
        </div>
        <div className="b-buscar">
          <input type="search" placeholder="Buscar por nombre o teléfono" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <div className="lista">
          {!cargado && <p className="vacio">Cargando…</p>}
          {cargado && visibles.length === 0 && <p className="vacio">No hay conversaciones aquí.</p>}
          {visibles.map((l) => {
            const espera = l.minutos_espera
            return (
              <button key={l.id} className={`conv${l.id === sel ? ' on' : ''}`} onClick={() => setSel(l.id)}>
                <span className="avatar">{iniciales(l.nombre || l.telefono)}</span>
                <b>{l.nombre || `+${l.telefono}`}</b>
                <time>{l.fecha_ultimo_contacto ? hora(l.fecha_ultimo_contacto) : ''}</time>
                <small>{l.ultimo_mensaje || 'Sin mensajes'}</small>
                <span className="conv-pie">
                  <span className={`chip ${ESTADOS[l.estado_chat].clase}`}>{ESTADOS[l.estado_chat].texto}</span>
                  {espera !== null && (
                    <span className={`chip ${espera >= 15 ? 'bad' : espera >= 10 ? 'warn' : 'neu'}`} title="Minutos hábiles sin respuesta de un asesor (SLA 10 min)">
                      {espera} min sin respuesta
                    </span>
                  )}
                  {l.estado_chat === 'asignada' && l.asignado_a && l.asignado_a !== yo.id && (
                    <span className="chip neu">{nombres.get(l.asignado_a) ?? 'Otro asesor'}</span>
                  )}
                  <span className="chip neu">{l.etapa}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="col b-chat">
        {!lead ? (
          <p className="vacio">Elige una conversación.</p>
        ) : (
          <>
            <div className="col-h">
              <button className="iconbtn b-volver" onClick={() => setSel(null)} aria-label="Volver a la lista">←</button>
              <span className="avatar">{iniciales(lead.nombre || lead.telefono)}</span>
              <div style={{ minWidth: 0 }}>
                <h2>{lead.nombre || `+${lead.telefono}`}</h2>
                <small>+{lead.telefono} · {ESTADOS[lead.estado_chat].texto}
                  {lead.asignado_a ? ` · ${nombres.get(lead.asignado_a) ?? 'otro asesor'}` : ''}</small>
              </div>
              <button className="btn chico b-verficha" onClick={() => setVerFicha(true)}>Cliente y acciones</button>
            </div>
            <div className="chat" ref={chat}>
              {mensajes.map((m) => {
                const { cuerpo, opciones } = m.lado === 'bot' ? partirOpciones(m.texto) : { cuerpo: m.texto, opciones: [] }
                return (
                  <div key={m.id} className={`m ${m.lado}`}>
                    {m.lado === 'asesor' && <span className="m-quien">{nombres.get(m.usuario_id ?? '') ?? 'Asesor'}</span>}
                    {m.media_ruta && <Media m={m} />}
                    {cuerpo}
                    {opciones.length > 0 && (
                      <div className="opts">{opciones.map((o, i) => <span key={i}>{o}</span>)}</div>
                    )}
                    <time>{hora(m.creado_en)}</time>
                  </div>
                )
              })}
            </div>
            <div className="b-responder">
              {aviso.error && <div className="aviso bad" role="alert">{aviso.error}</div>}
              {aviso.ok && <div className="aviso ok">{aviso.ok}</div>}
              {mensajes.length === 0 ? (
                <small className="muted">Cargando…</small>
              ) : !enVentana ? (
                <ComponerPlantilla key={lead.id} lead={lead.id} nombreCliente={lead.nombre}
                  alEnviar={() => { cargarMensajes(lead.id); cargarLista() }} />
              ) : (
                <>
                  {lead.estado_chat !== 'asignada' && (
                    <small className="muted">Al responder tomas la conversación y el bot deja de contestarle.</small>
                  )}
                  <div className="b-caja">
                    <textarea
                      rows={2}
                      placeholder="Escribe tu respuesta · Enter envía, Shift+Enter hace salto de línea"
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          enviar()
                        }
                      }}
                    />
                    <button className="btn primary" disabled={ocupado || !texto.trim()} onClick={enviar}>
                      {ocupado ? 'Enviando…' : 'Enviar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="col b-ficha">
        <div className="col-h">
          <h2>Cliente</h2>
          <button className="iconbtn b-verficha" style={{ marginLeft: 'auto' }} onClick={() => setVerFicha(false)} aria-label="Cerrar">✕</button>
        </div>
        {!lead ? (
          <p className="vacio">Sin conversación abierta.</p>
        ) : (
          <div className="b-datos">
            <div className="row">
              {lead.estado_chat !== 'asignada' || lead.asignado_a !== yo.id ? (
                <button className="btn primary chico" disabled={ocupado} onClick={() => hacer(() => tomar(lead.id), 'La tomaste: el bot ya no le contesta.')}>Tomar</button>
              ) : (
                <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => liberar(lead.id), 'Devuelta a la cola.')}>Devolver a la cola</button>
              )}
              {lead.estado_chat !== 'bot' && lead.estado_chat !== 'cerrada' && (
                <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => reanudarBot(lead.id), 'El bot la atiende de nuevo desde el menú de inicio.')}>Devolver al bot</button>
              )}
              {lead.estado_chat !== 'cerrada' && (
                <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => cerrar(lead.id), 'Conversación cerrada.')}>Cerrar</button>
              )}
            </div>
            {yo.verTodas && (
              <label className="field">
                Asignar a
                <select value={lead.asignado_a ?? ''} disabled={ocupado}
                  onChange={(e) => e.target.value && hacer(() => asignar(lead.id, e.target.value), 'Asignada.')}>
                  <option value="">Sin asignar</option>
                  {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              Etapa
              <select value={lead.etapa} disabled={ocupado || !yo.moverEtapas} onChange={(e) => cambiarEtapa(e.target.value)}>
                {etapas.map((e) => <option key={e.nombre} value={e.nombre}>{e.nombre}</option>)}
              </select>
            </label>
            {lead.motivo_perdido && <Dato titulo="Motivo de pérdida" valor={lead.motivo_perdido} />}
            <Dato titulo="Teléfono" valor={`+${lead.telefono}`} />
            <Dato titulo="Busca" valor={lead.categoria_interes} />
            <Dato titulo="Uso" valor={lead.uso_equipo} />
            <Dato titulo="Presupuesto" valor={lead.presupuesto} />
            <Dato titulo="Marca" valor={lead.marca_interes} />
            <Dato titulo="Equipo de interés" valor={lead.cotiz_producto} />
            <Dato titulo="Valor estimado" valor={lead.valor_estimado ? pesos(Number(lead.valor_estimado)) : ''} />
            <Dato titulo="Paso del bot" valor={lead.estado_chat === 'bot' ? lead.paso_menu : ''} />
            {lead.etiquetas?.length > 0 && (
              <div className="dato">
                <small>Etiquetas</small>
                <div className="row" style={{ gap: 5 }}>{lead.etiquetas.map((t) => <span key={t} className="chip neu">{t}</span>)}</div>
              </div>
            )}
            <Dato titulo="Notas" valor={lead.notas} />
            <SeguimientosCliente key={lead.id} lead={lead.id} nombres={nombres} puedeAgendar={yo.moverEtapas} />
          </div>
        )}
      </div>

      {perdido && lead && (
        <div className="modal" onClick={() => setPerdido(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Motivo de pérdida">
            <h3>¿Por qué se perdió?</h3>
            <div className="row">
              {MOTIVOS.map((m) => (
                <button key={m} className="btn" disabled={ocupado} onClick={async () => {
                  const etapa = perdido
                  setPerdido(null)
                  await hacer(() => moverEtapa(lead.id, etapa, m), `Marcado como ${etapa}: ${m}.`)
                }}>{m}</button>
              ))}
            </div>
            <button className="btn chico" onClick={() => setPerdido(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  if (!valor) return null
  return (
    <div className="dato">
      <small>{titulo}</small>
      <div>{valor}</div>
    </div>
  )
}

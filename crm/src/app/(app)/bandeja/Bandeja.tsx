'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clienteNavegador, prepararTiempoReal } from '@/lib/supabase/navegador'
import { asignar, cerrar, liberar, reanudarBot, responder, tomar, type Resultado } from './acciones'
import { ComprobanteCliente } from './ComprobanteCliente'
import { useHerramientas } from './Herramientas'
import { useAdjuntos } from './Adjuntos'
import { OportunidadesCliente, type Embudo, type Etapa } from './OportunidadesCliente'
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

export type Mensaje = {
  id: number
  lado: 'cliente' | 'bot' | 'asesor'
  tipo: string
  texto: string
  creado_en: string
  usuario_id: string | null
  media_ruta: string
  media_mime: string
  media_nombre: string
  estado_entrega: '' | 'enviado' | 'entregado' | 'leido' | 'fallido'
  error_meta: string
  automatico?: boolean // F4·45: «¿Sigues necesitando ayuda?» o el aviso de demora
}

type Persona = { id: string; nombre: string }
type Filtro = 'cola' | 'mias' | 'bot' | 'todas' | 'cerradas'

const COLUMNAS =
  'id, telefono, nombre, etapa, estado_chat, asignado_a, ultimo_mensaje, fecha_ultimo_contacto, en_cola_desde, ' +
  'primera_respuesta_en, paso_menu, categoria_interes, uso_equipo, presupuesto, marca_interes, cotiz_producto, ' +
  'valor_estimado, etiquetas, motivo_perdido, notas, minutos_espera'
const VENTANA_MS = 24 * 60 * 60 * 1000
const ESTADOS: Record<Lead['estado_chat'], { texto: string; clase: string }> = {
  bot: { texto: 'Bot', clase: 'ok' },
  cola: { texto: 'En cola', clase: 'warn' },
  asignada: { texto: 'Asignada', clase: 'acc' },
  cerrada: { texto: 'Cerrada', clase: 'neu' },
}

export const hora = (t: string) => {
  const d = new Date(t)
  const hoy = new Date().toDateString() === d.toDateString()
  return d.toLocaleString('es-CO', hoy
    ? { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' }
    : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' })
}
export const iniciales = (s: string) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const pesos = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
// F4·38: cada cliente conserva su color, para reconocerlo de un vistazo en la lista.
const colorAvatar = (id: number) => ({ background: `hsl(${(id * 47) % 360} 42% 40%)` })

// El bot guarda las opciones de sus listas y botones al final: "texto\n\n[Ver: A · B]".
export function partirOpciones(texto: string) {
  const k = texto.lastIndexOf('\n\n[')
  if (k < 0 || !texto.endsWith(']')) return { cuerpo: texto, opciones: [] as string[] }
  const dentro = texto.slice(k + 3, -1).trim()
  const lista = dentro.includes(': ') ? dentro.split(': ').slice(1).join(': ') : dentro
  return { cuerpo: texto.slice(0, k), opciones: lista.split(' · ').filter(Boolean) }
}

// RM-07: el último estado que informó Meta, como en WhatsApp.
export function Entrega({ m }: { m: Mensaje }) {
  if (m.lado === 'cliente' || !m.estado_entrega) return null
  if (m.estado_entrega === 'fallido')
    return <span className="m-entrega fallido" title={m.error_meta || 'Meta no lo entregó'}>✗ No entregado</span>
  const titulo = { enviado: 'Enviado', entregado: 'Entregado', leido: 'Leído' }[m.estado_entrega]
  return <span className={`m-entrega ${m.estado_entrega}`} title={titulo} aria-label={titulo}>{m.estado_entrega === 'enviado' ? '✓' : '✓✓'}</span>
}

export function Media({ m }: { m: Mensaje }) {
  const src = `/media/${m.media_ruta.split('/').map(encodeURIComponent).join('/')}`
  if (m.media_mime.startsWith('image/')) return <a href={src} target="_blank" rel="noreferrer"><img className="m-img" src={src} alt={m.media_nombre || 'Imagen del cliente'} /></a>
  if (m.media_mime.startsWith('audio/')) return <audio className="m-audio" controls preload="none" src={src} />
  if (m.media_mime.startsWith('video/')) return <video className="m-img" controls preload="none" src={src} />
  return <a className="btn chico" href={src} target="_blank" rel="noreferrer">📄 {m.media_nombre || 'Abrir documento'}</a>
}

export function Bandeja({ yo, usuarios, asesores, embudos, etapas, rapidas, inicial }: {
  yo: { id: string; verTodas: boolean; moverEtapas: boolean; validarPagos: boolean }
  usuarios: Persona[]
  asesores: Persona[]
  embudos: Embudo[]
  etapas: Etapa[]
  rapidas: { id: number; atajo: string; titulo: string; texto: string }[]
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
  const [abiertas, setAbiertas] = useState<Map<number, string[]>>(new Map())
  const [versionOps, setVersionOps] = useState(0)
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
      .is('archivado_en', null) // archivados y papelera salen de la Bandeja; si el cliente escribe, se desarchiva solo (F4·30 E)
      .is('eliminado_en', null)
      .order('fecha_ultimo_contacto', { ascending: false, nullsFirst: false })
      .limit(300)
    setLeads((data ?? []) as unknown as Lead[])
    // Las oportunidades abiertas de cada cliente, para mostrarlas en la lista (RE-02).
    const { data: ops } = await clienteNavegador()
      .from('oportunidades')
      .select('lead_id, embudos(nombre), etapas(nombre)')
      .eq('estado', 'abierta')
    const mapa = new Map<number, string[]>()
    for (const o of (ops ?? []) as unknown as { lead_id: number; embudos: { nombre: string }; etapas: { nombre: string } }[])
      mapa.set(o.lead_id, [...(mapa.get(o.lead_id) ?? []), `${o.embudos.nombre} · ${o.etapas.nombre}`])
    setAbiertas(mapa)
    setCargado(true)
  }, [])

  // F4·31: con muchos clientes a la vez, cada cambio trae solo los chats que cambiaron (no los 300). La lista completa se
  // recarga cada 30 s como respaldo (y para el contador de espera, que calcula la base).
  const actualizarLeads = useCallback(async (ids: number[]) => {
    if (!ids.length) return
    const sb = clienteNavegador()
    const [{ data }, { data: ops }] = await Promise.all([
      sb.from('leads').select(COLUMNAS).in('id', ids).is('archivado_en', null).is('eliminado_en', null),
      sb.from('oportunidades').select('lead_id, embudos(nombre), etapas(nombre)').eq('estado', 'abierta').in('lead_id', ids),
    ])
    const nuevos = new Map(((data ?? []) as unknown as Lead[]).map((l) => [l.id, l]))
    const fecha = (l: Lead) => (l.fecha_ultimo_contacto ? Date.parse(l.fecha_ultimo_contacto) : 0)
    setLeads((ls) => {
      const resto = ls.filter((l) => !ids.includes(l.id))  // un chat que ya no llega (archivado o sin permiso) sale de la lista
      return [...resto, ...nuevos.values()].sort((a, b) => fecha(b) - fecha(a)).slice(0, 300)
    })
    setAbiertas((m) => {
      const mapa = new Map(m)
      for (const id of ids) mapa.delete(id)
      for (const o of (ops ?? []) as unknown as { lead_id: number; embudos: { nombre: string }; etapas: { nombre: string } }[])
        mapa.set(o.lead_id, [...(mapa.get(o.lead_id) ?? []), `${o.embudos.nombre} · ${o.etapas.nombre}`])
      return mapa
    })
  }, [])

  const cargarMensajes = useCallback(async (id: number) => {
    const { data } = await clienteNavegador()
      .from('mensajes')
      .select('id, lado, tipo, texto, creado_en, usuario_id, media_ruta, media_mime, media_nombre, estado_entrega, error_meta, automatico')
      .eq('lead_id', id)
      .order('creado_en')
      .limit(500)
    if (selRef.current === id) setMensajes((data ?? []) as Mensaje[])
  }, [])

  // Tiempo real: cada cambio en leads trae solo ese chat (el RLS decide qué llega); los cambios de 250 ms se juntan en una
  // consulta. Un mensaje nuevo de la conversación abierta se agrega al chat. Cada 30 s se recarga todo, por si la conexión se cayó.
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined
    const pendientes = new Set<number>()
    const programar = (p?: { new?: Record<string, unknown>; old?: Record<string, unknown> }, campo = 'id') => {
      const id = Number(p?.new?.[campo] ?? p?.old?.[campo])
      if (id) pendientes.add(id)
      if (espera) return  // ya hay una consulta programada: con mensajes seguidos no se pospone sin fin
      espera = setTimeout(() => {
        espera = undefined
        const ids = [...pendientes]
        pendientes.clear()
        actualizarLeads(ids)
      }, 250)
    }
    cargarLista()
    let canal: ReturnType<ReturnType<typeof clienteNavegador>['channel']> | null = null
    let vigente = true
    prepararTiempoReal().then((supabase) => {
      if (!vigente) return
      canal = supabase
      .channel('bandeja')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (p: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => programar(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, (p: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
        setVersionOps((v) => v + 1)
        programar(p, 'lead_id')
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, (p: { new: Record<string, unknown> }) => {
        const nuevo = p.new as unknown as Mensaje & { lead_id: number }
        if (nuevo.lead_id === selRef.current)
          setMensajes((ms) => (ms.some((m) => m.id === nuevo.id) ? ms : [...ms, nuevo]))
        programar(p, 'lead_id')
      })
      // El estado de entrega llega después, como una actualización del mensaje (RM-07).
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes' }, (p: { new: Record<string, unknown> }) => {
        const cambio = p.new as unknown as Mensaje & { lead_id: number }
        if (cambio.lead_id === selRef.current)
          setMensajes((ms) => ms.map((m) => (m.id === cambio.id
            ? { ...m, estado_entrega: cambio.estado_entrega, error_meta: cambio.error_meta } : m)))
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
  }, [cargarLista, cargarMensajes, actualizarLeads])

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

  // «/» o ⚡ (RBOT-08 y F4·61): respuestas rápidas (el texto queda para revisarlo), catálogos, acciones y flujos.
  const herramientas = useHerramientas({
    lead: lead?.id ?? 0, texto, setTexto, nombreCliente: lead?.nombre ?? '', rapidas, activo: !!lead && enVentana,
    alEnviar: (r) => { setAviso(r); if (lead) cargarMensajes(lead.id); cargarLista() },
  })
  // 😊 y 📎 (F4·62): emojis y archivos; también arrastrando al chat o pegando con Ctrl+V.
  const caja = useRef<HTMLTextAreaElement>(null)
  const adjuntos = useAdjuntos({
    lead: lead?.id ?? 0, activo: !!lead && enVentana, setTexto, area: caja,
    alEnviar: (r) => { setAviso(r); if (lead) cargarMensajes(lead.id); cargarLista() },
  })

  async function enviar() {
    if (!lead || !texto.trim() || ocupado) return
    const escrito = texto
    setTexto('')
    const bien = await hacer(() => responder(lead.id, escrito))
    if (!bien) setTexto(escrito)
    else cargarMensajes(lead.id)
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
                <span className="avatar" style={colorAvatar(l.id)}>{iniciales(l.nombre || l.telefono)}</span>
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
                  {l.etiquetas?.includes('Agente') && (
                    <span className="chip acc" title="Avi, el agente de IA, atendió esta conversación">🤖 Avi</span>
                  )}
                  {l.etiquetas?.includes('Revisar-Agente') && (
                    <span className="chip warn" title="Avi no pudo responder sin inventar un dato o llegó a un límite: revisa la conversación">Revisar Avi</span>
                  )}
                  {(abiertas.get(l.id) ?? []).map((t) => <span key={t} className="chip neu">{t}</span>)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className={`col b-chat${adjuntos.encima ? ' adj-encima' : ''}`} {...adjuntos.zona}>
        {!lead ? (
          <p className="vacio">Elige una conversación.</p>
        ) : (
          <>
            <div className="col-h">
              <button className="iconbtn b-volver" onClick={() => setSel(null)} aria-label="Volver a la lista">←</button>
              <span className="avatar" style={colorAvatar(lead.id)}>{iniciales(lead.nombre || lead.telefono)}</span>
              <div style={{ minWidth: 0 }}>
                <h2>{lead.nombre || `+${lead.telefono}`}</h2>
                <small>+{lead.telefono} · {ESTADOS[lead.estado_chat].texto}
                  {lead.asignado_a ? ` · ${nombres.get(lead.asignado_a) ?? 'otro asesor'}` : ''}</small>
              </div>
              <a className="btn chico" href={`/leads/${lead.id}`} style={{ marginLeft: 'auto' }}>Ficha completa</a>
              <button className="btn chico b-verficha" onClick={() => setVerFicha(true)}>Cliente y acciones</button>
            </div>
            <div className="chat" ref={chat}>
              {mensajes.map((m) => {
                const { cuerpo, opciones } = m.lado === 'bot' ? partirOpciones(m.texto) : { cuerpo: m.texto, opciones: [] }
                return (
                  <div key={m.id} className={`m ${m.lado}`}>
                    {m.lado === 'asesor' && <span className="m-quien">{nombres.get(m.usuario_id ?? '') ?? 'Asesor'}</span>}
                    {m.automatico && <span className="m-quien" title="Mensaje automático del retorno (F4·45)">🤖 automático</span>}
                    {m.media_ruta && <Media m={m} />}
                    {cuerpo}
                    {opciones.length > 0 && (
                      <div className="opts">{opciones.map((o, i) => <span key={i}>{o}</span>)}</div>
                    )}
                    <time>{hora(m.creado_en)} <Entrega m={m} /></time>
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
                  {herramientas.panel}
                  {adjuntos.panel}
                  <div className="b-caja">
                    {adjuntos.botones}
                    {herramientas.botonRayo}
                    <textarea
                      ref={caja}
                      onPaste={adjuntos.alPegar}
                      rows={2}
                      placeholder="Escribe tu respuesta · Enter envía, Shift+Enter hace salto de línea · / para catálogos, acciones y respuestas rápidas"
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (herramientas.tecla(e)) return
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
            <div className="b-cliente">
              <span className="avatar" style={colorAvatar(lead.id)}>{iniciales(lead.nombre || lead.telefono)}</span>
              <b>{lead.nombre || `+${lead.telefono}`}</b>
              {lead.nombre && <small>+{lead.telefono}</small>}
            </div>
            <div className="row">
              {lead.estado_chat !== 'asignada' || lead.asignado_a !== yo.id ? (
                <button className="btn primary chico" disabled={ocupado} onClick={() => hacer(() => tomar(lead.id), 'La tomaste: el bot ya no le contesta.')}>Tomar</button>
              ) : (
                <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => liberar(lead.id), 'Devuelta a la cola.')}>Devolver a la cola</button>
              )}
              {lead.estado_chat !== 'bot' && lead.estado_chat !== 'cerrada' && (
                <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => reanudarBot(lead.id), 'El bot la atiende de nuevo (al inicio del bot de destino de «Retorno y seguimiento»).')}>Devolver al bot</button>
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
            {yo.validarPagos && <ComprobanteCliente key={`pago-${lead.id}`} lead={lead.id} version={versionOps} alCambiar={cargarLista} />}
            <OportunidadesCliente key={`op-${lead.id}`} lead={lead.id} embudos={embudos} etapas={etapas} puede={yo.moverEtapas}
              version={versionOps} alCambiar={cargarLista} />
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
            <SeguimientosCliente key={`seg-${lead.id}`} lead={lead.id} nombres={nombres} puedeAgendar={yo.moverEtapas} />
          </div>
        )}
      </div>

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

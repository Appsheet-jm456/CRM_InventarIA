'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { numeroPedido } from '../leads/[id]/pedido/pedido'
import { autorizarVideoCorregido, enviarAlCliente, marcarChecklist, marcarListo, reabrirPedido, tomarPedido, type Resultado } from './acciones'
import { VideosEquipo, type Video } from './VideosEquipo'
import { Icono } from '@/components/Iconos'

export type Pedido = {
  id: number
  numero: number
  cliente: string
  entrega: 'envio' | 'tienda' | null
  equipos: { codigo: string; nombre: string }[]
  doc_tipo: 'OP' | 'FVE' | null
  doc_numero: string | null
  estado: 'por_revisar' | 'en_revision' | 'listo'
  tecnico: string | null
  tomado_en: string | null
  listo_en: string | null
  listo_por: string | null
  checklist: Record<string, { por: string; en: string }>
  entro_en: string
  videos: Video[]
}

// F4·54 (RPD-29): pedido cerrado (Vendido o Perdido) de los últimos 6 meses, en la pestaña «Cerrados».
export type PedidoCerrado = Pedido & {
  cerrado_en: string | null; cierre: string; correccion_video_autorizada_en: string | null; correccion_video_motivo: string | null
  // 0062 (RPD-39, RPD-40): para reenviar el video corregido desde el panel
  lead_id: number; video_enviado_en: string | null; correccion_video_en: string | null; correccion_video_id: number | null
  ventana_meta_hasta: string | null
}

export type Reporte = {
  desde: string; hasta: string
  totales: { pedidos: number; listos: number; despachados: number; entregados_tienda: number; horas_entrada_a_listo: number | null; horas_listo_a_guia: number | null }
  por_tecnico: { tecnico: string; tomados: number; listos: number; videos: number; horas_revision: number | null }[]
}

const horas = (h: number | null) => h === null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString('es-CO')} h`

export const CHECKLIST: [string, string][] = [
  ['revision', 'Revisión'], ['inspeccion', 'Inspección'], ['mantenimiento', 'Mantenimiento'],
  ['pasta_termica', 'Cambio de pasta térmica'], ['prueba_funcional', 'Prueba funcional'],
]
export const ESTADO: Record<Pedido['estado'], { texto: string; clase: string }> = {
  por_revisar: { texto: 'Por revisar', clase: 'warn' },
  en_revision: { texto: 'En revisión', clase: 'acc' },
  listo: { texto: 'Listo para despachar', clase: 'ok' },
}
export const hora = (t: string) => new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
const GUARDADO = 'servicio-tecnico:quien'

// F4·50 bloque A (RAL-01 a RAL-09): un solo usuario para el servicio técnico; «¿Quién eres?» se recuerda en este navegador y va en cada acción.
// F4·56 (RAL-11 a RAL-14): tabla como en Pedidos; al tocar un pedido se abre su resumen y ahí se modifica mientras no esté cerrado.
type Fila = Pedido & Partial<Omit<PedidoCerrado, keyof Pedido>> & { cerrado?: boolean }

const equiposDe = (p: Pedido) => (p.equipos.length ? p.equipos : [{ codigo: 'pedido', nombre: 'Equipo del pedido' }])
const conVideo = (p: Pedido) => equiposDe(p).filter((e) => (p.videos ?? []).some((v) => v.equipo_codigo === e.codigo && v.estado === 'listo')).length
const hechos = (p: Pedido) => CHECKLIST.filter(([k]) => p.checklist[k]).length
const hace = (t: string) => {
  const h = (Date.now() - new Date(t).getTime()) / 3600000
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} días`
}

function PasosTecnico({ p, chico = false }: { p: Fila; chico?: boolean }) {
  const pasos = [
    { t: 'Por revisar', hecho: true, cuando: p.entro_en },
    { t: 'En revisión', hecho: p.estado !== 'por_revisar', cuando: p.tomado_en },
    { t: 'Listo', hecho: p.estado === 'listo', cuando: p.listo_en },
  ]
  const actual = pasos.findIndex((x) => !x.hecho)
  if (chico) {
    return (
      <span className="pd-flujo">
        {pasos.map((x, i) => <span key={x.t} className={`pd-punto${x.hecho ? ' hecho' : ''}${i === actual ? ' actual' : ''}`} title={x.t} />)}
      </span>
    )
  }
  return (
    <ol className="ped-pasos" aria-label="Pasos del servicio técnico">
      {pasos.map((x, i) => (
        <li key={x.t} className={`ped-paso${x.hecho ? ' hecho' : ''}${i === actual ? ' actual' : ''}`}>
          <span className="pt">{x.hecho ? <Icono nombre="chulo" /> : i + 1}</span>
          <span className="pn">{x.t}</span>
          <small>{x.hecho && x.cuando ? hora(x.cuando) : ''}</small>
        </li>
      ))}
    </ol>
  )
}

export function ServicioTecnico({ pedidos, cerrados, puedeCorregir, puedeEnviar, tecnicos, error, reporte }: {
  pedidos: Pedido[]; cerrados: PedidoCerrado[]; puedeCorregir: boolean; puedeEnviar: boolean; tecnicos: string[]; error: string | null; reporte: Reporte | null
}) {
  const router = useRouter()
  const [quien, setQuien] = useState('')
  const [aviso, setAviso] = useState<Resultado & { pedido?: number }>({})
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [ver, setVer] = useState<'activos' | 'listos' | 'cerrados' | 'reporte'>('activos')
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState<number | null>(null)

  useEffect(() => {
    try { const q = localStorage.getItem(GUARDADO); if (q && tecnicos.includes(q)) setQuien(q) } catch { /* sin almacenamiento: se elige cada vez */ }
    const t = setInterval(() => router.refresh(), 30000) // pedidos nuevos sin recargar
    return () => clearInterval(t)
  }, [router, tecnicos])

  function elegir(nombre: string) {
    setQuien(nombre)
    try { localStorage.setItem(GUARDADO, nombre) } catch { /* nada */ }
  }

  async function hacer(pedido: number, accion: () => Promise<Resultado>, pregunta?: string) {
    if (!quien) { setAviso({ error: 'Primero elige quién eres (arriba).', pedido }); return }
    if (pregunta && !confirm(pregunta)) return
    setOcupado(pedido)
    const r = await accion()
    setOcupado(null)
    setAviso({ ...r, pedido })
    router.refresh()
  }

  async function autorizar(p: Fila) {
    const motivo = prompt(`¿Por qué hay que cambiar el video del pedido ${numeroPedido(p.numero)}? (queda en el historial)`)?.trim()
    if (!motivo) return
    setOcupado(p.id)
    const r = await autorizarVideoCorregido(p.id, null, motivo)
    setOcupado(null)
    setAviso({ ...r, pedido: p.id })
    router.refresh()
  }

  // RPD-39: enviar al cliente no necesita «¿Quién eres?» (lo hace quien gestiona oportunidades)
  async function enviarVideo(p: Fila) {
    if (!confirm('¿Enviar el video al cliente por WhatsApp? Se envía una sola vez.')) return
    setOcupado(p.id)
    const r = await enviarAlCliente(p.id, p.lead_id ?? 0, 'video')
    setOcupado(null)
    setAviso({ ...r, pedido: p.id })
    router.refresh()
  }

  // RPD-38: al cambiar el video de un pedido cerrado, primero el motivo y la autorización (en el mismo clic)
  async function prepararCambio(p: Fila): Promise<string | null> {
    if (!quien) return 'Primero elige quién eres (arriba).'
    const motivo = prompt(`¿Por qué cambias el video del pedido ${numeroPedido(p.numero)}? (queda en el historial)`)?.trim()
    if (!motivo) return ''
    const r = await autorizarVideoCorregido(p.id, p.lead_id ?? null, motivo)
    return r.error ?? null
  }

  const activos = pedidos.filter((p) => p.estado !== 'listo')
  const listos = pedidos.filter((p) => p.estado === 'listo')
  const todos: Fila[] = useMemo(() => [...pedidos, ...cerrados.map((c) => ({ ...c, cerrado: true }))], [pedidos, cerrados])
  const base: Fila[] = ver === 'listos' ? listos : ver === 'cerrados' ? cerrados.map((c) => ({ ...c, cerrado: true })) : activos
  const q = texto.trim().toLowerCase()
  const lista = q ? base.filter((p) => [numeroPedido(p.numero), p.cliente, p.doc_numero, ...p.equipos.flatMap((e) => [e.codigo, e.nombre])]
    .some((c) => (c ?? '').toLowerCase().includes(q))) : base
  const sel = abierto ? todos.find((p) => p.id === abierto) ?? null : null

  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>Servicio técnico</h2>
          <small>Pedidos pagados en Alistamiento. Toca un pedido para ver su resumen: tómalo, marca lo que le hiciste, sube el video y pulsa «Revisado, listo para despachar».</small>
        </div>
        <label className="field" style={{ minWidth: 220 }}>
          ¿Quién eres?
          <select value={quien} onChange={(e) => elegir(e.target.value)} aria-invalid={!quien}>
            <option value="">— elige tu nombre —</option>
            {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
        {error && <div className="aviso bad" role="alert">{error}</div>}
        {!quien && <div className="aviso warn">Elige tu nombre arriba: queda registrado en cada pedido que tomes.</div>}
        <div className="row" style={{ gap: 6 }}>
          <button className={`pastilla${ver === 'activos' ? ' activa' : ''}`} onClick={() => setVer('activos')}>Por hacer ({activos.length})</button>
          <button className={`pastilla${ver === 'listos' ? ' activa' : ''}`} onClick={() => setVer('listos')}>Listos para despachar ({listos.length})</button>
          <button className={`pastilla${ver === 'cerrados' ? ' activa' : ''}`} onClick={() => setVer('cerrados')}>Cerrados ({cerrados.length})</button>
          {reporte && <button className={`pastilla${ver === 'reporte' ? ' activa' : ''}`} onClick={() => setVer('reporte')}>Reporte</button>}
        </div>

        {ver === 'reporte' && reporte && (
          <div style={{ display: 'grid', gap: 10 }}>
            <small className="muted">Últimos 30 días ({reporte.desde} a {reporte.hasta}), por la fecha en que el pedido entró a Alistamiento o el técnico lo tomó.</small>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {([['Pedidos', reporte.totales.pedidos], ['Listos', reporte.totales.listos], ['Despachados (guía)', reporte.totales.despachados],
                ['Entregados en tienda', reporte.totales.entregados_tienda], ['Entrada → listo', horas(reporte.totales.horas_entrada_a_listo)],
                ['Listo → guía', horas(reporte.totales.horas_listo_a_guia)]] as const).map(([t, v]) => (
                <div key={t} className="dato" style={{ minWidth: 140 }}><small>{t}</small><div><b>{v}</b></div></div>
              ))}
            </div>
            <table>
              <thead><tr><th>Técnico</th><th>Pedidos tomados</th><th>Listos</th><th>Videos subidos</th><th>Tiempo de revisión (promedio)</th></tr></thead>
              <tbody>
                {reporte.por_tecnico.map((t) => (
                  <tr key={t.tecnico}><td>{t.tecnico}</td><td>{t.tomados}</td><td>{t.listos}</td><td>{t.videos}</td><td>{horas(t.horas_revision)}</td></tr>
                ))}
                {!reporte.por_tecnico.length && <tr><td colSpan={5} className="muted">Todavía no hay pedidos tomados en estos días.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {ver !== 'reporte' && (
          <>
            <div className="pd-filtros">
              <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar cliente, PED, código del equipo o FVE" aria-label="Buscar" />
            </div>
            {ver === 'cerrados' && <small className="muted">Pedidos cerrados de los últimos 6 meses. Solo se ven; para cambiar un video, alguien con permiso «Corregir pedidos» lo autoriza con un motivo y luego se sube aquí.</small>}
            <div className="pd-tabla">
              <table>
                <thead>
                  <tr><th>Pedido</th><th>Cliente</th><th>Producto</th><th>Entrega</th><th>Estado</th><th>Técnico</th><th>Videos</th><th>Revisión</th><th>Documento</th></tr>
                </thead>
                <tbody>
                  {lista.map((p) => {
                    const n = equiposDe(p).length
                    return (
                      <tr key={p.id} className={`pd-fila${abierto === p.id ? ' activa' : ''}`} tabIndex={0} onClick={() => { setAbierto(p.id); setAviso({}) }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { setAbierto(p.id); setAviso({}) } }}>
                        <td><b>{numeroPedido(p.numero)}</b><small className="pd-sub">{p.cerrado ? `${p.cierre ?? 'Cerrado'}${p.cerrado_en ? ` · ${hora(p.cerrado_en)}` : ''}` : `entró hace ${hace(p.entro_en)}`}</small></td>
                        <td><b>{p.cliente}</b></td>
                        <td>{equiposDe(p).map((e) => <div key={e.codigo}>{e.nombre}{e.codigo !== 'pedido' && <small className="pd-sub">{e.codigo}</small>}</div>)}</td>
                        <td>{p.entrega === 'envio' ? 'Envío' : p.entrega === 'tienda' ? 'Tienda' : <span className="muted">Sin definir</span>}</td>
                        <td><PasosTecnico p={p} chico /><small className="pd-sub">
                          <span className={`chip ${p.cerrado ? 'neu' : ESTADO[p.estado].clase}`}>{p.cerrado ? 'Cerrado' : ESTADO[p.estado].texto}</span></small></td>
                        <td>{p.tecnico ?? <span className="muted">Sin tomar</span>}{p.tomado_en && !p.cerrado && p.estado === 'en_revision' && <small className="pd-sub">hace {hace(p.tomado_en)}</small>}</td>
                        <td>{conVideo(p) >= n ? <span className="pd-ok"><Icono nombre="chulo" />{conVideo(p)} de {n}</span> : <span className={p.estado === 'por_revisar' ? 'muted' : 'ped-aviso'}>{conVideo(p)} de {n}</span>}</td>
                        <td>{hechos(p)} de {CHECKLIST.length}</td>
                        <td>{p.doc_numero ? <span className="chip ok">{p.doc_tipo} {p.doc_numero}</span> : <span className="chip warn">Falta</span>}</td>
                      </tr>
                    )
                  })}
                  {!lista.length && <tr><td colSpan={9} className="muted">{ver === 'activos' ? 'No hay pedidos por alistar.' : ver === 'listos' ? 'No hay pedidos listos esperando despacho.' : 'No hay pedidos cerrados con este filtro.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {sel && (
        <div className="pd-fondo" onClick={() => setAbierto(null)}>
          <aside className="pd-cajon" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Pedido ${numeroPedido(sel.numero)}`}>
            <div className="pd-cajon-h">
              <div><b>Pedido {numeroPedido(sel.numero)} · {sel.cliente}</b>
                <small className="pd-sub">{sel.entrega === 'envio' ? 'Envío' : sel.entrega === 'tienda' ? 'Recoge en tienda' : 'Entrega sin definir'} · entró {hora(sel.entro_en)}</small></div>
              <button className="btn chico" onClick={() => setAbierto(null)} aria-label="Cerrar">✕</button>
            </div>
            <div className="pd-cajon-b">
              <Resumen p={sel} quien={quien} ocupado={ocupado === sel.id} puedeCorregir={puedeCorregir} puedeEnviar={puedeEnviar}
                aviso={aviso.pedido === sel.id ? aviso : {}} enviar={() => enviarVideo(sel)} preparar={() => prepararCambio(sel)}
                hacer={(accion, pregunta) => hacer(sel.id, accion, pregunta)} autorizar={() => autorizar(sel)}
                alSubir={(r) => { setAviso({ ...r, pedido: sel.id }); router.refresh() }} />
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}

// RAL-12 y RAL-13: el resumen del pedido para el técnico; las acciones salen solo mientras el pedido no está cerrado.
function Resumen({ p, quien, ocupado, puedeCorregir, puedeEnviar, aviso, hacer, autorizar, alSubir, enviar, preparar }: {
  p: Fila; quien: string; ocupado: boolean; puedeCorregir: boolean; puedeEnviar: boolean; aviso: Resultado
  enviar: () => void; preparar: () => Promise<string | null>
  hacer: (accion: () => Promise<Resultado>, pregunta?: string) => void; autorizar: () => void; alSubir: (r: Resultado) => void
}) {
  const mio = p.tecnico === quien
  const faltan = equiposDe(p).filter((e) => !(p.videos ?? []).some((v) => v.equipo_codigo === e.codigo && (v.estado === 'listo' || v.estado === 'procesando')))
  const enRevision = !p.cerrado && p.estado === 'en_revision'
  const autorizada = !!p.correccion_video_autorizada_en
  const puedeSubir = p.cerrado ? autorizada || puedeCorregir : (enRevision && mio) || p.estado === 'listo'
  // RPD-39 y RPD-40: el video corregido, si ya está listo y sin enviar, y la ventana de 24 h de WhatsApp
  const pendiente = !!p.correccion_video_en && (!p.video_enviado_en || p.video_enviado_en < p.correccion_video_en)
  const corregidoListo = (p.videos ?? []).some((v) => v.id === p.correccion_video_id && v.estado === 'listo')
  const ventanaAbierta = !!p.ventana_meta_hasta && new Date(p.ventana_meta_hasta).getTime() > Date.now()
  const sig = p.cerrado ? { t: p.correccion_video_autorizada_en ? `Video corregido autorizado (${p.correccion_video_motivo}): súbelo abajo.` : 'Pedido cerrado: solo se ve.', tono: p.correccion_video_autorizada_en ? 'aviso' : 'info' }
    : p.estado === 'por_revisar' ? { t: 'Toma el pedido para empezar la revisión.', tono: 'aviso' }
    : enRevision && !mio ? { t: `Lo está revisando ${p.tecnico}.`, tono: 'info' }
    : enRevision && faltan.length ? { t: `Sube ${faltan.length === 1 ? 'el video' : `${faltan.length} videos`} (uno por equipo, de 1 a 2 minutos).`, tono: 'aviso' }
    : enRevision ? { t: 'Todo listo: pulsa «Revisado, listo para despachar».', tono: 'aviso' }
    : { t: 'Listo para despachar: el asesor envía la guía o avisa al cliente.', tono: 'ok' }

  return (
    <div className="ped">
      <div className="ped-card">
        <div className="ped-h">
          <span className="ped-t"><span className="ped-ico"><Icono nombre="herramienta" /></span>{p.tecnico ?? 'Sin técnico'}</span>
          <span className={`chip ${p.cerrado ? 'neu' : ESTADO[p.estado].clase}`}>{p.cerrado ? p.cierre ?? 'Cerrado' : ESTADO[p.estado].texto}</span>
        </div>
        <PasosTecnico p={p} />
        <div className={`ped-sig ${sig.tono}`}><span>{sig.tono === 'ok' && <Icono nombre="chulo" />}{sig.t}</span></div>
      </div>
      {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}

      <div className="ped-card ped-cuerpo">
        <span className="ped-t"><span className="ped-ico"><Icono nombre="video" /></span>Equipos y videos</span>
        {equiposDe(p).map((e) => (
          <div key={e.codigo} className="ped-equipo">
            <div className="ped-datos"><b>{e.nombre}</b>{e.codigo !== 'pedido' && <small className="muted">{e.codigo}</small>}</div>
            {p.estado !== 'por_revisar' || p.cerrado ? (
              <VideosEquipo pedido={p.id} codigo={e.codigo} videos={(p.videos ?? []).filter((v) => v.equipo_codigo === e.codigo)} quien={quien}
                puedeSubir={puedeSubir} miniaturas alTerminar={alSubir}
                antesDeSubir={p.cerrado && !autorizada ? preparar : undefined} textoSubir={p.cerrado && !autorizada ? 'Cambiar video' : undefined} />
            ) : <small className="muted">Toma el pedido para subir el video.</small>}
          </div>
        ))}
        {p.cerrado && !autorizada && puedeCorregir && (
          <div className="row"><button className="btn chico" disabled={ocupado} onClick={autorizar}>Autorizar al técnico</button>
            <small className="muted">Si el video lo graba otra persona: queda autorizado para que lo suba.</small></div>
        )}
      </div>

      {p.cerrado && puedeEnviar && (
        <div className="ped-card ped-cuerpo">
          <span className="ped-t"><span className="ped-ico"><Icono nombre="enviar" /></span>Enviar al cliente</span>
          <small className={ventanaAbierta ? 'ped-ok' : 'ped-aviso'}>
            {ventanaAbierta ? `WhatsApp abierto hasta ${hora(p.ventana_meta_hasta!)}.`
              : p.ventana_meta_hasta ? `WhatsApp cerrado desde ${hora(p.ventana_meta_hasta)}: el cliente debe escribir primero para poder enviarle el video.`
              : 'El cliente no ha escrito: WhatsApp no deja enviarle mensajes libres.'}
          </small>
          {pendiente ? (corregidoListo ? (
            <div className="row">
              <button className="btn primary chico" disabled={ocupado || !ventanaAbierta} onClick={enviar}>Enviar video corregido</button>
              <small className="muted">Se envía una sola vez.</small>
            </div>
          ) : <small className="muted">Preparando el video corregido (se comprime en el servidor)… vuelve en unos minutos.</small>)
            : p.video_enviado_en ? <small className="ped-ok">✓ Video enviado {hora(p.video_enviado_en)}. Para enviar otro, primero cámbialo.</small>
            : (p.videos ?? []).some((v) => v.estado === 'listo') ? (
              <div className="row">
                <button className="btn primary chico" disabled={ocupado || !ventanaAbierta} onClick={enviar}>Enviar video</button>
                <small className="muted">El cliente todavía no lo ha recibido.</small>
              </div>
            ) : <small className="muted">Todavía no hay un video listo para enviar.</small>}
        </div>
      )}

      <div className="ped-card ped-cuerpo">
        <span className="ped-t"><span className="ped-ico"><Icono nombre="chulo" /></span>Revisión ({hechos(p)} de {CHECKLIST.length})</span>
        <div className="st-check">
          {CHECKLIST.map(([clave, texto]) => {
            const marca = p.checklist[clave]
            return (
              <label key={clave} className="check" title={marca ? `${marca.por} · ${hora(marca.en)}` : undefined}>
                <input type="checkbox" checked={!!marca} disabled={!enRevision || !mio || ocupado}
                  onChange={(ev) => hacer(() => marcarChecklist(p.id, clave, ev.target.checked, quien))} />
                {texto}{marca && <small className="muted"> · {marca.por}</small>}
              </label>
            )
          })}
        </div>
        {!p.cerrado && p.estado === 'listo' && <small className="muted">Para cambiar la revisión, pulsa «Volver a revisión».</small>}
      </div>

      <div className="ped-card ped-cuerpo">
        <span className="ped-t"><span className="ped-ico"><Icono nombre="documento" /></span>Documento</span>
        {p.doc_numero ? <span><span className="chip ok">{p.doc_tipo} {p.doc_numero}</span></span> : <small className="muted">Pendiente: lo pone el asesor (no detiene la revisión).</small>}
      </div>

      {!p.cerrado && (
        <div className="row" style={{ gap: 6 }}>
          {p.estado === 'por_revisar' && (
            <button className="btn primary" disabled={ocupado} onClick={() => hacer(() => tomarPedido(p.id, quien))}>Tomar pedido</button>
          )}
          {enRevision && mio && (
            <button className="btn primary" disabled={ocupado || faltan.length > 0}
              onClick={() => hacer(() => marcarListo(p.id, quien), '¿El equipo quedó revisado y funcional, listo para despachar?')}>Revisado, listo para despachar</button>
          )}
          {p.estado === 'listo' && (
            <button className="btn" disabled={ocupado} onClick={() => hacer(() => reabrirPedido(p.id, quien), '¿Volver a abrir la revisión de este pedido?')}>Volver a revisión</button>
          )}
        </div>
      )}
    </div>
  )
}

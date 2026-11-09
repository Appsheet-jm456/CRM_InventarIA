'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icono, type ClaveIcono } from '@/components/Iconos'
import { MOTIVOS_CANCELAR } from '@/components/MotivoPerdida'
import { clienteNavegador, subirConAvance } from '@/lib/supabase/navegador'
import { OportunidadesCliente, type Embudo, type Etapa } from '../../../bandeja/OportunidadesCliente'
import { cancelarPedido, enviarAlCliente, guardarDocumento, marcarEntregado, registrarGuia, type Resultado } from '../../../servicio-tecnico/acciones'
import { CHECKLIST, ESTADO, hora } from '../../../servicio-tecnico/ServicioTecnico'
import { VideosEquipo, type Video } from '../../../servicio-tecnico/VideosEquipo'
import { nombreDocumento, numeroPedido, pasos, siguiente, ventana, type Datos, type Entrega } from './pedido'

type Fila = Datos & {
  id: number
  oportunidad_id: number
  equipos: { codigo: string; nombre: string }[]
  tecnico: string | null
  listo_por: string | null
  checklist: Record<string, unknown>
  transportadora: string | null
  numero_guia: string | null
  cancelado_motivo: string | null
  oportunidades: { estado: string; valor_estimado: number | null; etapas: { nombre: string } | null } | null
  alistamiento_videos: Video[]
  leads: { atributos: Record<string, unknown> | null } | null
}
type Evento = { id: number; en: string; detalle: string | null }
type Ir = { id: string; n: number } | null

const TRANSPORTADORAS = ['Inter Rapidísimo', 'Servientrega', 'Envía', 'Coordinadora']
const pesos = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Sección plegable: la que toca ahora queda abierta y las terminadas, cerradas con su resumen (RPD-04).
function Seccion({ id, icono, titulo, resumen, chip, defecto, ir, children }: {
  id: string; icono: ClaveIcono; titulo: string; resumen?: string | null; chip?: ReactNode; defecto: boolean; ir: Ir; children?: ReactNode
}) {
  const [abierta, setAbierta] = useState(defecto)
  const caja = useRef<HTMLDetailsElement>(null)
  useEffect(() => { setAbierta(defecto) }, [defecto])
  useEffect(() => {
    if (ir?.id !== id) return
    setAbierta(true)
    caja.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [ir, id])
  return (
    <details ref={caja} className="ped-card ped-sec" open={abierta} onToggle={(e) => setAbierta((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="ped-t"><span className="ped-ico"><Icono nombre={icono} /></span>{titulo}</span>
        <span className="ped-res">{resumen && <small className="muted">{resumen}</small>}{chip}</span>
      </summary>
      <div className="ped-cuerpo">{children}</div>
    </details>
  )
}

// Una fila de «Enviar al cliente»: ✓ con la hora cuando ya salió, o el botón y, si no se puede, el motivo escrito debajo (RPD-24).
function Envio({ icono, titulo, hecho, texto, accion }: { icono: ClaveIcono; titulo: string; hecho: boolean; texto: string; accion?: ReactNode }) {
  return (
    <div className="ped-envio">
      <span className={`ped-envio-i${hecho ? ' ok' : ''}`}><Icono nombre={hecho ? 'chulo' : icono} /></span>
      <div className="ped-datos"><b>{titulo}</b><small className={hecho ? 'ped-ok' : 'muted'}>{texto}</small></div>
      {accion}
    </div>
  )
}

// F4·54 (docs/PEDIDOS.md, RPD-01 a RPD-07, RPD-16 a RPD-26): la pestaña Oportunidades de la ficha, en el orden del proceso.
export function PedidoCliente({ lead, puedeDocumento, embudos, etapas, version, alCambiar, pago }: {
  lead: number; puedeDocumento: boolean; embudos: Embudo[]; etapas: Etapa[]; version: number; alCambiar: () => void; pago?: ReactNode
}) {
  const [fila, setFila] = useState<Fila | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [cargado, setCargado] = useState(false)
  const [tipo, setTipo] = useState<'OP' | 'FVE'>('FVE')
  const [numero, setNumero] = useState('')
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const [guia, setGuia] = useState({ transportadora: '', otra: '', numero: '' })
  const [subiendo, setSubiendo] = useState<number | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [ir, setIr] = useState<Ir>(null)
  const foto = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    const sb = clienteNavegador()
    const { data } = await sb.from('alistamientos')
      .select('id, numero, oportunidad_id, equipos, doc_tipo, doc_numero, estado, tecnico, tomado_en, listo_en, listo_por, checklist, creado_en, ' +
        'oportunidades(estado, valor_estimado, etapas(nombre)), leads(atributos), transportadora, numero_guia, guia_en, guia_enviada_en, ' +
        'documento_enviado_en, video_enviado_en, primer_documento_en, primer_video_en, aviso_tienda_en, entregado_en, cancelado_en, cancelado_motivo, ' +
        'alistamiento_videos(id, equipo_codigo, estado, tecnico, subido_en, ruta, peso, error)')
      .eq('lead_id', lead).order('creado_en', { ascending: false }).limit(1)
    const f = ((data ?? [])[0] as unknown as Fila | undefined) ?? null
    setFila(f)
    setCargado(true)
    if (f?.doc_tipo) setTipo(f.doc_tipo)
    setNumero(f?.doc_numero ?? '')
    if (!f) return
    const [cot, ev] = await Promise.all([
      sb.from('cotizaciones').select('total').eq('lead_id', lead).order('creado_en', { ascending: false }).limit(1),
      sb.from('lead_eventos').select('id, en, detalle').eq('lead_id', lead).eq('tipo', 'alistamiento').order('en', { ascending: false }).limit(40),
    ])
    setTotal(Number(f.oportunidades?.valor_estimado) || Number((cot.data ?? [])[0]?.total) || null)
    setEventos((ev.data ?? []) as Evento[])
  }, [lead])

  useEffect(() => { setAviso({}); cargar() }, [cargar, version])

  const otras = (
    <OportunidadesCliente lead={lead} embudos={embudos} etapas={etapas} puede={puedeDocumento} version={version} alCambiar={alCambiar}
      modo={fila ? 'otras' : 'todas'} oportunidadId={fila?.oportunidad_id} />
  )
  if (!cargado) return null
  if (!fila) return <div className="ped">{pago}{otras}</div>

  const opAbierta = fila.oportunidades?.estado === 'abierta'
  const entrega: Entrega = fila.leads?.atributos?.venta_online === true ? 'envio' : fila.leads?.atributos?.venta_online === false ? 'tienda' : null
  const videos = (fila.alistamiento_videos ?? []).filter((v) => v.estado !== 'vencido')
  const videosListos = videos.some((v) => v.estado === 'listo')
  const equiposConVideo = fila.equipos.filter((e) => videos.some((v) => v.equipo_codigo === e.codigo && v.estado === 'listo')).length
  const cancelado = !!fila.cancelado_en
  const listo = fila.estado === 'listo'
  const pasosPedido = pasos(fila, entrega)
  const sig = siguiente(fila, entrega, { videosListos, videos: equiposConVideo, equipos: Math.max(fila.equipos.length, 1) })
  const docNombre = nombreDocumento(fila.doc_tipo)
  const vVideo = ventana(fila.video_enviado_en, fila.primer_video_en, opAbierta)
  const vDoc = ventana(fila.documento_enviado_en, fila.primer_documento_en, opAbierta)
  const puedeCancelar = puedeDocumento && opAbierta && !cancelado && !fila.guia_en && !fila.entregado_en
  const estadoPedido: [string, string] = cancelado ? ['Cancelado', 'bad'] : fila.entregado_en ? ['Entregado', 'ok'] : fila.guia_enviada_en ? ['Enviado', 'ok']
    : fila.aviso_tienda_en ? ['Por recoger', 'acc'] : [ESTADO[fila.estado].texto, ESTADO[fila.estado].clase]
  const enviados = [!!fila.video_enviado_en, !!fila.documento_enviado_en, entrega === 'tienda' ? !!fila.aviso_tienda_en : !!fila.guia_enviada_en, ...(entrega === 'tienda' ? [!!fila.entregado_en] : [])]
  const cuando = (t: string | null) => (t ? hora(t) : '')

  async function hacer(accion: () => Promise<Resultado>, pregunta?: string) {
    if (pregunta && !confirm(pregunta)) return
    setOcupado(true)
    const r = await accion()
    setOcupado(false)
    setAviso(r)
    cargar()
    alCambiar()
  }

  async function enviarGuia(f: File) {
    const transportadora = guia.transportadora === 'otra' ? guia.otra.trim() : guia.transportadora
    if (!transportadora || !guia.numero.trim()) return setAviso({ error: 'Elige la transportadora y escribe el número de guía antes de subir la foto.' })
    if (!['image/jpeg', 'image/png'].includes(f.type)) return setAviso({ error: 'La foto de la guía debe ser JPG o PNG.' })
    if (f.size > 5 * 1024 * 1024) return setAviso({ error: 'La foto pesa más de 5 MB: tómala de nuevo o recórtala.' })
    if (!confirm(`¿Enviar la guía ${guia.numero.trim()} de ${transportadora} al cliente? Se envía una sola vez y el pedido pasará a Despachado y Vendido.`)) {
      if (foto.current) foto.current.value = ''
      return
    }
    const ruta = `${fila!.id}/guia-${Date.now()}.${f.type === 'image/png' ? 'png' : 'jpg'}`
    setSubiendo(0)
    const fallo = await subirConAvance('guias', ruta, f, setSubiendo)
    setSubiendo(null)
    if (foto.current) foto.current.value = ''
    if (fallo) return setAviso({ error: fallo })
    hacer(() => registrarGuia(fila!.id, lead, ruta, transportadora, guia.numero.trim()))
  }

  const reenvio = (v: ReturnType<typeof ventana>) => (v.hasta ? `Puedes reenviarlo hasta ${hora(v.hasta)}` : '')

  return (
    <div className="ped">
      {pago}
      <div className="ped-card">
        <div className="ped-h">
          <span className="ped-t"><span className="ped-ico"><Icono nombre="paquete" /></span>Pedido {numeroPedido(fila.numero)}</span>
          <span className={`chip ${estadoPedido[1]}`}>{estadoPedido[0]}</span>
        </div>
        <div className="ped-s">
          {fila.equipos.length || 1} equipo{(fila.equipos.length || 1) === 1 ? '' : 's'}{total ? ` · Total ${pesos(total)}` : ''}
          {entrega ? ` · ${entrega === 'envio' ? 'Envío' : 'Recoge en tienda'}` : ''}
        </div>
        <div className="ped-etapa">
          <OportunidadesCliente lead={lead} embudos={embudos} etapas={etapas} puede={puedeDocumento} version={version} alCambiar={alCambiar}
            modo="solo" oportunidadId={fila.oportunidad_id} />
        </div>
        <ol className={`ped-pasos${cancelado ? ' cancelado' : ''}`} aria-label="Pasos del pedido">
          {pasosPedido.map((p, i) => (
            <li key={p.clave} className={`ped-paso${p.hecho ? ' hecho' : ''}${p.actual ? ' actual' : ''}`} aria-current={p.actual ? 'step' : undefined}>
              <span className="pt">{p.hecho ? <Icono nombre="chulo" /> : i + 1}</span>
              <span className="pn">{p.titulo}</span>
              <small>{p.hecho && p.cuando ? hora(p.cuando) : p.detalle ?? ''}</small>
            </li>
          ))}
        </ol>
        {cancelado ? (
          <div className="ped-sig bad"><span>Pedido cancelado: {fila.cancelado_motivo} · {cuando(fila.cancelado_en)}</span></div>
        ) : sig && (
          <div className={`ped-sig ${sig.tono}`}>
            <span>{sig.tono === 'ok' && <Icono nombre="chulo" />}{sig.tono === 'ok' ? '' : 'Siguiente paso: '}{sig.texto}</span>
            {sig.seccion && <button className="btn chico" onClick={() => setIr({ id: sig.seccion!, n: Date.now() })}>Ir</button>}
          </div>
        )}
      </div>

      {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}

      <Seccion id="pago" icono="chulo" titulo="Pago" resumen={`Validado · ${cuando(fila.creado_en)}`} defecto={false} ir={ir}>
        <small className="muted">El pago se validó y el pedido entró a Alistamiento.</small>
      </Seccion>

      <Seccion id="tecnico" icono="herramienta" titulo="Servicio técnico" ir={ir} defecto={!cancelado && !listo}
        resumen={`${fila.tecnico ?? 'Sin técnico'} · ${equiposConVideo} de ${Math.max(fila.equipos.length, 1)} videos`}
        chip={<span className={`chip ${ESTADO[fila.estado].clase}`}>{ESTADO[fila.estado].texto}</span>}>
        {(fila.equipos.length ? fila.equipos : [{ codigo: 'pedido', nombre: 'Equipo del pedido' }]).map((e) => (
          <div key={e.codigo} className="ped-equipo">
            <div className="ped-datos"><b>{e.nombre}</b>{e.codigo !== 'pedido' && <small className="muted">{e.codigo}</small>}</div>
            <VideosEquipo pedido={fila.id} codigo={e.codigo} puedeSubir={false} alTerminar={setAviso} miniaturas
              videos={videos.filter((v) => v.equipo_codigo === e.codigo)} />
          </div>
        ))}
        <dl className="ped-par">
          <dt>Técnico</dt><dd>{fila.tecnico ?? 'Aún sin técnico'}{fila.tomado_en && <small className="muted"> · tomó {cuando(fila.tomado_en)}</small>}</dd>
          {fila.listo_en && <><dt>Listo</dt><dd>{cuando(fila.listo_en)}{fila.listo_por && <small className="muted"> · {fila.listo_por}</small>}</dd></>}
          {Object.keys(fila.checklist).length > 0 && (
            <><dt>Revisión</dt><dd>{CHECKLIST.filter(([k]) => fila.checklist[k]).map(([, t]) => t).join(' · ')}</dd></>
          )}
        </dl>
      </Seccion>

      <Seccion id="documento" icono="documento" titulo="Documento" ir={ir} defecto={!cancelado && !fila.doc_numero}
        resumen={fila.doc_numero ? `${fila.doc_tipo} ${fila.doc_numero}` : 'Falta'}
        chip={<span className={`chip ${fila.doc_numero ? 'ok' : 'warn'}`}>{fila.doc_numero ? 'Listo' : 'Falta'}</span>}>
        <small className="muted">OP de garantía (POS) o FVE: el número lo da contabilidad.</small>
        {puedeDocumento && !cancelado ? (
          <form className="ped-doc" onSubmit={(e) => { e.preventDefault(); hacer(() => guardarDocumento(fila.id, lead, tipo, numero.trim())) }}>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as 'OP' | 'FVE')} disabled={ocupado} aria-label="Tipo de documento">
              <option value="FVE">FVE · factura electrónica</option>
              <option value="OP">OP · garantía POS</option>
            </select>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Número del documento" disabled={ocupado} aria-label="Número del documento" />
            <button className="btn primary chico" disabled={ocupado || !numero.trim() || (numero.trim() === fila.doc_numero && tipo === fila.doc_tipo)}>Guardar</button>
          </form>
        ) : fila.doc_numero && <b>{fila.doc_tipo} {fila.doc_numero}</b>}
        {!fila.doc_numero && !cancelado && <small className="ped-aviso">El técnico no puede marcar «listo para despachar» hasta que pongas el documento.</small>}
      </Seccion>

      <Seccion id="enviar" icono="enviar" titulo="Enviar al cliente" ir={ir} defecto={!cancelado && listo && sig?.tono !== 'ok'}
        resumen={`${enviados.filter(Boolean).length} de ${enviados.length} hechos`}>
        <Envio icono="video" titulo="Video de la revisión" hecho={vVideo.estado !== 'nuevo'}
          texto={vVideo.estado === 'nuevo' ? (videosListos ? 'Pendiente' : 'Aún no hay videos listos') : `Enviado ${cuando(fila.video_enviado_en)}${vVideo.hasta ? ` · ${reenvio(vVideo)}` : ''}`}
          accion={vVideo.estado !== 'cerrado' && !cancelado && puedeDocumento && (
            <button className={`btn chico${vVideo.estado === 'nuevo' && videosListos ? ' primary' : ''}`} disabled={ocupado || !videosListos}
              onClick={() => hacer(() => enviarAlCliente(fila.id, lead, 'video'), vVideo.estado === 'nuevo' ? '¿Enviar al cliente el video de cada equipo?' : '¿Reenviar al cliente el video?')}>
              {vVideo.estado === 'nuevo' ? 'Enviar' : 'Reenviar'}</button>)} />
        <Envio icono="documento" titulo={`${docNombre}${fila.doc_numero ? ` ${fila.doc_numero}` : ''}`} hecho={vDoc.estado !== 'nuevo'}
          texto={vDoc.estado === 'nuevo' ? (fila.doc_numero ? 'Pendiente' : 'Primero guarda el OP o la FVE') : `Enviada ${cuando(fila.documento_enviado_en)}${vDoc.hasta ? ` · ${reenvio(vDoc)}` : ''}`}
          accion={vDoc.estado !== 'cerrado' && !cancelado && puedeDocumento && (
            <button className={`btn chico${vDoc.estado === 'nuevo' && fila.doc_numero ? ' primary' : ''}`} disabled={ocupado || !fila.doc_numero}
              onClick={() => hacer(() => enviarAlCliente(fila.id, lead, 'documento'), `¿${vDoc.estado === 'nuevo' ? 'Enviar' : 'Reenviar'} al cliente su ${docNombre} ${fila.doc_numero ?? ''}?`)}>
              {vDoc.estado === 'nuevo' ? 'Enviar' : 'Reenviar'}</button>)} />

        {entrega === 'envio' && (
          <>
            <Envio icono="paquete" titulo={fila.transportadora && fila.numero_guia ? `Guía · ${fila.transportadora} ${fila.numero_guia}` : 'Guía de la transportadora'}
              hecho={!!fila.guia_enviada_en}
              texto={fila.guia_enviada_en ? `Enviada ${cuando(fila.guia_enviada_en)} · se envía una sola vez`
                : fila.guia_en ? 'Registrada, pero no llegó al cliente' : listo ? 'Sube la foto de la guía' : 'Disponible cuando el servicio técnico marque listo'}
              accion={fila.guia_en && !fila.guia_enviada_en && !cancelado && puedeDocumento && (
                <button className="btn primary chico" disabled={ocupado} onClick={() => hacer(() => enviarAlCliente(fila.id, lead, 'guia'), '¿Reintentar el envío de la guía al cliente?')}>Reintentar</button>)} />
            {!fila.guia_en && listo && !cancelado && puedeDocumento && (
              <div className="ped-guia">
                <div className="ped-doc">
                  <select value={guia.transportadora} onChange={(e) => setGuia({ ...guia, transportadora: e.target.value })} disabled={ocupado} aria-label="Transportadora">
                    <option value="">Transportadora…</option>
                    {TRANSPORTADORAS.map((t) => <option key={t} value={t}>{t}</option>)}
                    <option value="otra">Otra…</option>
                  </select>
                  {guia.transportadora === 'otra' && <input value={guia.otra} onChange={(e) => setGuia({ ...guia, otra: e.target.value })} placeholder="¿Cuál?" aria-label="Otra transportadora" />}
                  <input value={guia.numero} onChange={(e) => setGuia({ ...guia, numero: e.target.value })} placeholder="Número de guía" disabled={ocupado} aria-label="Número de guía" />
                </div>
                <input ref={foto} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarGuia(f) }} />
                <div className="row">
                  <button className="btn primary" disabled={ocupado || subiendo !== null} onClick={() => foto.current?.click()}>
                    {subiendo !== null ? `Subiendo… ${subiendo} %` : 'Subir foto de la guía y enviar'}</button>
                  <small className="muted">Al enviarla, el pedido pasa a Despachado y Vendido.</small>
                </div>
              </div>
            )}
          </>
        )}
        {entrega === 'tienda' && (
          <>
            <Envio icono="reloj" titulo="Aviso: listo para recoger" hecho={!!fila.aviso_tienda_en}
              texto={fila.aviso_tienda_en ? `Enviado ${cuando(fila.aviso_tienda_en)} · se avisa una sola vez` : listo ? 'Pendiente' : 'Disponible cuando el servicio técnico marque listo'}
              accion={!fila.aviso_tienda_en && !cancelado && puedeDocumento && (
                <button className="btn primary chico" disabled={ocupado || !listo} onClick={() => hacer(() => enviarAlCliente(fila.id, lead, 'listo_tienda'), '¿Avisarle al cliente que su equipo está listo para recoger?')}>Avisar</button>)} />
            <Envio icono="chulo" titulo="Entregado en tienda" hecho={!!fila.entregado_en}
              texto={fila.entregado_en ? `Entregado ${cuando(fila.entregado_en)}` : 'Marca cuando el cliente recoja el equipo'}
              accion={!fila.entregado_en && !cancelado && puedeDocumento && (
                <button className="btn chico" disabled={ocupado || !listo} onClick={() => hacer(() => marcarEntregado(fila.id, lead), '¿El cliente ya recogió su equipo? El pedido pasará a Vendido.')}>Entregado</button>)} />
          </>
        )}
        {!entrega && <small className="ped-aviso">Marca en la pestaña Principal si la venta es online o en tienda para ver la guía o el aviso de recogida.</small>}
        {puedeCancelar && (
          <div className="ped-pie">
            <button className="btn chico peligro" disabled={ocupado} onClick={() => setCancelando(true)}>Cancelar pedido</button>
            <small className="muted">Solo antes de enviar la guía.</small>
          </div>
        )}
      </Seccion>

      <Seccion id="historial" icono="reloj" titulo="Historial del pedido" resumen={`${eventos.length} movimientos`} defecto={false} ir={ir}>
        {eventos.length === 0 && <small className="muted">Todavía no hay movimientos.</small>}
        <ul className="ped-hist">
          {eventos.map((e) => <li key={e.id}><small className="muted">{hora(e.en)}</small><span>{e.detalle}</span></li>)}
        </ul>
      </Seccion>

      {otras}

      {cancelando && (
        <div className="modal" onClick={() => setCancelando(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cancelar pedido">
            <h3>¿Por qué se cancela el pedido?</h3>
            <small className="muted">La oportunidad queda Perdida y el servicio técnico deja de verlo. No se le envía nada al cliente.</small>
            <div className="row">
              {MOTIVOS_CANCELAR.map((m) => (
                <button key={m} className="btn" onClick={() => { setCancelando(false); hacer(() => cancelarPedido(fila.id, lead, m)) }}>{m}</button>
              ))}
            </div>
            <button className="btn chico" onClick={() => setCancelando(false)}>Volver</button>
          </div>
        </div>
      )}
    </div>
  )
}

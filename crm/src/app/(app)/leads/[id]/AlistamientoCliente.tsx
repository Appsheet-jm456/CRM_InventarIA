'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { clienteNavegador, subirConAvance } from '@/lib/supabase/navegador'
import { enviarAlCliente, guardarDocumento, marcarEntregado, registrarGuia, type Resultado } from '../../servicio-tecnico/acciones'
import { CHECKLIST, ESTADO, hora, type Pedido } from '../../servicio-tecnico/ServicioTecnico'
import { VideosEquipo, type Video } from '../../servicio-tecnico/VideosEquipo'

type Fila = Pick<Pedido, 'id' | 'equipos' | 'doc_tipo' | 'doc_numero' | 'estado' | 'tecnico' | 'tomado_en' | 'listo_en' | 'listo_por' | 'checklist'> & {
  oportunidades: { estado: string; etapas: { nombre: string } | null } | null
  alistamiento_videos: Video[]
  transportadora: string | null; numero_guia: string | null; guia_en: string | null; guia_enviada_en: string | null
  documento_enviado_en: string | null; video_enviado_en: string | null; aviso_tienda_en: string | null; entregado_en: string | null
  leads: { atributos: Record<string, unknown> | null } | null
}

const TRANSPORTADORAS = ['Inter Rapidísimo', 'Servientrega', 'Envía', 'Coordinadora']

// F4·50 (RAL-02, RAL-03, RAL-07): en la ficha del cliente el asesor ve el alistamiento, pone el OP o la FVE, envía al cliente el video, el
// documento y la guía (que pasa la oportunidad a Despachado y Vendido) o, en tienda, avisa que está listo y marca Entregado.
export function AlistamientoCliente({ lead, puedeDocumento, version, alCambiar }: {
  lead: number; puedeDocumento: boolean; version: number; alCambiar: () => void
}) {
  const [fila, setFila] = useState<Fila | null>(null)
  const [tipo, setTipo] = useState<'OP' | 'FVE'>('FVE')
  const [numero, setNumero] = useState('')
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const [guia, setGuia] = useState({ transportadora: '', otra: '', numero: '' })
  const [subiendo, setSubiendo] = useState<number | null>(null)
  const foto = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    const { data } = await clienteNavegador().from('alistamientos')
      .select('id, equipos, doc_tipo, doc_numero, estado, tecnico, tomado_en, listo_en, listo_por, checklist, oportunidades(estado, etapas(nombre)), leads(atributos), ' +
        'transportadora, numero_guia, guia_en, guia_enviada_en, documento_enviado_en, video_enviado_en, aviso_tienda_en, entregado_en, ' +
        'alistamiento_videos(id, equipo_codigo, estado, tecnico, subido_en, ruta, peso, error)')
      .eq('lead_id', lead).order('creado_en', { ascending: false }).limit(1)
    const f = ((data ?? [])[0] as unknown as Fila | undefined) ?? null
    setFila(f)
    if (f?.doc_tipo) setTipo(f.doc_tipo)
    setNumero(f?.doc_numero ?? '')
  }, [lead])

  useEffect(() => { setAviso({}); cargar() }, [cargar, version])

  if (!fila) return null
  const etapa = fila.oportunidades?.etapas?.nombre ?? ''
  const enCurso = fila.oportunidades?.estado === 'abierta' && etapa === 'Alistamiento'

  const entrega = fila.leads?.atributos?.venta_online === true ? 'envio' : fila.leads?.atributos?.venta_online === false ? 'tienda' : null
  const videosListos = (fila.alistamiento_videos ?? []).some((v) => v.estado === 'listo')
  const listo = fila.estado === 'listo'

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
    if (!confirm(`¿Enviar la guía ${guia.numero.trim()} de ${transportadora} al cliente? El pedido pasará a Despachado y Vendido.`)) {
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

  const enviado = (t: string | null) => t ? <small className="muted"> · enviado {hora(t)}</small> : null

  async function guardar() {
    setOcupado(true)
    const r = await guardarDocumento(fila!.id, lead, tipo, numero)
    setOcupado(false)
    setAviso(r)
    cargar()
    alCambiar()
  }

  return (
    <div className="dato" style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>🛠 Alistamiento · servicio técnico</b>
        <span className={`chip ${enCurso ? ESTADO[fila.estado].clase : 'neu'}`}>{enCurso ? ESTADO[fila.estado].texto : etapa || 'Cerrado'}</span>
      </div>
      {(fila.equipos.length ? fila.equipos : [{ codigo: 'pedido', nombre: 'Equipo del pedido' }]).map((e) => (
        <div key={e.codigo} style={{ display: 'grid', gap: 4, borderLeft: '3px solid var(--line)', paddingLeft: 10 }}>
          <span>💻 {e.nombre} {e.codigo !== 'pedido' && <small className="muted">· {e.codigo}</small>}</span>
          <VideosEquipo pedido={fila.id} codigo={e.codigo} puedeSubir={false} alTerminar={setAviso}
            videos={(fila.alistamiento_videos ?? []).filter((v) => v.equipo_codigo === e.codigo && v.estado !== 'vencido')} />
        </div>
      ))}
      <small className="muted">
        {fila.tecnico ? <>Técnico: <b>{fila.tecnico}</b>{fila.tomado_en && ` · tomó ${hora(fila.tomado_en)}`}</> : 'Aún sin técnico.'}
        {fila.listo_en && <> · listo para despachar {hora(fila.listo_en)}{fila.listo_por && ` (${fila.listo_por})`}</>}
      </small>
      {Object.keys(fila.checklist).length > 0 && (
        <small>{CHECKLIST.filter(([k]) => fila.checklist[k]).map(([, t]) => `✔ ${t}`).join(' · ')}</small>
      )}
      <div className="field">
        Documento del pedido (OP de garantía POS o FVE)
        {puedeDocumento && enCurso ? (
          <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); guardar() }}>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as 'OP' | 'FVE')} disabled={ocupado} aria-label="Tipo de documento">
              <option value="FVE">FVE · factura electrónica</option>
              <option value="OP">OP · garantía (POS)</option>
            </select>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Número que da contabilidad" maxLength={40}
              disabled={ocupado} aria-label="Número del documento" style={{ flex: '1 1 140px' }} />
            <button className="btn primary chico" disabled={ocupado || !numero.trim() || (numero.trim() === fila.doc_numero && tipo === fila.doc_tipo)}>Guardar</button>
          </form>
        ) : fila.doc_numero ? <span className="chip ok">{fila.doc_tipo} {fila.doc_numero}</span> : <span className="chip bad">Sin documento</span>}
        {enCurso && !fila.doc_numero && <small className="muted">El técnico no puede marcar «listo para despachar» hasta que pongas el documento.</small>}
      </div>
      {puedeDocumento && (
        <div className="field" style={{ gap: 6 }}>
          Enviar al cliente por WhatsApp
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span><button className="btn chico" disabled={ocupado || !videosListos} title={videosListos ? undefined : 'Aún no hay videos listos'}
              onClick={() => hacer(() => enviarAlCliente(fila.id, lead, 'video'), '¿Enviar al cliente el video de cada equipo?')}>🎥 Enviar video</button>{enviado(fila.video_enviado_en)}</span>
            <span><button className="btn chico" disabled={ocupado || !fila.doc_numero} title={fila.doc_numero ? undefined : 'Primero guarda el OP o la FVE'}
              onClick={() => hacer(() => enviarAlCliente(fila.id, lead, 'documento'), `¿Enviar al cliente su ${fila.doc_tipo} ${fila.doc_numero ?? ''}?`)}>🧾 Enviar {fila.doc_tipo ?? 'OP o FVE'}</button>{enviado(fila.documento_enviado_en)}</span>
            {entrega === 'tienda' && (
              <span><button className="btn chico" disabled={ocupado || !listo} title={listo ? undefined : 'El técnico aún no lo marca listo'}
                onClick={() => hacer(() => enviarAlCliente(fila.id, lead, 'listo_tienda'), '¿Avisarle al cliente que su equipo está listo para recoger?')}>🔔 Avisar: listo para recoger</button>{enviado(fila.aviso_tienda_en)}</span>
            )}
          </div>
          {entrega === 'envio' && (fila.guia_en ? (
            <div className="row" style={{ gap: 6 }}>
              <span className="chip ok">📦 {fila.transportadora} · guía {fila.numero_guia}</span>
              {fila.guia_enviada_en ? <small className="muted">enviada {hora(fila.guia_enviada_en)}</small> : <small className="error">no se le envió al cliente</small>}
              <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => enviarAlCliente(fila.id, lead, 'guia'), '¿Reenviar la guía al cliente?')}>Reenviar guía</button>
            </div>
          ) : listo && enCurso ? (
            <div style={{ display: 'grid', gap: 6, borderLeft: '3px solid var(--line)', paddingLeft: 10 }}>
              <b>📦 Enviar guía</b>
              <div className="row" style={{ gap: 6 }}>
                <select value={guia.transportadora} disabled={ocupado} aria-label="Transportadora" onChange={(e) => setGuia({ ...guia, transportadora: e.target.value })}>
                  <option value="">— transportadora —</option>
                  {TRANSPORTADORAS.map((t) => <option key={t} value={t}>{t}</option>)}
                  <option value="otra">Otra…</option>
                </select>
                {guia.transportadora === 'otra' && <input value={guia.otra} maxLength={60} placeholder="¿Cuál?" onChange={(e) => setGuia({ ...guia, otra: e.target.value })} />}
                <input value={guia.numero} maxLength={40} placeholder="Número de guía" aria-label="Número de guía" style={{ flex: '1 1 120px' }}
                  onChange={(e) => setGuia({ ...guia, numero: e.target.value })} />
              </div>
              <input ref={foto} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarGuia(f) }} />
              <div className="row" style={{ gap: 6 }}>
                <button className="btn primary chico" disabled={ocupado || subiendo !== null} onClick={() => foto.current?.click()}>
                  {subiendo !== null ? `Subiendo… ${subiendo} %` : '📷 Subir foto de la guía y enviar'}</button>
                <small className="muted">Al enviarla, el pedido pasa solo a Despachado y Vendido.</small>
              </div>
            </div>
          ) : enCurso ? <small className="muted">📦 La guía se envía cuando el técnico marque el pedido como listo para despachar.</small> : null)}
          {entrega === 'tienda' && listo && enCurso && !fila.entregado_en && (
            <div><button className="btn primary chico" disabled={ocupado}
              onClick={() => hacer(() => marcarEntregado(fila.id, lead), '¿El cliente ya recogió su equipo? El pedido pasará a Vendido.')}>✅ Entregado en tienda</button></div>
          )}
          {fila.entregado_en && <small className="muted">✅ Entregado en tienda {hora(fila.entregado_en)}</small>}
          {!entrega && <small className="muted">Marca en la pestaña Principal si es venta online o en tienda para ver la guía o el aviso de recogida.</small>}
        </div>
      )}
      {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { marcarChecklist, marcarListo, reabrirPedido, tomarPedido, type Resultado } from './acciones'
import { VideosEquipo, type Video } from './VideosEquipo'

export type Pedido = {
  id: number
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
export function ServicioTecnico({ pedidos, tecnicos, error }: { pedidos: Pedido[]; tecnicos: string[]; error: string | null }) {
  const router = useRouter()
  const [quien, setQuien] = useState('')
  const [aviso, setAviso] = useState<Resultado & { pedido?: number }>({})
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [ver, setVer] = useState<'activos' | 'listos'>('activos')

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
    if (!quien) { setAviso({ error: 'Primero elige quién eres.', pedido }); return }
    if (pregunta && !confirm(pregunta)) return
    setOcupado(pedido)
    const r = await accion()
    setOcupado(null)
    setAviso({ ...r, pedido })
    router.refresh()
  }

  const activos = pedidos.filter((p) => p.estado !== 'listo')
  const listos = pedidos.filter((p) => p.estado === 'listo')
  const lista = ver === 'activos' ? activos : listos

  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>Servicio técnico</h2>
          <small>Pedidos pagados en Alistamiento. Toma el pedido, marca lo que le hiciste y pulsa «Revisado, listo para despachar». No le escribe al cliente.</small>
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
        </div>
        {lista.length === 0 && <p className="muted">{ver === 'activos' ? 'No hay pedidos por alistar.' : 'No hay pedidos listos esperando despacho.'}</p>}
        {lista.map((p) => {
          const mio = p.tecnico === quien
          const sinDoc = !p.doc_numero
          const faltanVideos = (p.equipos.length ? p.equipos.map((e) => e.codigo) : ['pedido'])
            .filter((c) => !(p.videos ?? []).some((v) => v.equipo_codigo === c && (v.estado === 'listo' || v.estado === 'procesando')))
          return (
            <article key={p.id} className="dato" style={{ display: 'grid', gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <b>Pedido #{p.id} · {p.cliente}</b>
                <span className="row" style={{ gap: 6 }}>
                  <span className="chip neu">{p.entrega === 'envio' ? '🚚 Envío' : p.entrega === 'tienda' ? '🏬 Tienda' : 'Entrega sin definir'}</span>
                  <span className={`chip ${ESTADO[p.estado].clase}`}>{ESTADO[p.estado].texto}</span>
                </span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {(p.equipos.length ? p.equipos : [{ codigo: 'pedido', nombre: 'Equipo del pedido (sin código en la oportunidad)' }]).map((e) => (
                  <div key={e.codigo} style={{ display: 'grid', gap: 4, borderLeft: '3px solid var(--line)', paddingLeft: 10 }}>
                    <span>💻 {e.nombre} {e.codigo !== 'pedido' && <small className="muted">· {e.codigo}</small>}</span>
                    {p.estado !== 'por_revisar' && (
                      <VideosEquipo pedido={p.id} codigo={e.codigo} videos={(p.videos ?? []).filter((v) => v.equipo_codigo === e.codigo)} quien={quien}
                        puedeSubir={p.estado === 'en_revision' && mio} alTerminar={(r) => { setAviso({ ...r, pedido: p.id }); router.refresh() }} />
                    )}
                  </div>
                ))}
              </div>
              <small className="muted">
                Entró {hora(p.entro_en)}
                {p.tecnico && <> · {p.estado === 'listo' ? 'Revisó' : 'Lo tiene'} <b>{p.tecnico}</b>{p.tomado_en && ` desde ${hora(p.tomado_en)}`}</>}
                {p.listo_en && <> · listo {hora(p.listo_en)}</>}
              </small>
              <div>
                {sinDoc ? <span className="chip bad">Falta el documento (OP o FVE): lo pone el asesor</span>
                  : <span className="chip ok">{p.doc_tipo} {p.doc_numero}</span>}
              </div>
              {p.estado !== 'por_revisar' && (
                <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                  {CHECKLIST.map(([clave, texto]) => {
                    const marca = p.checklist[clave]
                    return (
                      <label key={clave} className="check" title={marca ? `${marca.por} · ${hora(marca.en)}` : undefined}>
                        <input type="checkbox" checked={!!marca} disabled={p.estado !== 'en_revision' || !mio || ocupado === p.id}
                          onChange={(e) => hacer(p.id, () => marcarChecklist(p.id, clave, e.target.checked, quien))} />
                        {texto}
                      </label>
                    )
                  })}
                </div>
              )}
              <div className="row" style={{ gap: 6 }}>
                {p.estado === 'por_revisar' && (
                  <button className="btn primary chico" disabled={ocupado === p.id} onClick={() => hacer(p.id, () => tomarPedido(p.id, quien))}>Tomar pedido</button>
                )}
                {p.estado === 'en_revision' && !mio && <small className="muted">Lo está revisando {p.tecnico}.</small>}
                {p.estado === 'en_revision' && mio && (
                  <button className="btn primary chico" disabled={ocupado === p.id || sinDoc || faltanVideos.length > 0}
                    title={sinDoc ? 'Falta el documento (OP o FVE): lo pone el asesor' : faltanVideos.length ? 'Falta un video por cada equipo' : undefined}
                    onClick={() => hacer(p.id, () => marcarListo(p.id, quien), '¿El equipo quedó revisado y funcional, listo para despachar?')}>
                    ✅ Revisado, listo para despachar
                  </button>
                )}
                {p.estado === 'listo' && (
                  <button className="btn chico" disabled={ocupado === p.id}
                    onClick={() => hacer(p.id, () => reabrirPedido(p.id, quien), '¿Volver a abrir la revisión de este pedido?')}>Volver a revisión</button>
                )}
              </div>
              {p.estado === 'en_revision' && mio && faltanVideos.length > 0 && (
                <small className="muted">Para marcarlo listo falta {faltanVideos.length === 1 ? 'un video' : `${faltanVideos.length} videos`} (uno por equipo, de 1 a 2 minutos).</small>
              )}
              {aviso.pedido === p.id && (aviso.error || aviso.ok) && (
                <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

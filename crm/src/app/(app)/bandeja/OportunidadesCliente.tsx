'use client'

import { useCallback, useEffect, useState } from 'react'
import { MotivoPerdida } from '@/components/MotivoPerdida'
import { clienteNavegador } from '@/lib/supabase/navegador'
import { abrirOportunidad, moverOportunidad } from './acciones'

export type Embudo = { id: number; nombre: string }
export type Etapa = { id: number; nombre: string; cierre: string; color: string; embudo_id: number; orden: number }
type Oportunidad = {
  id: number
  embudo_id: number
  etapa_id: number
  estado: 'abierta' | 'ganada' | 'perdida'
  valor_estimado: number | null
  producto: string
  motivo_perdido: string | null
  cerrado_en: string | null
}

const pesos = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// RE-02: el cliente puede tener una oportunidad en cada embudo; aquí se mueven y se abren (RE-05, RE-06).
export function OportunidadesCliente({ lead, embudos, etapas, puede, version, alCambiar }: {
  lead: number
  embudos: Embudo[]
  etapas: Etapa[]
  puede: boolean
  version: number
  alCambiar: () => void
}) {
  const [ops, setOps] = useState<Oportunidad[]>([])
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [perdida, setPerdida] = useState<{ op: number; etapa: Etapa } | null>(null)
  const [nuevo, setNuevo] = useState('')

  const cargar = useCallback(async () => {
    const { data } = await clienteNavegador()
      .from('oportunidades')
      .select('id, embudo_id, etapa_id, estado, valor_estimado, producto, motivo_perdido, cerrado_en')
      .eq('lead_id', lead)
      .order('creado_en', { ascending: false })
    setOps((data ?? []) as Oportunidad[])
  }, [lead])

  useEffect(() => {
    cargar()
  }, [cargar, version])

  async function hacer(accion: () => Promise<{ error?: string }>) {
    setOcupado(true)
    const r = await accion()
    setOcupado(false)
    setError(r.error ?? '')
    await cargar()
    alCambiar()
  }

  function mover(op: Oportunidad, etapaId: number) {
    const etapa = etapas.find((e) => e.id === etapaId)
    if (!etapa || etapaId === op.etapa_id) return
    if (etapa.cierre === 'perdida') setPerdida({ op: op.id, etapa })
    else hacer(() => moverOportunidad(op.id, etapaId))
  }

  const abiertas = ops.filter((o) => o.estado === 'abierta')
  const cerradas = ops.filter((o) => o.estado !== 'abierta').slice(0, 5)
  const sinAbrir = embudos.filter((e) => !abiertas.some((o) => o.embudo_id === e.id))
  const nombreEmbudo = (id: number) => embudos.find((e) => e.id === id)?.nombre ?? ''
  const nombreEtapa = (id: number) => etapas.find((e) => e.id === id)?.nombre ?? ''

  return (
    <div className="dato">
      <small>Oportunidades</small>
      {abiertas.length === 0 && <div className="muted" style={{ fontWeight: 400 }}>Ninguna abierta.</div>}
      {abiertas.map((o) => (
        <label key={o.id} className="field op">
          <span>{nombreEmbudo(o.embudo_id)}{o.valor_estimado ? ` · ${pesos(Number(o.valor_estimado))}` : ''}{o.producto ? ` · ${o.producto}` : ''}</span>
          <select value={o.etapa_id} disabled={ocupado || !puede} onChange={(e) => mover(o, Number(e.target.value))}>
            {etapas.filter((e) => e.embudo_id === o.embudo_id).map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </label>
      ))}
      {cerradas.map((o) => (
        <div key={o.id} className="muted op-cerrada">
          <span className={`chip ${o.estado === 'ganada' ? 'ok' : 'bad'}`}>{nombreEtapa(o.etapa_id)}</span>{' '}
          {nombreEmbudo(o.embudo_id)}{o.motivo_perdido ? ` · ${o.motivo_perdido}` : ''}
          {o.cerrado_en ? ` · ${new Date(o.cerrado_en).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })}` : ''}
        </div>
      ))}
      {puede && sinAbrir.length > 0 && (
        <div className="inline" style={{ marginTop: 6 }}>
          <select value={nuevo} onChange={(e) => setNuevo(e.target.value)} aria-label="Embudo">
            <option value="">Abrir en otro embudo…</option>
            {sinAbrir.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <button className="btn chico" disabled={ocupado || !nuevo} onClick={() => hacer(() => abrirOportunidad(lead, Number(nuevo))).then(() => setNuevo(''))}>
            Abrir
          </button>
        </div>
      )}
      {error && <div className="aviso bad" role="alert">{error}</div>}
      {perdida && (
        <MotivoPerdida etapa={perdida.etapa.nombre} alCancelar={() => setPerdida(null)}
          alElegir={(m) => {
            const p = perdida
            setPerdida(null)
            hacer(() => moverOportunidad(p.op, p.etapa.id, m))
          }} />
      )}
    </div>
  )
}

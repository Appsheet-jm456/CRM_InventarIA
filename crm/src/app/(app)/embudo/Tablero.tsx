'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MotivoPerdida } from '@/components/MotivoPerdida'
import { clienteNavegador, prepararTiempoReal } from '@/lib/supabase/navegador'
import { moverOportunidad } from '../bandeja/acciones'

type Etapa = { id: number; nombre: string; color: string; cierre: string }
type Oportunidad = {
  id: number
  etapa_id: number
  estado: string
  valor_estimado: number | null
  producto: string
  motivo_perdido: string | null
  lead_id: number
  leads: { nombre: string; telefono: string; estado_chat: string; asignado_a: string | null } | null
}

const COLORES: Record<string, string> = {
  Gris: '#8A9A92', Azul: '#3B82C4', Amarillo: '#D4A017', Naranja: '#E07B2E', Morado: '#8B5CC4', Verde: '#2E8C6A', Rojo: '#C4453B',
}
const pesos = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

export function Tablero({ etapas, oportunidades, nombres, yo }: {
  etapas: Etapa[]
  oportunidades: Oportunidad[]
  nombres: Record<string, string>
  yo: string
}) {
  const router = useRouter()
  const [local, setLocal] = useState(oportunidades)
  const [arrastrada, setArrastrada] = useState<number | null>(null)
  const [sobre, setSobre] = useState<number | null>(null)
  const [perdida, setPerdida] = useState<{ op: number; etapa: Etapa } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => setLocal(oportunidades), [oportunidades])

  // Tiempo real: cualquier cambio en oportunidades (el bot, otro asesor) vuelve a pedir el tablero.
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined
    let canal: ReturnType<ReturnType<typeof clienteNavegador>['channel']> | null = null
    let vigente = true
    prepararTiempoReal().then((supabase) => {
      if (!vigente) return
      canal = supabase
        .channel('embudo')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, () => {
          clearTimeout(espera)
          espera = setTimeout(() => router.refresh(), 300)
        })
        .subscribe()
    })
    return () => {
      vigente = false
      clearTimeout(espera)
      if (canal) clienteNavegador().removeChannel(canal)
    }
  }, [router])

  async function mover(op: number, etapaId: number, motivo?: string) {
    const actual = local.find((o) => o.id === op)
    const etapa = etapas.find((e) => e.id === etapaId)
    if (!actual || !etapa || actual.etapa_id === etapaId) return
    if (!motivo && etapa.cierre === 'perdida') {
      setPerdida({ op, etapa })
      return
    }
    setError('')
    setLocal((os) => os.map((o) => (o.id === op ? { ...o, etapa_id: etapaId, motivo_perdido: motivo ?? null } : o)))
    const r = await moverOportunidad(op, etapaId, motivo)
    if (r.error) {
      setError(r.error)
      setLocal(oportunidades)
    }
    router.refresh()
  }

  const estadoChat = (o: Oportunidad) => {
    const l = o.leads
    if (!l) return ''
    if (l.estado_chat === 'asignada') return l.asignado_a === yo ? 'Tuya' : nombres[l.asignado_a ?? ''] ?? 'Asignada'
    return { cola: 'En cola', bot: 'Bot', cerrada: 'Chat cerrado' }[l.estado_chat] ?? ''
  }

  return (
    <>
      {error && <div className="aviso bad" role="alert">{error}</div>}
      <div className="kanban">
        {etapas.map((e) => {
          const suyas = local.filter((o) => o.etapa_id === e.id)
          const total = suyas.reduce((s, o) => s + Number(o.valor_estimado ?? 0), 0)
          return (
            <section
              key={e.id}
              className={`k-col${sobre === e.id ? ' sobre' : ''}`}
              onDragOver={(ev) => {
                ev.preventDefault()
                setSobre(e.id)
              }}
              onDragLeave={() => setSobre((s) => (s === e.id ? null : s))}
              onDrop={(ev) => {
                ev.preventDefault()
                setSobre(null)
                if (arrastrada) mover(arrastrada, e.id)
                setArrastrada(null)
              }}
            >
              <div className="k-h" style={{ borderTopColor: COLORES[e.color] ?? COLORES.Gris }}>
                <b>{e.nombre}</b>
                <span className="chip neu">{suyas.length}</span>
                {total > 0 && <small>{pesos(total)}</small>}
              </div>
              <div className="k-tarjetas">
                {suyas.map((o) => (
                  <article key={o.id} className="k-tarjeta" draggable onDragStart={() => setArrastrada(o.id)} onDragEnd={() => setArrastrada(null)}>
                    <Link href={`/bandeja?c=${o.lead_id}`} className="k-nombre">{o.leads?.nombre || (o.leads ? `+${o.leads.telefono}` : 'Cliente')}</Link>
                    {o.producto && <small>Equipo {o.producto}</small>}
                    {o.valor_estimado ? <small className="num">{pesos(Number(o.valor_estimado))}</small> : null}
                    {o.motivo_perdido && <small>Motivo: {o.motivo_perdido}</small>}
                    <div className="k-pie">
                      <span className="chip neu">{estadoChat(o)}</span>
                      <select aria-label="Mover a otra etapa" value={o.etapa_id} onChange={(ev) => mover(o.id, Number(ev.target.value))}>
                        {etapas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                      </select>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
      {perdida && (
        <MotivoPerdida etapa={perdida.etapa.nombre} alCancelar={() => setPerdida(null)}
          alElegir={(m) => {
            const p = perdida
            setPerdida(null)
            mover(p.op, p.etapa.id, m)
          }} />
      )}
    </>
  )
}

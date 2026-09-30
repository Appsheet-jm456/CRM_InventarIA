'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { clienteNavegador, prepararTiempoReal } from '@/lib/supabase/navegador'
import { moverEtapa } from '../bandeja/acciones'

type Etapa = { nombre: string; color: string; cierre: string }
type Lead = {
  id: number
  nombre: string
  telefono: string
  etapa: string
  estado_chat: string
  asignado_a: string | null
  valor_estimado: number | null
  cotiz_producto: string
  fecha_ultimo_contacto: string | null
  motivo_perdido: string | null
}

const MOTIVOS = ['Precio', 'Sin respuesta', 'No calificado', 'Compró en otro lado', 'Solo preguntaba', 'Otro']
const COLORES: Record<string, string> = {
  Gris: '#8A9A92', Azul: '#3B82C4', Amarillo: '#D4A017', Naranja: '#E07B2E', Morado: '#8B5CC4', Verde: '#2E8C6A', Rojo: '#C4453B',
}
const pesos = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

export function Tablero({ etapas, leads, nombres, yo }: {
  etapas: Etapa[]
  leads: Lead[]
  nombres: Record<string, string>
  yo: string
}) {
  const router = useRouter()
  const [local, setLocal] = useState(leads)
  const [arrastrado, setArrastrado] = useState<number | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const [perdido, setPerdido] = useState<{ lead: number; etapa: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => setLocal(leads), [leads])

  // Tiempo real: cualquier cambio en leads (el bot, otro asesor) vuelve a pedir el tablero.
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined
    let canal: ReturnType<ReturnType<typeof clienteNavegador>['channel']> | null = null
    let vigente = true
    prepararTiempoReal().then((supabase) => {
      if (!vigente) return
      canal = supabase
        .channel('embudo')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
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

  async function mover(lead: number, etapa: string, motivo?: string) {
    const actual = local.find((l) => l.id === lead)
    if (!actual || actual.etapa === etapa) return
    if (!motivo && etapas.find((e) => e.nombre === etapa)?.cierre === 'perdida') {
      setPerdido({ lead, etapa })
      return
    }
    setError('')
    setLocal((ls) => ls.map((l) => (l.id === lead ? { ...l, etapa, motivo_perdido: motivo ?? null } : l)))
    const r = await moverEtapa(lead, etapa, motivo)
    if (r.error) {
      setError(r.error)
      setLocal(leads)
    }
    router.refresh()
  }

  return (
    <>
      {error && <div className="aviso bad" role="alert">{error}</div>}
      <div className="kanban">
        {etapas.map((e) => {
          const suyos = local.filter((l) => l.etapa === e.nombre)
          const total = suyos.reduce((s, l) => s + Number(l.valor_estimado ?? 0), 0)
          return (
            <section
              key={e.nombre}
              className={`k-col${sobre === e.nombre ? ' sobre' : ''}`}
              onDragOver={(ev) => {
                ev.preventDefault()
                setSobre(e.nombre)
              }}
              onDragLeave={() => setSobre((s) => (s === e.nombre ? null : s))}
              onDrop={(ev) => {
                ev.preventDefault()
                setSobre(null)
                if (arrastrado) mover(arrastrado, e.nombre)
                setArrastrado(null)
              }}
            >
              <div className="k-h" style={{ borderTopColor: COLORES[e.color] ?? COLORES.Gris }}>
                <b>{e.nombre}</b>
                <span className="chip neu">{suyos.length}</span>
                {total > 0 && <small>{pesos(total)}</small>}
              </div>
              <div className="k-tarjetas">
                {suyos.map((l) => (
                  <article
                    key={l.id}
                    className="k-tarjeta"
                    draggable
                    onDragStart={() => setArrastrado(l.id)}
                    onDragEnd={() => setArrastrado(null)}
                  >
                    <Link href={`/bandeja?c=${l.id}`} className="k-nombre">{l.nombre || `+${l.telefono}`}</Link>
                    {l.cotiz_producto && <small>Equipo {l.cotiz_producto}</small>}
                    {l.valor_estimado ? <small className="num">{pesos(Number(l.valor_estimado))}</small> : null}
                    {l.motivo_perdido && <small>Motivo: {l.motivo_perdido}</small>}
                    <div className="k-pie">
                      <span className="chip neu">
                        {l.estado_chat === 'asignada' ? (l.asignado_a === yo ? 'Tuya' : nombres[l.asignado_a ?? ''] ?? 'Asignada')
                          : l.estado_chat === 'cola' ? 'En cola' : l.estado_chat === 'bot' ? 'Bot' : 'Cerrada'}
                      </span>
                      <select aria-label="Mover a otra etapa" value={l.etapa} onChange={(ev) => mover(l.id, ev.target.value)}>
                        {etapas.map((x) => <option key={x.nombre} value={x.nombre}>{x.nombre}</option>)}
                      </select>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {perdido && (
        <div className="modal" onClick={() => setPerdido(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Motivo de pérdida">
            <h3>¿Por qué se perdió?</h3>
            <div className="row">
              {MOTIVOS.map((m) => (
                <button key={m} className="btn" onClick={() => {
                  const p = perdido
                  setPerdido(null)
                  mover(p.lead, p.etapa, m)
                }}>{m}</button>
              ))}
            </div>
            <button className="btn chico" onClick={() => setPerdido(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  )
}

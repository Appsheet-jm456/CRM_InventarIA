'use client'

import { useCallback, useEffect, useState } from 'react'
import { clienteNavegador } from '@/lib/supabase/navegador'
import { enDias, isoDeBogota } from '@/lib/fechas'
import { agendar, cancelar, marcarHecho } from '../seguimientos/acciones'

type Seguimiento = { id: number; que: string; vence_en: string; asignado_a: string }

export const cuando = (t: string) =>
  new Date(t).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' })

// Seguimientos pendientes del cliente abierto y el formulario para agendar uno (RS-01, RS-02).
export function SeguimientosCliente({ lead, nombres, puedeAgendar }: { lead: number; nombres: Map<string, string>; puedeAgendar: boolean }) {
  const [lista, setLista] = useState<Seguimiento[]>([])
  const [que, setQue] = useState('')
  const [vence, setVence] = useState(enDias(1))
  const [aviso, setAviso] = useState<{ error?: string; ok?: string }>({})
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    const { data } = await clienteNavegador()
      .from('seguimientos')
      .select('id, que, vence_en, asignado_a')
      .eq('lead_id', lead)
      .eq('estado', 'pendiente')
      .order('vence_en')
    setLista((data ?? []) as Seguimiento[])
  }, [lead])

  useEffect(() => {
    setAviso({})
    cargar()
  }, [cargar])

  async function hacer(accion: () => Promise<{ error?: string; ok?: string }>) {
    setOcupado(true)
    const r = await accion()
    setOcupado(false)
    setAviso(r)
    if (!r.error) cargar()
    return !r.error
  }

  return (
    <div className="dato">
      <small>Seguimientos</small>
      {lista.length === 0 && <div className="muted" style={{ fontWeight: 400 }}>Ninguno pendiente.</div>}
      {lista.map((s) => {
        const vencido = new Date(s.vence_en).getTime() < Date.now()
        return (
          <div key={s.id} className="seg">
            <div>
              <span className={`chip ${vencido ? 'bad' : 'neu'}`}>{vencido ? 'Vencido' : cuando(s.vence_en)}</span> {s.que}
              {vencido && <small className="muted"> · {cuando(s.vence_en)}</small>}
              <small className="muted"> · {nombres.get(s.asignado_a) ?? ''}</small>
            </div>
            <div className="inline">
              <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => marcarHecho(s.id))}>Hecho</button>
              <button className="btn chico peligro" disabled={ocupado} onClick={() => hacer(() => cancelar(s.id))}>Cancelar</button>
            </div>
          </div>
        )
      })}
      {puedeAgendar && (
        <div className="seg-nuevo">
          <input placeholder="Qué hay que hacer (ej.: enviar cotización)" value={que} onChange={(e) => setQue(e.target.value)} />
          <div className="inline" style={{ flexWrap: 'wrap' }}>
            <button className="btn chico" type="button" onClick={() => setVence(enDias(1))}>Mañana 9 a. m.</button>
            <button className="btn chico" type="button" onClick={() => setVence(enDias(3))}>En 3 días</button>
            <input type="datetime-local" value={vence} onChange={(e) => setVence(e.target.value)} />
          </div>
          <button className="btn primary chico" disabled={ocupado || !que.trim()}
            onClick={async () => (await hacer(() => agendar(lead, que, isoDeBogota(vence)))) && setQue('')}>
            Agendar seguimiento
          </button>
        </div>
      )}
      {aviso.error && <div className="aviso bad" role="alert">{aviso.error}</div>}
    </div>
  )
}

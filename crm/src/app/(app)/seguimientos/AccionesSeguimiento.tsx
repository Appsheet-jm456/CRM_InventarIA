'use client'

import { useState } from 'react'
import { enDias, isoDeBogota } from '@/lib/fechas'
import { cancelar, marcarHecho, reprogramar } from './acciones'

export function AccionesSeguimiento({ id }: { id: number }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [fecha, setFecha] = useState('')

  async function hacer(accion: () => Promise<{ error?: string }>) {
    setOcupado(true)
    const r = await accion()
    setOcupado(false)
    setError(r.error ?? '')
  }

  return (
    <div className="inline" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => marcarHecho(id))}>Hecho</button>
      <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => reprogramar(id, isoDeBogota(enDias(1))))}>Mañana</button>
      <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Nueva fecha" />
      <button className="btn chico" disabled={ocupado || !fecha} onClick={() => hacer(() => reprogramar(id, isoDeBogota(fecha)))}>Mover</button>
      <button className="btn chico peligro" disabled={ocupado} onClick={() => hacer(() => cancelar(id))}>Cancelar</button>
      {error && <small className="aviso bad">{error}</small>}
    </div>
  )
}

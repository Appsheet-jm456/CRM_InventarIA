'use client'

import { useEffect, useState } from 'react'
import type { Plantilla } from '@/lib/meta'
import { plantillasParaEnviar, responderConPlantilla } from './acciones'

const COBRO: Record<string, string> = {
  MARKETING: 'Marketing: Meta la cobra.',
  UTILITY: 'Utilidad: Meta la cobra fuera de la ventana de servicio.',
  AUTHENTICATION: 'Autenticación: Meta la cobra.',
}

// RS-06: fuera de la ventana de 24 h la respuesta sale como plantilla aprobada de Meta.
export function ComponerPlantilla({ lead, nombreCliente, alEnviar }: { lead: number; nombreCliente: string; alEnviar: () => void }) {
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null)
  const [error, setError] = useState('')
  const [elegida, setElegida] = useState('')
  const [valores, setValores] = useState<string[]>([])
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    plantillasParaEnviar().then((r) => {
      setPlantillas(r.plantillas)
      if (r.error) setError(r.error)
    })
  }, [])

  const plantilla = plantillas?.find((p) => `${p.nombre}|${p.idioma}` === elegida)
  useEffect(() => {
    if (plantilla) setValores(Array.from({ length: plantilla.variables }, (_, i) => (i === 0 ? nombreCliente.split(' ')[0] : '')))
  }, [elegida]) // eslint-disable-line react-hooks/exhaustive-deps

  const vista = plantilla?.cuerpo.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] || `[dato ${n}]`)

  async function enviar() {
    if (!plantilla) return
    setOcupado(true)
    setError('')
    const r = await responderConPlantilla(lead, plantilla.nombre, plantilla.idioma, valores)
    setOcupado(false)
    if (r.error) setError(r.error)
    else {
      setElegida('')
      alEnviar()
    }
  }

  return (
    <div className="plantilla">
      <small className="muted">
        Pasaron más de 24 horas desde el último mensaje del cliente: Meta solo deja escribirle con una plantilla aprobada.
      </small>
      {error && <div className="aviso bad" role="alert">{error}</div>}
      {plantillas === null ? (
        <small className="muted">Buscando plantillas…</small>
      ) : plantillas.length === 0 ? (
        <div className="aviso">No hay plantillas aprobadas. El administrador las envía a aprobación en Configuración → Canal WhatsApp.</div>
      ) : (
        <>
          <label className="field">
            Plantilla
            <select value={elegida} onChange={(e) => setElegida(e.target.value)}>
              <option value="">Elige una plantilla</option>
              {plantillas.map((p) => (
                <option key={`${p.nombre}|${p.idioma}`} value={`${p.nombre}|${p.idioma}`}>{p.nombre} ({p.idioma})</option>
              ))}
            </select>
          </label>
          {plantilla && (
            <>
              {valores.map((v, i) => (
                <label key={i} className="field">
                  Dato {i + 1}
                  <input value={v} onChange={(e) => setValores((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))} />
                </label>
              ))}
              <div className="m asesor plantilla-vista">{vista}</div>
              {COBRO[plantilla.categoria] && <small className="muted">{COBRO[plantilla.categoria]}</small>}
              <button className="btn primary" disabled={ocupado || valores.some((v) => !v.trim())} onClick={enviar}>
                {ocupado ? 'Enviando…' : 'Enviar plantilla'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

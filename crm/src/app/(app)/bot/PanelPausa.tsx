'use client'

import { useState, useTransition } from 'react'
import { borrarCuadro, guardarPausa, type Resultado } from './acciones'
import type { Cuadro } from './Lienzo'

export const MAX_ESPERA = 86399 // 23 h 59 min 59 s: la ventana de 24 h de Meta (RF-14)

export function textoEspera(segundos: number) {
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  const s = segundos % 60
  return `${h} h ${m} min ${s} s`
}

// Panel del cuadro Pausa (F4·13, RF-14 y RF-15): cuánto espera y a dónde sigue en cada caso.
export function PanelPausa({ bot, cuadro, destinos, editable, alTerminar }: {
  bot: number
  cuadro: Cuadro
  destinos: Cuadro[]
  editable: boolean
  alTerminar: (r: Resultado, borrado?: boolean) => void
}) {
  const inicial = Number(cuadro.ajustes?.segundos ?? 900)
  const [nombre, setNombre] = useState(cuadro.nombre)
  const [h, setH] = useState(Math.floor(inicial / 3600))
  const [m, setM] = useState(Math.floor((inicial % 3600) / 60))
  const [s, setS] = useState(inicial % 60)
  const [respondio, setRespondio] = useState<string | null>(cuadro.salidas?.respondio ?? null)
  const [tiempo, setTiempo] = useState<string | null>(cuadro.salidas?.tiempo ?? null)
  const [ocupado, iniciar] = useTransition()
  const total = h * 3600 + m * 60 + s
  const fuera = total < 1 || total > MAX_ESPERA
  const numero = (v: string, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)))

  const destino = (valor: string | null, cambiar: (v: string | null) => void, etiqueta: string) => (
    <label className="field">{etiqueta}
      <select value={valor ?? ''} disabled={!editable || ocupado} onChange={(e) => cambiar(e.target.value || null)}>
        <option value="">— sin destino —</option>
        {destinos.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
      </select>
    </label>
  )

  return (
    <div className="lienzo-panel">
      <div className="lienzo-panel-h">
        <div><b>{cuadro.nombre}</b><small className="muted"> · {cuadro.clave}</small></div>
        <small className="muted">⏳ Pausa</small>
      </div>
      {!editable && <div className="aviso">Estás viendo la versión publicada. Para cambiar el flujo, abre un borrador.</div>}
      <small className="muted">
        No envía nada: espera. Si el cliente escribe antes, sigue por «El cliente respondió» con su mensaje (por ejemplo, a unas
        Condiciones). Si no, al cumplirse el tiempo sigue por «Pasó el tiempo», normalmente un mensaje de recordatorio.
      </small>
      {editable && (
        <label className="field">Nombre en el lienzo<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} /></label>
      )}
      <fieldset className="pausa-tiempo" disabled={!editable || ocupado}>
        <legend>Esperar</legend>
        <label><input type="number" min={0} max={23} value={h} onChange={(e) => setH(numero(e.target.value, 23))} aria-label="Horas" /> h</label>
        <label><input type="number" min={0} max={59} value={m} onChange={(e) => setM(numero(e.target.value, 59))} aria-label="Minutos" /> min</label>
        <label><input type="number" min={0} max={59} value={s} onChange={(e) => setS(numero(e.target.value, 59))} aria-label="Segundos" /> s</label>
      </fieldset>
      {fuera
        ? <div className="aviso bad">La espera va de 1 segundo a 23 h 59 min 59 s: Meta solo deja escribirle al cliente dentro de las 24 h.</div>
        : <small className="muted">El reloj revisa cada 5 segundos. El recordatorio no sale si el chat está con un asesor, si el cliente ya
          siguió por otro lado o si pasaron 24 h desde su último mensaje (queda la etiqueta «Recordatorio-no-enviado»).</small>}
      {destino(respondio, setRespondio, 'El cliente respondió, sigue a')}
      {destino(tiempo, setTiempo, 'Pasó el tiempo, sigue a')}
      {editable && (
        <div className="row">
          <button className="btn primary" disabled={ocupado || fuera}
            onClick={() => iniciar(async () => alTerminar(await guardarPausa(bot, cuadro.clave, nombre, total, respondio, tiempo)))}>
            {ocupado ? 'Guardando…' : 'Guardar en el borrador'}
          </button>
          <button className="btn peligro" disabled={ocupado}
            onClick={() => confirm(`¿Borrar el cuadro ${cuadro.nombre} del borrador? Las flechas que llegan quedan sueltas.`)
              && iniciar(async () => alTerminar(await borrarCuadro(bot, cuadro.clave), true))}>Borrar cuadro</button>
        </div>
      )}
    </div>
  )
}

'use client'

import type { Cuadro } from './Lienzo'
import { MAX_ESPERA } from './PanelPausa'

// Salidas opcionales del Mensaje, como en Kommo (F4·18, RF-20 a RF-22). Sin destino, el bot hace lo de siempre.
export function OtrasSalidas({ sinBotones, destinos, todos, deshabilitado, otra, setOtra, sinRespuesta, setSinRespuesta, error, setError, espera, setEspera }: {
  sinBotones: boolean
  destinos: Cuadro[] // sin el propio cuadro: «Sin respuesta» no vuelve a él
  todos: Cuadro[]
  deshabilitado: boolean
  otra: string | null
  setOtra: (v: string | null) => void
  sinRespuesta: string | null
  setSinRespuesta: (v: string | null) => void
  error: string | null
  setError: (v: string | null) => void
  espera: number
  setEspera: (v: number) => void
}) {
  const h = Math.floor(espera / 3600)
  const m = Math.floor((espera % 3600) / 60)
  const s = espera % 60
  const numero = (v: string, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)))
  const fuera = espera < 1 || espera > MAX_ESPERA
  const selector = (valor: string | null, cambiar: (v: string | null) => void, lista: Cuadro[], etiqueta: string) => (
    <select value={valor ?? ''} disabled={deshabilitado} aria-label={etiqueta} onChange={(e) => cambiar(e.target.value || null)}>
      <option value="">— no hacer nada —</option>
      {lista.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
    </select>
  )

  return (
    <div className="lienzo-opciones otras-salidas">
      <strong>Otras salidas</strong>
      <small className="muted">Opcionales. Si no llevan a ningún cuadro, el bot sigue como siempre.</small>
      {!sinBotones && (
        <label className="field">Otra respuesta, sigue a
          {selector(otra, setOtra, todos, 'Otra respuesta')}
          <small className="muted">Si el cliente escribe algo que no es una opción. Va antes de la búsqueda en el inventario; «9», «hola», «reiniciar» y un código de equipo siguen funcionando igual.</small>
        </label>
      )}
      <label className="field">Sin respuesta, sigue a
        {selector(sinRespuesta, setSinRespuesta, destinos, 'Sin respuesta')}
      </label>
      {sinRespuesta && (
        <>
          <fieldset className="pausa-tiempo" disabled={deshabilitado}>
            <legend>Si no responde en</legend>
            <label><input type="number" min={0} max={23} value={h} onChange={(e) => setEspera(numero(e.target.value, 23) * 3600 + m * 60 + s)} aria-label="Horas" /> h</label>
            <label><input type="number" min={0} max={59} value={m} onChange={(e) => setEspera(h * 3600 + numero(e.target.value, 59) * 60 + s)} aria-label="Minutos" /> min</label>
            <label><input type="number" min={0} max={59} value={s} onChange={(e) => setEspera(h * 3600 + m * 60 + numero(e.target.value, 59))} aria-label="Segundos" /> s</label>
          </fieldset>
          {fuera
            ? <div className="aviso bad">La espera va de 1 segundo a 23 h 59 min 59 s: Meta solo deja escribirle al cliente dentro de las 24 h.</div>
            : <small className="muted">No sale si el chat está con un asesor, si el cliente ya siguió por otro lado o si pasaron 24 h desde su último mensaje.</small>}
        </>
      )}
      <label className="field">Error al enviar el mensaje, sigue a
        {selector(error, setError, todos, 'Error al enviar el mensaje')}
        <small className="muted">Si Meta no entrega este mensaje (fuera de las 24 h, número inválido o cliente que bloqueó). Lo que se envíe desde aquí no vuelve a dispararlo.</small>
      </label>
    </div>
  )
}

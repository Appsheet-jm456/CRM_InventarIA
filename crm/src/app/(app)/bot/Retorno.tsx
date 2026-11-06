'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { guardarRetorno, type Resultado } from './acciones'
import { VistaWhatsApp } from './VistaWhatsApp'

export type AjustesRetorno = {
  activo: boolean
  a_activa: boolean; a_horas: number; a_texto: string; a_boton_si: string; a_boton_asesor: string; a_boton_no: string
  b_activa: boolean; b_horas: number; b_texto: string; b_boton_si: string; b_boton_espera: string
  texto_espera: string; texto_no: string
  volver_respuesta: boolean; palabra: string; volver_inactividad: boolean; inactividad_horas: number
  destino_bot: number | null; vendido_vuelve: boolean; vendido_bot: number | null
  solo_horario: boolean; etiquetas_excluidas: string[]
}
export type BotOpcion = { id: number; nombre: string; principal: boolean }

const conNombre = (s: string) => s.replace(/\{nombre\}/g, 'Ana')

// Configuración → Bot → Retorno y seguimiento (F4·45, RT-01 a RT-10, decisión 0035).
export function PanelRetorno({ actual, bots }: { actual: AjustesRetorno; bots: BotOpcion[] }) {
  const router = useRouter()
  const [a, setA] = useState(actual)
  const [etiquetas, setEtiquetas] = useState(actual.etiquetas_excluidas.join(', '))
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, iniciar] = useTransition()
  const pon = (c: Partial<AjustesRetorno>) => setA({ ...a, ...c })
  const listo = { ...a, etiquetas_excluidas: etiquetas.split(',').map((e) => e.trim()).filter(Boolean) }
  const cambio = JSON.stringify(listo) !== JSON.stringify(actual)
  const apagado = ocupado || !a.activo

  function guardar() {
    const enciende = !actual.activo && a.activo
    if (enciende && !confirm('¿Encender el retorno? Desde ya el bot puede escribirles solo a los clientes que cumplan las reglas (una vez y dentro de las 24 h).')) return
    iniciar(async () => {
      const r = await guardarRetorno(listo)
      setAviso(r)
      if (!r.error) router.refresh()
    })
  }

  const casilla = (k: keyof AjustesRetorno, texto: string, deshabilitado = apagado) => (
    <label className="check">
      <input type="checkbox" checked={a[k] as boolean} disabled={deshabilitado} onChange={(e) => pon({ [k]: e.target.checked })} />
      <span>{texto}</span>
    </label>
  )
  const texto = (k: keyof AjustesRetorno, etiqueta: string, ayuda?: string) => (
    <label className="field">{etiqueta}
      <textarea rows={2} maxLength={1024} value={a[k] as string} disabled={apagado} onChange={(e) => pon({ [k]: e.target.value })} />
      {ayuda && <small className="muted">{ayuda}</small>}
    </label>
  )
  const boton = (k: keyof AjustesRetorno, etiqueta: string) => (
    <label className="field">{etiqueta}
      <input maxLength={20} value={a[k] as string} disabled={apagado} onChange={(e) => pon({ [k]: e.target.value })} />
    </label>
  )
  const horas = (k: keyof AjustesRetorno, etiqueta: string, min: number, max: number, paso = 0.5) => (
    <label className="field">{etiqueta}
      <input type="number" min={min} max={max} step={paso} value={a[k] as number} disabled={apagado}
        onChange={(e) => pon({ [k]: Number(e.target.value) })} />
    </label>
  )
  const elegirBot = (k: 'destino_bot' | 'vendido_bot', vacio: string) => (
    <select value={a[k] ?? ''} disabled={apagado} onChange={(e) => pon({ [k]: e.target.value ? Number(e.target.value) : null })}>
      <option value="">{vacio}</option>
      {bots.filter((b) => !b.principal || k === 'vendido_bot').map((b) => <option key={b.id} value={b.id}>{b.nombre}{b.principal ? ' (principal)' : ''}</option>)}
    </select>
  )

  return (
    <section className="panel">
      <div className="panel-h"><h2>Retorno y seguimiento</h2><small className="muted">Solo el administrador · el bot lo usa en menos de 30 s</small></div>
      <div className="panel-b" style={{ display: 'grid', gap: 16 }}>
        {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}

        <div className="interruptor-fila">
          <button type="button" className={`toggle${a.activo ? ' on' : ''}`} aria-pressed={a.activo} aria-label="Retorno y seguimiento" disabled={ocupado}
            onClick={() => pon({ activo: !a.activo })} />
          <div>
            <b>Retorno del bot y seguimiento automático</b> <span className={`chip ${a.activo ? 'ok' : 'neu'}`}>{a.activo ? 'Encendido' : 'Apagado'}</span>
            <small className="muted" style={{ display: 'block' }}>
              {a.activo
                ? 'El bot escribe solo una vez por silencio, siempre dentro de las 24 h de Meta (sin plantilla ni costo), y devuelve los chats al bot según las reglas de abajo.'
                : 'Todo funciona como antes: el bot no escribe solo y un chat con asesor vuelve al bot solo con «Devolver al bot», al cerrarlo o con «reiniciar».'}
            </small>
          </div>
        </div>

        <fieldset className="f-seccion" disabled={apagado}>
          <legend>A · El cliente dejó de responder</legend>
          {casilla('a_activa', 'Escribirle si no responde después de nuestro último mensaje (del bot o de un asesor)')}
          <div className="row" style={{ alignItems: 'end' }}>{horas('a_horas', 'Horas de silencio (1 a 23)', 1, 23)}</div>
          {texto('a_texto', 'Mensaje', '{nombre} es el primer nombre del cliente (si no se sabe, se quita).')}
          <div className="row">{boton('a_boton_si', 'Botón 1 (sigue con el bot)')}{boton('a_boton_asesor', 'Botón 2 (asesor)')}{boton('a_boton_no', 'Botón 3 (no le interesa)')}</div>
          <div className="lienzo-vista">
            <strong>Así lo ve el cliente</strong>
            <VistaWhatsApp cuerpo={conNombre(a.a_texto)} forma="botones" numerar={false}
              opciones={[{ id: '1', titulo: a.a_boton_si }, { id: '2', titulo: a.a_boton_asesor }, { id: '3', titulo: a.a_boton_no }]} />
          </div>
        </fieldset>

        <fieldset className="f-seccion" disabled={apagado}>
          <legend>B · El asesor no respondió</legend>
          {casilla('b_activa', 'Avisarle al cliente si está con un asesor y ninguna persona le contesta')}
          <div className="row" style={{ alignItems: 'end' }}>{horas('b_horas', 'Horas hábiles sin respuesta (0,5 a 23)', 0.5, 23)}</div>
          {texto('b_texto', 'Mensaje de demora')}
          <div className="row">{boton('b_boton_si', 'Botón 1 (vuelve al bot)')}{boton('b_boton_espera', 'Botón 2 (espera al asesor)')}</div>
          <div className="lienzo-vista">
            <strong>Así lo ve el cliente</strong>
            <VistaWhatsApp cuerpo={conNombre(a.b_texto)} forma="botones" numerar={false}
              opciones={[{ id: '1', titulo: a.b_boton_si }, { id: '2', titulo: a.b_boton_espera }]} />
          </div>
          <small className="muted">Las horas hábiles usan el horario y los festivos de la pestaña «Horario y festivos».</small>
        </fieldset>

        <fieldset className="f-seccion" disabled={apagado}>
          <legend>Respuestas del bot a los botones</legend>
          {texto('texto_espera', 'Cuando prefiere esperar al asesor')}
          {texto('texto_no', 'Cuando ya no le interesa', 'El cliente queda con la etiqueta No-Interesado y no vuelve a recibir mensajes automáticos.')}
        </fieldset>

        <fieldset className="f-seccion" disabled={apagado}>
          <legend>Volver al bot</legend>
          {casilla('volver_respuesta', 'Cuando el cliente toca «Sí» (o escribe la palabra de abajo), el chat deja al asesor y vuelve al bot')}
          <label className="field">Palabra que también vale como «Sí» (opcional)
            <input maxLength={40} value={a.palabra} disabled={apagado} placeholder="continuar" onChange={(e) => pon({ palabra: e.target.value })} />
            <small className="muted">Solo cuenta si el cliente tiene un mensaje automático sin responder.</small>
          </label>
          {casilla('volver_inactividad', 'Si nadie escribe en el chat (ni el cliente ni el asesor), vuelve al bot en silencio')}
          <div className="row" style={{ alignItems: 'end' }}>{horas('inactividad_horas', 'Horas sin actividad (1 a 720)', 1, 720, 1)}</div>
          <small className="muted">«Devolver al bot» en la Bandeja y cerrar el chat siempre devuelven el chat al bot.</small>
          <label className="field">A dónde vuelve
            {elegirBot('destino_bot', 'Al inicio del bot principal')}
          </label>
          <label className="field">Clientes que ya compraron (etapa de cierre ganada, como Vendido)
            {elegirBot('vendido_bot', 'Al mismo destino de arriba')}
          </label>
          {casilla('vendido_vuelve', 'Con los clientes que ya compraron, también volver al bot por inactividad (si no, se quedan con el asesor)')}
        </fieldset>

        <fieldset className="f-seccion" disabled={apagado}>
          <legend>Cuándo no se escribe</legend>
          {casilla('solo_horario', 'Solo en horario de atención (si vence de noche, sale al abrir si todavía cumple las 24 h)')}
          <label className="field">Etiquetas que nunca reciben el mensaje
            <input value={etiquetas} disabled={apagado} placeholder="No-Molestar, VIP" onChange={(e) => setEtiquetas(e.target.value)} />
            <small className="muted">Separadas por coma. Además, nunca se escribe si el chat está cerrado o archivado, si el cliente está en una etapa de
              cierre (Vendido, Perdido…), si tiene una compra esperando el pago o el comprobante, si está en una Pausa del lienzo, si dijo «Ya no,
              gracias», si el chatbot está apagado o si faltan menos de 30 min para cumplir 24 h desde su último mensaje.</small>
          </label>
        </fieldset>

        <div className="row">
          <button className="btn primary" disabled={ocupado || !cambio} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
          {cambio && <button className="btn" disabled={ocupado} onClick={() => { setA(actual); setEtiquetas(actual.etiquetas_excluidas.join(', ')) }}>Deshacer</button>}
        </div>
      </div>
    </section>
  )
}

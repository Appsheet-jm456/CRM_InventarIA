'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { guardarInterruptores, type Resultado } from './acciones'

export type Interruptores = { chatbot_activo: boolean; menu_activo: boolean; agente_en_todo: boolean; texto_apagado: string }
export type CambioInterruptores = { en: string; quien: string | null; antes: Record<string, unknown>; despues: Record<string, unknown> }

// Qué pasa con cada combinación (RF-31): lo que el dueño ve antes de guardar.
function resultado(i: Interruptores) {
  if (!i.chatbot_activo) return { tono: 'warn', texto: 'Todo lo atienden los asesores: cada mensaje entra a la cola de la Bandeja.' }
  if (i.menu_activo && i.agente_en_todo) return { tono: 'ok', texto: 'Menú guiado + Avi responde cualquier pregunta abierta + asesor.' }
  if (i.menu_activo) return { tono: 'ok', texto: 'Menú guiado + Avi solo en sus cuadros 🤖 del lienzo + asesor. El texto libre fuera de ellos lo atiende el Híbrido.' }
  if (i.agente_en_todo) return { tono: 'ok', texto: 'Solo Avi, sin menús; pasa al asesor cuando hace falta. Lo que Avi no atiende entra a la cola.' }
  return { tono: 'warn', texto: 'Es lo mismo que apagar el Chatbot: sin menú ni Avi, todo entra a la cola.' }
}

const NOMBRES: Record<string, string> = { chatbot: 'Chatbot', menu: 'Menú guiado', agente_en_todo: 'Avi en todo el bot', texto: 'Mensaje' }
const fecha = (t: string) => new Date(t).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })

// Configuración → Bot → Interruptores (F4·35, RF-31 a RF-35, decisión 0034).
export function PanelInterruptores({ actual, historial }: { actual: Interruptores; historial: CambioInterruptores[] }) {
  const router = useRouter()
  const [i, setI] = useState(actual)
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, iniciar] = useTransition()
  const cambio = JSON.stringify(i) !== JSON.stringify(actual)
  const r = resultado(i)

  const interruptor = (k: 'chatbot_activo' | 'menu_activo' | 'agente_en_todo', titulo: string, encendido: string, apagado: string, deshabilitado = false) => (
    <div className="interruptor-fila">
      <button type="button" className={`toggle${i[k] ? ' on' : ''}`} aria-pressed={i[k]} aria-label={titulo} disabled={ocupado || deshabilitado}
        onClick={() => setI({ ...i, [k]: !i[k] })} />
      <div>
        <b>{titulo}</b> <span className={`chip ${i[k] ? 'ok' : 'neu'}`}>{i[k] ? 'Encendido' : 'Apagado'}</span>
        <small className="muted" style={{ display: 'block' }}>{i[k] ? encendido : apagado}</small>
      </div>
    </div>
  )

  function guardar() {
    const apaga = actual.chatbot_activo && !i.chatbot_activo
    if (apaga && !confirm('¿Apagar el chatbot? Desde ya nadie automático contesta: cada mensaje entra a la cola de la Bandeja.')) return
    if (!apaga && !confirm('¿Guardar los interruptores? El bot los usa en menos de 30 segundos.')) return
    iniciar(async () => {
      const res = await guardarInterruptores(i)
      setAviso(res)
      if (!res.error) router.refresh()
    })
  }

  return (
    <section className="panel">
      <div className="panel-h"><h2>Interruptores del bot</h2><small className="muted">Solo el administrador · el bot los usa en menos de 30 s</small></div>
      <div className="panel-b" style={{ display: 'grid', gap: 16 }}>
        {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}
        {interruptor('chatbot_activo', '1. Chatbot', 'La automatización funciona según los otros dos interruptores.',
          'Nada automático contesta: ni menú, ni Avi, ni acciones, ni recordatorios. Cada mensaje entra a la cola de la Bandeja.')}
        {interruptor('menu_activo', '2. Menú guiado (el lienzo)', 'Los bots del lienzo atienden: menús, preguntas y cuadros 🤖 Agente.',
          'Sin menús: el texto lo atiende Avi si el 3 está encendido.', !i.chatbot_activo)}
        {interruptor('agente_en_todo', '3. Avi en texto libre en todo el bot', 'Cualquier pregunta abierta, en cualquier punto, la responde Avi.',
          'Avi solo entra donde pusiste un cuadro 🤖 Agente en el lienzo.', !i.chatbot_activo)}
        <div className={`aviso ${r.tono}`}><b>Resultado:</b> {r.texto}</div>
        <small className="muted">
          A quién atiende Avi (solo en Probar, números de prueba o todos) se elige en Configuración → Agente → Avi. Al apagar el Chatbot, los chats
          que ya están en la cola siguen ahí; al encenderlo, el bot atiende a los nuevos y los que tomó un asesor siguen con él.
        </small>
        <label className="field">
          Mensaje cuando el chatbot está apagado (opcional)
          <textarea rows={2} maxLength={1024} value={i.texto_apagado} disabled={ocupado} placeholder="Hola 👋 En un momento te atiende un asesor."
            onChange={(e) => setI({ ...i, texto_apagado: e.target.value })} />
          <small className="muted">
            El cliente lo recibe una vez, cuando su chat entra a la cola. Vacío: no se envía nada. Cuenta como mensaje de Meta. Puede llevar{' '}
            <b>{'{horario}'}</b> (los días y franjas de atención) y <b>{'{proxima}'}</b> («en breve» si hay atención ahora, o «mañana a las 8:00 am»), por ejemplo:
            «Hola 👋 Un asesor te responde {'{proxima}'}.»
          </small>
        </label>
        <div className="row">
          <button className="btn primary" disabled={ocupado || !cambio} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
          {cambio && <button className="btn" disabled={ocupado} onClick={() => setI(actual)}>Deshacer</button>}
        </div>
        {historial.length > 0 && (
          <div>
            <strong>Últimos cambios</strong>
            <ul className="lista-simple">
              {historial.map((h, n) => (
                <li key={n}>
                  <small className="muted">{fecha(h.en)} · {h.quien ?? 'Alguien'}</small>{' '}
                  {Object.keys(h.despues).filter((k) => h.antes[k] !== h.despues[k]).map((k) => k === 'texto'
                    ? 'cambió el mensaje'
                    : `${NOMBRES[k] ?? k}: ${h.despues[k] ? 'encendido' : 'apagado'}`).join(' · ')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

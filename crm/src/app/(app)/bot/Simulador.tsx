'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { Opcion } from '@/lib/bot'
import { simular, type EstadoSimulado } from './acciones'
import { textoEspera } from './PanelPausa'
import { VistaWhatsApp } from './VistaWhatsApp'

type Mensaje = Record<string, any>
type Turno = { id: number; lado: 'cliente' | 'bot' | 'aviso'; texto?: string; mensaje?: Mensaje }

const ETIQUETAS: Record<string, string> = { etapa: 'Etapa', Etiqueta: 'Etiqueta' }

// Un mensaje de la API de WhatsApp (lo que arma flujo.py) como lo ve el cliente.
function Burbuja({ m, alElegir }: { m: Mensaje; alElegir: (o: Opcion) => void }) {
  if (m._pdf) return <div className="wa"><div className="wa-burbuja"><div className="wa-texto">📄 <b>{m._pdf.nombre}</b> (catálogo PDF)</div></div></div>
  if (m.type === 'text') return <VistaWhatsApp cuerpo={m.text.body} forma="texto" opciones={[]} />
  const i = m.interactive
  const imagen = i.header?.type === 'image' ? '🖼 Foto del equipo' : undefined
  if (i.type === 'button') {
    const ops = i.action.buttons.map((b: Mensaje) => ({ id: b.reply.id, titulo: b.reply.title }))
    return <VistaWhatsApp cuerpo={i.body.text} forma="botones" opciones={ops} numerar={false} imagen={imagen} alElegir={alElegir} />
  }
  const ops = i.action.sections.flatMap((s: Mensaje) => s.rows.map((r: Mensaje) => ({ id: r.id, titulo: r.title, descripcion: r.description })))
  return <VistaWhatsApp cuerpo={i.body.text} forma="lista" opciones={ops} numerar={false} botonLista={i.action.button} alElegir={alElegir} />
}

// RF-07: el mismo motor del bot sobre la versión que se ve en el lienzo, sin escribir en la base ni enviar a WhatsApp.
export function Simulador({ bot, version, nombres, pausas, mensajesConEspera = new Set(), conError = new Set(), alMoverse, alCerrar }: {
  bot: number
  version: number
  nombres: Map<string, string>
  pausas: Map<string, number> // cuadros que esperan y cuánto: Pausas (F4·13) y Mensajes con «Sin respuesta» (RF-21)
  mensajesConEspera?: Set<string>
  conError?: Set<string> // Mensajes con «Error al enviar el mensaje» (RF-22)
  alMoverse: (clave: string | null) => void
  alCerrar: () => void
}) {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [estado, setEstado] = useState<EstadoSimulado>(null)
  const [texto, setTexto] = useState('')
  const [ocupado, iniciar] = useTransition()
  const fin = useRef<HTMLDivElement>(null)
  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' })
  }, [turnos])

  // evento 'tiempo': "Simular que pasó el tiempo" (Pausa o «Sin respuesta»); 'fallo': Meta no entregó el mensaje (RF-22).
  // No son mensajes del cliente.
  function enviar(entrada: string, visible = entrada, evento?: 'tiempo' | 'fallo') {
    if ((!entrada.trim() && !evento) || ocupado) return
    const base = Date.now()
    setTurnos((t) => [...t, evento
      ? { id: base, lado: 'aviso', texto: evento === 'fallo' ? '✗ Meta no entregó el último mensaje del bot.' : '⏳ Pasó el tiempo sin que el cliente escribiera.' }
      : { id: base, lado: 'cliente', texto: visible }])
    setTexto('')
    iniciar(async () => {
      const r = await simular(bot, version, estado, entrada, evento)
      if (r.error) {
        setTurnos((t) => [...t, { id: base + 1, lado: 'aviso', texto: r.error }])
        return
      }
      const nuevo = r.estado ?? null
      setEstado(nuevo)
      // Si la charla pasó a otro bot (RF-17), sus cuadros no están en este lienzo: no se resalta nada.
      alMoverse(nuevo?.bot === undefined || nuevo?.bot === bot ? ((nuevo?.nodo as string) ?? null) : null)
      setTurnos((t) => [
        ...t,
        ...(r.avisos ?? []).map((a, k) => ({ id: base + 1 + k, lado: 'bot' as const, mensaje: { type: 'text', text: { body: a } } })),
        ...(r.mensajes ?? []).map((m, k) => ({ id: base + 100 + k, lado: 'bot' as const, mensaje: m })),
        ...(!r.mensajes?.length && nuevo?.pausa
          ? [{ id: base + 99, lado: 'aviso' as const, texto: 'El chat está con un asesor: el bot no responde. Escribe «reiniciar» para volver a probar.' }]
          : []),
      ])
    })
  }

  function reiniciar() {
    setTurnos([])
    setEstado(null)
    alMoverse(null)
  }

  const campos = (estado?.campos ?? {}) as Record<string, unknown>
  const nodo = estado?.nodo as string | undefined
  const enEsteBot = estado?.bot === undefined || estado?.bot === bot
  const espera = estado?.espera_hasta && enEsteBot && nodo ? pausas.get(nodo) : undefined
  const puedeFallar = !!nodo && enEsteBot && !estado?.pausa && conError.has(nodo)

  return (
    <div className="lienzo-panel simulador">
      <div className="lienzo-panel-h">
        <b>Probar la versión {version}</b>
        <div className="row">
          <button className="btn chico" onClick={reiniciar} disabled={ocupado}>Empezar de nuevo</button>
          <button className="btn chico" onClick={alCerrar}>Cerrar</button>
        </div>
      </div>
      <small className="muted">Escribe como un cliente o toca los botones. Usa el inventario y el horario reales, pero no guarda nada ni envía a WhatsApp.</small>
      <div className="simulador-chat" aria-live="polite">
        {turnos.length === 0 && (
          <div className="row">
            {['hola', 'dell i5 de 10', '100-102-1041', 'asesor'].map((e) => (
              <button key={e} className="pastilla" onClick={() => enviar(e)}>{e}</button>
            ))}
          </div>
        )}
        {turnos.map((t) => t.lado === 'cliente' ? (
          <div key={t.id} className="simulador-cliente">{t.texto}</div>
        ) : t.lado === 'aviso' ? (
          <div key={t.id} className="aviso warn">{t.texto}</div>
        ) : (
          <Burbuja key={t.id} m={t.mensaje!} alElegir={(o) => enviar(o.id, o.titulo)} />
        ))}
        {ocupado && <div className="muted">Escribiendo…</div>}
        <div ref={fin} />
      </div>
      {espera !== undefined && (
        <div className="aviso warn simulador-espera">
          ⏳ Esperando {textoEspera(espera)}. {mensajesConEspera.has(nodo!)
            ? 'Si el cliente escribe, se cancela «Sin respuesta». O'
            : 'Escribe como el cliente para probar «El cliente respondió», o'}
          <button type="button" className="btn chico" disabled={ocupado} onClick={() => enviar('', '', 'tiempo')}>Simular que pasó el tiempo</button>
        </div>
      )}
      {puedeFallar && (
        <div className="aviso simulador-espera">
          Este mensaje tiene «Error al enviar el mensaje».
          <button type="button" className="btn chico" disabled={ocupado} onClick={() => enviar('', '', 'fallo')}>Simular fallo de envío</button>
        </div>
      )}
      <form className="simulador-escribir" onSubmit={(e) => { e.preventDefault(); enviar(texto) }}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe como el cliente…" aria-label="Mensaje del cliente" maxLength={1000} />
        <button className="btn primary chico" disabled={ocupado || !texto.trim()}>Enviar</button>
      </form>
      {estado && (
        <div className="simulador-estado">
          <strong>Lo que el bot anotaría</strong>
          <dl>
            <div><dt>Cuadro</dt><dd>{estado.bot !== undefined && estado.bot !== bot ? 'En otro bot (ver el aviso de arriba)'
              : nodo ? nombres.get(nodo.replace(/-vacio$/, '')) ?? nodo : '—'}</dd></div>
            <div><dt>{ETIQUETAS.etapa}</dt><dd>{String(estado.etapa ?? '—')}</dd></div>
            {Object.entries(campos).map(([k, v]) => <div key={k}><dt>{ETIQUETAS[k] ?? k}</dt><dd>{String(v)}</dd></div>)}
            {!!estado.pausa && <div><dt>Asesor</dt><dd>En la cola: el bot se detiene</dd></div>}
          </dl>
        </div>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cambiarModoBot, guardarAvi, type DatosAvi, type Resultado } from './acciones'

const HERRAMIENTAS: [string, string][] = [
  ['buscar_productos', 'Buscar equipos en el inventario'],
  ['ficha_producto', 'Enviar la ficha con foto'],
  ['buscar_conocimiento', 'Consultar fichas y documentos'],
  ['capturar_datos', 'Guardar los datos del cliente'],
  ['iniciar_compra', 'Pasar al flujo de compra'],
  ['iniciar_cotizacion', 'Pasar al flujo de cotización'],
  ['pasar_a_asesor', 'Pasar a un asesor'],
]
const REGLAS = [
  'Precios, stock, especificaciones y condiciones salen solo de las herramientas.',
  'Nunca escribe cuentas, titulares ni cédulas: para pagar usa el flujo de compra.',
  'No promete descuentos, tiempos ni garantías que no estén en el conocimiento.',
  'No confirma pagos: lo hace una persona.',
  'Si no sabe o el cliente lo pide, pasa a un asesor.',
  'Antes de enviar, el sistema revisa que ningún precio ni número largo sea inventado.',
]
const ESTADOS: [DatosAvi['estado'], string, string][] = [
  ['apagado', 'Apagado', 'Nadie habla con Avi; los bots atienden como siempre.'],
  ['simulador', 'Solo en Probar', 'Avi solo responde en la pestaña Probar.'],
  ['lista_blanca', 'Números de prueba', 'Avi atiende solo a los números de la lista, y solo en los bots en modo Agente.'],
  ['todos', 'Todos los clientes', 'Avi atiende a todos los clientes de los bots en modo Agente.'],
]

export function Personalidad({ datos, listo, bots }: {
  datos: DatosAvi
  listo: boolean
  bots: { id: number; nombre: string; principal: boolean; modo: 'menu' | 'hibrido' | 'agente' }[]
}) {
  const [d, setD] = useState<DatosAvi>(datos)
  const [aviso, setAviso] = useState<Resultado>({})
  const [avisoBot, setAvisoBot] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const cambio = JSON.stringify(d) !== JSON.stringify(datos)
  const poner = <K extends keyof DatosAvi>(k: K, v: DatosAvi[K]) => setD({ ...d, [k]: v })
  const numero = (k: 'memoria_mensajes' | 'max_pasos' | 'max_mensajes' | 'max_turnos_dia', t: string, min: number, max: number) => (
    <label className="field" style={{ flex: '0 1 200px' }}>
      {t}
      <input type="number" min={min} max={max} value={d[k]} disabled={ocupado} onChange={(e) => poner(k, Number(e.target.value))} />
    </label>
  )

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Cómo atiende cada bot</h2>
            <small>Menú guiado y Híbrido no gastan IA en la conversación. En modo Agente, Avi contesta el texto libre (los números 0 a 9 siguen yendo al menú).</small>
          </div>
        </div>
        {(avisoBot.error || avisoBot.ok) && <div className="panel-b" style={{ paddingBottom: 0 }}><div className={`aviso ${avisoBot.error ? 'bad' : 'ok'}`} role="alert">{avisoBot.error ?? avisoBot.ok}</div></div>}
        <div className="panel-b" style={{ display: 'grid', gap: 10 }}>
          {bots.map((b) => (
            <label key={b.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{b.nombre}{b.principal ? ' · principal' : ''}</span>
              <select defaultValue={b.modo} onChange={async (e) => setAvisoBot(await cambiarModoBot(b.id, e.target.value as 'menu' | 'hibrido' | 'agente'))}>
                <option value="menu">Menú guiado</option>
                <option value="hibrido">Híbrido</option>
                <option value="agente">Agente (Avi)</option>
              </select>
            </label>
          ))}
        </div>
      </section>

      <form onSubmit={async (e) => { e.preventDefault(); setOcupado(true); setAviso(await guardarAvi(d)); setOcupado(false) }} style={{ display: 'grid', gap: 16 }}>
        <section className="panel">
          <div className="panel-h">
            <div>
              <h2>Encendido</h2>
              <small>Primero en Probar, luego con números de prueba y al final con todos. «Apagado» lo devuelve todo al Híbrido al instante.</small>
            </div>
            {!listo && <span className="chip warn">Falta la llave o el presupuesto <Link href="/agente/cerebro">(Cerebro)</Link></span>}
          </div>
          <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
            <div className="row">
              {ESTADOS.map(([v, t, x]) => (
                <label key={v} className="field" style={{ flex: '1 1 200px', cursor: 'pointer' }}>
                  <span><input type="radio" name="estado" checked={d.estado === v} disabled={ocupado} onChange={() => poner('estado', v)} /> <b>{t}</b></span>
                  <small className="muted">{x}</small>
                </label>
              ))}
            </div>
            {(d.estado === 'lista_blanca' || d.lista_blanca) && (
              <label className="field">
                Números de prueba (uno por línea, con indicativo)
                <textarea rows={3} value={d.lista_blanca} disabled={ocupado} placeholder="573001112233" onChange={(e) => poner('lista_blanca', e.target.value)} />
              </label>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-h"><div><h2>Personalidad</h2><small>Así habla Avi. Las reglas fijas de abajo van siempre por encima.</small></div></div>
          <div className="panel-b" style={{ display: 'grid', gap: 14 }}>
            <div className="row">
              <label className="field" style={{ flex: '1 1 220px' }}>
                Nombre
                <input value={d.nombre} maxLength={40} disabled={ocupado} onChange={(e) => poner('nombre', e.target.value)} />
              </label>
              <label className="field" style={{ flex: '1 1 160px' }}>
                Tono
                <select value={d.tono} disabled={ocupado} onChange={(e) => poner('tono', e.target.value as DatosAvi['tono'])}>
                  <option value="amigable">Amigable</option><option value="cercano">Cercano</option><option value="formal">Formal</option>
                </select>
              </label>
              <label className="field" style={{ flex: '1 1 160px' }}>
                Emojis
                <select value={d.emojis} disabled={ocupado} onChange={(e) => poner('emojis', e.target.value as DatosAvi['emojis'])}>
                  <option value="si">Sí</option><option value="pocos">Pocos</option><option value="no">No</option>
                </select>
              </label>
              <label className="field" style={{ flex: '1 1 140px' }}>
                Trato
                <select value={d.trato} disabled={ocupado} onChange={(e) => poner('trato', e.target.value as DatosAvi['trato'])}>
                  <option value="tu">Tú</option><option value="usted">Usted</option>
                </select>
              </label>
              <label className="field" style={{ flex: '1 1 140px' }}>
                Largo
                <select value={d.largo} disabled={ocupado} onChange={(e) => poner('largo', e.target.value as DatosAvi['largo'])}>
                  <option value="corto">Corto</option><option value="medio">Medio</option>
                </select>
              </label>
            </div>
            <label className="field">
              Instrucciones del dueño
              <textarea rows={6} value={d.prompt} maxLength={4000} disabled={ocupado} onChange={(e) => poner('prompt', e.target.value)}
                placeholder="Ejemplos: «Pregunta siempre para qué va a usar el equipo». «Ofrece primero los grado A»." />
              <small className="muted">{d.prompt.length.toLocaleString('es-CO')} / 4.000</small>
            </label>
            <div style={{ background: 'var(--surface-2, #f3f4f6)', borderRadius: 8, padding: 12 }}>
              <b>Reglas fijas</b> <span className="muted">(no se pueden quitar)</span>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{REGLAS.map((r) => <li key={r} className="muted">{r}</li>)}</ul>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-h"><div><h2>Herramientas y límites</h2><small>Lo que Avi puede hacer y cuánto puede gastar por conversación.</small></div></div>
          <div className="panel-b" style={{ display: 'grid', gap: 14 }}>
            <div className="row">
              {HERRAMIENTAS.map(([id, t]) => (
                <label key={id} style={{ flex: '1 1 260px', cursor: 'pointer' }}>
                  <input type="checkbox" disabled={ocupado || id === 'pasar_a_asesor'} checked={!d.herramientas_apagadas.includes(id)}
                    onChange={(e) => poner('herramientas_apagadas', e.target.checked ? d.herramientas_apagadas.filter((h) => h !== id) : [...d.herramientas_apagadas, id])} /> {t}
                </label>
              ))}
            </div>
            <div className="row">
              {numero('memoria_mensajes', 'Mensajes que recuerda', 4, 60)}
              {numero('max_pasos', 'Pasos por turno', 1, 12)}
              {numero('max_mensajes', 'Mensajes por turno', 1, 5)}
              {numero('max_turnos_dia', 'Turnos por día y cliente', 1, 200)}
            </div>
            {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}
            <div className="row">
              <button className="btn primary" disabled={ocupado || !cambio}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
              {cambio && <button type="button" className="btn" disabled={ocupado} onClick={() => setD(datos)}>Deshacer</button>}
            </div>
          </div>
        </section>
      </form>
    </>
  )
}

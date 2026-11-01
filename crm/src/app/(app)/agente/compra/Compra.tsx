'use client'

import Link from 'next/link'
import { useState } from 'react'
import { guardarCompra, type DatosCompra, type Resultado } from './acciones'

const PASOS = [
  ['Quiere comprar', 'El cliente escribe «quiero comprar 100-102-1030-1» (o solo «quiero comprar» después de ver una ficha).'],
  ['Equipo y tipo de cliente', 'Toma el código escrito o el de la última ficha; si no hay, lo pide. Pregunta distribuidor o cliente final (los que vienen del bot de distribuidores no la ven).'],
  ['Resumen', 'Precio de la base, + configuración si es cliente final, y el total. Botones: Sí, enviar cuentas · Hablar con asesor · Cancelar.'],
  ['Cuentas', 'Envía el texto de cuentas de abajo, tal cual, y mueve la oportunidad a Esperando pago.'],
  ['Comprobante', 'Con una foto, un PDF o «ya pagué»: Pago por confirmar, el texto de comprobante recibido y el chat pasa a la Bandeja con una nota para el asesor.'],
  ['Asesor', 'El asesor verifica el pago en el banco y cierra la venta. Nadie confirma un pago automáticamente.'],
] as const

export function Compra({ datos, etapas, disparo, bots }: {
  datos: DatosCompra
  bots: { id: number; nombre: string; archivado: boolean; publicado: boolean }[]
  etapas: { embudo: string; esperando: string; confirmar: string }[]
  disparo: { nombre: string; activa: boolean } | null
}) {
  const [d, setD] = useState<DatosCompra>(datos)
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const cambio = JSON.stringify(d) !== JSON.stringify(datos)
  const poner = <K extends keyof DatosCompra>(k: K, v: DatosCompra[K]) => setD({ ...d, [k]: v })

  const texto = (k: 'texto_cuentas' | 'texto_comprobante' | 'texto_sigue_interesado' | 'texto_cancelacion', titulo: string, ayuda: string, filas = 3) => (
    <label className="field">
      {titulo}
      <textarea rows={filas} value={d[k]} maxLength={4096} disabled={ocupado} onChange={(e) => poner(k, e.target.value)} />
      <small className="muted">{ayuda} · {d[k].length.toLocaleString('es-CO')} / 4.096</small>
    </label>
  )

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Flujo de compra</h2>
            <small>Pasos exactos, sin IA, desde «quiero comprar» hasta que el asesor confirma el pago.</small>
          </div>
          {disparo ? (
            <span className={`chip ${disparo.activa ? 'ok' : 'warn'}`}>Acción «{disparo.nombre}»: {disparo.activa ? 'activa' : 'apagada'}</span>
          ) : (
            <span className="chip warn">Ninguna acción inicia la compra</span>
          )}
        </div>
        <ol className="compra-pasos">
          {PASOS.map(([t, x]) => <li key={t}><b>{t}</b><span className="muted">{x}</span></li>)}
        </ol>
        <div className="panel-b" style={{ paddingTop: 0 }}>
          <small className="muted">
            La compra empieza con la acción que tiene el paso «Iniciar flujo de compra»
            {disparo && !disparo.activa ? ': está apagada, actívala en ' : ' ('}
            <Link href="/agente/acciones">Acciones</Link>{disparo && !disparo.activa ? '.' : ').'}
            {' '}Etapas: {etapas.map((e) => `${e.embudo}: ${e.esperando} → ${e.confirmar}`).join(' · ')}.
          </small>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Textos y reglas</h2>
            <small>Se envían tal cual. El texto de cuentas no se guarda en el código ni en GitHub, solo aquí.</small>
          </div>
          {!d.texto_cuentas.trim() && <span className="chip warn">Sin cuentas: al confirmar, el chat pasa a un asesor para que las envíe</span>}
        </div>
        {(aviso.error || aviso.ok) && (
          <div className="panel-b" style={{ paddingBottom: 0 }}>
            <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
          </div>
        )}
        <form className="panel-b" style={{ display: 'grid', gap: 14 }}
          onSubmit={async (e) => { e.preventDefault(); setOcupado(true); setAviso(await guardarCompra(d)); setOcupado(false) }}>
          {texto('texto_cuentas', 'Cuentas para pagar', 'Titular, bancos, números, llave, recargo con tarjeta, tiempo para pagar y qué datos de envío mandar', 12)}
          {texto('texto_comprobante', 'Comprobante recibido', 'Se envía al recibir la foto, el PDF o «ya pagué», antes de pasar al asesor. Puede llevar {horario} (los días y franjas) y {proxima} («en breve» si hay atención, o «mañana a las 8:00 am»)')}
          <label className="field">
            Después del comprobante, ir al bot
            <select value={d.compra_bot_despues ?? ''} disabled={ocupado}
              onChange={(e) => poner('compra_bot_despues', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Ninguno: el texto de comprobante recibido y pasa al asesor</option>
              {bots.filter((b) => !b.archivado || b.id === d.compra_bot_despues).map((b) => (
                <option key={b.id} value={b.id} disabled={!b.publicado}>{b.nombre}{!b.publicado ? ' (sin publicar)' : b.archivado ? ' (archivado)' : ''}</option>
              ))}
            </select>
            <small className="muted">
              Por ejemplo «Datos de despacho»: el cliente responde sus datos de envío en el lienzo y ese bot termina en el asesor. La oportunidad
              pasa igual a Pago por confirmar. Con un bot elegido, el texto de comprobante recibido no se envía: lo dice el primer mensaje del bot.
            </small>
          </label>
          {texto('texto_sigue_interesado', '¿Sigues interesado?', 'Un solo recordatorio si no responde después de enviar las cuentas', 2)}
          {texto('texto_cancelacion', 'Cancelación', 'Cuando escribe «ya no quiero», «cancelar»…', 2)}
          <div className="row">
            <label className="field" style={{ flex: '0 1 220px' }}>
              Recordatorio a las (horas)
              <input type="number" min={1} max={23} value={d.horas_sin_respuesta} disabled={ocupado}
                onChange={(e) => poner('horas_sin_respuesta', Number(e.target.value))} />
            </label>
            <label className="field" style={{ flex: '0 1 260px' }}>
              Configuración para cliente final (COP)
              <input type="number" min={0} step={1000} value={d.cargo_configuracion} disabled={ocupado}
                onChange={(e) => poner('cargo_configuracion', Number(e.target.value))} />
            </label>
          </div>
          <div className="row">
            <button className="btn primary" disabled={ocupado || !cambio}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
            {cambio && <button type="button" className="btn" disabled={ocupado} onClick={() => setD(datos)}>Deshacer</button>}
          </div>
        </form>
      </section>
    </>
  )
}

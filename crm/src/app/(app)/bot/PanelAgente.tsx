'use client'

import { useRef, useState, useTransition } from 'react'
import { borrarCuadro, guardarAgente, type Resultado } from './acciones'
import type { Cuadro, DatoFicha } from './Lienzo'
import { InsertarDato, conEjemplos, insertarEn } from './PanelPregunta'
import { VistaWhatsApp } from './VistaWhatsApp'

// Las herramientas de Avi (agente.HERRAMIENTAS), dichas para el dueño.
export const HERRAMIENTAS_AVI: [string, string][] = [
  ['buscar_productos', 'Buscar en el inventario'],
  ['ficha_producto', 'Enviar la ficha con foto'],
  ['buscar_conocimiento', 'Consultar el conocimiento (políticas, garantía, envíos)'],
  ['enviar_catalogo', 'Enviar el catálogo'],
  ['mover_etapa', 'Avanzar en el embudo'],
  ['crear_seguimiento', 'Dejar un seguimiento al asesor'],
  ['capturar_datos', 'Anotar datos del cliente'],
  ['iniciar_compra', 'Iniciar la compra'],
  ['iniciar_cotizacion', 'Iniciar la cotización'],
  ['pasar_a_asesor', 'Pasar a un asesor'],
]

// Panel del cuadro Agente (F4·35, RF-36 a RF-38).
export function PanelAgente({ bot, cuadro, destinos, datos, editable, apagadasEnAvi, alTerminar }: {
  bot: number
  cuadro: Cuadro
  destinos: Cuadro[]
  datos: DatoFicha[]
  editable: boolean
  apagadasEnAvi: string[]
  alTerminar: (r: Resultado, borrado?: boolean) => void
}) {
  const a = cuadro.ajustes ?? {}
  const [nombre, setNombre] = useState(cuadro.nombre)
  const [texto, setTexto] = useState(cuadro.texto)
  const [instruccion, setInstruccion] = useState(String(a.instruccion ?? ''))
  // null en la base = todas las que estén encendidas en Avi
  const [herramientas, setHerramientas] = useState<string[]>(Array.isArray(a.herramientas)
    ? (a.herramientas as string[]) : HERRAMIENTAS_AVI.map(([h]) => h).filter((h) => !apagadasEnAvi.includes(h)))
  const [vueltas, setVueltas] = useState(Number(a.max_vueltas ?? 8))
  const [salidas, setSalidas] = useState<Record<string, string | null>>({
    compra: cuadro.salidas?.compra ?? null, asesor: cuadro.salidas?.asesor ?? null, menu: cuadro.salidas?.menu ?? null, falla: cuadro.salidas?.falla ?? null,
  })
  const [ocupado, iniciar] = useTransition()
  const area = useRef<HTMLTextAreaElement>(null)
  const motivos = [
    !texto.trim() && 'Escribe el mensaje de entrada.',
    instruccion.length > 2000 && 'La instrucción pasa de 2.000 caracteres.',
    !(vueltas >= 1 && vueltas <= 50) && 'El límite de vueltas va de 1 a 50.',
  ].filter(Boolean) as string[]

  const salida = (k: string, etiqueta: string, suelta: string) => (
    <label className="field">{etiqueta}
      <select value={salidas[k] ?? ''} disabled={!editable || ocupado} onChange={(e) => setSalidas({ ...salidas, [k]: e.target.value || null })}>
        <option value="">{suelta}</option>
        {destinos.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
      </select>
    </label>
  )

  return (
    <div className="lienzo-panel">
      <div className="lienzo-panel-h">
        <div><b>{cuadro.nombre}</b><small className="muted"> · {cuadro.clave}</small></div>
        <small className="muted">🤖 Agente</small>
      </div>
      {!editable && <div className="aviso">Estás viendo la versión publicada. Para cambiar el flujo, abre un borrador.</div>}
      <small className="muted">
        Desde aquí conversa Avi con su personalidad, más la instrucción de abajo. Precios y datos siempre salen de la base y Avi los verifica antes
        de enviarlos. A quién atiende Avi (solo en Probar, números de prueba o todos) se elige en Configuración → Agente.
      </small>
      {editable && <label className="field">Nombre en el lienzo<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} /></label>}
      <label className="field">Mensaje de entrada
        <textarea ref={area} rows={2} value={texto} maxLength={1024} disabled={!editable || ocupado} onChange={(e) => setTexto(e.target.value)} />
        {editable && <span className="row contador"><InsertarDato datos={datos} deshabilitado={ocupado} alInsertar={(mk) => setTexto(insertarEn(area.current, texto, mk))} /></span>}
      </label>
      <label className="field">Instrucción para este punto
        <textarea rows={3} value={instruccion} maxLength={2000} disabled={!editable || ocupado} onChange={(e) => setInstruccion(e.target.value)}
          placeholder="Resuelve dudas del equipo que vio y llévalo a comprar." />
      </label>
      <fieldset className="f-seccion" disabled={!editable || ocupado}>
        <legend>Herramientas que puede usar</legend>
        {HERRAMIENTAS_AVI.map(([h, t]) => (
          <label key={h} className="inline">
            <input type="checkbox" checked={herramientas.includes(h)}
              onChange={(e) => setHerramientas(e.target.checked ? [...herramientas, h] : herramientas.filter((x) => x !== h))} />
            {t}{apagadasEnAvi.includes(h) && <small className="muted"> (apagada en Avi: no la usará)</small>}
          </label>
        ))}
      </fieldset>
      <label className="field">Límite de vueltas (mensajes del cliente dentro del cuadro)
        <input type="number" min={1} max={50} value={vueltas} disabled={!editable || ocupado} onChange={(e) => setVueltas(Math.floor(Number(e.target.value) || 0))} />
      </label>
      {salida('compra', 'Inició compra, sigue a', '— sin unir: el flujo de compra de siempre —')}
      {salida('asesor', 'Pidió asesor o no avanza (o llegó al límite), sigue a', '— sin unir: pasa al asesor —')}
      {salida('menu', 'Volvió al menú («menú», «hola», 0), sigue a', '— sin unir: inicio del bot principal —')}
      {salida('falla', 'Error del cerebro (o Avi apagado), sigue a', '— sin unir: atiende el Híbrido —')}
      <div className="lienzo-vista">
        <strong>Así lo ve el cliente al entrar</strong>
        <VistaWhatsApp cuerpo={conEjemplos(texto, datos)} forma="texto" opciones={[]} numerar />
      </div>
      {editable && (
        <div className="row">
          <button className="btn primary" data-guardar data-accion="guardar" disabled={ocupado || motivos.length > 0}
            onClick={() => iniciar(async () => alTerminar(await guardarAgente(bot, cuadro.clave, {
              nombre, texto, instruccion, maxVueltas: vueltas,
              herramientas: HERRAMIENTAS_AVI.every(([h]) => herramientas.includes(h)) ? null : herramientas,
              compra: salidas.compra, asesor: salidas.asesor, menu: salidas.menu, falla: salidas.falla,
            })))}>
            {ocupado ? 'Guardando…' : 'Guardar en el borrador'}
          </button>
          <button className="btn peligro" data-guardar disabled={ocupado}
            onClick={() => confirm(`¿Borrar el cuadro ${cuadro.nombre} del borrador? Las flechas que llegan quedan sueltas.`)
              && iniciar(async () => alTerminar(await borrarCuadro(bot, cuadro.clave), true))}>Borrar cuadro</button>
        </div>
      )}
      {editable && motivos.length > 0 && <div className="aviso bad" role="alert">Aún no se puede guardar: {motivos.join(' ')}</div>}
    </div>
  )
}

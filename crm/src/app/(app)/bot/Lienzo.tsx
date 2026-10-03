'use client'

import '@xyflow/react/dist/style.css'
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider,
  useConnection, useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type Node, type NodeProps,
} from '@xyflow/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { MenuAcciones } from '@/components/MenuAcciones'
import { medir, revisarMarcas, type Formato, type Opcion } from '@/lib/bot'
import {
  borrarCuadro, conectar, crearBorrador, crearCuadro, descartarBorrador, guardarAjustes, guardarCuadro, moverCuadro, publicar, volverAVersion,
  type Resultado,
} from './acciones'
import type { Contexto } from './Mensajes'
import { PanelCatalogo, type CatalogoOpcion } from './PanelCatalogo'
import { PanelCondiciones } from './PanelCondiciones'
import { MAX_ESPERA, PanelPausa, textoEspera } from './PanelPausa'
import { Simulador } from './Simulador'
import { VistaWhatsApp } from './VistaWhatsApp'

// --------------------------------------------------------------------------- //
// Datos (bot_cuadros, migraciones 0011 y 0012)
// --------------------------------------------------------------------------- //
export type OpcionFlujo = Opcion & { destino: string | null; palabras?: string[]; reconocer?: string; efectos?: Record<string, unknown> }
export type Cuadro = {
  clave: string
  tipo: 'mensaje' | 'presupuesto' | 'marca' | 'equipos' | 'ficha' | 'asesor' | 'aviso' | 'ir_bot' | 'condicion' | 'catalogo' | 'pausa'
  nombre: string
  orden: number
  inicio: boolean
  texto: string
  opciones: OpcionFlujo[] | null
  texto_original: string
  opciones_original: OpcionFlujo[] | null
  opciones_codigo: Opcion[] | null
  max_titulo: number | null
  marcas: string[]
  formato: Formato
  salidas: Record<string, string | null>
  ajustes: Record<string, unknown>
  x: number
  y: number
  actualizado_en: string
}
type Version = { cuadros: Cuadro[]; version?: number }
export type OtroBot = { id: number; nombre: string; archivado: boolean; publicado: boolean }

const TIPOS: Record<Cuadro['tipo'], string> = {
  mensaje: 'Mensaje', presupuesto: 'Sistema · presupuesto', marca: 'Sistema · marcas con stock', equipos: 'Sistema · lista de equipos',
  ficha: 'Sistema · ficha del equipo', asesor: 'Sistema · pasa a asesor', aviso: 'Sistema · aviso',
  ir_bot: 'Ir a otro bot', condicion: 'Condiciones', catalogo: 'Catálogos', pausa: 'Pausa',
}
const SALIDAS: Record<string, string> = {
  siguiente: 'Luego', cambiar_presupuesto: 'Sin equipos → cambiar presupuesto', respuesta: 'Cuando el cliente responda',
  ninguna: 'Ninguna se cumple', respondio: 'El cliente respondió', tiempo: 'Pasó el tiempo',
}
// Los cuadros que crea el dueño desde "+ Agregar" (RF-08): se editan, se unen y se borran. Los demás son del sistema.
const DEL_DUENO: Cuadro['tipo'][] = ['mensaje', 'ir_bot', 'condicion', 'catalogo', 'pausa']
const delDueno = (c: Cuadro) => DEL_DUENO.includes(c.tipo)
// A la ficha, la lista y los avisos no se llega con una flecha: los abre el bot (migración 0012).
const DESTINOS: Cuadro['tipo'][] = ['mensaje', 'presupuesto', 'marca', 'asesor', 'ir_bot', 'condicion', 'catalogo', 'pausa']
// Espejo de salidas_del_cuadro (migración 0016).
function salidasDe(c: Pick<Cuadro, 'tipo' | 'opciones'>): string[] {
  if (c.tipo === 'mensaje') return c.opciones?.length ? [] : ['respuesta']
  return { condicion: ['ninguna'], catalogo: ['siguiente'], pausa: ['respondio', 'tiempo'] }[c.tipo as string] ?? []
}

// RF-05 en el navegador (la base lo exige al publicar, F4·7): opciones sin destino, cuadros a los que no se llega
// y textos que pasan el límite de WhatsApp.
function revisar(cuadros: Cuadro[], bots: OtroBot[], catalogos: CatalogoOpcion[]) {
  const porClave = new Map(cuadros.map((c) => [c.clave, c]))
  const problemas = new Map<string, string[]>()
  const anotar = (clave: string, p: string) => problemas.set(clave, [...(problemas.get(clave) ?? []), p])
  const inicio = cuadros.find((c) => c.inicio)
  const alcanzados = new Set<string>()
  const pila = inicio ? [inicio.clave] : []
  while (pila.length) {
    const c = porClave.get(pila.pop()!)
    if (!c || alcanzados.has(c.clave)) continue
    alcanzados.add(c.clave)
    for (const o of c.opciones ?? []) if (o.destino && porClave.has(o.destino)) pila.push(o.destino)
    for (const d of Object.values(c.salidas ?? {})) if (d) pila.push(d)
  }
  for (const c of cuadros) {
    if (c.tipo === 'mensaje') {
      for (const o of c.opciones ?? []) if (!o.destino) anotar(c.clave, `La opción ${o.id} (${o.titulo}) no lleva a ningún cuadro.`)
    }
    if (delDueno(c)) {
      for (const s of salidasDe(c)) if (!c.salidas?.[s]) anotar(c.clave, `«${SALIDAS[s]}» no lleva a ningún cuadro.`)
      if (!alcanzados.has(c.clave)) anotar(c.clave, 'Ningún cuadro lleva aquí: el cliente nunca llegará.')
    }
    if (c.tipo === 'condicion') {
      for (const o of c.opciones ?? []) {
        if (!o.palabras?.length) anotar(c.clave, `La condición «${o.titulo}» no tiene palabras.`)
        else if (!o.destino) anotar(c.clave, `La condición «${o.titulo}» no lleva a ningún cuadro.`)
      }
    }
    if (c.tipo === 'pausa') {
      const s = Number(c.ajustes?.segundos ?? 0)
      if (!(s >= 1 && s <= MAX_ESPERA)) anotar(c.clave, 'La espera va de 1 segundo a 23 h 59 min 59 s (ventana de 24 h de Meta).')
    }
    if (c.tipo === 'catalogo') {
      const cat = catalogos.find((k) => k.id === Number(c.ajustes?.catalogo_id))
      if (!c.ajustes?.catalogo_id) anotar(c.clave, 'Elige qué catálogo envía.')
      else if (!cat) anotar(c.clave, 'Ese catálogo ya no existe: elige otro.')
      else if (!cat.activo) anotar(c.clave, `El catálogo «${cat.nombre}» está desactivado.`)
    }
    if (c.tipo === 'ir_bot') {
      const destino = bots.find((b) => b.id === Number(c.ajustes?.bot_id))
      if (!destino) anotar(c.clave, 'Elige a qué bot lleva.')
      else if (destino.archivado) anotar(c.clave, `El bot «${destino.nombre}» está archivado.`)
      else if (!destino.publicado) anotar(c.clave, `El bot «${destino.nombre}» aún no está publicado.`)
    }
    const m = medir(c.texto, c.formato, c.opciones ?? c.opciones_codigo ?? [], c.marcas)
    if (m.largo > m.limite) anotar(c.clave, `El texto pasa el límite de WhatsApp (${m.largo} de ${m.limite}).`)
  }
  return problemas
}

// --------------------------------------------------------------------------- //
// Un cuadro en el lienzo
// --------------------------------------------------------------------------- //
type DatosNodo = { cuadro: Cuadro; marca: 'nuevo' | 'cambiado' | null; problemas: string[]; editable: boolean; aqui: boolean; destinoBot?: string; catalogo?: string }

function recorte(texto: string, n = 110) {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

function NodoCuadro({ data, selected }: NodeProps<Node<DatosNodo>>) {
  const { cuadro: c, marca, problemas, editable, aqui, destinoBot, catalogo } = data
  const sistema = !delDueno(c)
  const unible = editable && !sistema
  // Mientras se arrastra una flecha, todo el cuadro sirve para soltarla (no solo su punto de entrada).
  const arrastrando = useConnection((u) => u.inProgress)
  const filas: { id: string; titulo: string; destino?: string | null; unible: boolean }[] = [
    ...(c.opciones ?? []).map((o) => ({ id: o.id, destino: o.destino, unible,
      titulo: c.tipo === 'condicion' ? `${o.titulo} = ${o.palabras?.length ? o.palabras.join(' · ') : '…'}` : `${o.id}. ${o.titulo}` })),
    // Las salidas de un cuadro del dueño van en su orden (la base guarda el JSON con otro orden de claves).
    ...(delDueno(c) ? salidasDe(c) : Object.keys(c.salidas ?? {})).map((s) => ({ id: s, titulo: SALIDAS[s] ?? s, destino: c.salidas?.[s] ?? null, unible })),
  ]
  return (
    <div className={`nodo-bot ${sistema ? 'sistema' : ''} ${selected ? 'elegido' : ''} ${problemas.length ? 'con-problema' : ''} ${aqui ? 'aqui' : ''}`}>
      {c.tipo !== 'aviso' && !c.inicio && <Handle type="target" position={Position.Left} isConnectable={editable} />}
      {editable && arrastrando && DESTINOS.includes(c.tipo) && !c.inicio && (
        <Handle type="target" position={Position.Left} id="cuadro" className="handle-cuadro" isConnectableStart={false} />
      )}
      <div className="nodo-bot-h">
        <b>{c.inicio ? '▶ ' : ''}{c.nombre}</b>
        <span className="nodo-bot-chips">
          {marca && <span className={`chip ${marca === 'nuevo' ? 'acc' : 'warn'}`}>{marca}</span>}
          {problemas.length > 0 && <span className="chip bad" title={problemas.join('\n')}>{problemas.length} ⚠</span>}
        </span>
      </div>
      <small className="nodo-bot-tipo">{sistema ? `🔒 ${TIPOS[c.tipo]}` : TIPOS[c.tipo]}</small>
      {c.formato !== 'sistema' && c.formato !== 'ficha' && <p className="nodo-bot-texto">{recorte(c.texto)}</p>}
      {c.tipo === 'condicion' && <p className="nodo-bot-texto">🔀 Según el último mensaje del cliente</p>}
      {c.tipo === 'pausa' && <p className="nodo-bot-texto">⏳ Espera {textoEspera(Number(c.ajustes?.segundos ?? 0))}</p>}
      {c.tipo === 'catalogo' && <p className="nodo-bot-texto">📚 {catalogo ?? 'Elige el catálogo'}</p>}
      {c.tipo === 'ir_bot' && <p className="nodo-bot-texto">↪ {destinoBot ? <>Va al inicio de <b>{destinoBot}</b></> : 'Elige a qué bot lleva'}</p>}
      {c.tipo === 'presupuesto' && <small className="muted">Rangos de presupuesto o un monto escrito</small>}
      {c.tipo === 'marca' && <small className="muted">Marcas con stock en el inventario</small>}
      {c.tipo === 'ficha' && <small className="muted">Foto, equipo, precio y stock del inventario</small>}
      {filas.length > 0 && (
        <ul className="nodo-bot-opciones">
          {filas.map((f) => (
            <li key={f.id} className={!f.destino && !sistema ? 'suelta' : ''}>
              <span>{f.titulo}</span>
              {f.destino === '@pedir_codigo' && <small className="muted"> · pide el código</small>}
              <Handle type="source" position={Position.Right} id={f.id} isConnectable={f.unible} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const TIPOS_NODO = { cuadro: NodoCuadro }

// --------------------------------------------------------------------------- //
// Panel para editar el cuadro elegido
// --------------------------------------------------------------------------- //
function Panel({ bot, bots, cuadro, cuadros, editable, contexto, alTerminar }: {
  bot: number
  bots: OtroBot[]
  cuadro: Cuadro
  cuadros: Cuadro[]
  editable: boolean
  contexto: Contexto
  alTerminar: (r: Resultado, borrado?: boolean) => void
}) {
  const [nombre, setNombre] = useState(cuadro.nombre)
  const [texto, setTexto] = useState(cuadro.texto)
  const [opciones, setOpciones] = useState<OpcionFlujo[] | null>(cuadro.opciones)
  const [respuesta, setRespuesta] = useState<string | null>(cuadro.salidas?.respuesta ?? null)
  const [destinoBot, setDestinoBot] = useState(String(cuadro.ajustes?.bot_id ?? ''))
  const [ocupado, iniciar] = useTransition()
  const mensaje = cuadro.tipo === 'mensaje'
  const irBot = cuadro.tipo === 'ir_bot'
  const sinBotones = mensaje && opciones?.length === 0 // RF-09: sale como texto y sigue la flecha "respuesta"
  const formato: Formato = sinBotones ? 'texto' : mensaje ? 'menu' : cuadro.formato
  const textoEditable = editable && formato !== 'sistema' && formato !== 'ficha'
  const todas = opciones ?? cuadro.opciones_codigo ?? []
  const medida = medir(texto, formato, todas, cuadro.marcas)
  const { desconocidas } = revisarMarcas(texto, cuadro.marcas)
  const limite = cuadro.max_titulo ?? 24
  const titulosMal = (opciones ?? []).some((o) => !o.titulo.trim() || o.titulo.length > limite)
  const ids = (opciones ?? []).map((o) => o.id)
  const idsMal = ids.some((id, i) => !/^\d{1,2}$/.test(id) || id === '9' || ids.indexOf(id) !== i)
  // Por qué no se puede guardar, dicho en claro (un cuadro sin conectar SÍ se guarda: las flechas se exigen al publicar).
  const motivos = [
    !texto.trim() && 'El mensaje no puede quedar vacío.',
    medida.largo > medida.limite && `El mensaje pasa el límite de WhatsApp (${medida.largo} de ${medida.limite}): acórtalo.`,
    desconocidas.length > 0 && `El bot no reemplaza ${desconocidas.map((m) => `{${m}}`).join(', ')}.`,
    titulosMal && `Hay títulos vacíos o de más de ${limite} caracteres (el límite de WhatsApp): acórtalos; están en rojo.`,
    idsMal && 'Revisa los números de las opciones: sin repetir, del 0 al 99 y sin el 9.',
  ].filter(Boolean) as string[]
  const bloqueado = motivos.length > 0
  const destinos = cuadros.filter((c) => DESTINOS.includes(c.tipo) && c.clave !== cuadro.clave)
  const elegido = bots.find((b) => String(b.id) === destinoBot)
  const ejemplos: Record<string, string> = { uso: 'Diseño', motivo: '', horario: contexto.horario, proxima: 'mañana a las 8:00 am' }
  const vista = cuadro.formato === 'ficha' ? contexto.ficha
    : cuadro.marcas.reduce((t, m) => t.replaceAll(`{${m}}`, ejemplos[m] ?? ''), texto)

  const cambiarOpcion = (i: number, cambio: Partial<OpcionFlujo>) =>
    setOpciones((ops) => (ops ?? []).map((o, j) => (j === i ? { ...o, ...cambio } : o)))
  const siguienteId = () => String([...Array(99).keys()].map((n) => n + 1).find((n) => n !== 9 && !ids.includes(String(n))) ?? '')

  function guardar() {
    iniciar(async () => {
      if (irBot) {
        alTerminar(await guardarAjustes(bot, cuadro.clave, nombre, { bot_id: destinoBot ? Number(destinoBot) : null }))
        return
      }
      const ops = opciones?.map((o) => ({ id: o.id, titulo: o.titulo, destino: o.destino ?? null })) ?? null
      alTerminar(await guardarCuadro(bot, cuadro.clave, mensaje ? nombre : null, textoEditable ? texto : null, ops,
        sinBotones ? { respuesta } : null))
    })
  }

  return (
    <div className="lienzo-panel">
      <div className="lienzo-panel-h">
        <div><b>{cuadro.nombre}</b><small className="muted"> · {cuadro.clave}</small></div>
        <small className="muted">{TIPOS[cuadro.tipo]}</small>
      </div>
      {!editable && <div className="aviso">Estás viendo la versión publicada. Para cambiar el flujo, abre un borrador.</div>}
      {editable && !delDueno(cuadro) && (
        <div className="aviso">🔒 Cuadro del sistema: se cambia su texto{cuadro.opciones ? ' y el título de sus botones' : ''}; lo que hace sigue en el bot (RF-03).</div>
      )}
      {editable && (mensaje || irBot) && (
        <label className="field">Nombre en el lienzo<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} /></label>
      )}
      {irBot && (
        <label className="field">Lleva al cliente al inicio de
          <select value={destinoBot} disabled={!editable || ocupado} onChange={(e) => setDestinoBot(e.target.value)}>
            <option value="">— elige un bot —</option>
            {bots.filter((b) => !b.archivado || String(b.id) === destinoBot).map((b) => (
              <option key={b.id} value={b.id}>{b.nombre}{b.archivado ? ' (archivado)' : !b.publicado ? ' (sin publicar)' : ''}</option>
            ))}
          </select>
          <small className="muted">
            {elegido && !elegido.publicado ? `«${elegido.nombre}» aún no está publicado: publícalo antes que este bot. `
              : elegido?.archivado ? `«${elegido.nombre}» está archivado. ` : ''}
            El cliente sigue en ese bot hasta que escriba «hola» o «menú», que lo devuelven al principal.
          </small>
        </label>
      )}
      {formato === 'sistema' ? null : formato === 'ficha' ? null : (
        <label className="field">Mensaje
          <textarea rows={Math.min(10, Math.max(3, texto.split('\n').length + 1))} value={texto} disabled={!textoEditable || ocupado}
            onChange={(e) => setTexto(e.target.value)} />
          <span className="row contador">
            <small className="muted">*negrita* · _cursiva_ · ~tachado~</small>
            <small className={`mono ${medida.largo > medida.limite ? 'bad' : 'muted'}`}>
              {medida.largo.toLocaleString('es-CO')} / {medida.limite.toLocaleString('es-CO')}
              {medida.forma === 'botones' ? ' con botones' : medida.forma === 'lista' ? ' con lista' : ''}
            </small>
          </span>
        </label>
      )}
      {desconocidas.length > 0 && <div className="aviso bad">El bot no reemplaza {desconocidas.map((m) => `{${m}}`).join(', ')}.</div>}
      {opciones && (
        <div className="lienzo-opciones">
          <strong>Opciones</strong>
          {opciones.map((o, i) => (
            <div key={i} className="lienzo-opcion">
              <input className="mono" value={o.id} disabled={!editable || !mensaje || ocupado} aria-label="Número" maxLength={2}
                onChange={(e) => cambiarOpcion(i, { id: e.target.value.replace(/\D/g, '') })} />
              <input value={o.titulo} disabled={!editable || ocupado} aria-label="Título" maxLength={40}
                className={!o.titulo.trim() || o.titulo.length > limite ? 'mal' : undefined}
                title={`${o.titulo.length} de ${limite} caracteres`}
                onChange={(e) => cambiarOpcion(i, { titulo: e.target.value })} />
              {mensaje ? (
                <select value={o.destino ?? ''} disabled={!editable || ocupado} aria-label="Lleva a"
                  onChange={(e) => cambiarOpcion(i, { destino: e.target.value || null })}>
                  <option value="">— sin destino —</option>
                  {destinos.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
                </select>
              ) : (
                <small className="muted">{o.destino === '@pedir_codigo' ? 'pide el código' : cuadros.find((d) => d.clave === o.destino)?.nombre ?? ''}</small>
              )}
              {editable && mensaje && (
                <button type="button" className="btn chico peligro" aria-label={`Quitar opción ${o.id}`} disabled={ocupado}
                  onClick={() => setOpciones(opciones.filter((_, j) => j !== i))}>×</button>
              )}
            </div>
          ))}
          {editable && mensaje && opciones.length < 10 && (
            <button type="button" className="btn chico" disabled={ocupado}
              onClick={() => setOpciones([...opciones, { id: siguienteId(), titulo: `Opción ${opciones.length + 1}`, destino: null }])}>+ Opción</button>
          )}
          {sinBotones && (
            <label className="field">Cuando el cliente responda, sigue a
              <select value={respuesta ?? ''} disabled={!editable || ocupado} onChange={(e) => setRespuesta(e.target.value || null)}>
                <option value="">— sin destino —</option>
                {destinos.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
              </select>
              <small className="muted">Sin opciones, el mensaje sale como texto y lo que escriba el cliente sigue esta flecha.</small>
            </label>
          )}
          <small className="muted">
            Máximo {limite} caracteres por título. Hasta 3 opciones cortas salen como botones; si no, como lista (hasta 10).
            {mensaje && ' El 9 está reservado para pasar a un asesor.'}
            {idsMal && <span className="bad"> Revisa los números: sin repetir, del 0 al 99 y sin el 9.</span>}
          </small>
        </div>
      )}
      {formato !== 'sistema' && (
        <div className="lienzo-vista">
          <strong>Así lo ve el cliente</strong>
          <VistaWhatsApp cuerpo={vista} forma={cuadro.formato === 'ficha' ? 'botones' : medida.forma}
            opciones={formato === 'ficha' ? (opciones ?? []) : formato === 'menu' ? todas : []} numerar={cuadro.formato !== 'ficha'} />
        </div>
      )}
      {editable && (
        <div className="row">
          <button className="btn primary" data-guardar data-accion="guardar" disabled={ocupado || bloqueado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar en el borrador'}</button>
          {delDueno(cuadro) && !cuadro.inicio && (
            <button className="btn peligro" data-guardar disabled={ocupado}
              onClick={() => confirm(`¿Borrar el cuadro ${cuadro.nombre} del borrador? Las flechas que llegan quedan sueltas.`)
                && iniciar(async () => alTerminar(await borrarCuadro(bot, cuadro.clave), true))}>Borrar cuadro</button>
          )}
        </div>
      )}
      {editable && motivos.length > 0 && (
        <div className="aviso bad" role="alert">Aún no se puede guardar: {motivos.join(' ')}</div>
      )}
      {editable && mensaje && motivos.length === 0 && (
        <small className="muted">Se puede guardar aunque una opción no esté conectada: las flechas se exigen al publicar.</small>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------- //
// Publicar (F4·7): qué cambia, choques con la versión publicada y nota
// --------------------------------------------------------------------------- //
function PanelPublicar({ bot, borrador, publicada, choques, problemas, alTerminar, alCancelar }: {
  bot: number
  borrador: Version
  publicada: Version
  choques: { clave: string; nombre: string }[]
  problemas: number
  alTerminar: (r: Resultado) => void
  alCancelar: () => void
}) {
  const [nota, setNota] = useState('')
  const [pisar, setPisar] = useState(false)
  const [choque, setChoque] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  const antes = new Map(publicada.cuadros.map((c) => [c.clave, c]))
  const ahora = new Set(borrador.cuadros.map((c) => c.clave))
  const nuevos = borrador.cuadros.filter((c) => !antes.has(c.clave))
  const borrados = publicada.cuadros.filter((c) => !ahora.has(c.clave))
  const cambiados = borrador.cuadros.filter((c) => {
    const a = antes.get(c.clave)
    return a && (a.texto !== c.texto || a.nombre !== c.nombre || JSON.stringify(a.opciones) !== JSON.stringify(c.opciones)
      || JSON.stringify(a.salidas) !== JSON.stringify(c.salidas) || JSON.stringify(a.ajustes) !== JSON.stringify(c.ajustes))
  })
  const hayChoque = choques.length > 0 || !!choque
  const sinCambios = !nuevos.length && !borrados.length && !cambiados.length

  return (
    <div className="lienzo-panel">
      <b>Publicar la versión {borrador.version}</b>
      <small className="muted">
        {publicada.version
          ? <>El bot la usa en menos de 30 segundos. La versión {publicada.version} queda en el historial y puedes volver a ella.
            Un cliente que esté en un cuadro que ya no existe vuelve al saludo.</>
          : <>Es la primera versión de este bot. Publicarla no cambia a quién atiende: eso lo decide cuál es el bot principal.</>}
      </small>
      {problemas > 0 && <div className="aviso bad">Hay {problemas} cosa(s) por resolver: están marcadas con ⚠ en el lienzo.</div>}
      <div className="publicar-resumen">
        {sinCambios && <span className="muted">El borrador es igual a la versión publicada.</span>}
        {nuevos.length > 0 && <div><span className="chip acc">{nuevos.length} nuevo(s)</span> {nuevos.map((c) => c.nombre).join(', ')}</div>}
        {cambiados.length > 0 && <div><span className="chip warn">{cambiados.length} cambiado(s)</span> {cambiados.map((c) => c.nombre).join(', ')}</div>}
        {borrados.length > 0 && <div><span className="chip bad">{borrados.length} borrado(s)</span> {borrados.map((c) => c.nombre).join(', ')}</div>}
      </div>
      {hayChoque && (
        <div className="aviso warn">
          {choque ?? <>Desde que abriste el borrador cambiaron en la versión publicada: <b>{choques.map((c) => c.nombre).join(', ')}</b>.
            Publicar los reemplaza por lo que tiene el borrador.</>}
          <label className="inline" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={pisar} onChange={(e) => setPisar(e.target.checked)} /> Entiendo, publicar igual
          </label>
        </div>
      )}
      <label className="field">Nota (qué cambia, para el historial)
        <textarea rows={2} value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} placeholder="Agrega la pregunta de ciudad de envío" />
      </label>
      <div className="row">
        <button className="btn primary" data-guardar disabled={ocupado || problemas > 0 || sinCambios || (hayChoque && !pisar)}
          onClick={() => iniciar(async () => {
            const r = await publicar(bot, nota, pisar)
            if (r.choque) { setChoque(r.error ?? ''); setPisar(false); return }
            alTerminar(r)
          })}>{ocupado ? 'Publicando…' : `Publicar versión ${borrador.version}`}</button>
        <button className="btn" disabled={ocupado} onClick={alCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------- //
// El lienzo
// --------------------------------------------------------------------------- //
// "+ Agregar" (RF-08).
const AGREGAR: { texto: string; tipo: string; detalle: string; deshabilitada?: boolean }[] = [
  { texto: '💬 Mensaje', tipo: 'mensaje', detalle: 'Texto con botones o lista; sin opciones, espera la respuesta' },
  { texto: '🔀 Condiciones', tipo: 'condicion', detalle: 'Elige el camino según lo que escribió el cliente' },
  { texto: '📚 Catálogos', tipo: 'catalogo', detalle: 'Envía un catálogo de Inventario y sigue' },
  { texto: '⏳ Pausa', tipo: 'pausa', detalle: 'Espera; si el cliente no escribe, sigue al recordatorio' },
  { texto: '↪ Ir a otro bot', tipo: 'ir_bot', detalle: 'Lleva al cliente al inicio de otro bot' },
]

// Un lugar donde el cuadro nuevo (240 de ancho, unos 160 de alto) no tape a otro: prueba alrededor del punto pedido.
function hueco(cuadros: Cuadro[], x: number, y: number) {
  const libre = (px: number, py: number) => cuadros.every((c) => Math.abs(c.x - px) > 260 || Math.abs(c.y - py) > 190)
  for (let paso = 0; paso < 8; paso++) {
    for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const px = x + dx * 270 * paso, py = y + dy * 200 * paso
      if (libre(px, py)) return { x: px, y: py }
    }
  }
  return { x, y }
}

type Props = {
  bot: { id: number; nombre: string; archivado: boolean; principal?: boolean }
  bots: OtroBot[] // los demás bots, para «Ir a otro bot»
  catalogos: CatalogoOpcion[] // los de Inventario, para el cuadro Catálogos
  puedeSubirCatalogo: boolean
  publicada: Version
  borrador: Version | null
  archivada?: Version
  contexto: Contexto
  choques?: { clave: string; nombre: string }[]
  hayBorrador?: boolean
}

function LienzoInterno({ bot, bots, catalogos, puedeSubirCatalogo, publicada, borrador, archivada, contexto, choques = [], hayBorrador = false }: Props) {
  const router = useRouter()
  const flujo = useReactFlow()
  const editable = !!borrador
  const cuadros = useMemo(() => (archivada ?? borrador ?? publicada).cuadros, [archivada, borrador, publicada])
  const [elegido, setElegido] = useState<string | null>(null)
  const [publicando, setPublicando] = useState(false)
  const [probando, setProbando] = useState(false)
  const [verProblemas, setVerProblemas] = useState(false)
  // Cambios del panel sin guardar: no se pierden al tocar fuera, otro cuadro o cerrar la página.
  const sinGuardar = useRef(false)
  const [pendiente, setPendiente] = useState(false) // lo mismo que la ref, para habilitar «Guardar» en la barra
  const marcarPendiente = (v: boolean) => { sinGuardar.current = v; setPendiente(v) }
  const puedeSalir = () => !sinGuardar.current
    || (confirm('Hay cambios sin guardar en este cuadro. ¿Salir y descartarlos?') && (marcarPendiente(false), true))
  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => { if (sinGuardar.current) e.preventDefault() }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [])
  const [aqui, setAqui] = useState<string | null>(null)
  const enElBot = archivada?.version === publicada.version
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, iniciar] = useTransition()

  const problemas = useMemo(() => revisar(cuadros, bots, catalogos), [cuadros, bots, catalogos])
  const totalProblemas = [...problemas.values()].reduce((s, p) => s + p.length, 0)
  const anteriores = useMemo(() => new Map(publicada.cuadros.map((c) => [c.clave, c])), [publicada])

  const armarNodos = (): Node<DatosNodo>[] => cuadros.map((c) => {
    const antes = anteriores.get(c.clave)
    // Un bot que aún no se publicó no tiene con qué compararse: sin marcas.
    const marca = !editable || !publicada.version ? null : !antes ? 'nuevo'
      : antes.texto !== c.texto || antes.nombre !== c.nombre || JSON.stringify(antes.opciones) !== JSON.stringify(c.opciones)
        || JSON.stringify(antes.salidas) !== JSON.stringify(c.salidas) || JSON.stringify(antes.ajustes) !== JSON.stringify(c.ajustes) ? 'cambiado' : null
    return { id: c.clave, type: 'cuadro', position: { x: c.x, y: c.y }, draggable: editable,
      data: { cuadro: c, marca, problemas: problemas.get(c.clave) ?? [], editable, aqui: probando && aqui?.replace(/-vacio$/, '') === c.clave,
        destinoBot: c.tipo === 'ir_bot' ? bots.find((b) => b.id === Number(c.ajustes?.bot_id))?.nombre : undefined,
        catalogo: c.tipo === 'catalogo' ? catalogos.find((k) => k.id === Number(c.ajustes?.catalogo_id))?.nombre : undefined } }
  })
  const armarFlechas = (): Edge[] => cuadros.flatMap((c) => [
    ...(c.opciones ?? []).filter((o) => o.destino && o.destino !== '@pedir_codigo').map((o) => ({
      id: `${c.clave}:${o.id}`, source: c.clave, sourceHandle: o.id, target: o.destino!,
      deletable: editable && delDueno(c), markerEnd: { type: MarkerType.ArrowClosed },
      className: delDueno(c) ? 'flecha-mensaje' : 'flecha-sistema',
    })),
    ...Object.entries(c.salidas ?? {}).filter(([, d]) => d).map(([s, d]) => ({
      id: `${c.clave}:${s}`, source: c.clave, sourceHandle: s, target: d!, deletable: editable && delDueno(c),
      markerEnd: { type: MarkerType.ArrowClosed }, className: delDueno(c) ? 'flecha-mensaje' : 'flecha-sistema',
    })),
  ])

  const [nodos, setNodos, alCambiarNodos] = useNodesState<Node<DatosNodo>>(armarNodos())
  const [flechas, setFlechas, alCambiarFlechas] = useEdgesState<Edge>(armarFlechas())
  // Cada vez que el servidor devuelve cuadros nuevos (tras guardar, unir o borrar), el lienzo se rehace.
  useEffect(() => {
    setNodos((previos) => armarNodos().map((n) => ({ ...n, selected: previos.find((p) => p.id === n.id)?.selected ?? n.id === elegido })))
    setFlechas(armarFlechas())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuadros, problemas, aqui, probando])

  // Al abrir o descartar un borrador cambia lo que se ve: se vuelve a encuadrar todo.
  const vista = archivada ? `a${archivada.version}` : borrador ? `b${borrador.version}` : `p${publicada.version}`
  useEffect(() => {
    const t = setTimeout(() => flujo.fitView({ padding: 0.12, duration: 300 }), 60)
    return () => clearTimeout(t)
  }, [vista, flujo])

  function hacer(accion: () => Promise<Resultado & { dato?: unknown }>, despues?: (dato: unknown) => void) {
    iniciar(async () => {
      const r = await accion()
      setAviso(r.error ? r : r.ok ? r : {})
      if (!r.error) { despues?.(r.dato); router.refresh() }
    })
  }

  const cuadroDe = (clave: string | null) => cuadros.find((c) => c.clave === clave)
  const validarUnion = (u: Connection | Edge) => {
    const origen = cuadroDe(u.source)
    const destino = cuadroDe(u.target)
    return !!editable && !!origen && delDueno(origen) && !!destino && destino.clave !== origen.clave && DESTINOS.includes(destino.tipo)
  }

  const elegidoCuadro = cuadroDe(elegido)
  // El panel de al lado solo se abre cuando hay algo que mostrar: así el lienzo tiene todo el ancho.
  const ladoAbierto = probando || (publicando && !!borrador) || !!elegidoCuadro || (verProblemas && editable && totalProblemas > 0)

  return (
    <section className="lienzo-pantalla">
      <div className="lienzo-barra">
        <button className="btn chico" title={editable ? 'Sale del lienzo. El borrador se conserva; para descartarlo usa «Descartar borrador».' : 'Volver a la lista de bots'}
          onClick={() => { if (!puedeSalir()) return; router.push('/bot?t=bots') }}>
          {editable ? '← Cancelar' : '← Bots'}
        </button>
        <div className="lienzo-titulo">
          <b>{bot.principal ? '⭐ ' : ''}{bot.nombre}</b>
          <small>
            {archivada ? `Versión ${archivada.version} (${enElBot ? 'la que usa el bot' : 'anterior'}) · solo para ver` : editable ? `Borrador · versión ${borrador!.version}` : `Versión publicada ${publicada.version ?? ''} · solo para ver`}
          </small>
        </div>
        <a className="btn chico" href={`/bot/flujo/${bot.id}?t=historial`} onClick={(e) => { if (!puedeSalir()) e.preventDefault() }}>Historial de versiones</a>
        <button className="btn chico" onClick={() => { if (!puedeSalir()) return; setElegido(null); setPublicando(false); setVerProblemas(false); setProbando(true) }}>▶ Probar</button>
        {editable && (
          <button className={`chip ${totalProblemas ? 'bad' : 'ok'}`} title="Lo que impediría publicar" disabled={!totalProblemas}
            onClick={() => { setElegido(null); setPublicando(false); setProbando(false); setVerProblemas(true) }}>
            {totalProblemas ? `${totalProblemas} por resolver` : 'Listo para publicar'}
          </button>
        )}
        {editable ? (
          <>
            <MenuAcciones etiqueta="Agregar un cuadro" boton="+ Agregar ▾" desactivado={ocupado} acciones={AGREGAR.map((a) => ({
              ...a,
              onClick: () => {
                if (!puedeSalir()) return
                // El cuadro nuevo aparece en el primer hueco libre cerca del centro de lo que se ve y queda elegido.
                const r = document.querySelector('.lienzo-area')?.getBoundingClientRect()
                const centro = flujo.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 600) / 2, y: (r?.top ?? 0) + (r?.height ?? 400) / 2 })
                const { x, y } = hueco(cuadros, centro.x - 120, centro.y - 70)
                hacer(() => crearCuadro(bot.id, a.tipo, x, y), (clave) => setElegido(String(clave)))
              },
            }))} />
            <button className="btn chico peligro" disabled={ocupado}
              onClick={() => confirm('¿Descartar el borrador? Se pierden todos sus cambios; el bot sigue igual.')
                && hacer(() => descartarBorrador(bot.id), () => setElegido(null))}>Descartar borrador</button>
            <button className="btn chico" disabled={ocupado} onClick={() => { if (!puedeSalir()) return; setElegido(null); setProbando(false); setVerProblemas(false); setPublicando(true) }}>Publicar…</button>
            <button className="btn primary chico" disabled={!pendiente || ocupado}
              title={pendiente ? 'Guarda el cuadro abierto en el borrador' : 'No hay cambios sin guardar en el cuadro abierto'}
              onClick={() => (document.querySelector('.lienzo-lado button[data-accion="guardar"]') as HTMLButtonElement | null)?.click()}>
              Guardar
            </button>
          </>
        ) : archivada && enElBot ? (
          <a className="btn primary chico" href={`/bot/flujo/${bot.id}`}>{hayBorrador ? 'Ir al borrador' : 'Editar el flujo'}</a>
        ) : archivada ? (
          <>
            <a className="btn chico" href={`/bot/flujo/${bot.id}?v=${publicada.version}`}>Ver la que usa el bot</a>
            <button className="btn primary chico" disabled={ocupado} onClick={() => {
              if (!confirm(hayBorrador
                ? `Ya hay un borrador abierto. ¿Reemplazarlo por una copia de la versión ${archivada.version}?`
                : `¿Abrir un borrador con la versión ${archivada.version}? El bot no cambia hasta que lo publiques.`)) return
              hacer(() => volverAVersion(bot.id, archivada.version!, hayBorrador), () => router.push(`/bot/flujo/${bot.id}`))
            }}>Volver a esta versión</button>
          </>
        ) : bot.archivado ? (
          <span className="chip neu">Bot archivado: solo se puede ver</span>
        ) : (
          <button className="btn primary chico" disabled={ocupado} onClick={() => hacer(() => crearBorrador(bot.id))}>
            {hayBorrador ? 'Seguir con el borrador' : 'Editar el flujo'}
          </button>
        )}
      </div>
      {(aviso.error || aviso.ok) && (
        <div className="lienzo-aviso">
          <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
        </div>
      )}
      <details className="lienzo-ayuda">
        <summary>Toca un cuadro para verlo o editarlo · ▶ es el saludo · 🔒 son del sistema · reglas que siempre valen</summary>
        <small className="muted">
          {editable ? 'Lo que cambies aquí no llega al bot hasta que lo publiques. Arrastra desde el punto de una opción hasta un cuadro para unirlos. ' : 'Abre un borrador para cambiar el flujo sin afectar a los clientes. '}
          Los cuadros 🔒 buscan en el inventario, muestran la ficha o pasan a un asesor: se les cambia el texto pero no lo que hacen.
          Las reglas de siempre siguen en cualquier punto: <b>9</b> o “asesor” pasa a un asesor, un <b>código</b> de equipo abre su ficha,
          “hola” o “menú” vuelve al inicio y el texto libre busca en el inventario.
        </small>
      </details>
      <div className={`lienzo-cuerpo${ladoAbierto ? '' : ' sin-lado'}`}>
        <div className="lienzo-area">
          <ReactFlow
            nodes={nodos} edges={flechas} nodeTypes={TIPOS_NODO}
            onNodesChange={alCambiarNodos} onEdgesChange={alCambiarFlechas}
            onNodeClick={(_, n) => { if (probando || (n.id !== elegido && !puedeSalir())) return; setPublicando(false); setVerProblemas(false); setElegido(n.id) }}
            onPaneClick={() => { if (!puedeSalir()) return; setElegido(null); setVerProblemas(false) }}
            onNodeDragStop={(_, n) => editable && hacer(() => moverCuadro(bot.id, n.id, n.position.x, n.position.y))}
            isValidConnection={validarUnion}
            onConnect={(u) => u.sourceHandle && hacer(() => conectar(bot.id, u.source, u.sourceHandle!, u.target))}
            onEdgesDelete={(borradas) => borradas.forEach((e) => {
              const [clave, opcion] = e.id.split(':')
              hacer(() => conectar(bot.id, clave, opcion, null))
            })}
            connectionRadius={70} // la flecha se puede soltar sobre el cuadro, no solo en su punto de entrada
            nodesConnectable={editable} elementsSelectable deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
            fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.2} colorMode="system" proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
        {ladoAbierto && (
        <aside className="lienzo-lado"
          // Cualquier cambio en un campo, o un botón que edita (no los de guardar o borrar), deja el cuadro "sin guardar".
          onChangeCapture={() => marcarPendiente(true)}
          onClickCapture={(e) => {
            const b = (e.target as HTMLElement).closest('button')
            if (b && elegidoCuadro && !b.dataset.guardar && b.closest('.lienzo-panel')) marcarPendiente(true)
          }}>
          {probando ? (
            <Simulador bot={bot.id} version={(archivada ?? borrador ?? publicada).version!} nombres={new Map(cuadros.map((c) => [c.clave, c.nombre]))}
              pausas={new Map(cuadros.filter((c) => c.tipo === 'pausa').map((c) => [c.clave, Number(c.ajustes?.segundos ?? 0)]))}
              alMoverse={setAqui} alCerrar={() => { setProbando(false); setAqui(null) }} />
          ) : publicando && borrador ? (
            <PanelPublicar bot={bot.id} borrador={borrador} publicada={publicada} choques={choques} problemas={totalProblemas}
              alCancelar={() => setPublicando(false)}
              alTerminar={(r) => { setAviso(r); if (!r.error) { setPublicando(false); router.refresh() } }} />
          ) : elegidoCuadro?.tipo === 'pausa' ? (
            <PanelPausa key={elegidoCuadro.clave + elegidoCuadro.actualizado_en} bot={bot.id} cuadro={elegidoCuadro} editable={editable}
              destinos={cuadros.filter((c) => DESTINOS.includes(c.tipo) && c.clave !== elegidoCuadro.clave)}
              alTerminar={(r, borrado) => {
                setAviso(r)
                if (!r.error) { marcarPendiente(false); if (borrado) setElegido(null); router.refresh() }
              }} />
          ) : elegidoCuadro?.tipo === 'catalogo' ? (
            <PanelCatalogo key={elegidoCuadro.clave + elegidoCuadro.actualizado_en} bot={bot.id} cuadro={elegidoCuadro} editable={editable}
              catalogos={catalogos} puedeSubir={puedeSubirCatalogo}
              destinos={cuadros.filter((c) => DESTINOS.includes(c.tipo) && c.clave !== elegidoCuadro.clave)}
              alTerminar={(r, borrado) => {
                setAviso(r)
                if (!r.error) { marcarPendiente(false); if (borrado) setElegido(null); router.refresh() }
              }} />
          ) : elegidoCuadro?.tipo === 'condicion' ? (
            <PanelCondiciones key={elegidoCuadro.clave + elegidoCuadro.actualizado_en} bot={bot.id} cuadro={elegidoCuadro} editable={editable}
              destinos={cuadros.filter((c) => DESTINOS.includes(c.tipo) && c.clave !== elegidoCuadro.clave)}
              alTerminar={(r, borrado) => {
                setAviso(r)
                if (!r.error) { marcarPendiente(false); if (borrado) setElegido(null); router.refresh() }
              }} />
          ) : elegidoCuadro ? (
            <Panel key={elegidoCuadro.clave + elegidoCuadro.actualizado_en} bot={bot.id} bots={bots} cuadro={elegidoCuadro} cuadros={cuadros} editable={editable}
              contexto={contexto} alTerminar={(r, borrado) => {
                setAviso(r)
                if (!r.error) { marcarPendiente(false); if (borrado) setElegido(null); router.refresh() }
              }} />
          ) : (
            <div className="lienzo-panel">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>Por resolver antes de publicar</b>
                <button className="btn chico" onClick={() => setVerProblemas(false)}>Cerrar</button>
              </div>
              <ul className="lienzo-problemas-lista">
                {[...problemas].map(([clave, ps]) => ps.map((p, i) => (
                  <li key={clave + i}><button className="enlace" onClick={() => setElegido(clave)}>{cuadroDe(clave)?.nombre}</button>: {p}</li>
                )))}
              </ul>
            </div>
          )}
        </aside>
        )}
      </div>
    </section>
  )
}

export function Lienzo(props: Props) {
  return (
    <ReactFlowProvider>
      <LienzoInterno {...props} />
    </ReactFlowProvider>
  )
}

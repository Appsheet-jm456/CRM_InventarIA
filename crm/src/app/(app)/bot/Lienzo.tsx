'use client'

import '@xyflow/react/dist/style.css'
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider,
  useConnection, useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type Node, type NodeProps,
} from '@xyflow/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { medir, revisarMarcas, type Formato, type Opcion } from '@/lib/bot'
import {
  borrarCuadro, conectar, crearBorrador, crearMensaje, descartarBorrador, guardarCuadro, moverCuadro, publicar, volverAVersion,
  type Resultado,
} from './acciones'
import type { Contexto } from './Mensajes'
import { Simulador } from './Simulador'
import { VistaWhatsApp } from './VistaWhatsApp'

// --------------------------------------------------------------------------- //
// Datos (bot_cuadros, migraciones 0011 y 0012)
// --------------------------------------------------------------------------- //
export type OpcionFlujo = Opcion & { destino: string | null; palabras?: string[]; reconocer?: string; efectos?: Record<string, unknown> }
export type Cuadro = {
  clave: string
  tipo: 'mensaje' | 'presupuesto' | 'marca' | 'equipos' | 'ficha' | 'asesor' | 'aviso'
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
  salidas: Record<string, string>
  x: number
  y: number
  actualizado_en: string
}
type Version = { cuadros: Cuadro[]; version?: number }

const TIPOS: Record<Cuadro['tipo'], string> = {
  mensaje: 'Mensaje', presupuesto: 'Sistema · presupuesto', marca: 'Sistema · marcas con stock', equipos: 'Sistema · lista de equipos',
  ficha: 'Sistema · ficha del equipo', asesor: 'Sistema · pasa a asesor', aviso: 'Sistema · aviso',
}
const SALIDAS: Record<string, string> = { siguiente: 'Luego', cambiar_presupuesto: 'Sin equipos → cambiar presupuesto' }
// A la ficha, la lista y los avisos no se llega con una flecha: los abre el bot (migración 0012).
const DESTINOS: Cuadro['tipo'][] = ['mensaje', 'presupuesto', 'marca', 'asesor']

// RF-05 en el navegador (la base lo exige al publicar, F4·7): opciones sin destino, cuadros a los que no se llega
// y textos que pasan el límite de WhatsApp.
function revisar(cuadros: Cuadro[]) {
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
    for (const d of Object.values(c.salidas ?? {})) pila.push(d)
  }
  for (const c of cuadros) {
    if (c.tipo === 'mensaje') {
      for (const o of c.opciones ?? []) if (!o.destino) anotar(c.clave, `La opción ${o.id} (${o.titulo}) no lleva a ningún cuadro.`)
      if (!alcanzados.has(c.clave)) anotar(c.clave, 'Ningún cuadro lleva a este mensaje: el cliente nunca lo verá.')
    }
    const m = medir(c.texto, c.formato, c.opciones ?? c.opciones_codigo ?? [], c.marcas)
    if (m.largo > m.limite) anotar(c.clave, `El texto pasa el límite de WhatsApp (${m.largo} de ${m.limite}).`)
  }
  return problemas
}

// --------------------------------------------------------------------------- //
// Un cuadro en el lienzo
// --------------------------------------------------------------------------- //
type DatosNodo = { cuadro: Cuadro; marca: 'nuevo' | 'cambiado' | null; problemas: string[]; editable: boolean; aqui: boolean }

function recorte(texto: string, n = 110) {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

function NodoCuadro({ data, selected }: NodeProps<Node<DatosNodo>>) {
  const { cuadro: c, marca, problemas, editable, aqui } = data
  const sistema = c.tipo !== 'mensaje'
  const unible = editable && !sistema
  // Mientras se arrastra una flecha, todo el cuadro sirve para soltarla (no solo su punto de entrada).
  const arrastrando = useConnection((u) => u.inProgress)
  const filas: { id: string; titulo: string; destino?: string | null; unible: boolean }[] = [
    ...(c.opciones ?? []).map((o) => ({ id: o.id, titulo: `${o.id}. ${o.titulo}`, destino: o.destino, unible })),
    ...Object.keys(c.salidas ?? {}).map((s) => ({ id: s, titulo: SALIDAS[s] ?? s, destino: c.salidas[s], unible: false })),
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
      {c.tipo === 'presupuesto' && <small className="muted">Rangos de presupuesto o un monto escrito</small>}
      {c.tipo === 'marca' && <small className="muted">Marcas con stock en el inventario</small>}
      {c.tipo === 'ficha' && <small className="muted">Foto, equipo, precio y stock del inventario</small>}
      {filas.length > 0 && (
        <ul className="nodo-bot-opciones">
          {filas.map((f) => (
            <li key={f.id} className={f.destino === null && !sistema ? 'suelta' : ''}>
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
function Panel({ cuadro, cuadros, editable, contexto, alTerminar }: {
  cuadro: Cuadro
  cuadros: Cuadro[]
  editable: boolean
  contexto: Contexto
  alTerminar: (r: Resultado, borrado?: boolean) => void
}) {
  const [nombre, setNombre] = useState(cuadro.nombre)
  const [texto, setTexto] = useState(cuadro.texto)
  const [opciones, setOpciones] = useState<OpcionFlujo[] | null>(cuadro.opciones)
  const [ocupado, iniciar] = useTransition()
  const mensaje = cuadro.tipo === 'mensaje'
  const textoEditable = editable && cuadro.formato !== 'sistema' && cuadro.formato !== 'ficha'
  const todas = opciones ?? cuadro.opciones_codigo ?? []
  const medida = medir(texto, cuadro.formato, todas, cuadro.marcas)
  const { desconocidas } = revisarMarcas(texto, cuadro.marcas)
  const limite = cuadro.max_titulo ?? 24
  const titulosMal = (opciones ?? []).some((o) => !o.titulo.trim() || o.titulo.length > limite)
  const ids = (opciones ?? []).map((o) => o.id)
  const idsMal = ids.some((id, i) => !/^\d{1,2}$/.test(id) || id === '9' || ids.indexOf(id) !== i)
  const bloqueado = medida.largo > medida.limite || desconocidas.length > 0 || titulosMal || idsMal || !texto.trim()
  const destinos = cuadros.filter((c) => DESTINOS.includes(c.tipo))
  const ejemplos: Record<string, string> = { uso: 'Diseño', motivo: '', horario: contexto.horario, proxima: 'mañana a las 8:00 am' }
  const vista = cuadro.formato === 'ficha' ? contexto.ficha
    : cuadro.marcas.reduce((t, m) => t.replaceAll(`{${m}}`, ejemplos[m] ?? ''), texto)

  const cambiarOpcion = (i: number, cambio: Partial<OpcionFlujo>) =>
    setOpciones((ops) => (ops ?? []).map((o, j) => (j === i ? { ...o, ...cambio } : o)))
  const siguienteId = () => String([...Array(99).keys()].map((n) => n + 1).find((n) => n !== 9 && !ids.includes(String(n))) ?? '')

  function guardar() {
    iniciar(async () => {
      const ops = opciones?.map((o) => ({ id: o.id, titulo: o.titulo, destino: o.destino ?? null })) ?? null
      alTerminar(await guardarCuadro(cuadro.clave, mensaje ? nombre : null, textoEditable ? texto : null, ops))
    })
  }

  return (
    <div className="lienzo-panel">
      <div className="lienzo-panel-h">
        <div><b>{cuadro.nombre}</b><small className="muted"> · {cuadro.clave}</small></div>
        <small className="muted">{TIPOS[cuadro.tipo]}</small>
      </div>
      {!editable && <div className="aviso">Estás viendo la versión publicada. Para cambiar el flujo, abre un borrador.</div>}
      {editable && !mensaje && (
        <div className="aviso">🔒 Cuadro del sistema: se cambia su texto{cuadro.opciones ? ' y el título de sus botones' : ''}; lo que hace sigue en el bot (RF-03).</div>
      )}
      {editable && mensaje && (
        <label className="field">Nombre en el lienzo<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} /></label>
      )}
      {cuadro.formato === 'sistema' ? null : cuadro.formato === 'ficha' ? null : (
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
                <button type="button" className="btn chico peligro" aria-label={`Quitar opción ${o.id}`} disabled={ocupado || opciones.length === 1}
                  onClick={() => setOpciones(opciones.filter((_, j) => j !== i))}>×</button>
              )}
            </div>
          ))}
          {editable && mensaje && opciones.length < 10 && (
            <button type="button" className="btn chico" disabled={ocupado}
              onClick={() => setOpciones([...opciones, { id: siguienteId(), titulo: `Opción ${opciones.length + 1}`, destino: null }])}>+ Opción</button>
          )}
          <small className="muted">
            Máximo {limite} caracteres por título. Hasta 3 opciones cortas salen como botones; si no, como lista (hasta 10).
            {mensaje && ' El 9 está reservado para pasar a un asesor.'}
            {idsMal && <span className="bad"> Revisa los números: sin repetir, del 0 al 99 y sin el 9.</span>}
          </small>
        </div>
      )}
      {cuadro.formato !== 'sistema' && (
        <div className="lienzo-vista">
          <strong>Así lo ve el cliente</strong>
          <VistaWhatsApp cuerpo={vista} forma={cuadro.formato === 'ficha' ? 'botones' : medida.forma}
            opciones={cuadro.formato === 'ficha' ? (opciones ?? []) : cuadro.formato === 'menu' ? todas : []} numerar={cuadro.formato !== 'ficha'} />
        </div>
      )}
      {editable && (
        <div className="row">
          <button className="btn primary" disabled={ocupado || bloqueado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar en el borrador'}</button>
          {mensaje && !cuadro.inicio && (
            <button className="btn peligro" disabled={ocupado}
              onClick={() => confirm(`¿Borrar el cuadro ${cuadro.nombre} del borrador? Las flechas que llegan quedan sueltas.`)
                && iniciar(async () => alTerminar(await borrarCuadro(cuadro.clave), true))}>Borrar cuadro</button>
          )}
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------- //
// Publicar (F4·7): qué cambia, choques con la versión publicada y nota
// --------------------------------------------------------------------------- //
function PanelPublicar({ borrador, publicada, choques, problemas, alTerminar, alCancelar }: {
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
    return a && (a.texto !== c.texto || a.nombre !== c.nombre || JSON.stringify(a.opciones) !== JSON.stringify(c.opciones))
  })
  const hayChoque = choques.length > 0 || !!choque
  const sinCambios = !nuevos.length && !borrados.length && !cambiados.length

  return (
    <div className="lienzo-panel">
      <b>Publicar la versión {borrador.version}</b>
      <small className="muted">El bot la usa en menos de 30 segundos. La versión {publicada.version} queda en el historial y puedes volver a ella.
        Un cliente que esté en un cuadro que ya no existe vuelve al saludo.</small>
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
        <button className="btn primary" disabled={ocupado || problemas > 0 || sinCambios || (hayChoque && !pisar)}
          onClick={() => iniciar(async () => {
            const r = await publicar(nota, pisar)
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
type Props = {
  publicada: Version
  borrador: Version | null
  archivada?: Version
  contexto: Contexto
  choques?: { clave: string; nombre: string }[]
  hayBorrador?: boolean
}

function LienzoInterno({ publicada, borrador, archivada, contexto, choques = [], hayBorrador = false }: Props) {
  const router = useRouter()
  const flujo = useReactFlow()
  const editable = !!borrador
  const cuadros = useMemo(() => (archivada ?? borrador ?? publicada).cuadros, [archivada, borrador, publicada])
  const [elegido, setElegido] = useState<string | null>(null)
  const [publicando, setPublicando] = useState(false)
  const [probando, setProbando] = useState(false)
  const [aqui, setAqui] = useState<string | null>(null)
  const enElBot = archivada?.version === publicada.version
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, iniciar] = useTransition()

  const problemas = useMemo(() => revisar(cuadros), [cuadros])
  const totalProblemas = [...problemas.values()].reduce((s, p) => s + p.length, 0)
  const anteriores = useMemo(() => new Map(publicada.cuadros.map((c) => [c.clave, c])), [publicada])

  const armarNodos = (): Node<DatosNodo>[] => cuadros.map((c) => {
    const antes = anteriores.get(c.clave)
    const marca = !editable ? null : !antes ? 'nuevo'
      : antes.texto !== c.texto || antes.nombre !== c.nombre || JSON.stringify(antes.opciones) !== JSON.stringify(c.opciones) ? 'cambiado' : null
    return { id: c.clave, type: 'cuadro', position: { x: c.x, y: c.y }, draggable: editable,
      data: { cuadro: c, marca, problemas: problemas.get(c.clave) ?? [], editable, aqui: probando && aqui?.replace(/-vacio$/, '') === c.clave } }
  })
  const armarFlechas = (): Edge[] => cuadros.flatMap((c) => [
    ...(c.opciones ?? []).filter((o) => o.destino && o.destino !== '@pedir_codigo').map((o) => ({
      id: `${c.clave}:${o.id}`, source: c.clave, sourceHandle: o.id, target: o.destino!,
      deletable: editable && c.tipo === 'mensaje', markerEnd: { type: MarkerType.ArrowClosed },
      className: c.tipo === 'mensaje' ? 'flecha-mensaje' : 'flecha-sistema',
    })),
    ...Object.entries(c.salidas ?? {}).map(([s, d]) => ({
      id: `${c.clave}:${s}`, source: c.clave, sourceHandle: s, target: d, deletable: false,
      markerEnd: { type: MarkerType.ArrowClosed }, className: 'flecha-sistema',
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
    return !!editable && origen?.tipo === 'mensaje' && !!destino && DESTINOS.includes(destino.tipo)
  }

  const elegidoCuadro = cuadroDe(elegido)

  return (
    <section className="panel lienzo">
      <div className="panel-h">
        <div>
          <h2>{archivada ? `Versión ${archivada.version} (${enElBot ? 'la que usa el bot' : 'anterior'})` : editable ? `Borrador · versión ${borrador!.version}` : `Versión publicada ${publicada.version ?? ''}`}</h2>
          <small>
            {archivada ? (enElBot ? 'Solo para ver: los cambios se hacen en el borrador.' : 'Así estaba el flujo en esa versión. Para volver a ella se abre como borrador y se publica.') : editable
              ? 'Lo que cambies aquí no llega al bot hasta que lo publiques. Arrastra desde el punto de una opción hasta un cuadro para unirlos.'
              : 'Así está el flujo que usa el bot. Abre un borrador para cambiarlo sin afectar a los clientes.'}
          </small>
        </div>
        <div className="row">
          <button className="btn chico" onClick={() => { setElegido(null); setPublicando(false); setProbando(true) }}>▶ Probar</button>
          {editable && (
            <span className={`chip ${totalProblemas ? 'bad' : 'ok'}`} title="Lo que impediría publicar">
              {totalProblemas ? `${totalProblemas} por resolver` : 'Listo para publicar'}
            </span>
          )}
          {editable ? (
            <>
              <button className="btn chico" disabled={ocupado} onClick={() => {
                const r = document.querySelector('.lienzo-area')?.getBoundingClientRect()
                const centro = flujo.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 600) / 2, y: (r?.top ?? 0) + (r?.height ?? 400) / 2 })
                hacer(() => crearMensaje(centro.x - 110, centro.y - 60), (clave) => setElegido(String(clave)))
              }}>+ Mensaje</button>
              <button className="btn primary chico" disabled={ocupado} onClick={() => { setElegido(null); setProbando(false); setPublicando(true) }}>Publicar…</button>
              <button className="btn chico peligro" disabled={ocupado}
                onClick={() => confirm('¿Descartar el borrador? Se pierden todos sus cambios; el bot sigue igual.')
                  && hacer(descartarBorrador, () => setElegido(null))}>Descartar borrador</button>
            </>
          ) : archivada && enElBot ? (
            <a className="btn primary chico" href="/bot?t=flujo">{hayBorrador ? 'Ir al borrador' : 'Editar el flujo'}</a>
          ) : archivada ? (
            <>
              <a className="btn chico" href={`/bot?t=flujo&v=${publicada.version}`}>Ver la que usa el bot</a>
              <button className="btn primary chico" disabled={ocupado} onClick={() => {
                if (!confirm(hayBorrador
                  ? `Ya hay un borrador abierto. ¿Reemplazarlo por una copia de la versión ${archivada.version}?`
                  : `¿Abrir un borrador con la versión ${archivada.version}? El bot no cambia hasta que lo publiques.`)) return
                hacer(() => volverAVersion(archivada.version!, hayBorrador), () => router.push('/bot?t=flujo'))
              }}>Volver a esta versión</button>
            </>
          ) : (
            <button className="btn primary chico" disabled={ocupado} onClick={() => hacer(crearBorrador)}>
              {hayBorrador ? 'Seguir con el borrador' : 'Editar el flujo'}
            </button>
          )}
        </div>
      </div>
      {(aviso.error || aviso.ok) && (
        <div className="panel-b" style={{ paddingBottom: 0 }}>
          <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>
        </div>
      )}
      <div className="lienzo-cuerpo">
        <div className="lienzo-area">
          <ReactFlow
            nodes={nodos} edges={flechas} nodeTypes={TIPOS_NODO}
            onNodesChange={alCambiarNodos} onEdgesChange={alCambiarFlechas}
            onNodeClick={(_, n) => { if (probando) return; setPublicando(false); setElegido(n.id) }} onPaneClick={() => setElegido(null)}
            onNodeDragStop={(_, n) => editable && hacer(() => moverCuadro(n.id, n.position.x, n.position.y))}
            isValidConnection={validarUnion}
            onConnect={(u) => u.sourceHandle && hacer(() => conectar(u.source, u.sourceHandle!, u.target))}
            onEdgesDelete={(borradas) => borradas.forEach((e) => {
              const [clave, opcion] = e.id.split(':')
              hacer(() => conectar(clave, opcion, null))
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
        <aside className="lienzo-lado">
          {probando ? (
            <Simulador version={(archivada ?? borrador ?? publicada).version!} nombres={new Map(cuadros.map((c) => [c.clave, c.nombre]))}
              alMoverse={setAqui} alCerrar={() => { setProbando(false); setAqui(null) }} />
          ) : publicando && borrador ? (
            <PanelPublicar borrador={borrador} publicada={publicada} choques={choques} problemas={totalProblemas}
              alCancelar={() => setPublicando(false)}
              alTerminar={(r) => { setAviso(r); if (!r.error) { setPublicando(false); router.refresh() } }} />
          ) : elegidoCuadro ? (
            <Panel key={elegidoCuadro.clave + elegidoCuadro.actualizado_en} cuadro={elegidoCuadro} cuadros={cuadros} editable={editable}
              contexto={contexto} alTerminar={(r, borrado) => {
                setAviso(r)
                if (!r.error) { if (borrado) setElegido(null); router.refresh() }
              }} />
          ) : (
            <div className="lienzo-panel">
              <b>Toca un cuadro para verlo o editarlo.</b>
              <small className="muted">
                ▶ es el saludo de inicio. Los cuadros 🔒 son del sistema: buscan en el inventario, muestran la ficha o pasan a un asesor;
                se les cambia el texto pero no lo que hacen. Las reglas de siempre siguen en cualquier punto: <b>9</b> o “asesor” pasa a
                un asesor, un <b>código</b> de equipo abre su ficha, “hola” o “menú” vuelve al inicio y el texto libre busca en el inventario.
              </small>
              {editable && totalProblemas > 0 && (
                <div className="lienzo-problemas">
                  <strong>Por resolver antes de publicar</strong>
                  <ul>
                    {[...problemas].map(([clave, ps]) => ps.map((p, i) => (
                      <li key={clave + i}><button className="enlace" onClick={() => setElegido(clave)}>{cuadroDe(clave)?.nombre}</button>: {p}</li>
                    )))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </aside>
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

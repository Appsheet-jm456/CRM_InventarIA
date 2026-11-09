'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clienteNavegador } from '@/lib/supabase/navegador'
import { asignar, cerrar, liberar, reanudarBot, responder, tomar } from '../../bandeja/acciones'
import { Entrega, Media, hora, iniciales, partirOpciones, type Mensaje } from '../../bandeja/Bandeja'
import { ComprobanteCliente } from '../../bandeja/ComprobanteCliente'
import { PedidoCliente } from './pedido/PedidoCliente'
import { type Embudo, type Etapa } from '../../bandeja/OportunidadesCliente'
import { ComponerPlantilla } from '../../bandeja/Plantilla'
import { archivoLead, borrarYa, crearTarea, cumplirTarea, etiquetaLead, guardarFicha, notaLead, type Resultado } from './acciones'

export type LeadFicha = {
  id: number
  telefono: string
  nombre: string
  etapa: string
  estado_chat: 'bot' | 'cola' | 'asignada' | 'cerrada'
  asignado_a: string | null
  valor_estimado: number | null
  etiquetas: string[]
  atributos: Record<string, unknown>
  creado_en: string
  fecha_ultimo_contacto: string | null
  en_cola_desde: string | null
  primera_respuesta_en: string | null
  categoria_interes: string
  uso_equipo: string
  presupuesto: string
  marca_interes: string
  cotiz_producto: string
  origen: string
  archivado_en: string | null
  eliminado_en: string | null
  resumen_agente: string | null
  notas: string
}
type Persona = { id: string; nombre: string }
type Atributo = {
  clave: string; nombre: string; tipo: string; seccion: string; opciones: string[]; archivado_en: string | null
  solo_venta_online: boolean; etapas_obligatorio: string[]
}
type Evento = { id: number; en: string; usuario_id: string | null; tipo: string; antes: unknown; despues: unknown; detalle: string }
type Tarea = { id: number; tipo: string; que: string; vence_en: string; estado: string; resultado: string; asignado_a: string; cerrado_en: string | null }
type Cotizacion = { id: number; consecutivo: number; total: number; tipo_cliente: string; pdf: string | null; creado_en: string; valida_hasta: string | null }

const VENTANA_MS = 24 * 60 * 60 * 1000
const pesos = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fechaLarga = (t: string) => new Date(t).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })
const ESTADOS: Record<LeadFicha['estado_chat'], { texto: string; clase: string }> = {
  bot: { texto: 'Bot', clase: 'ok' }, cola: { texto: 'En cola', clase: 'warn' }, asignada: { texto: 'Asignada', clase: 'acc' }, cerrada: { texto: 'Cerrada', clase: 'neu' },
}
const hoyMas = (horas: number) => {
  const d = new Date(Date.now() + horas * 3600_000 - 5 * 3600_000)
  return d.toISOString().slice(0, 16)
}
const texto = (v: unknown) => (v === null || v === undefined ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v))
// Vacío es lo mismo que no tenerlo: así deshacer a mano un cambio quita el aviso de «Cambios sin guardar».
const vacio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
const igual = (a: unknown, b: unknown) => (vacio(a) && vacio(b)) || JSON.stringify(a) === JSON.stringify(b)

// Lo mismo que valida la base (lead_atributo_error), para marcar el campo antes de guardar.
function errorDe(a: Atributo, v: unknown): string | null {
  if (vacio(v) || typeof v !== 'string') return null
  const t = v.trim()
  if (a.tipo === 'documento' && !/^[0-9]{5,12}$/.test(t)) return 'Solo números, de 5 a 12.'
  if (a.tipo === 'correo' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) return 'Escribe un correo, con @.'
  if (a.tipo === 'telefono' && !/^\+?[0-9 ()-]{7,20}$/.test(t)) return 'Escribe un teléfono.'
  if (a.tipo === 'enlace' && !/^https?:\/\/\S+$/.test(t)) return 'Debe empezar por http:// o https://.'
  return null
}

// ---------------------------------------------------------------------------------------------------------------------- //
// Un atributo editable según su tipo; el cambio queda pendiente hasta «Guardar cambios» (RL-25)
// ---------------------------------------------------------------------------------------------------------------------- //
function CampoAtributo({ a, valor, cambiar, ocupado, error }: { a: Atributo; valor: unknown; cambiar: (v: unknown) => void; ocupado: boolean; error: string | null }) {
  const comun = { 'aria-label': a.nombre, disabled: ocupado, 'aria-invalid': !!error }
  const actual = valor === undefined || valor === null ? '' : valor
  switch (a.tipo) {
    case 'texto_largo':
      return <textarea {...comun} rows={3} value={String(actual)} maxLength={4000} onChange={(e) => cambiar(e.target.value)} />
    case 'numero':
    case 'moneda':
      return <input {...comun} type="number" step={a.tipo === 'moneda' ? 1000 : 'any'} value={actual === '' ? '' : Number(actual)}
        onChange={(e) => cambiar(e.target.value === '' ? null : Number(e.target.value))} />
    case 'fecha':
      return <input {...comun} type="date" value={String(actual)} onChange={(e) => cambiar(e.target.value || null)} />
    case 'lista':
      return (
        <select {...comun} value={String(actual)} onChange={(e) => cambiar(e.target.value || null)}>
          <option value="">—</option>
          {a.opciones.map((o) => <option key={o}>{o}</option>)}
        </select>
      )
    case 'multiseleccion': {
      const elegidas = Array.isArray(actual) ? (actual as string[]) : []
      return (
        <div className="row" style={{ gap: 8 }}>
          {a.opciones.map((o) => (
            <label key={o} style={{ cursor: 'pointer' }}>
              <input type="checkbox" disabled={ocupado} checked={elegidas.includes(o)}
                onChange={(e) => cambiar(e.target.checked ? [...elegidas, o] : elegidas.filter((x) => x !== o))} /> {o}
            </label>
          ))}
        </div>
      )
    }
    case 'si_no':
      return (
        <select {...comun} value={actual === '' ? '' : actual ? 'si' : 'no'} onChange={(e) => cambiar(e.target.value === '' ? null : e.target.value === 'si')}>
          <option value="">—</option><option value="si">Sí</option><option value="no">No</option>
        </select>
      )
    default:
      return <input {...comun} type={a.tipo === 'correo' ? 'email' : a.tipo === 'enlace' ? 'url' : a.tipo === 'telefono' ? 'tel' : 'text'}
        inputMode={a.tipo === 'documento' ? 'numeric' : undefined}
        value={String(actual)} maxLength={a.tipo === 'enlace' ? 500 : 300} onChange={(e) => cambiar(e.target.value)} />
  }
}

// ---------------------------------------------------------------------------------------------------------------------- //
// La ficha
// ---------------------------------------------------------------------------------------------------------------------- //
export function Ficha({ lead: inicial, yo, usuarios, asesores, embudos, etapas, rapidas, atributos, tiposTarea, etiquetas, cotizaciones }: {
  lead: LeadFicha
  yo: { id: string; verTodas: boolean; moverEtapas: boolean; eliminar: boolean; validarPagos: boolean; corregirPedidos: boolean }
  usuarios: Persona[]
  asesores: Persona[]
  embudos: Embudo[]
  etapas: Etapa[]
  rapidas: { id: number; atajo: string; titulo: string; texto: string }[]
  atributos: Atributo[]
  tiposTarea: string[]
  etiquetas: string[]
  cotizaciones: Cotizacion[]
}) {
  const router = useRouter()
  const [lead, setLead] = useState(inicial)
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [pestana, setPestana] = useState<'principal' | 'oportunidades' | 'tareas' | 'cotizaciones' | 'archivos' | 'estadisticas'>('principal')
  const [caja, setCaja] = useState<'chat' | 'nota' | 'tarea'>('chat')
  const [escrito, setEscrito] = useState('')
  const [tarea, setTarea] = useState({ tipo: tiposTarea[0] ?? 'Seguimiento', que: '', vence: hoyMas(24), asignado: '' })
  const [etiquetaNueva, setEtiquetaNueva] = useState('')
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const [version] = useState(0)
  const [nuevaTarea, setNuevaTarea] = useState(false)
  // RL-25: lo que el asesor cambió y aún no guarda. Claves «nombre», «valor» y las de los atributos.
  const [cambios, setCambios] = useState<Record<string, unknown>>({})
  const [conflictos, setConflictos] = useState<Record<string, unknown> | null>(null)
  const linea = useRef<HTMLDivElement>(null)
  const nombres = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nombre])), [usuarios])
  const nombreAtributo = useMemo(() => new Map(atributos.map((a) => [a.clave, a.nombre])), [atributos])
  useEffect(() => setLead(inicial), [inicial])

  const guardado = (k: string): unknown => (k === 'nombre' ? lead.nombre : k === 'valor' ? lead.valor_estimado : lead.atributos?.[k])
  const valorDe = (k: string): unknown => (k in cambios ? cambios[k] : guardado(k))
  function cambiar(k: string, v: unknown) {
    setCambios((c) => {
      const n = { ...c }
      if (igual(v, guardado(k))) delete n[k]
      else n[k] = v
      return n
    })
  }
  const hayCambios = Object.keys(cambios).length > 0
  const errores = useMemo(() => {
    const e: Record<string, string> = {}
    for (const a of atributos) {
      const m = a.clave in cambios ? errorDe(a, cambios[a.clave]) : null
      if (m) e[a.clave] = m
    }
    if ('nombre' in cambios && String(cambios.nombre ?? '').trim().length > 80) e.nombre = 'Máximo 80 caracteres.'
    if ('valor' in cambios && cambios.valor !== null && Number(cambios.valor) < 0) e.valor = 'No puede ser negativo.'
    return e
  }, [atributos, cambios])
  const nombreDe = (k: string) => (k === 'nombre' ? 'Nombre' : k === 'valor' ? 'Valor' : nombreAtributo.get(k) ?? k)
  const mostrar = (k: string, v: unknown) =>
    k === 'venta_online' ? (v === true ? 'Venta online' : v === false ? 'Venta tienda' : '—') : k === 'valor' && !vacio(v) ? pesos(Number(v)) : texto(vacio(v) ? null : v)

  async function guardarCambios(forzar = false) {
    if (!hayCambios || ocupado) return
    if (Object.keys(errores).length) { setAviso({ error: 'Revisa los campos marcados: no se guardó nada.' }); return }
    const antes = Object.fromEntries(Object.keys(cambios).map((k) => [k, guardado(k) ?? null]))
    setOcupado(true)
    setAviso({})
    const r = await guardarFicha(lead.id, cambios, antes, forzar)
    setOcupado(false)
    if (r.error) { setAviso(r); return }
    if (r.conflictos) { setConflictos(r.conflictos); return }
    if (r.lead) setLead({ ...lead, nombre: r.lead.nombre, valor_estimado: r.lead.valor, atributos: r.lead.atributos })
    setCambios({})
    setConflictos(null)
    setAviso({ ok: r.ok })
    await cargar()
    router.refresh()
  }
  // «Usar lo nuevo»: lo que otro guardó gana y se quita de mis cambios.
  function usarLoNuevo() {
    if (!conflictos) return
    const nuevos = { ...lead, atributos: { ...lead.atributos } }
    for (const [k, v] of Object.entries(conflictos)) {
      if (k === 'nombre') nuevos.nombre = String(v ?? '')
      else if (k === 'valor') nuevos.valor_estimado = v === null ? null : Number(v)
      else if (vacio(v)) delete nuevos.atributos[k]
      else nuevos.atributos[k] = v
    }
    setLead(nuevos)
    setCambios((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !(k in conflictos))))
    setConflictos(null)
    router.refresh()
  }

  // Salir con cambios sin guardar pregunta antes: al cerrar o recargar la pestaña y al pulsar un enlace de la app.
  useEffect(() => {
    if (!hayCambios) return
    const alCerrar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const alPulsar = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a')
      if (!a || a.target === '_blank' || !a.href || a.href === location.href) return
      if (!confirm('Tienes cambios sin guardar en la ficha. ¿Salir sin guardarlos?')) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('beforeunload', alCerrar)
    document.addEventListener('click', alPulsar, true)
    return () => { window.removeEventListener('beforeunload', alCerrar); document.removeEventListener('click', alPulsar, true) }
  }, [hayCambios])

  const cargar = useCallback(async () => {
    const sb = clienteNavegador()
    const [m, e, t] = await Promise.all([
      sb.from('mensajes').select('id, lado, tipo, texto, creado_en, usuario_id, media_ruta, media_mime, media_nombre, estado_entrega, error_meta, automatico')
        .eq('lead_id', inicial.id).order('creado_en').limit(1000),
      sb.from('lead_eventos').select('id, en, usuario_id, tipo, antes, despues, detalle').eq('lead_id', inicial.id).order('en').limit(1000),
      sb.from('seguimientos').select('id, tipo, que, vence_en, estado, resultado, asignado_a, cerrado_en').eq('lead_id', inicial.id).order('vence_en'),
    ])
    setMensajes((m.data ?? []) as Mensaje[])
    setEventos((e.data ?? []) as Evento[])
    setTareas((t.data ?? []) as Tarea[])
  }, [inicial.id])

  // La conversación se actualiza sola cada 10 s (y al instante después de cada acción propia).
  useEffect(() => {
    cargar()
    const reloj = setInterval(cargar, 10000)
    return () => clearInterval(reloj)
  }, [cargar])

  const cuantos = (mensajes?.length ?? 0) + eventos.length
  useEffect(() => { linea.current?.scrollTo({ top: linea.current.scrollHeight }) }, [cuantos])

  async function hacer(accion: () => Promise<Resultado>, ok?: string) {
    setOcupado(true)
    setAviso({})
    const r = await accion()
    setOcupado(false)
    setAviso(r.error ? r : ok ? { ok } : r.ok ? r : {})
    await cargar()
    router.refresh()
    return !r.error
  }

  // Línea de tiempo: mensajes de WhatsApp y eventos del CRM juntos, en orden (docs/LEADS.md §2).
  type Item = { cuando: string; m?: Mensaje; e?: Evento }
  const items: Item[] = useMemo(() => [
    ...(mensajes ?? []).map((m) => ({ cuando: m.creado_en, m })),
    ...eventos.map((e) => ({ cuando: e.en, e })),
  ].sort((a, b) => a.cuando.localeCompare(b.cuando)), [mensajes, eventos])

  function describir(e: Evento) {
    const quien = e.usuario_id ? nombres.get(e.usuario_id) ?? 'Alguien' : 'Sistema'
    const flecha = (a: unknown, d: unknown) => `${texto(a)} → ${texto(d)}`
    switch (e.tipo) {
      case 'nota': return { quien, texto: e.detalle, nota: true }
      case 'oportunidad': return { quien, texto: `${e.detalle || 'Embudo'}: ${flecha(e.antes, e.despues)}` }
      case 'etapa': return { quien, texto: `Etapa del bot: ${flecha(e.antes, e.despues)}` }
      case 'responsable': return { quien, texto: `Responsable: ${e.antes ? nombres.get(String(e.antes)) ?? '—' : 'sin asignar'} → ${e.despues ? nombres.get(String(e.despues)) ?? '—' : 'sin asignar'}` }
      case 'nombre': return { quien, texto: `Nombre: ${flecha(e.antes, e.despues)}` }
      case 'valor': return { quien, texto: `Valor: ${e.antes ? pesos(Number(e.antes)) : '—'} → ${e.despues ? pesos(Number(e.despues)) : '—'}` }
      case 'etiquetas': {
        const a = (e.antes as string[] | null) ?? [], d = (e.despues as string[] | null) ?? []
        const mas = d.filter((x) => !a.includes(x)), menos = a.filter((x) => !d.includes(x))
        return { quien, texto: [mas.length ? `+ ${mas.join(', ')}` : '', menos.length ? `− ${menos.join(', ')}` : ''].filter(Boolean).join(' · ') || 'Etiquetas' }
      }
      case 'atributo': return { quien, texto: `${nombreAtributo.get(e.detalle) ?? e.detalle}: ${flecha(e.antes, e.despues)}` }
      case 'ficha': {
        const a = (e.antes ?? {}) as Record<string, unknown>, d = (e.despues ?? {}) as Record<string, unknown>
        return { quien, texto: 'Ficha guardada · ' + Object.keys(d).map((k) => `${nombreDe(k)}: ${mostrar(k, a[k])} → ${mostrar(k, d[k])}`).join(' · ') }
      }
      case 'tarea': return { quien, texto: `Tarea (${e.detalle}): ${texto(e.despues)}` }
      case 'alistamiento': return { quien, texto: `🛠 ${e.detalle}` } // F4·50
      case 'pago': return { quien, texto: `💳 ${e.detalle}` }
      case 'tarea_cumplida': return { quien, texto: `Tarea cumplida: ${texto(e.antes)}${e.detalle ? ` — ${e.detalle}` : ''}` }
      default: return { quien, texto: { archivado: 'Archivado', desarchivado: 'Desarchivado', eliminado: 'Enviado a la papelera', restaurado: 'Restaurado' }[e.tipo] ?? e.tipo }
    }
  }

  const ultimoCliente = [...(mensajes ?? [])].reverse().find((m) => m.lado === 'cliente')
  const enVentana = !!ultimoCliente && Date.now() - new Date(ultimoCliente.creado_en).getTime() < VENTANA_MS
  const busquedaRapida = caja === 'chat' ? /^\/(\S*)$/.exec(escrito) : null
  const coincidencias = busquedaRapida
    ? rapidas.filter((r) => `${r.atajo} ${r.titulo}`.toLowerCase().includes(busquedaRapida[1].toLowerCase())).slice(0, 6) : []

  async function enviar() {
    if (!escrito.trim() || ocupado) return
    const t = escrito
    setEscrito('')
    const bien = caja === 'chat' ? await hacer(() => responder(lead.id, t)) : await hacer(() => notaLead(lead.id, t))
    if (!bien) setEscrito(t)
  }

  // RL-16 y RL-17: «Venta online» va como interruptor arriba; los de solo venta online se ven si es online o si ya tienen dato.
  const online = valorDe('venta_online') === true
  const ventaAtributo = atributos.find((a) => a.clave === 'venta_online' && !a.archivado_en)
  const visibles = atributos.filter((a) => !a.archivado_en && a.clave !== 'venta_online' && (!a.solo_venta_online || online || !vacio(valorDe(a.clave))))
  const secciones = [...new Set(visibles.map((a) => a.seccion))].sort((a, b) => Number(a === 'Datos de despacho') - Number(b === 'Datos de despacho'))
  const faltanDespacho = online
    ? atributos.filter((a) => !a.archivado_en && a.solo_venta_online && a.etapas_obligatorio.includes('Alistamiento') && vacio(valorDe(a.clave))).map((a) => a.nombre)
    : []

  const formTarea = (alCrear?: () => void) => (
    <form className="row" style={{ gap: 6 }} onSubmit={async (e) => {
      e.preventDefault()
      if (await hacer(() => crearTarea(lead.id, tarea))) { setTarea({ ...tarea, que: '' }); alCrear?.() }
    }}>
      <select aria-label="Tipo" value={tarea.tipo} onChange={(e) => setTarea({ ...tarea, tipo: e.target.value })}>
        {tiposTarea.map((t) => <option key={t}>{t}</option>)}
      </select>
      <input style={{ flex: '1 1 200px' }} placeholder="Qué hay que hacer" maxLength={200} value={tarea.que} onChange={(e) => setTarea({ ...tarea, que: e.target.value })} />
      <input type="datetime-local" aria-label="Para cuándo" value={tarea.vence} onChange={(e) => setTarea({ ...tarea, vence: e.target.value })} />
      {yo.verTodas && (
        <select aria-label="Para quién" value={tarea.asignado} onChange={(e) => setTarea({ ...tarea, asignado: e.target.value })}>
          <option value="">Para mí</option>
          {asesores.filter((a) => a.id !== yo.id).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      )}
      <button className="btn primary" disabled={ocupado || !tarea.que.trim() || !yo.moverEtapas}
        title={yo.moverEtapas ? undefined : 'Tu rol no agenda tareas'}>Crear tarea</button>
    </form>
  )
  const pendientes = tareas.filter((t) => t.estado === 'pendiente')
  const archivos = (mensajes ?? []).filter((m) => m.media_ruta)
  const delCliente = (mensajes ?? []).filter((m) => m.lado === 'cliente').length
  const minutosPrimera = lead.primera_respuesta_en && lead.en_cola_desde
    ? Math.round((new Date(lead.primera_respuesta_en).getTime() - new Date(lead.en_cola_desde).getTime()) / 60000) : null

  return (
    <section className="ficha">
      {/* ------------------------------------------------ Panel izquierdo: datos ------------------------------------------------ */}
      <div className="col f-datos">
        <div className="col-h">
          <Link href="/leads" className="iconbtn" aria-label="Volver a Leads">←</Link>
          <span className="avatar">{iniciales(lead.nombre || lead.telefono)}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <input className="f-nombre" value={String(valorDe('nombre') ?? '')} placeholder="Sin nombre" aria-label="Nombre" disabled={ocupado} maxLength={80}
              aria-invalid={!!errores.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
            <small>+{lead.telefono} · <span className={`chip ${ESTADOS[lead.estado_chat].clase}`}>{ESTADOS[lead.estado_chat].texto}</span>
              {lead.archivado_en && <span className="chip neu" style={{ marginLeft: 4 }}>Archivado</span>}
              {lead.eliminado_en && <span className="chip bad" style={{ marginLeft: 4 }}>Papelera</span>}</small>
          </div>
        </div>

        <div className="f-cuerpo">
          {(aviso.error || aviso.ok) && <div className={`aviso ${aviso.error ? 'bad' : 'ok'}`} role="alert">{aviso.error ?? aviso.ok}</div>}

          <div className="row" style={{ gap: 6 }}>
            {lead.estado_chat !== 'asignada' || lead.asignado_a !== yo.id ? (
              <button className="btn primary chico" disabled={ocupado} onClick={() => hacer(() => tomar(lead.id), 'La tomaste: el bot ya no le contesta.')}>Tomar</button>
            ) : (
              <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => liberar(lead.id), 'Devuelta a la cola.')}>Devolver a la cola</button>
            )}
            {lead.estado_chat !== 'bot' && lead.estado_chat !== 'cerrada' && (
              <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => reanudarBot(lead.id), 'El bot la atiende de nuevo desde el menú de inicio.')}>Devolver al bot</button>
            )}
            {lead.estado_chat !== 'cerrada' && (
              <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => cerrar(lead.id), 'Conversación cerrada.')}>Cerrar</button>
            )}
            <Link className="btn chico" href={`/bandeja?c=${lead.id}`}>Ver en la Bandeja</Link>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <label className="field" style={{ flex: '1 1 180px' }}>
              Responsable
              {yo.verTodas ? (
                <select value={lead.asignado_a ?? ''} disabled={ocupado}
                  onChange={(e) => e.target.value && hacer(() => asignar(lead.id, e.target.value), 'Asignado.')}>
                  <option value="">Sin asignar</option>
                  {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              ) : <span>{lead.asignado_a ? nombres.get(lead.asignado_a) ?? 'Otro asesor' : 'Sin asignar'}</span>}
            </label>
            <label className="field" style={{ flex: '1 1 160px' }}>
              Valor
              <input type="number" min={0} step={1000} value={vacio(valorDe('valor')) ? '' : Number(valorDe('valor'))} disabled={ocupado}
                aria-invalid={!!errores.valor} onChange={(e) => cambiar('valor', e.target.value === '' ? null : Number(e.target.value))} />
              {errores.valor && <small className="error">{errores.valor}</small>}
            </label>
          </div>

          <div className="field">
            Etiquetas
            <div className="row" style={{ gap: 5 }}>
              {lead.etiquetas.map((t) => (
                <span key={t} className="chip neu">{t} <button className="btn-link" aria-label={`Quitar ${t}`} disabled={ocupado}
                  onClick={() => hacer(() => etiquetaLead(lead.id, t, false))}>×</button></span>
              ))}
              <form className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); const t = etiquetaNueva.trim(); if (t) { setEtiquetaNueva(''); hacer(() => etiquetaLead(lead.id, t, true)) } }}>
                <input list="ficha-etiquetas" value={etiquetaNueva} onChange={(e) => setEtiquetaNueva(e.target.value)} placeholder="+ etiqueta" maxLength={40} style={{ width: 120 }} />
                <datalist id="ficha-etiquetas">{etiquetas.map((t) => <option key={t} value={t} />)}</datalist>
              </form>
            </div>
          </div>

          <div className="pastillas" role="tablist">
            {([['principal', 'Principal'], ['oportunidades', 'Oportunidades'], ['tareas', `Tareas${pendientes.length ? ` (${pendientes.length})` : ''}`],
              ['cotizaciones', `Cotizaciones${cotizaciones.length ? ` (${cotizaciones.length})` : ''}`], ['archivos', `Archivos${archivos.length ? ` (${archivos.length})` : ''}`],
              ['estadisticas', 'Estadísticas']] as const).map(([k, t]) => (
              <button key={k} role="tab" aria-selected={pestana === k} className={`pastilla${pestana === k ? ' activa' : ''}`} onClick={() => setPestana(k)}>{t}</button>
            ))}
          </div>

          {pestana === 'principal' && (
            <div style={{ display: 'grid', gap: 14 }}>
              {ventaAtributo && (
                <div className="field">
                  Venta
                  <div className="row" style={{ gap: 6 }} role="radiogroup" aria-label="Venta">
                    {([[true, '🚚 Venta online', 'Despacho o envío a domicilio'], [false, '🏬 Venta tienda', 'Cotiza y viene a la tienda']] as const).map(([v, t, ayuda]) => (
                      <button key={t} type="button" role="radio" aria-checked={valorDe('venta_online') === v} title={ayuda} disabled={ocupado}
                        className={`btn chico${valorDe('venta_online') === v ? ' primary' : ''}`}
                        onClick={() => cambiar('venta_online', valorDe('venta_online') === v ? null : v)}>{t}</button>
                    ))}
                  </div>
                </div>
              )}
              {secciones.map((s) => (
                <fieldset key={s} className="f-seccion">
                  <legend>{s}</legend>
                  {s === 'Datos de despacho' && faltanDespacho.length > 0 && (
                    <div className="aviso warn" role="status">Faltan datos de despacho: {faltanDespacho.join(', ')}.</div>
                  )}
                  {visibles.filter((a) => a.seccion === s).map((a) => (
                    <label key={`${a.clave}-${version}`} className="field">
                      {a.nombre}{a.clave in cambios && <span className="muted"> · sin guardar</span>}
                      <CampoAtributo a={a} valor={valorDe(a.clave)} ocupado={ocupado} error={errores[a.clave] ?? null}
                        cambiar={(v) => cambiar(a.clave, v)} />
                      {errores[a.clave] && <small className="error">{errores[a.clave]}</small>}
                    </label>
                  ))}
                </fieldset>
              ))}
              <fieldset className="f-seccion">
                <legend>Lo que anotó el bot</legend>
                {[['Busca', lead.categoria_interes], ['Uso', lead.uso_equipo], ['Presupuesto', lead.presupuesto], ['Marca', lead.marca_interes],
                  ['Equipo de interés', lead.cotiz_producto], ['Etapa del bot', lead.etapa]].filter(([, v]) => v).map(([t, v]) => (
                  <div key={t} className="dato"><small>{t}</small><div>{v}</div></div>
                ))}
                {lead.resumen_agente && <div className="dato"><small>Resumen de Avi</small><div style={{ whiteSpace: 'pre-wrap' }}>{lead.resumen_agente}</div></div>}
                {lead.notas && <div className="dato"><small>Notas del sistema</small><div style={{ whiteSpace: 'pre-wrap' }}>{lead.notas}</div></div>}
              </fieldset>
            </div>
          )}

          {pestana === 'oportunidades' && (
            <PedidoCliente lead={lead.id} puedeDocumento={yo.moverEtapas} puedeCorregir={yo.corregirPedidos} puedePagos={yo.validarPagos} embudos={embudos} etapas={etapas} version={version}
              alCambiar={() => { cargar(); router.refresh() }}
              pago={yo.validarPagos ? <ComprobanteCliente lead={lead.id} version={version} alCambiar={() => { cargar(); router.refresh() }} /> : undefined} />
          )}

          {pestana === 'tareas' && (
            <div style={{ display: 'grid', gap: 8 }}>
              {nuevaTarea ? (
                <div className="dato">
                  <div className="row" style={{ justifyContent: 'space-between' }}><small>Nueva tarea</small>
                    <button className="btn-link" onClick={() => setNuevaTarea(false)}>Cancelar</button></div>
                  {formTarea(() => setNuevaTarea(false))}
                </div>
              ) : (
                <div className="row"><button className="btn chico" disabled={!yo.moverEtapas} onClick={() => setNuevaTarea(true)}
                  title={yo.moverEtapas ? 'También desde el chat, en la pestaña Tarea' : 'Tu rol no agenda tareas'}>+ Tarea</button></div>
              )}
              {tareas.length === 0 && <small className="muted">Sin tareas.</small>}
              {tareas.map((t) => (
                <div key={t.id} className="dato" style={{ opacity: t.estado === 'pendiente' ? 1 : 0.6 }}>
                  <small>{t.tipo} · {fechaLarga(t.vence_en)} · {nombres.get(t.asignado_a) ?? 'Asesor'}
                    {t.estado === 'pendiente' && new Date(t.vence_en) < new Date() && <span className="chip bad" style={{ marginLeft: 6 }}>Vencida</span>}
                    {t.estado !== 'pendiente' && <span className="chip ok" style={{ marginLeft: 6 }}>{t.estado === 'hecho' ? 'Cumplida' : 'Cancelada'}</span>}</small>
                  <div>{t.que}{t.resultado && <span className="muted"> — {t.resultado}</span>}</div>
                  {t.estado === 'pendiente' && (
                    <button className="btn chico" disabled={ocupado} onClick={() => {
                      const r = prompt('¿Cómo resultó? (opcional)')
                      if (r !== null) hacer(() => cumplirTarea(lead.id, t.id, r))
                    }}>Cumplida</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {pestana === 'cotizaciones' && (
            <div style={{ display: 'grid', gap: 8 }}>
              {cotizaciones.length === 0 && <small className="muted">Sin cotizaciones.</small>}
              {cotizaciones.map((c) => (
                <div key={c.id} className="dato">
                  <small>N.º {c.consecutivo} · {fechaLarga(c.creado_en)} · {c.tipo_cliente}{c.valida_hasta ? ` · válida hasta ${fechaLarga(c.valida_hasta)}` : ''}</small>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <b>{pesos(Number(c.total))}</b>
                    {c.pdf && <a className="btn chico" target="_blank" rel="noreferrer" href={`/archivos/cotizaciones/${c.pdf.split('/').map(encodeURIComponent).join('/')}`}>📄 PDF</a>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {pestana === 'archivos' && (
            <div className="row" style={{ gap: 10 }}>
              {archivos.length === 0 && <small className="muted">El cliente no ha enviado ni recibido archivos.</small>}
              {archivos.map((m) => (
                <div key={m.id} style={{ display: 'grid', gap: 4, maxWidth: 180 }}>
                  <Media m={m} />
                  <small className="muted">{m.lado === 'cliente' ? 'Cliente' : 'Enviado'} · {hora(m.creado_en)}</small>
                </div>
              ))}
            </div>
          )}

          {pestana === 'estadisticas' && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div className="dato"><small>Primer contacto</small><div>{fechaLarga(lead.creado_en)} · hace {Math.max(0, Math.round((Date.now() - new Date(lead.creado_en).getTime()) / 86400000))} días</div></div>
              {lead.fecha_ultimo_contacto && <div className="dato"><small>Último contacto</small><div>{fechaLarga(lead.fecha_ultimo_contacto)}</div></div>}
              <div className="dato"><small>Mensajes</small><div>{mensajes?.length ?? 0} en total · {delCliente} del cliente · {(mensajes ?? []).filter((m) => m.lado === 'bot').length} del bot · {(mensajes ?? []).filter((m) => m.lado === 'asesor').length} de asesores</div></div>
              {minutosPrimera !== null && <div className="dato"><small>Primera respuesta de un asesor</small><div>{minutosPrimera} min después de entrar a la cola</div></div>}
              <div className="dato"><small>Origen</small><div>{lead.origen}</div></div>
              <div className="dato"><small>Tareas</small><div>{tareas.filter((t) => t.estado === 'hecho').length} cumplidas · {pendientes.length} pendientes</div></div>
            </div>
          )}

          {conflictos && (
            <div className="aviso warn" role="alert">
              <b>Estos datos cambiaron mientras editabas</b> (otro asesor o el bot):
              <ul style={{ margin: '6px 0' }}>
                {Object.entries(conflictos).map(([k, v]) => (
                  <li key={k}>{nombreDe(k)}: ahora dice «{mostrar(k, v)}»; tú pusiste «{mostrar(k, cambios[k])}»</li>
                ))}
              </ul>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn chico primary" disabled={ocupado} onClick={() => guardarCambios(true)}>Conservar lo mío</button>
                <button className="btn chico" disabled={ocupado} onClick={usarLoNuevo}>Usar lo nuevo</button>
              </div>
            </div>
          )}

          {hayCambios && (
            <div className="f-guardar" role="region" aria-label="Cambios sin guardar">
              <span>Cambios sin guardar ({Object.keys(cambios).length})</span>
              <button className="btn chico" disabled={ocupado} onClick={() => { setCambios({}); setConflictos(null); setAviso({}) }}>Descartar</button>
              <button className="btn chico primary" disabled={ocupado} onClick={() => guardarCambios()}>{ocupado ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          )}

          <div className="row f-pie">
            {lead.archivado_en
              ? <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => archivoLead(lead.id, 'desarchivar'))}>Desarchivar</button>
              : <button className="btn chico" disabled={ocupado || !!lead.eliminado_en}
                  onClick={() => confirm('¿Archivar este lead? Sale de las listas; si vuelve a escribir, se desarchiva solo.') && hacer(() => archivoLead(lead.id, 'archivar'))}>Archivar</button>}
            {yo.eliminar && (lead.eliminado_en
              ? <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => archivoLead(lead.id, 'restaurar'))}>Restaurar</button>
              : <button className="btn chico peligro" disabled={ocupado}
                  onClick={() => confirm('¿Enviar a la papelera? Se puede restaurar durante 30 días.') && hacer(() => archivoLead(lead.id, 'eliminar'))}>Eliminar</button>)}
            {yo.eliminar && yo.verTodas && (
              <button className="btn chico peligro" disabled={ocupado} style={{ marginLeft: 'auto' }}
                title="Borra ya, sin papelera, todo lo del cliente: datos, mensajes, archivos y cotizaciones (Ley 1581)"
                onClick={async () => {
                  const t = prompt(`Borrado definitivo a pedido del cliente: se borran sus datos, mensajes, archivos y cotizaciones, y no se puede deshacer.\n\nPara confirmar, escribe su teléfono: ${lead.telefono}`)
                  if (t === null) return
                  setOcupado(true)
                  const r = await borrarYa(lead.id, t)
                  setOcupado(false)
                  if (r.error) setAviso(r)
                  else router.push('/leads')
                }}>Borrar ya (pedido del cliente)</button>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------- Panel derecho: línea de tiempo y chat ------------------------------------------- */}
      <div className="col f-linea">
        <div className="col-h"><h2>Conversación e historial</h2></div>
        <div className="chat" ref={linea}>
          {mensajes === null && <p className="vacio">Cargando…</p>}
          {items.map((it) => {
            if (it.m) {
              const m = it.m
              const { cuerpo, opciones } = m.lado === 'bot' ? partirOpciones(m.texto) : { cuerpo: m.texto, opciones: [] }
              return (
                <div key={`m${m.id}`} className={`m ${m.lado}`}>
                  {m.lado === 'asesor' && <span className="m-quien">{nombres.get(m.usuario_id ?? '') ?? 'Asesor'}</span>}
                    {m.automatico && <span className="m-quien" title="Mensaje automático del retorno (F4·45)">🤖 automático</span>}
                  {m.media_ruta && <Media m={m} />}
                  {cuerpo}
                  {opciones.length > 0 && <div className="opts">{opciones.map((o, i) => <span key={i}>{o}</span>)}</div>}
                  <time>{hora(m.creado_en)} <Entrega m={m} /></time>
                </div>
              )
            }
            const d = describir(it.e!)
            return (
              <div key={`e${it.e!.id}`} className={d.nota ? 'evento nota' : 'evento'}>
                {d.nota && <b>📝 Nota · </b>}{d.texto}
                <time>{d.quien} · {hora(it.e!.en)}</time>
              </div>
            )
          })}
        </div>

        <div className="b-responder">
          <div className="pastillas" role="tablist" style={{ marginBottom: 6 }}>
            {([['chat', 'Chat'], ['nota', 'Nota'], ['tarea', 'Tarea']] as const).map(([k, t]) => (
              <button key={k} role="tab" aria-selected={caja === k} className={`pastilla${caja === k ? ' activa' : ''}`} onClick={() => setCaja(k)}>{t}</button>
            ))}
          </div>
          {caja === 'chat' && mensajes !== null && !enVentana ? (
            <ComponerPlantilla key={lead.id} lead={lead.id} nombreCliente={lead.nombre} alEnviar={() => { cargar(); router.refresh() }} />
          ) : caja === 'tarea' ? (
            formTarea()
          ) : (
            <>
              {caja === 'chat' && lead.estado_chat !== 'asignada' && <small className="muted">Al responder tomas la conversación y el bot deja de contestarle.</small>}
              {caja === 'nota' && <small className="muted">La nota solo la ve el equipo; no le llega al cliente.</small>}
              {coincidencias.length > 0 && (
                <div role="listbox" aria-label="Respuestas rápidas" style={{ display: 'grid', gap: 2, border: '1px solid var(--line)', borderRadius: 10, padding: 4, marginBottom: 6 }}>
                  {coincidencias.map((r) => (
                    <button key={r.id} type="button" role="option" aria-selected="false" className="btn chico" style={{ justifyContent: 'flex-start' }}
                      onClick={() => setEscrito(r.texto.replaceAll('{nombre}', (lead.nombre ?? '').trim().split(/\s+/)[0] || 'cliente'))}>
                      <strong>/{r.atajo}</strong> · {r.titulo}
                    </button>
                  ))}
                </div>
              )}
              <div className="b-caja">
                <textarea rows={2} value={escrito} onChange={(e) => setEscrito(e.target.value)}
                  placeholder={caja === 'chat' ? 'Escribe tu respuesta · Enter envía, Shift+Enter salto de línea · / respuestas rápidas' : 'Nota para el equipo'}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && coincidencias.length > 0) {
                      e.preventDefault()
                      setEscrito(coincidencias[0].texto)
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      enviar()
                    }
                  }} />
                <button className={`btn ${caja === 'chat' ? 'primary' : ''}`} disabled={ocupado || !escrito.trim()} onClick={enviar}>
                  {ocupado ? 'Guardando…' : caja === 'chat' ? 'Enviar' : 'Guardar nota'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { accionEnGrupo, borrarVista, exportarLeads, guardarVista, type AccionGrupo, type Resultado } from './acciones'
import { COLUMNAS, COLUMNAS_INICIALES, ESTADOS, type Fila, type Filtros, type Pagina } from './filtros'

type Etapa = { id: number; nombre: string; embudo_id: number; cierre: string }
type Atributo = { clave: string; nombre: string; tipo: string; opciones: string[]; visible_lista: boolean }
type Vista = { id: number; nombre: string; filtros: Filtros; columnas: string[]; predeterminada: boolean }

const cop = (n: number | null) => (n === null || n === undefined ? '' : `$${Math.round(n).toLocaleString('es-CO')}`)
const fecha = (v: string | null) => (v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' }) : '')
const COLOR: Record<string, string> = { Verde: 'ok', Rojo: 'bad', Amarillo: 'warn', Naranja: 'warn', Azul: 'acc', Morado: 'acc' }
const GUARDADO = 'leads-columnas'

function valorAtributo(v: unknown) {
  if (v === null || v === undefined || v === '') return ''
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'number') return v.toLocaleString('es-CO')
  return String(v)
}

export function Leads(props: {
  filtros: Filtros
  pagina: Pagina
  error: string | null
  embudos: { id: number; nombre: string }[]
  etapas: Etapa[]
  usuarios: { id: string; nombre: string }[]
  etiquetas: string[]
  atributos: Atributo[]
  vistas: Vista[]
  vistaActiva: number | null
  puede: { reasignar: boolean; etapas: boolean; eliminar: boolean; exportar: boolean }
  yo: string
  tiposTarea: string[]
}) {
  const { filtros, pagina, embudos, etapas, usuarios, etiquetas, atributos, vistas, puede, yo, tiposTarea } = props
  const router = useRouter()
  const ruta = usePathname()
  const [q, setQ] = useState(filtros.q ?? '')
  const [elegidos, setElegidos] = useState<number[]>([])
  const [aviso, setAviso] = useState<Resultado>({})
  const [ocupado, setOcupado] = useState(false)
  const [abierto, setAbierto] = useState<'' | 'etapa' | 'responsable' | 'etiqueta' | 'tarea'>('')
  const [dato, setDato] = useState<Record<string, string>>({})
  const [columnas, setColumnas] = useState<string[]>(() => {
    const vista = vistas.find((v) => v.id === props.vistaActiva)
    if (vista?.columnas.length) return vista.columnas
    return [...COLUMNAS_INICIALES, ...atributos.filter((a) => a.visible_lista).map((a) => `a:${a.clave}`)]
  })

  // Las columnas elegidas se recuerdan en este navegador (si una vista no trae las suyas).
  useEffect(() => {
    if (props.vistaActiva) return
    try {
      const g = localStorage.getItem(GUARDADO)
      if (g) setColumnas(JSON.parse(g))
    } catch { /* sin almacenamiento: columnas por defecto */ }
  }, [props.vistaActiva])
  useEffect(() => setElegidos([]), [pagina])
  useEffect(() => setQ(filtros.q ?? ''), [filtros.q])

  function ir(cambios: Partial<Filtros>, conservarPagina = false) {
    const nuevo: Record<string, string> = { ...(filtros as Record<string, string>), ...(cambios as Record<string, string>) }
    if (!conservarPagina && !('pagina' in cambios)) delete nuevo.pagina
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(nuevo)) if (v) params.set(k, v)
    if (!params.toString()) params.set('estado', 'activos') // sin filtros abriría la vista predeterminada
    router.push(`${ruta}?${params.toString()}`)
  }

  function ponerColumnas(c: string[]) {
    setColumnas(c)
    try { localStorage.setItem(GUARDADO, JSON.stringify(c)) } catch { /* sin almacenamiento */ }
  }

  async function grupo(accion: AccionGrupo, extra: Record<string, unknown> = {}, pregunta?: string) {
    if (pregunta && !confirm(pregunta)) return
    setOcupado(true)
    const r = await accionEnGrupo(accion, elegidos, extra)
    setAviso(r)
    setOcupado(false)
    if (!r.error) { setAbierto(''); setDato({}); router.refresh() }
  }

  async function exportar() {
    setOcupado(true)
    const r = await exportarLeads(filtros, atributos.map((a) => ({ clave: a.clave, nombre: a.nombre })))
    setOcupado(false)
    if (r.error || !r.csv) return setAviso({ error: r.error ?? 'No se pudo exportar.' })
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }))
    enlace.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    enlace.click()
    URL.revokeObjectURL(enlace.href)
    setAviso({ ok: `${r.total} leads exportados.` })
  }

  const etapasDelEmbudo = useMemo(() => etapas.filter((e) => !filtros.embudo || e.embudo_id === Number(filtros.embudo)), [etapas, filtros.embudo])
  const etapaElegida = etapas.find((e) => e.id === Number(dato.etapa))
  const nombresNombrados = useMemo(() => new Map(embudos.map((e) => [e.id, e.nombre])), [embudos])
  const paginas = Math.max(1, Math.ceil(pagina.total / pagina.tamano))
  const todosElegidos = pagina.filas.length > 0 && pagina.filas.every((f) => elegidos.includes(f.id))
  const estado = filtros.estado ?? 'activos'
  const hayFiltros = ['q', 'embudo', 'etapa', 'responsable', 'etiqueta', 'vencidas', 'desde', 'hasta', 'atributo'].some((k) => filtros[k as keyof Filtros])
  const atributoFiltro = atributos.find((a) => a.clave === filtros.atributo)

  function celda(f: Fila, c: string) {
    if (c === 'a:venta_online') return f.atributos?.venta_online === true ? '🚚 Online' : f.atributos?.venta_online === false ? '🏬 Tienda' : ''
    if (c.startsWith('a:')) return valorAtributo(f.atributos?.[c.slice(2)])
    switch (c) {
      case 'telefono': return <span className="num">+{f.telefono}</span>
      case 'oportunidad': return f.oportunidad
        ? <span className={`chip ${f.oportunidad.estado === 'ganada' ? 'ok' : f.oportunidad.estado === 'perdida' ? 'bad' : COLOR[f.oportunidad.color] ?? 'neu'}`}
            title={f.oportunidad.embudo}>{f.oportunidad.etapa}</span>
        : <span className="muted">{f.etapa_bot}</span>
      case 'responsable': return f.responsable ?? <span className="muted">Sin asignar</span>
      case 'etiquetas': return <span className="row" style={{ gap: 4 }}>{f.etiquetas.map((t) => <span key={t} className="chip neu">{t}</span>)}</span>
      case 'valor': return <span className="num">{cop(f.valor)}</span>
      case 'ultimo_mensaje': return <span className="muted" title={f.ultimo_mensaje ?? ''}>{(f.ultimo_mensaje ?? '').slice(0, 60)}</span>
      case 'ultimo_contacto': return fecha(f.ultimo_contacto)
      case 'creado': return fecha(f.creado)
      case 'origen': return f.origen
      case 'producto': return f.producto
      case 'tareas': return f.vencidas ? <span className="chip bad">{f.vencidas} vencida{f.vencidas > 1 ? 's' : ''}</span> : ''
    }
    return ''
  }
  const tituloColumna = (c: string) => (c.startsWith('a:') ? atributos.find((a) => a.clave === c.slice(2))?.nombre ?? c : COLUMNAS.find(([k]) => k === c)?.[1] ?? c)
  const ordenable: Record<string, Filtros['orden']> = { valor: 'valor', ultimo_contacto: 'contacto', creado: 'creado' }

  function Orden({ campo, children }: { campo: Filtros['orden']; children: React.ReactNode }) {
    const activo = (filtros.orden ?? 'contacto') === campo
    const dir = filtros.dir ?? (campo === 'nombre' ? 'asc' : 'desc')
    return (
      <button className="btn-link" onClick={() => ir({ orden: campo, dir: activo && dir === 'desc' ? 'asc' : 'desc' })} title="Ordenar">
        {children}{activo ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    )
  }

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>{pagina.total.toLocaleString('es-CO')} leads · {cop(pagina.valor)}</h2>
            <small>Todos los clientes que puedes ver. Toca un nombre para abrir su ficha.</small>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <select aria-label="Vista guardada" value={props.vistaActiva ?? ''} disabled={ocupado} onChange={(e) => {
              const v = vistas.find((x) => x.id === Number(e.target.value))
              if (!v) return ir({ estado: 'activos' })
              if (v.columnas.length) ponerColumnas(v.columnas)
              const params = new URLSearchParams(Object.entries(v.filtros).filter(([, x]) => x) as [string, string][])
              if (!params.toString()) params.set('estado', 'activos')
              router.push(`${ruta}?${params.toString()}`)
            }}>
              <option value="">Vistas guardadas…</option>
              {vistas.map((v) => <option key={v.id} value={v.id}>{v.nombre}{v.predeterminada ? ' ★' : ''}</option>)}
            </select>
            <button className="btn chico" disabled={ocupado} onClick={async () => {
              const nombre = prompt('Nombre de la vista (filtros y columnas actuales):')
              if (!nombre) return
              const pre = confirm('¿Abrirla siempre al entrar a Leads (predeterminada)?')
              setAviso(await guardarVista(nombre, filtros, columnas, pre))
            }}>Guardar vista</button>
            {props.vistaActiva && (
              <button className="btn chico peligro" disabled={ocupado} onClick={async () => {
                if (confirm('¿Borrar esta vista?')) { setAviso(await borrarVista(props.vistaActiva!)); ir({ estado: 'activos' }) }
              }}>Borrar vista</button>
            )}
            {puede.exportar && <button className="btn chico" disabled={ocupado || !pagina.total} onClick={exportar}>Exportar CSV</button>}
          </div>
        </div>

        <div className="panel-b" style={{ display: 'grid', gap: 10 }}>
          <div className="pastillas" role="tablist" aria-label="Estado">
            {ESTADOS.map(([v, t]) => (
              <button key={v} className={`pastilla${estado === v ? ' activa' : ''}`} onClick={() => ir({ estado: v })}>{t}</button>
            ))}
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); ir({ q }) }}>
            <input style={{ flex: '1 1 260px' }} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar"
              placeholder="Buscar por nombre, teléfono, código de equipo o texto de los mensajes" />
            <button className="btn">Buscar</button>
          </form>
          <div className="row" style={{ gap: 8 }}>
            <select aria-label="Embudo" value={filtros.embudo ?? ''} onChange={(e) => ir({ embudo: e.target.value, etapa: '' })}>
              <option value="">Todos los embudos</option>
              {embudos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <select aria-label="Etapa" value={filtros.etapa ?? ''} onChange={(e) => ir({ etapa: e.target.value })}>
              <option value="">Todas las etapas</option>
              {etapasDelEmbudo.map((e) => <option key={e.id} value={e.id}>{filtros.embudo ? e.nombre : `${nombresNombrados.get(e.embudo_id) ?? ''} · ${e.nombre}`}</option>)}
            </select>
            <select aria-label="Responsable" value={filtros.responsable ?? ''} onChange={(e) => ir({ responsable: e.target.value })}>
              <option value="">Cualquier responsable</option>
              <option value={yo}>Yo</option>
              <option value="sin">Sin asignar</option>
              {usuarios.filter((u) => u.id !== yo).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            <select aria-label="Etiqueta" value={filtros.etiqueta ?? ''} onChange={(e) => ir({ etiqueta: e.target.value })}>
              <option value="">Cualquier etiqueta</option>
              {etiquetas.map((t) => <option key={t}>{t}</option>)}
            </select>
            <label className="row" style={{ gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={filtros.vencidas === 'true'} onChange={(e) => ir({ vencidas: e.target.checked ? 'true' : undefined })} />
              Tareas vencidas
            </label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <select aria-label="Fecha por" value={filtros.fecha_campo ?? 'contacto'} onChange={(e) => ir({ fecha_campo: e.target.value as Filtros['fecha_campo'] })}>
              <option value="contacto">Último contacto</option>
              <option value="creado">Creado</option>
            </select>
            <input type="date" aria-label="Desde" value={filtros.desde ?? ''} onChange={(e) => ir({ desde: e.target.value })} />
            <input type="date" aria-label="Hasta" value={filtros.hasta ?? ''} onChange={(e) => ir({ hasta: e.target.value })} />
            <select aria-label="Atributo" value={filtros.atributo ?? ''} onChange={(e) => ir({ atributo: e.target.value, valor_atributo: '' })}>
              <option value="">Filtrar por atributo…</option>
              {atributos.map((a) => <option key={a.clave} value={a.clave}>{a.nombre}</option>)}
            </select>
            {atributoFiltro && (atributoFiltro.opciones.length ? (
              <select aria-label="Valor del atributo" value={filtros.valor_atributo ?? ''} onChange={(e) => ir({ valor_atributo: e.target.value })}>
                <option value="">Con cualquier valor</option>
                {atributoFiltro.opciones.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input aria-label="Valor del atributo" defaultValue={filtros.valor_atributo ?? ''} placeholder="Contiene… (vacío: lo tiene lleno)"
                onKeyDown={(e) => e.key === 'Enter' && ir({ valor_atributo: (e.target as HTMLInputElement).value })} />
            ))}
            {hayFiltros && <button className="btn chico" onClick={() => router.push(`${ruta}?estado=${estado}`)}>Quitar filtros</button>}
            <details className="columnas" style={{ marginLeft: 'auto' }}>
              <summary className="btn chico">Columnas</summary>
              <div className="panel" style={{ position: 'absolute', zIndex: 20, padding: 12, display: 'grid', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
                {[...COLUMNAS, ...atributos.map((a) => [`a:${a.clave}`, a.nombre] as [string, string])].map(([k, t]) => (
                  <label key={k} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={columnas.includes(k)}
                      onChange={(e) => ponerColumnas(e.target.checked ? [...columnas, k] : columnas.filter((c) => c !== k))} /> {t}
                  </label>
                ))}
              </div>
            </details>
          </div>
        </div>

        {(aviso.error || aviso.ok || props.error) && (
          <div className="panel-b" style={{ paddingTop: 0 }}>
            <div className={`aviso ${aviso.error || props.error ? 'bad' : 'ok'}`} role="alert">
              {props.error ?? aviso.error ?? aviso.ok}
              {!!aviso.errores?.length && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {aviso.errores.slice(0, 8).map((e) => (
                    <li key={e.lead}>{pagina.filas.find((f) => f.id === e.lead)?.nombre || `Lead ${e.lead}`}: {e.error}</li>
                  ))}
                  {aviso.errores.length > 8 && <li>…y {aviso.errores.length - 8} más</li>}
                </ul>
              )}
            </div>
          </div>
        )}

        {elegidos.length > 0 && (
          <div className="panel-b" style={{ paddingTop: 0, display: 'grid', gap: 8 }}>
            <div className="row" style={{ gap: 6 }}>
              <b>{elegidos.length} seleccionado{elegidos.length > 1 ? 's' : ''}:</b>
              {puede.etapas && <button className="btn chico" disabled={ocupado} onClick={() => setAbierto(abierto === 'etapa' ? '' : 'etapa')}>Cambiar etapa</button>}
              {puede.reasignar && <button className="btn chico" disabled={ocupado} onClick={() => setAbierto(abierto === 'responsable' ? '' : 'responsable')}>Cambiar responsable</button>}
              <button className="btn chico" disabled={ocupado} onClick={() => setAbierto(abierto === 'etiqueta' ? '' : 'etiqueta')}>Etiqueta</button>
              {puede.etapas && <button className="btn chico" disabled={ocupado} onClick={() => setAbierto(abierto === 'tarea' ? '' : 'tarea')}>Crear tarea</button>}
              {estado === 'archivados'
                ? <button className="btn chico" disabled={ocupado} onClick={() => grupo('desarchivar')}>Desarchivar</button>
                : estado !== 'papelera' && <button className="btn chico" disabled={ocupado}
                    onClick={() => grupo('archivar', {}, `¿Archivar ${elegidos.length} leads? Salen de las listas; si el cliente vuelve a escribir, se desarchiva solo.`)}>Archivar</button>}
              {puede.eliminar && (estado === 'papelera'
                ? <button className="btn chico" disabled={ocupado} onClick={() => grupo('restaurar')}>Restaurar</button>
                : <button className="btn chico peligro" disabled={ocupado}
                    onClick={() => grupo('eliminar', {}, `¿Enviar ${elegidos.length} leads a la papelera? Se pueden restaurar durante 30 días.`)}>Eliminar</button>)}
              <button className="btn chico" disabled={ocupado} onClick={() => setElegidos([])}>Quitar selección</button>
            </div>

            {abierto === 'etapa' && (
              <div className="row" style={{ gap: 6 }}>
                <select aria-label="Etapa nueva" value={dato.etapa ?? ''} onChange={(e) => setDato({ etapa: e.target.value })}>
                  <option value="">Elige la etapa…</option>
                  {embudos.map((em) => (
                    <optgroup key={em.id} label={em.nombre}>
                      {etapas.filter((e) => e.embudo_id === em.id).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </optgroup>
                  ))}
                </select>
                {etapaElegida?.cierre === 'perdida' && (
                  <input placeholder="Motivo (obligatorio)" value={dato.motivo ?? ''} onChange={(e) => setDato({ ...dato, motivo: e.target.value })} />
                )}
                <button className="btn chico primary" disabled={ocupado || !dato.etapa || (etapaElegida?.cierre === 'perdida' && !dato.motivo?.trim())}
                  onClick={() => grupo('etapa', { etapa: Number(dato.etapa), motivo: dato.motivo ?? null },
                    `¿Mover ${elegidos.length} leads a «${etapaElegida?.nombre}»? A quien no tenga oportunidad en ese embudo se le abre una.`)}>Mover</button>
              </div>
            )}
            {abierto === 'responsable' && (
              <div className="row" style={{ gap: 6 }}>
                <select aria-label="Nuevo responsable" value={dato.usuario ?? ''} onChange={(e) => setDato({ usuario: e.target.value })}>
                  <option value="">Elige el asesor…</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
                <button className="btn chico primary" disabled={ocupado || !dato.usuario}
                  onClick={() => grupo('responsable', { usuario: dato.usuario },
                    `¿Asignar ${elegidos.length} leads a ${usuarios.find((u) => u.id === dato.usuario)?.nombre}? El bot deja de contestarles: los atiende esa persona.`)}>Asignar</button>
              </div>
            )}
            {abierto === 'etiqueta' && (
              <div className="row" style={{ gap: 6 }}>
                <input list="etiquetas-leads" maxLength={40} placeholder="Etiqueta" value={dato.etiqueta ?? ''} onChange={(e) => setDato({ etiqueta: e.target.value })} />
                <datalist id="etiquetas-leads">{etiquetas.map((t) => <option key={t} value={t} />)}</datalist>
                <button className="btn chico primary" disabled={ocupado || !dato.etiqueta?.trim()} onClick={() => grupo('etiqueta_poner', { etiqueta: dato.etiqueta })}>Poner</button>
                <button className="btn chico" disabled={ocupado || !dato.etiqueta?.trim()} onClick={() => grupo('etiqueta_quitar', { etiqueta: dato.etiqueta })}>Quitar</button>
              </div>
            )}
            {abierto === 'tarea' && (
              <div className="row" style={{ gap: 6 }}>
                <select aria-label="Tipo de tarea" value={dato.tipo ?? tiposTarea[0] ?? 'Seguimiento'} onChange={(e) => setDato({ ...dato, tipo: e.target.value })}>
                  {tiposTarea.map((t) => <option key={t}>{t}</option>)}
                </select>
                <input style={{ flex: '1 1 200px' }} placeholder="Qué hay que hacer" maxLength={200} value={dato.que ?? ''} onChange={(e) => setDato({ ...dato, que: e.target.value })} />
                <input type="datetime-local" aria-label="Para cuándo" value={dato.vence ?? ''} onChange={(e) => setDato({ ...dato, vence: e.target.value })} />
                <button className="btn chico primary" disabled={ocupado || !dato.que?.trim() || !dato.vence}
                  onClick={() => grupo('tarea', { que: dato.que, tipo: dato.tipo ?? tiposTarea[0] ?? 'Seguimiento', vence: `${dato.vence}:00-05:00` })}>Crear</button>
              </div>
            )}
          </div>
        )}

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" aria-label="Seleccionar la página" checked={todosElegidos}
                    onChange={(e) => setElegidos(e.target.checked ? pagina.filas.map((f) => f.id) : [])} />
                </th>
                <th><Orden campo="nombre">Nombre</Orden></th>
                {columnas.map((c) => (
                  <th key={c} className={c === 'valor' ? 'r' : undefined}>
                    {ordenable[c] ? <Orden campo={ordenable[c]}>{tituloColumna(c)}</Orden> : tituloColumna(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagina.filas.length === 0 && (
                <tr><td colSpan={columnas.length + 2} className="muted" style={{ padding: 20, textAlign: 'center' }}>No hay leads con estos filtros.</td></tr>
              )}
              {pagina.filas.map((f) => (
                <tr key={f.id} className={elegidos.includes(f.id) ? 'elegida' : undefined}>
                  <td>
                    <input type="checkbox" aria-label={`Seleccionar ${f.nombre || f.telefono}`} checked={elegidos.includes(f.id)}
                      onChange={(e) => setElegidos(e.target.checked ? [...elegidos, f.id] : elegidos.filter((x) => x !== f.id))} />
                  </td>
                  <td>
                    <Link href={`/leads/${f.id}`}>{f.nombre || `+${f.telefono}`}</Link>
                    {f.archivado && <span className="chip neu" style={{ marginLeft: 6 }}>Archivado</span>}
                    {f.eliminado && <span className="chip bad" style={{ marginLeft: 6 }}>Papelera</span>}
                    {f.etiquetas.includes('Agente') && <span className="chip acc" style={{ marginLeft: 6 }}>🤖</span>}
                  </td>
                  {columnas.map((c) => <td key={c} className={c === 'valor' ? 'r' : undefined}>{celda(f, c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel-b row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">
            {pagina.total ? `${((pagina.pagina - 1) * pagina.tamano + 1).toLocaleString('es-CO')}–${Math.min(pagina.pagina * pagina.tamano, pagina.total).toLocaleString('es-CO')} de ${pagina.total.toLocaleString('es-CO')}` : ''}
          </span>
          <div className="row" style={{ gap: 6 }}>
            <select aria-label="Por página" value={String(pagina.tamano)} onChange={(e) => ir({ tamano: e.target.value })}>
              {[50, 100, 200].map((n) => <option key={n} value={n}>{n} por página</option>)}
            </select>
            <button className="btn chico" disabled={pagina.pagina <= 1} onClick={() => ir({ pagina: String(pagina.pagina - 1) })}>← Anterior</button>
            <span className="muted">Página {pagina.pagina} de {paginas}</span>
            <button className="btn chico" disabled={pagina.pagina >= paginas} onClick={() => ir({ pagina: String(pagina.pagina + 1) })}>Siguiente →</button>
          </div>
        </div>
      </section>
    </>
  )
}

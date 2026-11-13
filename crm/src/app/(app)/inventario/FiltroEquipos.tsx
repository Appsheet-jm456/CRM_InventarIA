'use client'

// F4·74 · Filtro dinámico de Inventario → Equipos (docs/FILTRO-DINAMICO-INVENTARIO.md).
// Todo en memoria: cada lista cuenta los equipos que quedan con los demás filtros (búsqueda por facetas),
// se puede marcar varias opciones por lista y los filtros viajan en la dirección de la página.

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { MenuAcciones } from '@/components/MenuAcciones'
import {
  SIN_DATO, capacidadDisco, familiaCpu, fotoDe, gbDe, generacionDe, nombreCpu, pesos, ramDe, tactilDe, tipoDisco, titulo,
  type Producto,
} from '@/lib/inventario'

type Faceta = {
  clave: string
  nombre: string
  valor: (p: Producto) => string
  etiqueta?: (v: string) => string
  orden?: (a: string, b: string) => number
  ocultarCeros?: boolean // listas largas: solo lo que existe (y lo ya marcado)
}

const o = (v: string) => v || SIN_DATO
const porNumero = (a: string, b: string) => (Number(a) || 999) - (Number(b) || 999)
const porGb = (a: string, b: string) => gbDe(a) - gbDe(b)

const FACETAS: Faceta[] = [
  { clave: 'tipo', nombre: 'Tipo', valor: (p) => o(p.categoria.trim()) },
  { clave: 'marca', nombre: 'Marca', valor: (p) => o(p.marca.trim().toUpperCase()) },
  { clave: 'modelo', nombre: 'Modelo', valor: (p) => o(p.modelo.trim().toUpperCase()), ocultarCeros: true },
  { clave: 'gen', nombre: 'Generación', valor: (p) => o(generacionDe(p.generacion)), orden: porNumero,
    etiqueta: (v) => (v === SIN_DATO ? v : `${v}.ª`) },
  { clave: 'cpu', nombre: 'Procesador', valor: (p) => familiaCpu(p.procesador) || SIN_DATO,
    etiqueta: (v) => (v === SIN_DATO ? v : nombreCpu(v)) },
  { clave: 'ram', nombre: 'RAM', valor: (p) => o(ramDe(p.ram)), orden: porGb },
  { clave: 'disco', nombre: 'Disco', valor: (p) => o(capacidadDisco(p.almacenamiento)), orden: porGb },
  { clave: 'dtipo', nombre: 'Tipo de disco', valor: (p) => o(tipoDisco(p.almacenamiento)) },
]
const TACTIL = ['Sí', 'No', SIN_DATO]

type Estado = {
  q: string
  sel: Record<string, string[]>
  tactil: string
  pmin: string
  pmax: string
  todos: boolean // false = solo disponibles (con stock)
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const etiquetaDe = (f: Faceta, v: string) => (f.etiqueta ? f.etiqueta(v) : v)

function desdeDireccion(p: Record<string, string | undefined>): Estado {
  const sel: Record<string, string[]> = {}
  for (const f of FACETAS) {
    const valores = (p[f.clave] ?? '').split(',').map((v) => v.trim()).filter(Boolean)
    if (valores.length) sel[f.clave] = f.clave === 'marca' || f.clave === 'modelo' ? valores.map((v) => v.toUpperCase()) : valores
  }
  return { q: p.q ?? '', sel, tactil: TACTIL.includes(p.tactil ?? '') ? p.tactil! : '', pmin: p.pmin ?? '', pmax: p.pmax ?? '',
    todos: p.stock === 'todos' }
}

function aDireccion(e: Estado): string {
  const u = new URLSearchParams()
  if (e.q.trim()) u.set('q', e.q.trim())
  for (const f of FACETAS) if (e.sel[f.clave]?.length) u.set(f.clave, e.sel[f.clave].join(','))
  if (e.tactil) u.set('tactil', e.tactil)
  if (e.pmin) u.set('pmin', e.pmin)
  if (e.pmax) u.set('pmax', e.pmax)
  if (e.todos) u.set('stock', 'todos')
  const s = u.toString()
  return s ? `?${s}` : ''
}

export function FiltroEquipos({ productos, administra, inicial }: {
  productos: Producto[]
  administra: boolean
  inicial: Record<string, string | undefined>
}) {
  const [e, setE] = useState<Estado>(() => desdeDireccion(inicial))
  const [abierto, setAbierto] = useState(false)
  const [abiertaFaceta, setAbiertaFaceta] = useState<string | null>(null) // una lista desplegada a la vez
  const [buscaOpcion, setBuscaOpcion] = useState('')

  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${aDireccion(e)}`)
  }, [e])
  useEffect(() => {
    if (!abierto) return
    const cerrar = (ev: KeyboardEvent) => ev.key === 'Escape' && setAbierto(false)
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [abierto])

  // Lo que se calcula una vez por equipo (valores de cada lista y texto de búsqueda).
  const filas = useMemo(() => productos.map((p) => ({
    p,
    v: Object.fromEntries(FACETAS.map((f) => [f.clave, f.valor(p)])) as Record<string, string>,
    tactil: tactilDe(p.atributos) || SIN_DATO,
    texto: sinTildes([p.codigo, p.marca, p.modelo, p.procesador, p.ram, p.almacenamiento, p.descripcion,
      ...Object.values(p.atributos ?? {}).map(String)].join(' ')),
  })), [productos])

  const q = sinTildes(e.q.trim())
  const min = Number(e.pmin.replace(/\D/g, '')) || 0
  const max = Number(e.pmax.replace(/\D/g, '')) || 0

  // Un equipo pasa si cumple todos los filtros menos el que se está contando («y» entre listas, «o» dentro de una lista).
  const pasa = (f: (typeof filas)[number], excluir?: string) =>
    (e.todos || f.p.stock > 0) &&
    (!q || f.texto.includes(q)) &&
    (!min || Number(f.p.precio) >= min) &&
    (!max || Number(f.p.precio) <= max) &&
    (excluir === 'tactil' || !e.tactil || f.tactil === e.tactil) &&
    FACETAS.every((fa) => fa.clave === excluir || !e.sel[fa.clave]?.length || e.sel[fa.clave].includes(f.v[fa.clave]))

  const visibles = filas.filter((f) => pasa(f))

  const opciones = useMemo(() => {
    const r: Record<string, { valor: string; n: number }[]> = {}
    for (const fa of FACETAS) {
      const cuenta = new Map<string, number>()
      for (const f of filas) cuenta.set(f.v[fa.clave], cuenta.get(f.v[fa.clave]) ?? 0)
      for (const f of filas) if (pasa(f, fa.clave)) cuenta.set(f.v[fa.clave], (cuenta.get(f.v[fa.clave]) ?? 0) + 1)
      const orden = fa.orden ?? ((a: string, b: string) => a.localeCompare(b, 'es'))
      r[fa.clave] = [...cuenta.entries()]
        .filter(([v, n]) => n > 0 || !fa.ocultarCeros || e.sel[fa.clave]?.includes(v))
        .map(([valor, n]) => ({ valor, n }))
        .sort((a, b) => (a.valor === SIN_DATO ? 1 : b.valor === SIN_DATO ? -1 : orden(a.valor, b.valor)))
    }
    const t = new Map<string, number>(TACTIL.map((v) => [v, 0]))
    let todosTactil = 0
    for (const f of filas) if (pasa(f, 'tactil')) { t.set(f.tactil, (t.get(f.tactil) ?? 0) + 1); todosTactil++ }
    r.tactil = [{ valor: '', n: todosTactil }, ...TACTIL.map((valor) => ({ valor, n: t.get(valor) ?? 0 }))]
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, e])

  const alternar = (clave: string, valor: string) => setE((x) => {
    const actual = x.sel[clave] ?? []
    const nuevo = actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor]
    return { ...x, sel: { ...x.sel, [clave]: nuevo } }
  })
  const limpiar = () => setE((x) => ({ q: x.q, sel: {}, tactil: '', pmin: '', pmax: '', todos: false }))

  // Pastillas de lo que está aplicado (sin contar la búsqueda, que ya se ve en su casilla).
  const activos: { texto: string; quitar: () => void }[] = [
    ...FACETAS.flatMap((fa) => (e.sel[fa.clave] ?? []).map((v) => ({
      texto: `${fa.clave === 'tipo' || fa.clave === 'marca' || fa.clave === 'modelo' ? '' : `${fa.nombre}: `}${etiquetaDe(fa, v)}`,
      quitar: () => alternar(fa.clave, v),
    }))),
    ...(e.tactil ? [{ texto: `Táctil: ${e.tactil}`, quitar: () => setE((x) => ({ ...x, tactil: '' })) }] : []),
    ...(e.pmin || e.pmax ? [{
      texto: `Precio ${e.pmin ? `desde ${pesos(min)}` : ''}${e.pmin && e.pmax ? ' ' : ''}${e.pmax ? `hasta ${pesos(max)}` : ''}`,
      quitar: () => setE((x) => ({ ...x, pmin: '', pmax: '' })),
    }] : []),
    ...(e.todos ? [{ texto: 'También sin stock', quitar: () => setE((x) => ({ ...x, todos: false })) }] : []),
  ]
  const grupos = FACETAS.filter((fa) => e.sel[fa.clave]?.length).length + (e.tactil ? 1 : 0) + (e.pmin || e.pmax ? 1 : 0) + (e.todos ? 1 : 0)
  const valorFiltrado = visibles.reduce((s, f) => s + (f.p.stock > 0 ? Number(f.p.precio) * f.p.stock : 0), 0)
  const nEquipos = `${visibles.length} ${visibles.length === 1 ? 'equipo' : 'equipos'}`

  return (
    <section className="panel">
      <div className="panel-h filtro-inv">
        <input type="search" value={e.q} onChange={(ev) => setE((x) => ({ ...x, q: ev.target.value }))}
          placeholder="Buscar código, modelo, procesador…" aria-label="Buscar" />
        <button type="button" className="btn chico" onClick={() => setAbierto(true)} aria-haspopup="dialog">
          🎚 Filtros{grupos > 0 && <span className="contador-filtros">{grupos}</span>}
        </button>
        <small className="muted">{visibles.length} de {productos.length}{grupos > 0 || q ? ` · ${pesos(valorFiltrado)}` : ''}</small>
      </div>

      {activos.length > 0 && (
        <div className="filtros-activos">
          {activos.map((a) => (
            <button key={a.texto} type="button" className="pastilla quitar" onClick={a.quitar} title="Quitar este filtro">{a.texto} ✕</button>
          ))}
          <button type="button" className="btn chico" onClick={limpiar}>Limpiar todo</button>
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="panel-b muted">
          Ningún equipo con esos filtros.{' '}
          {(grupos > 0 || q) && <button type="button" className="btn chico" onClick={() => { limpiar(); setE((x) => ({ ...x, q: '' })) }}>Limpiar todo</button>}
        </div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th></th><th>Código</th><th>Equipo</th><th>Procesador</th><th>RAM</th><th>Disco</th><th>Estado</th>
                <th className="r">Precio</th><th className="r">Stock</th><th></th></tr>
            </thead>
            <tbody>
              {visibles.map(({ p }) => {
                const foto = fotoDe(p)
                return (
                  <tr key={p.id}>
                    <td className="celda-foto">{foto ? <img src={foto} alt="" loading="lazy" /> : <span className="sin-foto" title="Sin foto">—</span>}</td>
                    <td className="mono"><Link href={`/inventario/${p.id}`}>{p.codigo}</Link></td>
                    <td>{titulo(p)}</td>
                    <td>{p.procesador}{p.generacion ? <small className="muted"> · {p.generacion}.ª</small> : null}</td>
                    <td>{p.ram}</td>
                    <td>{p.almacenamiento}</td>
                    <td>{p.estado}</td>
                    <td className="r mono">{pesos(p.precio)}</td>
                    <td className="r mono"><span className={`chip ${p.stock > 0 ? 'ok' : 'neu'}`}>{p.stock}</span></td>
                    <td className="r">
                      <MenuAcciones etiqueta={`Acciones de ${p.codigo}`} acciones={[
                        { texto: 'Ver ficha', href: `/inventario/${p.id}` },
                        ...(administra ? [{ texto: 'Editar', href: `/inventario/${p.id}?editar=1` }] : []),
                      ]} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {abierto && (
        <div className="filtros-capa" onClick={() => setAbierto(false)}>
          <div className="filtros-panel" role="dialog" aria-modal="true" aria-label="Filtros" onClick={(ev) => ev.stopPropagation()}>
            <div className="filtros-cab">
              <h3>Filtros{grupos > 0 && <span className="contador-filtros">{grupos}</span>}</h3>
              <button type="button" className="btn chico" onClick={() => setAbierto(false)} aria-label="Cerrar">✕</button>
            </div>
            <div className="filtros-cuerpo">
              {FACETAS.map((fa) => {
                // F4·74b: cada lista es un selector cerrado («Todos ⌄», como la tienda web); al tocarlo se despliega con casillas.
                const lista = opciones[fa.clave] ?? []
                const elegidos = e.sel[fa.clave] ?? []
                const total = lista.reduce((s, x) => s + x.n, 0)
                const resumen = !elegidos.length ? `Todos (${total})`
                  : elegidos.length <= 2 ? elegidos.map((v) => etiquetaDe(fa, v)).join(', ')
                  : `${elegidos.length} seleccionados`
                const desplegado = abiertaFaceta === fa.clave
                const busca = sinTildes(buscaOpcion.trim())
                const vistas = desplegado && busca ? lista.filter((x) => sinTildes(etiquetaDe(fa, x.valor)).includes(busca)) : lista
                return (
                  <div key={fa.clave} className="faceta">
                    <h4>{fa.nombre}</h4>
                    <button type="button" className={`selector${elegidos.length ? ' con-valor' : ''}`} aria-expanded={desplegado}
                      onClick={() => { setAbiertaFaceta(desplegado ? null : fa.clave); setBuscaOpcion('') }}>
                      <span>{resumen}</span><span className="flecha" aria-hidden>{desplegado ? '⌃' : '⌄'}</span>
                    </button>
                    {desplegado && (
                      <div className="lista-opciones">
                        {lista.length > 8 && (
                          <input type="search" className="busca-opcion" placeholder={`Buscar ${fa.nombre.toLowerCase()}…`} value={buscaOpcion}
                            onChange={(ev) => setBuscaOpcion(ev.target.value)} aria-label={`Buscar ${fa.nombre}`} />
                        )}
                        <div className="opciones-scroll">
                          {vistas.map(({ valor, n }) => {
                            const marcado = elegidos.includes(valor)
                            return (
                              <label key={valor} className={`opcion${n === 0 && !marcado ? ' sin' : ''}`}>
                                <input type="checkbox" checked={marcado} disabled={n === 0 && !marcado} onChange={() => alternar(fa.clave, valor)} />
                                <span>{etiquetaDe(fa, valor)}</span><small>{n}</small>
                              </label>
                            )
                          })}
                          {vistas.length === 0 && <small className="muted">Nada con «{buscaOpcion}».</small>}
                        </div>
                        {elegidos.length > 0 && (
                          <button type="button" className="btn chico" onClick={() => setE((x) => ({ ...x, sel: { ...x.sel, [fa.clave]: [] } }))}>
                            Quitar {fa.nombre.toLowerCase()}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="faceta">
                <h4>Táctil</h4>
                <div className="segmento">
                  {opciones.tactil.filter(({ valor, n }) => valor !== SIN_DATO || n > 0 || e.tactil === SIN_DATO).map(({ valor, n }) => (
                    <button key={valor || 'todos'} type="button" className={e.tactil === valor ? 'activa' : ''} aria-pressed={e.tactil === valor}
                      onClick={() => setE((x) => ({ ...x, tactil: valor }))}>
                      {valor || 'Todos'} <small>({n})</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="faceta">
                <h4>Precio</h4>
                <div className="rango-precio">
                  <input inputMode="numeric" placeholder="Mínimo" aria-label="Precio mínimo" value={e.pmin}
                    onChange={(ev) => setE((x) => ({ ...x, pmin: ev.target.value.replace(/\D/g, '') }))} />
                  <span>–</span>
                  <input inputMode="numeric" placeholder="Máximo" aria-label="Precio máximo" value={e.pmax}
                    onChange={(ev) => setE((x) => ({ ...x, pmax: ev.target.value.replace(/\D/g, '') }))} />
                </div>
              </div>

              <label className="solo-disponibles">
                <input type="checkbox" checked={!e.todos} onChange={(ev) => setE((x) => ({ ...x, todos: !ev.target.checked }))} />
                Solo disponibles (con stock)
              </label>
            </div>
            <div className="filtros-pie">
              <button type="button" className="btn primary" onClick={() => setAbierto(false)}>Aplicar · {nEquipos}</button>
              <button type="button" className="btn" onClick={limpiar}>Limpiar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

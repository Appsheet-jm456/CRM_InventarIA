import Link from 'next/link'
import { MenuAcciones } from '@/components/MenuAcciones'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { COLUMNAS_PRODUCTO, fotoDe, pesos, titulo, type Producto } from '@/lib/inventario'
import { Pestanas } from './Pestanas'

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default async function Inventario({ searchParams }: {
  searchParams: { q?: string; marca?: string; cpu?: string; stock?: string }
}) {
  const sesion = (await obtenerSesion())!
  const administra = puede(sesion, ['administrar_inventario'])
  const { data } = await crearCliente().from('productos').select(COLUMNAS_PRODUCTO).order('precio').limit(2000)
  const todos = (data ?? []) as Producto[]

  const verTodos = searchParams.stock === 'todos'
  const q = sinTildes(searchParams.q?.trim() ?? '')
  const marca = searchParams.marca ?? ''
  const cpu = searchParams.cpu ?? ''
  const cpuDe = (p: Producto) => p.procesador.match(/i[3579]|ryzen\s*\d|celeron|pentium|m[1-4]/i)?.[0].toLowerCase().replace(/\s+/, ' ') ?? ''
  const filas = todos.filter((p) =>
    (verTodos || p.stock > 0) &&
    (!marca || p.marca === marca) &&
    (!cpu || cpuDe(p) === cpu) &&
    (!q || sinTildes([p.codigo, p.marca, p.modelo, p.procesador, p.ram, p.almacenamiento, p.descripcion].join(' ')).includes(q)))
  const marcas = [...new Set(todos.map((p) => p.marca).filter(Boolean))].sort()
  const cpus = [...new Set(todos.map(cpuDe).filter(Boolean))].sort()
  const conStock = todos.filter((p) => p.stock > 0)

  return (
    <>
      <Pestanas activa="/inventario" administra={administra}>
        {administra && <Link className="btn primary chico" href="/inventario/nuevo">+ Nuevo equipo</Link>}
      </Pestanas>

      <section className="panel">
        <div className="kpis">
          <div className="kpi"><span className="k">Equipos con stock</span><span className="v">{conStock.length}</span>
            <span className="s">{conStock.reduce((s, p) => s + p.stock, 0)} unidades</span></div>
          <div className="kpi"><span className="k">Valor del inventario</span>
            <span className="v">{pesos(conStock.reduce((s, p) => s + Number(p.precio) * p.stock, 0))}</span>
            <span className="s">Precio de venta × stock</span></div>
          <div className="kpi"><span className="k">Sin foto</span>
            <span className="v" style={{ color: conStock.some((p) => !fotoDe(p)) ? 'var(--warn)' : undefined }}>{conStock.filter((p) => !fotoDe(p)).length}</span>
            <span className="s">Con stock: la ficha del bot sale sin imagen</span></div>
        </div>
      </section>

      <section className="panel">
        <form className="panel-h filtro-inv" action="/inventario">
          <input type="search" name="q" defaultValue={searchParams.q} placeholder="Buscar código, modelo, procesador…" aria-label="Buscar" />
          <select name="marca" defaultValue={marca} aria-label="Marca">
            <option value="">Todas las marcas</option>
            {marcas.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select name="cpu" defaultValue={cpu} aria-label="Procesador">
            <option value="">Todos los procesadores</option>
            {cpus.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
          <select name="stock" defaultValue={verTodos ? 'todos' : ''} aria-label="Stock">
            <option value="">Con stock</option>
            <option value="todos">Todos, también en 0</option>
          </select>
          <button className="btn chico">Filtrar</button>
          <small className="muted">{filas.length} de {todos.length}</small>
        </form>
        {filas.length === 0 ? (
          <div className="panel-b muted">Ningún equipo con esos filtros.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th></th><th>Código</th><th>Equipo</th><th>Procesador</th><th>RAM</th><th>Disco</th><th>Estado</th>
                  <th className="r">Precio</th><th className="r">Stock</th><th></th></tr>
              </thead>
              <tbody>
                {filas.map((p) => {
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
      </section>
    </>
  )
}

import Link from 'next/link'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { COLUMNAS_PRODUCTO, fotoDe, pesos, type Producto } from '@/lib/inventario'
import { FiltroEquipos } from './FiltroEquipos'
import { Pestanas } from './Pestanas'

export default async function Inventario({ searchParams }: {
  searchParams: Record<string, string | undefined>
}) {
  const sesion = (await obtenerSesion())!
  const administra = puede(sesion, ['administrar_inventario'])
  const { data } = await crearCliente().from('productos').select(COLUMNAS_PRODUCTO).order('precio').limit(2000)
  const todos = (data ?? []) as Producto[]

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

      <FiltroEquipos productos={todos} administra={administra} inicial={searchParams} />
    </>
  )
}

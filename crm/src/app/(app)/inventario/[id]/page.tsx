import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { COLUMNAS_PRODUCTO, fotoDe, pesos, titulo, type Producto } from '@/lib/inventario'
import { FormProducto } from '../FormProducto'

export default async function FichaEquipo({ params, searchParams }: { params: { id: string }; searchParams: { editar?: string; creado?: string } }) {
  const sesion = (await obtenerSesion())!
  const administra = puede(sesion, ['administrar_inventario'])
  const { data } = await crearCliente().from('productos').select(COLUMNAS_PRODUCTO).eq('id', Number(params.id)).maybeSingle()
  if (!data) notFound()
  const p = data as Producto
  const foto = fotoDe(p)
  if (administra && searchParams.editar === '1') return <FormProducto producto={p} foto={foto} />

  // La misma ficha que arma el bot (flujo.r11): así la ve el cliente por WhatsApp.
  const ficha = `💻 *${p.marca} ${p.modelo}* · Código ${p.codigo}\n${p.procesador} · ${p.ram} · ${p.almacenamiento}` +
    `${p.estado ? ` · ${p.estado}` : ''}\n💰 ${pesos(p.precio).replace(/\s/g, '')} · ${p.stock > 0 ? '✅ Disponible' : '❌ Agotado'}`
  const datos: [string, string][] = [
    ['Código', p.codigo], ['Categoría', p.categoria], ['Marca', p.marca], ['Modelo', p.modelo],
    ['Procesador', p.procesador], ['Generación', p.generacion], ['RAM', p.ram], ['Disco', p.almacenamiento], ['Estado', p.estado],
  ]

  return (
    <>
      {searchParams.creado && <div className="aviso ok">Equipo creado.</div>}
      <div className="row">
        <Link className="btn chico" href="/inventario">← Inventario</Link>
        {administra && <Link className="btn primary chico" href={`/inventario/${p.id}?editar=1`} style={{ marginLeft: 'auto' }}>Editar</Link>}
      </div>
      <section className="panel">
        <div className="panel-h">
          <div><h2>{titulo(p)}</h2><small className="mono">{p.codigo}</small></div>
          <span className={`chip ${p.stock > 0 ? 'ok' : 'neu'}`}>{p.stock > 0 ? `${p.stock} en stock` : 'Sin stock'}</span>
        </div>
        <div className="panel-b ficha-cols">
          <div className="ficha-foto">
            <div className="foto-caja">{foto ? <img src={foto} alt={`Foto de ${titulo(p)}`} /> : <span className="muted">Sin foto</span>}</div>
            {!p.foto_ruta && p.foto && <small className="muted">Foto por enlace. Súbela a la app para que el bot la envíe sin depender de Drive.</small>}
          </div>
          <div>
            <div className="precio-ficha mono">{pesos(p.precio)}</div>
            <dl className="datos-ficha">
              {datos.filter(([, v]) => v).map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
            </dl>
            {p.descripcion && <p className="muted">{p.descripcion}</p>}
            {p.video && <a className="btn chico" href={p.video} target="_blank" rel="noreferrer">▶ Ver video</a>}
            <h3 className="sub">Así la ve el cliente por WhatsApp</h3>
            <div className="m bot ficha-whatsapp">{ficha}</div>
            <small className="muted">Actualizado {new Date(p.actualizado_en).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })}</small>
          </div>
        </div>
      </section>
    </>
  )
}

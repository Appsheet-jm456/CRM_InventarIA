import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { COLUMNAS_ATRIBUTO, COLUMNAS_PRODUCTO, aplicaA, fotoDe, pesos, rutaArchivo, textoAtributo, titulo, type AtributoProducto, type Producto } from '@/lib/inventario'
import { COLUMNAS_TIENDA, enlaceProducto, publicadosTienda, renglonWeb, type TiendaWeb } from '@/lib/tiendaWeb'
import { FormProducto } from '../FormProducto'

export default async function FichaEquipo({ params, searchParams }: { params: { id: string }; searchParams: { editar?: string; creado?: string } }) {
  const sesion = (await obtenerSesion())!
  const administra = puede(sesion, ['administrar_inventario'])
  const supabase = crearCliente()
  const [{ data }, { data: defs }, { data: tiendaFila }] = await Promise.all([
    supabase.from('productos').select(COLUMNAS_PRODUCTO).eq('id', Number(params.id)).maybeSingle(),
    supabase.from('producto_atributos').select(COLUMNAS_ATRIBUTO).is('archivado_en', null).order('orden').order('id'),
    supabase.from('tienda_web').select(COLUMNAS_TIENDA).eq('id', 1).maybeSingle(),
  ])
  if (!data) notFound()
  const p = data as Producto
  const atributos = (defs ?? []) as AtributoProducto[]
  const foto = fotoDe(p)
  if (administra && searchParams.editar === '1') return <FormProducto producto={p} foto={foto} atributos={atributos} />

  // F4·75: ¿el equipo ya tiene su página en la tienda web?
  const tienda = tiendaFila as TiendaWeb | null
  const publicados = tienda?.activa && !p.enlace_web ? await publicadosTienda(tienda.url) : null
  const enlaceWeb = p.enlace_web || (tienda && publicados?.has(p.codigo.trim().toLowerCase()) ? enlaceProducto(tienda, p.codigo) : '')
  const web = renglonWeb(tienda, publicados, p.codigo, p.enlace_web)

  // La misma ficha que arma el bot (flujo.r11): así la ve el cliente por WhatsApp.
  const ficha = `💻 *${p.marca} ${p.modelo}* · Código ${p.codigo}\n${p.procesador} · ${p.ram} · ${p.almacenamiento}` +
    `${p.estado ? ` · ${p.estado}` : ''}\n💰 ${pesos(p.precio).replace(/\s/g, '')} · ${p.stock > 0 ? '✅ Disponible' : '❌ Agotado'}` +
    (p.fotos_drive ? `\n📷 Más fotos: ${p.fotos_drive}` : '') + (web ? `\n${web}` : '')
  const datos: [string, string][] = [
    ['Código', p.codigo], ['Categoría', p.categoria], ['Marca', p.marca], ['Modelo', p.modelo],
    ['Procesador', p.procesador], ['Generación', p.generacion], ['RAM', p.ram], ['Disco', p.almacenamiento], ['Estado', p.estado],
    // Atributos del producto (F4·41, RI-10): los activos que aplican a su categoría y tienen dato.
    ...atributos.filter((a) => aplicaA(a, p.categoria)).map((a): [string, string] => [`${a.emoji ? `${a.emoji} ` : ''}${a.nombre}`, textoAtributo(p.atributos?.[a.clave])]),
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
            {/* F4·65: fotos 2 y 3, que el bot envía después de la ficha, y la carpeta de Drive */}
            {p.fotos_extra?.length > 0 && (
              <div className="fotos-extra">
                {p.fotos_extra.map((r, i) => <div key={r} className="foto-caja"><img src={rutaArchivo('productos', r)} alt={`Foto ${i + 2} de ${titulo(p)}`} /></div>)}
              </div>
            )}
            {p.fotos_drive && <a className="btn chico" href={p.fotos_drive} target="_blank" rel="noreferrer">📷 Más fotos en Drive</a>}
            {tienda?.activa && (enlaceWeb
              ? <a className="btn chico" href={enlaceWeb} target="_blank" rel="noreferrer" title={p.enlace_web ? 'Enlace escrito a mano' : 'Encontrado en la tienda por el código'}>🌐 Ver en la tienda web</a>
              : <small className="muted">{publicados === null ? 'La tienda web no respondió: no se sabe si este equipo está publicado.'
                : 'Aún no está publicado en la tienda web: el bot envía el catálogo web.'}{' '}
                {tienda.catalogo_url && <a href={tienda.catalogo_url} target="_blank" rel="noreferrer">Ver catálogo web</a>}</small>)}
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

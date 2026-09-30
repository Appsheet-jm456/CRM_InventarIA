import Link from 'next/link'
import { MODULOS } from '@/lib/modulos'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'

const dinero = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Resumen del día. Mientras la Bandeja llega (F3·5), muestra el inventario que el bot ofrece y lo que
// falta por construir; las conversaciones siguen en el visor de la demo.
export default async function Inicio() {
  const sesion = (await obtenerSesion())!
  const supabase = crearCliente()
  const [{ data: productos }, { data: etapas }] = await Promise.all([
    supabase.from('productos').select('precio, stock, marca'),
    supabase.from('etapas').select('nombre').order('orden'),
  ])

  const conStock = (productos ?? []).filter((p) => p.stock > 0)
  const unidades = conStock.reduce((s, p) => s + p.stock, 0)
  const valor = conStock.reduce((s, p) => s + Number(p.precio) * p.stock, 0)
  const marcas = new Set(conStock.map((p) => p.marca).filter(Boolean))
  const pendientes = MODULOS.filter((m) => m.paso && puede(sesion, m.permisos))

  const tiles = [
    { titulo: 'Equipos con stock', valor: String(conStock.length), detalle: `${unidades} unidades`, href: '/inventario' },
    { titulo: 'Valor del inventario', valor: dinero(valor), detalle: 'Precio de venta × stock', href: '/inventario' },
    { titulo: 'Marcas', valor: String(marcas.size), detalle: [...marcas].join(', ') || 'Sin datos', href: '/inventario' },
    { titulo: 'Etapas del embudo', valor: String(etapas?.length ?? 0), detalle: (etapas ?? []).map((e) => e.nombre).join(' → '), href: '/embudo' },
  ]

  return (
    <>
      <div className="hola">
        <h2>Hola, {sesion.nombre.split(' ')[0]}</h2>
        <p>
          {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' })} ·
          entraste como <b>{sesion.rol}</b>
        </p>
      </div>

      <section className="panel">
        <div className="kpis">
          {tiles.map((t) => (
            <Link key={t.titulo} href={t.href} className="kpi">
              <span className="k">{t.titulo}</span>
              <span className="v">{t.valor}</span>
              <span className="s">{t.detalle}</span>
            </Link>
          ))}
        </div>
      </section>

      {pendientes.length > 0 && (
        <section className="panel">
          <div className="panel-h">
            <div>
              <h2>Lo que viene</h2>
              <small>Módulos de tu rol que se construyen en la Fase 3.</small>
            </div>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Módulo</th>
                  <th>Para qué</th>
                  <th>Paso</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((m) => (
                  <tr key={m.clave}>
                    <td>
                      <Link href={m.ruta}>{m.titulo}</Link>
                    </td>
                    <td className="muted">{m.subtitulo}</td>
                    <td>
                      <span className="chip neu">{m.paso}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

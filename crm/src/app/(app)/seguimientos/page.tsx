import Link from 'next/link'
import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { diaBogota } from '@/lib/fechas'
import { AccionesSeguimiento } from './AccionesSeguimiento'

type Fila = {
  id: number
  que: string
  vence_en: string
  estado: string
  nota: string
  cerrado_en: string | null
  asignado_a: string
  lead_id: number
  leads: { nombre: string; telefono: string } | null
}

const cuando = (t: string) =>
  new Date(t).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' })

export default async function Seguimientos({ searchParams }: { searchParams: { todos?: string } }) {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['gestionar_oportunidades'])) return <SinPermiso />
  const verTodas = puede(sesion, ['ver_todas_conversaciones'])
  const todos = verTodas && searchParams.todos === '1'

  const supabase = crearCliente()
  let consulta = supabase
    .from('seguimientos')
    .select('id, que, vence_en, estado, nota, cerrado_en, asignado_a, lead_id, leads(nombre, telefono)')
    .order('vence_en')
    .limit(500)
  if (!todos) consulta = consulta.eq('asignado_a', sesion.id)
  const [{ data }, { data: usuarios }] = await Promise.all([consulta, supabase.from('usuarios').select('id, nombre')])
  const filas = (data ?? []) as unknown as Fila[]
  const nombres = new Map((usuarios ?? []).map((u) => [u.id, u.nombre]))

  const ahora = new Date()
  const hoy = diaBogota(ahora)
  const pendientes = filas.filter((f) => f.estado === 'pendiente')
  const grupos = [
    { titulo: 'Vencidos', clase: 'bad', filas: pendientes.filter((f) => new Date(f.vence_en) < ahora) },
    { titulo: 'Hoy', clase: 'warn', filas: pendientes.filter((f) => new Date(f.vence_en) >= ahora && diaBogota(new Date(f.vence_en)) === hoy) },
    { titulo: 'Próximos', clase: 'neu', filas: pendientes.filter((f) => diaBogota(new Date(f.vence_en)) > hoy) },
  ]
  const cerrados = filas
    .filter((f) => f.estado !== 'pendiente')
    .sort((a, b) => (b.cerrado_en ?? '').localeCompare(a.cerrado_en ?? ''))
    .slice(0, 20)

  return (
    <>
      <div className="row">
        <span className="muted">Recordatorios para el asesor: no le envían nada al cliente (RS-01). Se agendan desde la ficha del cliente en la Bandeja.</span>
        {verTodas && (
          <div className="row" style={{ marginLeft: 'auto' }}>
            <Link className={`pastilla${todos ? '' : ' activa'}`} href="/seguimientos">Míos</Link>
            <Link className={`pastilla${todos ? ' activa' : ''}`} href="/seguimientos?todos=1">De todos</Link>
          </div>
        )}
      </div>
      {grupos.map((g) => (
        <section key={g.titulo} className="panel">
          <div className="panel-h">
            <div><h2>{g.titulo} <span className={`chip ${g.clase}`}>{g.filas.length}</span></h2></div>
          </div>
          {g.filas.length === 0 ? (
            <div className="panel-b muted">Nada aquí.</div>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr><th>Cuándo</th><th>Qué</th><th>Cliente</th>{todos && <th>Responsable</th>}<th></th></tr>
                </thead>
                <tbody>
                  {g.filas.map((f) => (
                    <tr key={f.id}>
                      <td className="mono">{cuando(f.vence_en)}</td>
                      <td>{f.que}</td>
                      <td><Link href={`/bandeja?c=${f.lead_id}`}>{f.leads?.nombre || (f.leads ? `+${f.leads.telefono}` : 'Ver en la Bandeja')}</Link></td>
                      {todos && <td>{nombres.get(f.asignado_a) ?? ''}</td>}
                      <td className="r"><AccionesSeguimiento id={f.id} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      {cerrados.length > 0 && (
        <section className="panel">
          <div className="panel-h"><div><h2>Cerrados recientes</h2></div></div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Cerrado</th><th>Qué</th><th>Cliente</th><th>Estado</th><th>Nota</th></tr></thead>
              <tbody>
                {cerrados.map((f) => (
                  <tr key={f.id}>
                    <td className="mono">{f.cerrado_en ? cuando(f.cerrado_en) : ''}</td>
                    <td>{f.que}</td>
                    <td><Link href={`/bandeja?c=${f.lead_id}`}>{f.leads?.nombre || (f.leads ? `+${f.leads.telefono}` : '—')}</Link></td>
                    <td><span className={`chip ${f.estado === 'hecho' ? 'ok' : 'neu'}`}>{f.estado === 'hecho' ? 'Hecho' : 'Cancelado'}</span></td>
                    <td className="muted">{f.nota}</td>
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

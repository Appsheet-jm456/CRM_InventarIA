import Link from 'next/link'
import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { diaBogota } from '@/lib/fechas'
import { Barra, ConsumoMeta, pct, type Consumo } from './graficas'

type Etapa = { nombre: string; color: string; cierre: string; llegaron: number }
type Metricas = {
  alcance: 'todo' | 'mio'
  clientes_nuevos?: number
  atenciones: { total: number; respondidas: number; en_sla: number; promedio_min: number | null; mediana_min: number | null }
  oportunidades: { nuevas: number; ganadas: number; valor_ganado: number; perdidas: number; perdidas_sin_motivo: number }
  embudos: { id: number; nombre: string; nuevas: number; etapas: Etapa[] }[]
  motivos: { motivo: string; cantidad: number }[]
  sin_respuesta: { id: number; nombre: string; telefono: string; desde: string; asesor: string | null }[]
  entrega: { salientes: number; enviados: number; entregados: number; leidos: number; fallidos: number; sin_estado: number }
  asesores?: { id: string; nombre: string; atenciones: number; respondidas: number; en_sla: number; promedio_min: number | null; mensajes: number;
               ganadas: number; valor_ganado: number; perdidas: number }[]
}
const COLORES: Record<string, string> = {
  Gris: '#8A9A92', Azul: '#3B82C4', Amarillo: '#D4A017', Naranja: '#E07B2E', Morado: '#8B5CC4', Verde: '#2E8C6A', Rojo: '#C4453B',
}
const PERIODOS = [
  { clave: 'hoy', texto: 'Hoy' },
  { clave: 'semana', texto: 'Esta semana' },
  { clave: 'mes', texto: 'Este mes' },
  { clave: 'anterior', texto: 'Mes anterior' },
] as const

const pesos = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const minutos = (n: number | null) => (n == null ? '—' : `${Math.round(n)} min`)
const fecha = (d: string) =>
  new Date(`${d}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' })
const cuando = (t: string) =>
  new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' })

// RM-01: el período en días de Colombia. Sin nada, el mes en curso.
function periodo(p: { periodo?: string; desde?: string; hasta?: string }) {
  const hoy = diaBogota()
  const [a, m] = hoy.split('-').map(Number)
  const dia = (anio: number, mes: number, d: number) => new Date(Date.UTC(anio, mes - 1, d)).toISOString().slice(0, 10)
  const valida = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '')
  if (p.periodo === 'rango' && valida(p.desde) && valida(p.hasta) && p.desde! <= p.hasta!)
    return { clave: 'rango', desde: p.desde!, hasta: p.hasta! }
  if (p.periodo === 'hoy') return { clave: 'hoy', desde: hoy, hasta: hoy }
  if (p.periodo === 'semana') {
    const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay()
    return { clave: 'semana', desde: diaBogota(new Date(), -((dow + 6) % 7)), hasta: hoy }
  }
  if (p.periodo === 'anterior') return { clave: 'anterior', desde: dia(a, m - 1, 1), hasta: dia(a, m, 0) }
  return { clave: 'mes', desde: dia(a, m, 1), hasta: hoy }
}

export default async function Metricas({ searchParams }: {
  searchParams: { periodo?: string; desde?: string; hasta?: string; embudo?: string }
}) {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['ver_metricas', 'atender_bandeja'])) return <SinPermiso />
  const todo = puede(sesion, ['ver_metricas'])
  const per = periodo(searchParams)
  const embudo = Number(searchParams.embudo) || null

  const supabase = crearCliente()
  const [{ data, error }, { data: consumo }, { data: embudos }] = await Promise.all([
    supabase.rpc('metricas', { p_desde: per.desde, p_hasta: per.hasta, p_embudo: embudo }),
    todo ? supabase.rpc('consumo_meta') : Promise.resolve({ data: null }),
    supabase.from('embudos').select('id, nombre').eq('activo', true).order('orden'),
  ])
  if (error || !data)
    return <div className="aviso bad" role="alert">No se pudieron calcular las métricas: {error?.message ?? 'sin respuesta'}</div>
  const m = data as Metricas
  const c = consumo as Consumo | null

  const enlace = (cambios: Record<string, string | null>) => {
    const q = new URLSearchParams()
    const base = { periodo: per.clave === 'mes' ? null : per.clave, desde: per.clave === 'rango' ? per.desde : null,
                   hasta: per.clave === 'rango' ? per.hasta : null, embudo: embudo ? String(embudo) : null, ...cambios }
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v)
    return `/metricas${q.toString() ? `?${q}` : ''}`
  }

  const at = m.atenciones
  const op = m.oportunidades
  const cerradas = op.ganadas + op.perdidas
  const perdidasTotal = m.motivos.reduce((s, x) => s + x.cantidad, 0)

  return (
    <>
      <div className="row">
        <div className="row">
          {PERIODOS.map((p) => (
            <Link key={p.clave} className={`pastilla${per.clave === p.clave ? ' activa' : ''}`}
              href={enlace({ periodo: p.clave === 'mes' ? null : p.clave, desde: null, hasta: null })}>{p.texto}</Link>
          ))}
        </div>
        <form className="row" action="/metricas" style={{ marginLeft: 'auto' }}>
          <input type="hidden" name="periodo" value="rango" />
          {embudo && <input type="hidden" name="embudo" value={embudo} />}
          <label className="muted">Del <input type="date" name="desde" defaultValue={per.desde} required /></label>
          <label className="muted">al <input type="date" name="hasta" defaultValue={per.hasta} required /></label>
          <button className="btn chico">Ver</button>
        </form>
      </div>
      <div className="row">
        <span className="muted">
          {fecha(per.desde)}{per.hasta !== per.desde ? ` – ${fecha(per.hasta)}` : ''}
          {m.alcance === 'mio' ? ' · solo lo tuyo' : ' · todo el equipo'}
        </span>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <Link className={`pastilla${embudo ? '' : ' activa'}`} href={enlace({ embudo: null })}>Todos los embudos</Link>
          {(embudos ?? []).map((e) => (
            <Link key={e.id} className={`pastilla${embudo === e.id ? ' activa' : ''}`} href={enlace({ embudo: String(e.id) })}>{e.nombre}</Link>
          ))}
        </div>
      </div>

      <section className="panel">
        <div className="kpis">
          {m.clientes_nuevos != null && (
            <div className="kpi"><span className="k">Clientes nuevos</span><span className="v">{m.clientes_nuevos}</span>
              <span className="s">Escribieron por primera vez</span></div>
          )}
          <div className="kpi">
            <span className="k">Primera respuesta en SLA</span>
            <span className="v" style={{ color: at.respondidas && pct(at.en_sla, at.respondidas) < 80 ? 'var(--bad)' : undefined }}>
              {at.respondidas ? `${pct(at.en_sla, at.respondidas)} %` : '—'}
            </span>
            <span className="s">{at.en_sla} de {at.respondidas} respondidas en 10 min hábiles</span>
          </div>
          <div className="kpi">
            <span className="k">Tiempo de primera respuesta</span>
            <span className="v">{minutos(at.mediana_min)}</span>
            <span className="s">Mediana · promedio {minutos(at.promedio_min)} · {at.total} atenciones</span>
          </div>
          <div className="kpi">
            <span className="k">Ganadas</span>
            <span className="v">{op.ganadas}</span>
            <span className="s">{pesos(Number(op.valor_ganado))} · {cerradas ? `${pct(op.ganadas, cerradas)} % de las cerradas` : 'sin cierres'}</span>
          </div>
          <div className="kpi">
            <span className="k">Perdidas</span>
            <span className="v">{op.perdidas}</span>
            <span className="s" style={{ color: op.perdidas_sin_motivo ? 'var(--bad)' : undefined }}>
              {op.perdidas_sin_motivo ? `${op.perdidas_sin_motivo} sin motivo` : 'Todas con motivo'}
            </span>
          </div>
          <Link href="#sin-respuesta" className="kpi">
            <span className="k">Sin respuesta ahora</span>
            <span className="v" style={{ color: m.sin_respuesta.length ? 'var(--bad)' : undefined }}>{m.sin_respuesta.length}</span>
            <span className="s">Último mensaje del cliente</span>
          </Link>
        </div>
      </section>

      {c && <ConsumoMeta c={c} />}

      <div className="grid-metricas">
        {m.embudos.map((e) => {
          const base = e.nuevas
          return (
            <section key={e.id} className="panel">
              <div className="panel-h">
                <div>
                  <h2>{e.nombre}</h2>
                  <small>De las {base} oportunidades abiertas en el período, cuántas llegaron a cada etapa (RM-04)</small>
                </div>
              </div>
              <div className="panel-b barras">
                {base === 0 ? <span className="muted">Ninguna oportunidad nueva en el período.</span> : e.etapas.map((et) => (
                  <Barra key={et.nombre} etiqueta={et.nombre} valor={et.llegaron} de={base}
                    texto={`${et.llegaron} · ${pct(et.llegaron, base)} %`} color={COLORES[et.color]} />
                ))}
              </div>
            </section>
          )
        })}

        <section className="panel">
          <div className="panel-h">
            <div><h2>Motivos de pérdida</h2><small>Oportunidades cerradas como perdidas en el período</small></div>
          </div>
          <div className="panel-b barras">
            {m.motivos.length === 0 ? <span className="muted">Ninguna perdida en el período.</span> : m.motivos.map((x) => (
              <Barra key={x.motivo} etiqueta={x.motivo} valor={x.cantidad} de={perdidasTotal}
                texto={`${x.cantidad} · ${pct(x.cantidad, perdidasTotal)} %`} color={x.motivo === 'Sin motivo' ? 'var(--bad)' : undefined} />
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-h">
            <div><h2>Entrega de mensajes</h2><small>{m.entrega.salientes} enviados en el período{m.alcance === 'mio' ? ' por ti' : ' por el bot y los asesores'}</small></div>
          </div>
          <div className="panel-b barras">
            <Barra etiqueta="Leídos" valor={m.entrega.leidos} de={m.entrega.salientes} texto={String(m.entrega.leidos)} color="#1E88D8" />
            <Barra etiqueta="Entregados" valor={m.entrega.entregados} de={m.entrega.salientes} texto={String(m.entrega.entregados)} />
            <Barra etiqueta="Enviados" valor={m.entrega.enviados} de={m.entrega.salientes} texto={String(m.entrega.enviados)} color="#8A9A92" />
            <Barra etiqueta="Fallidos" valor={m.entrega.fallidos} de={m.entrega.salientes} texto={String(m.entrega.fallidos)} color="var(--bad)" />
            {m.entrega.sin_estado > 0 && (
              <small className="muted">{m.entrega.sin_estado} sin estado de Meta (anteriores a F3·8 o aún sin informar).</small>
            )}
          </div>
        </section>
      </div>

      {m.asesores && (
        <section className="panel">
          <div className="panel-h"><div><h2>Por asesor</h2><small>Atenciones que tomó y oportunidades que cerró en el período</small></div></div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Asesor</th><th className="r">Atenciones</th><th className="r">En SLA</th><th className="r">Promedio</th>
                  <th className="r">Mensajes</th><th className="r">Ganadas</th><th className="r">Valor ganado</th><th className="r">Perdidas</th></tr>
              </thead>
              <tbody>
                {m.asesores.map((a) => (
                  <tr key={a.id}>
                    <td>{a.nombre}</td>
                    <td className="r mono">{a.atenciones}</td>
                    <td className="r mono">{a.respondidas ? `${pct(a.en_sla, a.respondidas)} %` : '—'}</td>
                    <td className="r mono">{minutos(a.promedio_min)}</td>
                    <td className="r mono">{a.mensajes}</td>
                    <td className="r mono">{a.ganadas}</td>
                    <td className="r mono">{pesos(Number(a.valor_ganado))}</td>
                    <td className="r mono">{a.perdidas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel" id="sin-respuesta">
        <div className="panel-h">
          <div><h2>Sin respuesta ahora <span className={`chip ${m.sin_respuesta.length ? 'bad' : 'ok'}`}>{m.sin_respuesta.length}</span></h2>
            <small>En cola o asignadas, con el último mensaje del cliente (meta: cero al cierre del día)</small></div>
        </div>
        {m.sin_respuesta.length === 0 ? (
          <div className="panel-b muted">Nadie esperando respuesta.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Cliente</th><th>Escribió</th><th>Asesor</th></tr></thead>
              <tbody>
                {m.sin_respuesta.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/bandeja?c=${s.id}`}>{s.nombre || `+${s.telefono}`}</Link></td>
                    <td className="mono">{cuando(s.desde)}</td>
                    <td>{s.asesor ?? <span className="chip warn">En cola</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

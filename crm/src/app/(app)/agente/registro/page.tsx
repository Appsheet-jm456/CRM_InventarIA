import { crearCliente } from '@/lib/supabase/server'
import FiltroDia from './FiltroDia'

type Fila = {
  id: number; en: string; proveedor: string; modelo: string; tokens_entrada: number; tokens_salida: number; costo_usd: number
  resultado: string; ms: number | null; detalle: { problemas?: string[]; error?: string; paso?: number; respaldo?: boolean; resumen?: boolean; buscador?: boolean; filtros?: Record<string, unknown> } | null
  leads: { nombre: string | null; telefono: string } | null
}
const CHIP: Record<string, string> = { respondido: 'ok', simulador: 'neu', asesor: 'warn', bloqueado: 'warn', error: 'bad', tope: 'bad' }

type Mes = { lead_id: number | null; resultado: string; costo_usd: number; detalle: { paso?: number; buscador?: boolean } | null }

// El servidor corre en UTC: la hora se muestra siempre en la de Colombia.
const hora = (iso: string) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'medium' })

// Para qué fue la llamada: Avi conversando, el resumen de su memoria o el buscador del menú (la IA solo arma filtros).
function uso(d: Fila['detalle']) {
  if (d?.buscador) return 'Buscador del menú'
  if (d?.resumen) return 'Resumen de memoria'
  return d?.paso ? `Avi · paso ${d.paso}` : 'Avi'
}

const usd = (n: number) => `US$ ${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

// Inicio del mes en hora de Colombia (UTC-5), como agente_gasto_mes().
function inicioDelMes() {
  const ahora = new Date(Date.now() - 5 * 3600 * 1000)
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1, 5)).toISOString()
}

// Día de Colombia (UTC-5) de una fecha guardada en UTC, como 'AAAA-MM-DD'.
const diaCO = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10)
const sumarDias = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

// F4·28: métricas del mes y registro de lo que hizo el agente (RAG-18): cada llamada al modelo con tokens, costo y resultado.
// El permiso lo revisa el layout.
export default async function PaginaRegistro({ searchParams }: { searchParams: { dia?: string } }) {
  const supabase = crearCliente()
  const desde = inicioDelMes()
  // ?dia=AAAA-MM-DD filtra el registro a ese día de Colombia (00:00 a 24:00 -05 = 05:00 a 05:00 UTC).
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.dia ?? '') ? searchParams.dia as string : null
  let consulta = supabase.from('agente_turnos')
    .select('id, en, proveedor, modelo, tokens_entrada, tokens_salida, costo_usd, resultado, ms, detalle, leads(nombre, telefono)')
    .order('en', { ascending: false })
  consulta = dia ? consulta.gte('en', `${dia}T05:00:00Z`).lt('en', `${sumarDias(dia, 1)}T05:00:00Z`).limit(2000) : consulta.limit(100)
  const hace30 = new Date(Date.now() - 30 * 86400000).toISOString()
  const [{ data }, { data: mes }, { data: recientes }] = await Promise.all([
    consulta,
    supabase.from('agente_turnos').select('lead_id, resultado, costo_usd, detalle').neq('resultado', 'simulador').gte('en', desde).limit(20000),
    supabase.from('agente_turnos').select('en').gte('en', hace30).order('en', { ascending: false }).limit(20000),
  ])
  // Días con llamadas en los últimos 30 (los 14 más recientes) para las pastillas del filtro.
  const porDia = new Map<string, number>()
  for (const r of (recientes ?? []) as { en: string }[]) { const d = diaCO(r.en); porDia.set(d, (porDia.get(d) ?? 0) + 1) }
  const dias = [...porDia].slice(0, 14)
  const filas = (data ?? []) as unknown as Fila[]
  const cuenta = (r: string) => filas.filter((f) => f.resultado === r).length
  const costoFiltro = filas.reduce((a, f) => a + Number(f.costo_usd), 0)
  const fecha = dia ? new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-CO', { timeZone: 'UTC', dateStyle: 'full' }) : ''

  // Métricas del agente: conversaciones que atendió, qué pasó con ellas y cuánto costaron.
  const delMes = ((mes ?? []) as Mes[]).filter((t) => !t.detalle?.buscador)  // las métricas son de Avi; el buscador va aparte
  const leads = [...new Set(delMes.filter((t) => t.lead_id && t.detalle?.paso === 1).map((t) => t.lead_id as number))]
  const costo = delMes.reduce((a, t) => a + Number(t.costo_usd), 0)
  const [{ count: cotizaciones }, { data: oportunidades }] = leads.length ? await Promise.all([
    supabase.from('cotizaciones').select('id', { count: 'exact', head: true }).in('lead_id', leads).gte('creado_en', desde),
    supabase.from('oportunidades').select('lead_id, estado, cerrado_en, etapas(nombre)').in('lead_id', leads),
  ]) : [{ count: 0 }, { data: [] }]
  const ops = (oportunidades ?? []) as unknown as { lead_id: number; estado: string; cerrado_en: string | null; etapas: { nombre: string } | null }[]
  const enPago = new Set(ops.filter((o) => o.estado === 'abierta' && ['Esperando pago', 'Pago por confirmar'].includes(o.etapas?.nombre ?? '')).map((o) => o.lead_id)).size
  const ventas = new Set(ops.filter((o) => o.estado === 'ganada' && o.cerrado_en && o.cerrado_en >= desde).map((o) => o.lead_id)).size
  const asesor = new Set(delMes.filter((t) => t.resultado === 'asesor' && t.lead_id).map((t) => t.lead_id)).size
  const tarjetas: [string, string, string?][] = [
    ['Conversaciones con Avi', leads.length.toLocaleString('es-CO')],
    ['Pasadas a asesor', asesor.toLocaleString('es-CO'), leads.length ? `${Math.round((asesor / leads.length) * 100)} %` : undefined],
    ['Cotizaciones', (cotizaciones ?? 0).toLocaleString('es-CO')],
    ['En pago ahora', enPago.toLocaleString('es-CO'), 'Esperando pago o Pago por confirmar'],
    ['Ventas', ventas.toLocaleString('es-CO'), 'Oportunidades ganadas este mes'],
    ['Costo del mes', usd(costo)],
    ['Costo por conversación', leads.length ? usd(costo / leads.length) : '—'],
    ['Costo por venta', ventas ? usd(costo / ventas) : '—'],
  ]
  return (
    <>
    <section className="panel">
      <div className="panel-h"><div><h2>Avi este mes</h2><small>Clientes reales que Avi atendió desde el día 1 (el simulador no cuenta). Las ventas las cierra el asesor.</small></div></div>
      <div className="panel-b row" style={{ gap: 12 }}>
        {tarjetas.map(([t, v, x]) => (
          <div key={t} style={{ flex: '1 1 160px', border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, padding: '10px 12px' }}>
            <small className="muted">{t}</small>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{v}</div>
            {x && <small className="muted">{x}</small>}
          </div>
        ))}
      </div>
    </section>
    <section className="panel">
      <div className="panel-h">
        <div><h2>Registro de IA</h2><small>{dia ? `${filas.length} llamadas a la IA el ${fecha} (${usd(costoFiltro)})` : `Las últimas ${filas.length} llamadas a la IA`}, de la más reciente a la más antigua (hora de Colombia): Avi, el resumen de su memoria y el buscador del menú. Los bloqueos son respuestas que el sistema no dejó salir (precio o cuenta inventados).</small></div>
        <span className="row">
          <span className="chip ok">{cuenta('respondido')} respondidas</span>
          <span className="chip warn">{cuenta('bloqueado')} bloqueadas</span>
          <span className="chip bad">{cuenta('error') + cuenta('tope')} con error o tope</span>
        </span>
      </div>
      <div className="panel-b" style={{ paddingBottom: 0 }}><FiltroDia dia={dia} dias={dias} /></div>
      {filas.length === 0 ? (
        <div className="panel-b muted">{dia ? 'Ese día no hubo llamadas a la IA: el menú, los códigos, la compra y el carrito del asesor no la usan. Solo cuentan Avi (texto libre de un número en la lista blanca o cliente real con Avi encendido), el resumen de memoria y el buscador.' : <>Aún no hay registros. Aparecen cuando Avi o el buscador del menú usan la IA, o falla una prueba de conexión del modelo.</>}</div>
      ) : (
        <div className="panel-b" style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Cuándo</th><th>Cliente</th><th>Para qué</th><th>Modelo</th><th>Tokens</th><th>Costo</th><th>Resultado</th></tr></thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{hora(f.en)}</td>
                  <td>{f.leads ? (f.leads.nombre || f.leads.telefono) : '—'}</td>
                  <td>{uso(f.detalle)}</td>
                  <td>{f.proveedor} · {f.modelo}{f.detalle?.respaldo ? ' (respaldo)' : ''}</td>
                  <td>{f.tokens_entrada + f.tokens_salida}</td>
                  <td>US$ {Number(f.costo_usd).toLocaleString('es-CO', { maximumFractionDigits: 5 })}</td>
                  <td>
                    <span className={`chip ${CHIP[f.resultado] ?? 'neu'}`}>{f.resultado}</span>
                    {f.ms ? ` ${(f.ms / 1000).toFixed(1)} s` : ''}
                    {f.detalle?.problemas?.length ? <><br /><small className="muted">{f.detalle.problemas.join('; ')}</small></> : null}
                    {f.detalle?.error ? <><br /><small className="muted">{f.detalle.error}</small></> : null}
                    {f.detalle?.buscador && f.detalle.filtros ? <><br /><small className="muted">filtros: {Object.entries(f.detalle.filtros).map(([k, v]) => `${k} ${v}`).join(', ') || 'ninguno'}</small></> : null}
                  </td>
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

import { crearCliente } from '@/lib/supabase/server'

type Fila = {
  id: number; en: string; proveedor: string; modelo: string; tokens_entrada: number; tokens_salida: number; costo_usd: number
  resultado: string; ms: number | null; detalle: { problemas?: string[]; error?: string; paso?: number; respaldo?: boolean } | null
  leads: { nombre: string | null; telefono: string } | null
}
const CHIP: Record<string, string> = { respondido: 'ok', simulador: 'neu', asesor: 'warn', bloqueado: 'warn', error: 'bad', tope: 'bad' }

type Mes = { lead_id: number | null; resultado: string; costo_usd: number; detalle: { paso?: number } | null }

const usd = (n: number) => `US$ ${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

// Inicio del mes en hora de Colombia (UTC-5), como agente_gasto_mes().
function inicioDelMes() {
  const ahora = new Date(Date.now() - 5 * 3600 * 1000)
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1, 5)).toISOString()
}

// F4·28: métricas del mes y registro de lo que hizo el agente (RAG-18): cada llamada al modelo con tokens, costo y resultado.
// El permiso lo revisa el layout.
export default async function PaginaRegistro() {
  const supabase = crearCliente()
  const desde = inicioDelMes()
  const [{ data }, { data: mes }] = await Promise.all([
    supabase.from('agente_turnos')
      .select('id, en, proveedor, modelo, tokens_entrada, tokens_salida, costo_usd, resultado, ms, detalle, leads(nombre, telefono)')
      .order('en', { ascending: false }).limit(100),
    supabase.from('agente_turnos').select('lead_id, resultado, costo_usd, detalle').neq('resultado', 'simulador').gte('en', desde).limit(20000),
  ])
  const filas = (data ?? []) as unknown as Fila[]
  const cuenta = (r: string) => filas.filter((f) => f.resultado === r).length

  // Métricas del agente: conversaciones que atendió, qué pasó con ellas y cuánto costaron.
  const delMes = (mes ?? []) as Mes[]
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
        <div><h2>Registro de Avi</h2><small>Las últimas {filas.length} llamadas al modelo. Los bloqueos son respuestas que el sistema no dejó salir (precio o cuenta inventados).</small></div>
        <span className="row">
          <span className="chip ok">{cuenta('respondido')} respondidas</span>
          <span className="chip warn">{cuenta('bloqueado')} bloqueadas</span>
          <span className="chip bad">{cuenta('error') + cuenta('tope')} con error o tope</span>
        </span>
      </div>
      {filas.length === 0 ? (
        <div className="panel-b muted">Aún no hay registros. Aparecen cuando Avi atiende un chat real o falla una prueba de conexión del modelo.</div>
      ) : (
        <div className="panel-b" style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Cuándo</th><th>Cliente</th><th>Modelo</th><th>Tokens</th><th>Costo</th><th>Resultado</th></tr></thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{new Date(f.en).toLocaleString('es-CO')}</td>
                  <td>{f.leads ? (f.leads.nombre || f.leads.telefono) : '—'}</td>
                  <td>{f.proveedor} · {f.modelo}{f.detalle?.respaldo ? ' (respaldo)' : ''}</td>
                  <td>{f.tokens_entrada + f.tokens_salida}</td>
                  <td>US$ {Number(f.costo_usd).toLocaleString('es-CO', { maximumFractionDigits: 5 })}</td>
                  <td>
                    <span className={`chip ${CHIP[f.resultado] ?? 'neu'}`}>{f.resultado}</span>
                    {f.ms ? ` ${(f.ms / 1000).toFixed(1)} s` : ''}
                    {f.detalle?.problemas?.length ? <><br /><small className="muted">{f.detalle.problemas.join('; ')}</small></> : null}
                    {f.detalle?.error ? <><br /><small className="muted">{f.detalle.error}</small></> : null}
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

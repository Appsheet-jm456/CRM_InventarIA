import { crearCliente } from '@/lib/supabase/server'

type Fila = {
  id: number; en: string; proveedor: string; modelo: string; tokens_entrada: number; tokens_salida: number; costo_usd: number
  resultado: string; ms: number | null; detalle: { problemas?: string[]; error?: string; paso?: number; respaldo?: boolean } | null
  leads: { nombre: string | null; telefono: string } | null
}
const CHIP: Record<string, string> = { respondido: 'ok', simulador: 'neu', asesor: 'warn', bloqueado: 'warn', error: 'bad', tope: 'bad' }

// F4·28: registro de lo que hizo el agente (RAG-18): cada llamada al modelo con tokens, costo y resultado. El permiso lo revisa el layout.
export default async function PaginaRegistro() {
  const { data } = await crearCliente().from('agente_turnos')
    .select('id, en, proveedor, modelo, tokens_entrada, tokens_salida, costo_usd, resultado, ms, detalle, leads(nombre, telefono)')
    .order('en', { ascending: false }).limit(100)
  const filas = (data ?? []) as unknown as Fila[]
  const cuenta = (r: string) => filas.filter((f) => f.resultado === r).length
  return (
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
  )
}

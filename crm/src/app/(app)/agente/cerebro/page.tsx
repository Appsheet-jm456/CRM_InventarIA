import { crearCliente } from '@/lib/supabase/server'
import { Cerebro } from './Cerebro'

// F4·27: cerebro del agente. El permiso lo revisa el layout del módulo; la llave nunca llega a esta página.
export default async function PaginaCerebro() {
  const supabase = crearCliente()
  const [{ data: c }, { data: tope }, { data: turnos }] = await Promise.all([
    supabase.from('agente_config').select('*').eq('id', 1).maybeSingle(),
    supabase.rpc('agente_tope'),
    supabase.from('agente_turnos').select('en, proveedor, modelo, tokens_entrada, tokens_salida, costo_usd, resultado, ms')
      .neq('resultado', 'simulador').order('en', { ascending: false }).limit(8),
  ])
  if (!c) return <section className="panel"><div className="panel-b">No se encontró la configuración del agente.</div></section>
  return (
    <Cerebro
      datos={{
        principal: { proveedor: c.proveedor, modelo: c.modelo, url_base: c.url_base, protocolo: c.protocolo,
          precio_entrada_usd: Number(c.precio_entrada_usd), precio_salida_usd: Number(c.precio_salida_usd) },
        respaldo: c.proveedor_respaldo ? { proveedor: c.proveedor_respaldo, modelo: c.modelo_respaldo, url_base: c.url_base_respaldo,
          protocolo: c.protocolo_respaldo, precio_entrada_usd: Number(c.precio_entrada_usd_respaldo ?? 0),
          precio_salida_usd: Number(c.precio_salida_usd_respaldo ?? 0) } : null,
        temperatura: Number(c.temperatura), tokens_max: c.tokens_max, espera_segundos: c.espera_segundos,
        presupuesto_usd: Number(c.presupuesto_usd),
      }}
      llaves={{ principal: Boolean(c.llave_id), respaldo: Boolean(c.llave_respaldo_id), guardada_en: c.llave_guardada_en }}
      tope={(tope as { gasto: number; presupuesto: number; porcentaje: number | null; agotado: boolean; turnos_mes: number } | null)
        ?? { gasto: 0, presupuesto: 0, porcentaje: null, agotado: false, turnos_mes: 0 }}
      turnos={turnos ?? []}
    />
  )
}

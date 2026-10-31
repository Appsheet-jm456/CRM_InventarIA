import { crearCliente } from '@/lib/supabase/server'
import { Cotizacion } from './Cotizacion'

// F4·26: reglas de la cotización y las últimas enviadas. El permiso lo revisa el layout del módulo.
export default async function PaginaCotizacion() {
  const supabase = crearCliente()
  const [{ data: config }, { data: cotizaciones }, { data: acciones }] = await Promise.all([
    supabase.from('agente_config').select('validez_cotizacion_h, recargo_tarjeta_pct, cargo_configuracion').eq('id', 1).maybeSingle(),
    supabase.from('cotizaciones')
      .select('id, consecutivo, nombre, cedula, celular, tipo_cliente, items, total, valida_hasta, pdf, creado_en, leads(telefono)')
      .order('creado_en', { ascending: false }).limit(50),
    supabase.from('acciones').select('nombre, activa, hacer'),
  ])
  const disparo = (acciones ?? []).find((a) =>
    ((a.hacer as { tipo: string; flujo?: string }[]) ?? []).some((p) => p.tipo === 'flujo' && p.flujo === 'cotizacion'))
  return (
    <Cotizacion
      reglas={{
        validez_cotizacion_h: config?.validez_cotizacion_h ?? 24,
        recargo_tarjeta_pct: Number(config?.recargo_tarjeta_pct ?? 6),
      }}
      cargo={Number(config?.cargo_configuracion ?? 80000)}
      cotizaciones={(cotizaciones ?? []).map((c) => ({
        ...c,
        total: Number(c.total),
        items: c.items as { codigo: string; nombre: string; cantidad: number }[],
        telefono: (c.leads as unknown as { telefono: string } | null)?.telefono ?? '',
      }))}
      disparo={disparo ? { nombre: disparo.nombre, activa: disparo.activa } : null}
    />
  )
}

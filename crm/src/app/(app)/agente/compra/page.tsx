import { crearCliente } from '@/lib/supabase/server'
import { Compra } from './Compra'

// F4·25: textos y tiempos del flujo de compra. El permiso lo revisa el layout del módulo.
export default async function PaginaCompra() {
  const supabase = crearCliente()
  const [{ data: config }, { data: etapas }, { data: accion }] = await Promise.all([
    supabase.from('agente_config')
      .select('texto_cuentas, texto_comprobante, texto_sigue_interesado, texto_cancelacion, horas_sin_respuesta, cargo_configuracion')
      .eq('id', 1).maybeSingle(),
    supabase.from('compra_etapas')
      .select('embudos(nombre), esperando:etapas!compra_etapas_esperando_pago_id_fkey(nombre), confirmar:etapas!compra_etapas_pago_por_confirmar_id_fkey(nombre)'),
    supabase.from('acciones').select('nombre, activa, hacer'),
  ])
  const disparo = (accion ?? []).find((a) => ((a.hacer as { tipo: string; flujo?: string }[]) ?? []).some((p) => p.tipo === 'flujo' && p.flujo === 'compra'))
  return (
    <Compra
      datos={{
        texto_cuentas: config?.texto_cuentas ?? '',
        texto_comprobante: config?.texto_comprobante ?? '',
        texto_sigue_interesado: config?.texto_sigue_interesado ?? '',
        texto_cancelacion: config?.texto_cancelacion ?? '',
        horas_sin_respuesta: config?.horas_sin_respuesta ?? 12,
        cargo_configuracion: Number(config?.cargo_configuracion ?? 80000),
      }}
      etapas={(etapas ?? []).map((e) => ({
        embudo: (e.embudos as unknown as { nombre: string } | null)?.nombre ?? '',
        esperando: (e.esperando as unknown as { nombre: string } | null)?.nombre ?? '',
        confirmar: (e.confirmar as unknown as { nombre: string } | null)?.nombre ?? '',
      }))}
      disparo={disparo ? { nombre: disparo.nombre, activa: disparo.activa } : null}
    />
  )
}

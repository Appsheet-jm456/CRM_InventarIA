import { crearCliente } from '@/lib/supabase/server'
import { Compra } from './Compra'

// F4·25: textos y tiempos del flujo de compra. El permiso lo revisa el layout del módulo.
export default async function PaginaCompra() {
  const supabase = crearCliente()
  const [{ data: config }, { data: etapas }, { data: accion }, { data: bots }, { data: publicados }] = await Promise.all([
    supabase.from('agente_config')
      .select('texto_cuentas, texto_comprobante, texto_sigue_interesado, texto_cancelacion, horas_sin_respuesta, cargo_configuracion, compra_bot_despues, carrito_activo, carrito_max, carrito_texto_otro, carrito_texto_pedir, carrito_texto_maximo, carrito_encabezado, validar_comprobante, texto_soporte, texto_validado, texto_rechazado, motivos_rechazo')
      .eq('id', 1).maybeSingle(),
    supabase.from('compra_etapas')
      .select('embudos(nombre), esperando:etapas!compra_etapas_esperando_pago_id_fkey(nombre), confirmar:etapas!compra_etapas_pago_por_confirmar_id_fkey(nombre)'),
    supabase.from('acciones').select('nombre, activa, hacer'),
    supabase.from('bots').select('id, nombre, archivado').order('nombre'),
    supabase.from('bot_flujos').select('bot_id').eq('estado', 'publicada'),
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
        compra_bot_despues: config?.compra_bot_despues ?? null,
        carrito_activo: config?.carrito_activo ?? false,
        carrito_max: config?.carrito_max ?? 5,
        carrito_texto_otro: config?.carrito_texto_otro ?? '',
        carrito_texto_pedir: config?.carrito_texto_pedir ?? '',
        carrito_texto_maximo: config?.carrito_texto_maximo ?? '',
        carrito_encabezado: config?.carrito_encabezado ?? '',
        validar_comprobante: config?.validar_comprobante ?? true,
        texto_soporte: config?.texto_soporte ?? '',
        texto_validado: config?.texto_validado ?? '',
        texto_rechazado: config?.texto_rechazado ?? '',
        motivos_rechazo: config?.motivos_rechazo ?? [],
      }}
      bots={(bots ?? []).map((b) => ({ id: b.id, nombre: b.nombre, archivado: b.archivado, publicado: !!publicados?.some((f) => f.bot_id === b.id) }))}
      etapas={(etapas ?? []).map((e) => ({
        embudo: (e.embudos as unknown as { nombre: string } | null)?.nombre ?? '',
        esperando: (e.esperando as unknown as { nombre: string } | null)?.nombre ?? '',
        confirmar: (e.confirmar as unknown as { nombre: string } | null)?.nombre ?? '',
      }))}
      disparo={disparo ? { nombre: disparo.nombre, activa: disparo.activa } : null}
    />
  )
}

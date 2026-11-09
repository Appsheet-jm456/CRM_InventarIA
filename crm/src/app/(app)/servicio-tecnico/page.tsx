import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { ServicioTecnico, type Pedido, type PedidoCerrado, type Reporte } from './ServicioTecnico'

// F4·50 bloque A (docs/ALISTAMIENTO-Y-VIDEO-TECNICO.md): pedidos de Cliente Final en la etapa Alistamiento. El servicio técnico no ve chats,
// pagos ni teléfonos: la base le entrega solo lo del pedido (servicio_tecnico_pedidos).
export default async function PaginaServicioTecnico() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['gestionar_alistamiento'])) return <SinPermiso />
  const supabase = crearCliente()
  // D (RAL-09): reporte de los últimos 30 días, en hora de Colombia.
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)
  const desde = new Date(Date.now() - 5 * 3600000 - 29 * 86400000).toISOString().slice(0, 10)
  const [{ data: pedidos, error }, { data: cerrados }, { data: tecnicos }, { data: reporte }] = await Promise.all([
    supabase.rpc('servicio_tecnico_pedidos'),
    supabase.rpc('servicio_tecnico_cerrados'),
    supabase.from('alistamiento_tecnicos').select('nombre').eq('activo', true).order('id'),
    supabase.rpc('alistamiento_reporte', { p_desde: desde, p_hasta: hoy }),
  ])
  return (
    <ServicioTecnico pedidos={(pedidos ?? []) as Pedido[]} cerrados={(cerrados ?? []) as PedidoCerrado[]}
      puedeCorregir={puede(sesion, ['corregir_pedidos'])} tecnicos={(tecnicos ?? []).map((t) => t.nombre)} error={error?.message ?? null}
      reporte={(reporte ?? null) as Reporte | null} />
  )
}

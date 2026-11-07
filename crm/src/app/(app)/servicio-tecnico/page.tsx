import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { ServicioTecnico, type Pedido } from './ServicioTecnico'

// F4·50 bloque A (docs/ALISTAMIENTO-Y-VIDEO-TECNICO.md): pedidos de Cliente Final en la etapa Alistamiento. El servicio técnico no ve chats,
// pagos ni teléfonos: la base le entrega solo lo del pedido (servicio_tecnico_pedidos).
export default async function PaginaServicioTecnico() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['gestionar_alistamiento'])) return <SinPermiso />
  const supabase = crearCliente()
  const [{ data: pedidos, error }, { data: tecnicos }] = await Promise.all([
    supabase.rpc('servicio_tecnico_pedidos'),
    supabase.from('alistamiento_tecnicos').select('nombre').eq('activo', true).order('id'),
  ])
  return (
    <ServicioTecnico pedidos={(pedidos ?? []) as Pedido[]} tecnicos={(tecnicos ?? []).map((t) => t.nombre)} error={error?.message ?? null} />
  )
}

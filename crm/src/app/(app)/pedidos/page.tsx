import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import type { Embudo, Etapa } from '../bandeja/OportunidadesCliente'
import { Pedidos, type FilaPedido } from './Pedidos'

// F4·55 (docs/PEDIDOS.md, RPD-08 a RPD-14): todos los pedidos que pasaron el pago, con su servicio técnico, documento y despacho.
export default async function PaginaPedidos() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['ver_pedidos'])) return <SinPermiso />
  const supabase = crearCliente()
  const [{ data, error }, { data: etapas }, { data: embudos }] = await Promise.all([
    supabase.rpc('pedidos_lista'),
    supabase.from('etapas').select('id, nombre, cierre, color, embudo_id, orden').order('orden'),
    supabase.from('embudos').select('id, nombre').eq('activo', true).order('orden'),
  ])
  return (
    <Pedidos pedidos={(data ?? []) as FilaPedido[]} error={error?.message ?? null}
      etapas={(etapas ?? []) as Etapa[]} embudos={(embudos ?? []) as Embudo[]}
      puedeDocumento={puede(sesion, ['gestionar_oportunidades'])} puedeCorregir={puede(sesion, ['corregir_pedidos'])} puedePagos={puede(sesion, ['validar_pagos'])} />
  )
}

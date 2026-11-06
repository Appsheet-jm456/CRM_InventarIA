import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { COLUMNAS_ATRIBUTO, type AtributoProducto } from '@/lib/inventario'
import { FormProducto } from '../FormProducto'

export default async function NuevoEquipo() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_inventario'])) return <SinPermiso />
  const { data: atributos } = await crearCliente().from('producto_atributos').select(COLUMNAS_ATRIBUTO)
    .is('archivado_en', null).order('orden').order('id')
  return <FormProducto foto={null} atributos={(atributos ?? []) as AtributoProducto[]} />
}

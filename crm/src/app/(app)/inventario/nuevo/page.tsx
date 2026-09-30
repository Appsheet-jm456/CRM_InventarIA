import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { FormProducto } from '../FormProducto'

export default async function NuevoEquipo() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_inventario'])) return <SinPermiso />
  return <FormProducto foto={null} />
}

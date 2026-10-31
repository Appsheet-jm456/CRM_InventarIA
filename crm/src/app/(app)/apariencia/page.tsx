import { leerApariencia, leerModoOscuro } from '@/lib/apariencia'
import { obtenerSesion, puede } from '@/lib/sesion'
import { FormApariencia } from './FormApariencia'

// Cualquier usuario entra por su modo oscuro (RA-06); logo, colores y fuente solo con administrar_apariencia (RA-01).
export default async function Apariencia() {
  const sesion = (await obtenerSesion())!
  const [apariencia, oscuro] = await Promise.all([leerApariencia(), leerModoOscuro()])
  return <FormApariencia apariencia={apariencia} oscuro={oscuro} editar={puede(sesion, ['administrar_apariencia'])} />
}

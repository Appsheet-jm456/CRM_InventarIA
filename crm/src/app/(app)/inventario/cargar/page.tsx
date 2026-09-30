import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { Pestanas } from '../Pestanas'
import { CargaExcel } from './CargaExcel'

export default async function Cargar() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_inventario'])) return <SinPermiso />
  return (
    <>
      <Pestanas activa="/inventario/cargar" administra>
        <a className="btn chico" href="/formato-inventario.csv" download>Descargar formato</a>
      </Pestanas>
      <CargaExcel />
    </>
  )
}

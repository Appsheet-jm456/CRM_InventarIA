import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { Pestanas } from './Pestanas'

// Módulo Agente (F4·22 a F4·29, decisión 0032): solo con administrar_agente; la base lo exige también (RLS de 0024).
export default async function LayoutAgente({ children }: { children: React.ReactNode }) {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_agente'])) return <SinPermiso />
  return (
    <>
      <Pestanas />
      {children}
    </>
  )
}

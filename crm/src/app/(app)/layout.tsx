import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { leerApariencia } from '@/lib/apariencia'
import { urlLogo } from '@/lib/marca'
import { MODULOS } from '@/lib/modulos'
import { obtenerSesion, puede } from '@/lib/sesion'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion()
  if (!sesion) redirect('/login')
  const { logo } = await leerApariencia()

  return (
    <Shell
      modulos={MODULOS.filter((m) => puede(sesion, m.permisos))}
      usuario={{ nombre: sesion.nombre, rol: sesion.rol }}
      logo={urlLogo(logo)}
      alertas={puede(sesion, ['atender_bandeja'])}
    >
      {children}
    </Shell>
  )
}

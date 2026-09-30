import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { MODULOS } from '@/lib/modulos'
import { obtenerSesion, puede } from '@/lib/sesion'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion()
  if (!sesion) redirect('/login')

  return (
    <Shell
      modulos={MODULOS.filter((m) => puede(sesion, m.permisos))}
      usuario={{ nombre: sesion.nombre, rol: sesion.rol }}
    >
      {children}
    </Shell>
  )
}

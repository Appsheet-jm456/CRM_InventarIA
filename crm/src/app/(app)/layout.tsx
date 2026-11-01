import { redirect } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { leerApariencia } from '@/lib/apariencia'
import { urlLogo } from '@/lib/marca'
import { MODULOS } from '@/lib/modulos'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion()
  if (!sesion) redirect('/login')
  const [{ logo }, { data: interruptores }] = await Promise.all([
    leerApariencia(),
    crearCliente().from('bot_config').select('chatbot_activo, menu_activo').eq('id', 1).maybeSingle(),
  ])

  return (
    <Shell
      modulos={MODULOS.filter((m) => puede(sesion, m.permisos))}
      usuario={{ nombre: sesion.nombre, rol: sesion.rol }}
      logo={urlLogo(logo)}
      alertas={puede(sesion, ['atender_bandeja'])}
      chatbot={{ apagado: interruptores?.chatbot_activo === false, menuApagado: interruptores?.menu_activo === false,
        puedeCambiar: puede(sesion, ['administrar_bot']) }}
    >
      {children}
    </Shell>
  )
}

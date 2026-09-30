import { redirect } from 'next/navigation'
import { obtenerSesion } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { FormLogin } from './FormLogin'

export default async function PaginaLogin() {
  if (await obtenerSesion()) redirect('/')

  // Tiene sesión en Supabase Auth pero su perfil está inactivo o no existe.
  const {
    data: { user },
  } = await crearCliente().auth.getUser()
  const aviso = user ? 'Este usuario no tiene acceso. Pídele al administrador que lo active.' : undefined

  return (
    <main className="login">
      <div className="login-box">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            VV
          </div>
          <div className="brand-txt">
            <div className="brand-name">CRM InventarIA</div>
            <div className="brand-sub">Ventas Virtuales Colombia</div>
          </div>
        </div>
        <h1>Entrar</h1>
        <FormLogin aviso={aviso} />
      </div>
    </main>
  )
}

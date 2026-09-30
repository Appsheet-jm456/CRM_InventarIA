import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearCliente } from '@/lib/supabase/server'
import { usuarioDeCorreo } from '@/lib/usuario'
import { FilaUsuario } from './FilaUsuario'
import { FormNuevoUsuario } from './FormNuevoUsuario'

export default async function Usuarios() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_usuarios'])) return <SinPermiso />

  const supabase = crearCliente()
  const [{ data: usuarios }, { data: roles }, { data: cuentas }] = await Promise.all([
    supabase.from('usuarios').select('id, nombre, activo, rol_id').order('activo', { ascending: false }).order('nombre'),
    supabase.from('roles').select('id, nombre').order('id'),
    // El usuario para entrar vive en Supabase Auth, que solo se lee con la llave de servicio.
    crearClienteAdmin().auth.admin.listUsers({ perPage: 1000 }),
  ])
  const correos = new Map((cuentas?.users ?? []).map((u) => [u.id, u.email]))
  const listaRoles = (roles ?? []) as { id: number; nombre: string }[]

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Nuevo usuario</h2>
            <small>Cada persona entra con su propio usuario: así cada movimiento dice quién lo hizo (RU-01).</small>
          </div>
        </div>
        <FormNuevoUsuario roles={listaRoles} />
      </section>

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Usuarios</h2>
            <small>No se borran: se desactivan, y su historial queda intacto (RU-06).</small>
          </div>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Contraseña</th>
              </tr>
            </thead>
            <tbody>
              {(usuarios ?? []).map((u) => (
                <FilaUsuario
                  key={u.id}
                  usuario={{ ...u, usuario: usuarioDeCorreo(correos.get(u.id)) }}
                  roles={listaRoles}
                  esYo={u.id === sesion.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

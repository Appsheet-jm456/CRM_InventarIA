import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { MatrizPermisos } from './MatrizPermisos'

// Del trabajo diario a lo delicado; un permiso nuevo del código cae al final.
const ORDEN = [
  'atender_bandeja',
  'gestionar_oportunidades',
  'ver_todas_conversaciones',
  'ver_metricas',
  'administrar_inventario',
  'administrar_bot',
  'administrar_embudo',
  'administrar_canal',
  'administrar_usuarios',
]

export default async function Roles() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_usuarios'])) return <SinPermiso />

  const supabase = crearCliente()
  const [{ data: permisos }, { data: roles }, { data: asignados }, { data: usuarios }] = await Promise.all([
    supabase.from('permisos').select('codigo, descripcion'),
    supabase.from('roles').select('id, nombre, sistema').order('id'),
    supabase.from('rol_permisos').select('rol_id, permiso'),
    supabase.from('usuarios').select('rol_id'),
  ])

  const posicion = (codigo: string) => (ORDEN.includes(codigo) ? ORDEN.indexOf(codigo) : ORDEN.length)
  const conteo = new Map<number, number>()
  for (const u of usuarios ?? []) conteo.set(u.rol_id, (conteo.get(u.rol_id) ?? 0) + 1)

  return (
    <MatrizPermisos
      permisos={[...(permisos ?? [])].sort((a, b) => posicion(a.codigo) - posicion(b.codigo))}
      roles={(roles ?? []).map((r) => ({ ...r, usuarios: conteo.get(r.id) ?? 0 }))}
      asignados={(asignados ?? []).map((a) => `${a.rol_id}:${a.permiso}`)}
    />
  )
}

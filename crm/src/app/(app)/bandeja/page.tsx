import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { Bandeja } from './Bandeja'

export default async function PaginaBandeja({ searchParams }: { searchParams: { c?: string } }) {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['atender_bandeja'])) return <SinPermiso />

  const supabase = crearCliente()
  const [{ data: usuarios }, { data: atienden }, { data: etapas }] = await Promise.all([
    supabase.from('usuarios').select('id, nombre, activo, rol_id').order('nombre'),
    supabase.from('rol_permisos').select('rol_id').eq('permiso', 'atender_bandeja'),
    supabase.from('etapas').select('nombre, cierre, color').order('orden'),
  ])
  const rolesQueAtienden = new Set((atienden ?? []).map((r) => r.rol_id))

  return (
    <Bandeja
      yo={{ id: sesion.id, verTodas: puede(sesion, ['ver_todas_conversaciones']), moverEtapas: puede(sesion, ['gestionar_oportunidades']) }}
      usuarios={(usuarios ?? []).map((u) => ({ id: u.id, nombre: u.nombre }))}
      asesores={(usuarios ?? []).filter((u) => u.activo && rolesQueAtienden.has(u.rol_id)).map((u) => ({ id: u.id, nombre: u.nombre }))}
      etapas={etapas ?? []}
      inicial={Number(searchParams.c) || null}
    />
  )
}

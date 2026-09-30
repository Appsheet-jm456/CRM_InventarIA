import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { Tablero } from './Tablero'

export default async function Embudo() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['gestionar_oportunidades'])) return <SinPermiso />

  // El RLS deja ver lo mismo que en la Bandeja: lo del asesor y lo sin asignar, o todo con permiso.
  const supabase = crearCliente()
  const [{ data: etapas }, { data: leads }, { data: usuarios }] = await Promise.all([
    supabase.from('etapas').select('nombre, color, cierre').order('orden'),
    supabase
      .from('leads')
      .select('id, nombre, telefono, etapa, estado_chat, asignado_a, valor_estimado, cotiz_producto, fecha_ultimo_contacto, motivo_perdido')
      .order('fecha_ultimo_contacto', { ascending: false, nullsFirst: false })
      .limit(1000),
    supabase.from('usuarios').select('id, nombre'),
  ])

  return (
    <Tablero
      etapas={etapas ?? []}
      leads={leads ?? []}
      nombres={Object.fromEntries((usuarios ?? []).map((u) => [u.id, u.nombre]))}
      yo={sesion.id}
    />
  )
}

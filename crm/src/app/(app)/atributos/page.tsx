import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { Atributos } from './Atributos'
import type { TipoAtributo } from './tipos'

// F4·30 B: Configuración → Atributos del lead. La base exige administrar_atributos (RLS de 0032).
export default async function PaginaAtributos() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_atributos'])) return <SinPermiso />

  const supabase = crearCliente()
  const [{ data: atributos }, { data: etapas }, { data: leads }] = await Promise.all([
    supabase.from('lead_atributos')
      .select('id, clave, nombre, tipo, seccion, orden, opciones, obligatorio, etapas_obligatorio, visible_lista, llenable_bot, archivado_en')
      .order('seccion').order('orden').order('id'),
    supabase.from('etapas').select('nombre, orden').order('orden'),
    supabase.from('leads').select('atributos').is('eliminado_en', null).limit(5000),
  ])
  // Cuántos clientes tienen algo guardado en cada atributo (para saber qué se pierde de vista al archivar).
  const usos: Record<string, number> = {}
  for (const l of leads ?? []) {
    for (const [k, v] of Object.entries((l.atributos ?? {}) as Record<string, unknown>)) {
      if (v !== null && v !== '' && !(Array.isArray(v) && !v.length)) usos[k] = (usos[k] ?? 0) + 1
    }
  }
  return (
    <Atributos
      atributos={(atributos ?? []).map((a) => ({
        ...a, tipo: a.tipo as TipoAtributo, opciones: (a.opciones ?? []) as string[], usos: usos[a.clave] ?? 0,
      }))}
      etapas={[...new Set((etapas ?? []).map((e) => e.nombre))]}
    />
  )
}

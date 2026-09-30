import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { ListaEtapas } from './ListaEtapas'

export default async function Etapas() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_embudo'])) return <SinPermiso />

  const supabase = crearCliente()
  const [{ data: etapas }, { data: leads }] = await Promise.all([
    supabase.from('etapas').select('id, nombre, orden, color, cierre').order('orden'),
    supabase.from('leads').select('etapa'),
  ])
  const conteo: Record<string, number> = {}
  for (const l of leads ?? []) conteo[l.etapa] = (conteo[l.etapa] ?? 0) + 1

  return <ListaEtapas etapas={(etapas ?? []).map((e) => ({ ...e, clientes: conteo[e.nombre] ?? 0 }))} />
}

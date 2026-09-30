import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { ListaEtapas } from './ListaEtapas'

export default async function Etapas({ searchParams }: { searchParams: { e?: string } }) {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_embudo'])) return <SinPermiso />

  const supabase = crearCliente()
  const { data: embudos } = await supabase.from('embudos').select('id, nombre, descripcion, etiqueta_bot, predeterminado, activo').order('orden')
  const lista = embudos ?? []
  const actual = lista.find((e) => e.id === Number(searchParams.e)) ?? lista[0]
  const [{ data: etapas }, { data: ops }] = await Promise.all([
    supabase.from('etapas').select('id, nombre, orden, color, cierre').eq('embudo_id', actual?.id ?? 0).order('orden'),
    supabase.from('oportunidades').select('etapa_id').eq('embudo_id', actual?.id ?? 0),
  ])
  const conteo: Record<number, number> = {}
  for (const o of ops ?? []) conteo[o.etapa_id] = (conteo[o.etapa_id] ?? 0) + 1

  return (
    <ListaEtapas
      embudos={lista}
      embudo={actual?.id ?? 0}
      etapas={(etapas ?? []).map((e) => ({ ...e, clientes: conteo[e.id] ?? 0 }))}
    />
  )
}

import Link from 'next/link'
import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { Tablero } from './Tablero'

const DIAS_CERRADAS = 30

export default async function Embudo({ searchParams }: { searchParams: { e?: string } }) {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['gestionar_oportunidades'])) return <SinPermiso />

  const supabase = crearCliente()
  const { data: embudos } = await supabase.from('embudos').select('id, nombre, descripcion').eq('activo', true).order('orden')
  const lista = embudos ?? []
  const actual = lista.find((e) => e.id === Number(searchParams.e)) ?? lista[0]
  if (!actual) return <div className="aviso">No hay embudos activos.</div>

  // Las abiertas y las cerradas de los últimos 30 días. El RLS deja ver lo mismo que la Bandeja (RU-08).
  const desde = new Date(Date.now() - DIAS_CERRADAS * 86400000).toISOString()
  const [{ data: etapas }, { data: ops }, { data: usuarios }] = await Promise.all([
    supabase.from('etapas').select('id, nombre, color, cierre').eq('embudo_id', actual.id).order('orden'),
    supabase
      .from('oportunidades')
      .select('id, etapa_id, estado, valor_estimado, producto, motivo_perdido, lead_id, leads(nombre, telefono, estado_chat, asignado_a)')
      .eq('embudo_id', actual.id)
      .or(`estado.eq.abierta,cerrado_en.gte.${desde}`)
      .order('actualizado_en', { ascending: false })
      .limit(1000),
    supabase.from('usuarios').select('id, nombre'),
  ])

  return (
    <>
      <div className="row">
        <div className="embudos-tabs">
          {lista.map((e) => (
            <Link key={e.id} href={`/embudo?e=${e.id}`} className={`pastilla${e.id === actual.id ? ' activa' : ''}`}>{e.nombre}</Link>
          ))}
        </div>
        <small className="muted">{actual.descripcion} · las cerradas se ven {DIAS_CERRADAS} días</small>
      </div>
      <Tablero
        key={actual.id}
        etapas={etapas ?? []}
        oportunidades={(ops ?? []) as unknown as Parameters<typeof Tablero>[0]['oportunidades']}
        nombres={Object.fromEntries((usuarios ?? []).map((u) => [u.id, u.nombre]))}
        yo={sesion.id}
      />
    </>
  )
}

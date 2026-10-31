import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { leerFiltros, type Filtros, type Pagina } from './filtros'
import { Leads } from './Leads'

// F4·30 C: lista de todos los leads. Pagina y filtra en la base (leads_lista, 0033); el asesor ve los suyos y los sin asignar (RLS).
export default async function PaginaLeads({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['atender_bandeja'])) return <SinPermiso />

  const supabase = crearCliente()
  const { data: vistas } = await supabase.from('lead_vistas').select('id, nombre, filtros, columnas, predeterminada').order('nombre')
  let filtros: Filtros = leerFiltros(searchParams)
  // Sin filtros en la dirección, abre la vista predeterminada del usuario.
  const predeterminada = (vistas ?? []).find((v) => v.predeterminada)
  const sinFiltros = Object.keys(filtros).length === 0
  if (sinFiltros && predeterminada) filtros = predeterminada.filtros as Filtros

  const [lista, { data: embudos }, { data: etapas }, { data: usuarios }, { data: etiquetas }, { data: atributos }, { data: tipos }] = await Promise.all([
    supabase.rpc('leads_lista', { p: filtros }),
    supabase.from('embudos').select('id, nombre').eq('activo', true).order('orden'),
    supabase.from('etapas').select('id, nombre, embudo_id, cierre').order('orden'),
    supabase.from('usuarios').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.rpc('leads_etiquetas'),
    supabase.from('lead_atributos').select('clave, nombre, tipo, opciones, visible_lista').is('archivado_en', null).order('seccion').order('orden'),
    supabase.from('lead_tarea_tipos').select('nombre').eq('activo', true).order('orden'),
  ])

  return (
    <Leads
      filtros={filtros}
      pagina={(lista.data as Pagina | null) ?? { total: 0, valor: 0, pagina: 1, tamano: 50, filas: [] }}
      error={lista.error?.message ?? null}
      embudos={embudos ?? []}
      etapas={(etapas ?? []).map((e) => ({ ...e, cierre: e.cierre ?? '' }))}
      usuarios={usuarios ?? []}
      etiquetas={((etiquetas ?? []) as unknown as string[])}
      atributos={(atributos ?? []).map((a) => ({ ...a, opciones: (a.opciones ?? []) as string[] }))}
      vistas={(vistas ?? []).map((v) => ({ ...v, filtros: v.filtros as Filtros, columnas: v.columnas ?? [] }))}
      vistaActiva={sinFiltros && predeterminada ? predeterminada.id : null}
      puede={{
        reasignar: puede(sesion, ['ver_todas_conversaciones']),
        etapas: puede(sesion, ['gestionar_oportunidades']),
        eliminar: puede(sesion, ['eliminar_leads']),
        exportar: puede(sesion, ['exportar_leads']),
      }}
      yo={sesion.id}
      tiposTarea={(tipos ?? []).map((t) => t.nombre)}
    />
  )
}

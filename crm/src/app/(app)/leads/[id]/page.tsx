import Link from 'next/link'
import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { Ficha, type LeadFicha } from './Ficha'

// F4·30 D: ficha del lead a pantalla completa (datos y atributos a la izquierda, línea de tiempo y chat a la derecha).
// El RLS de leads decide si se ve: el asesor, sus leads y los sin asignar.
export default async function PaginaFicha({ params }: { params: { id: string } }) {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['atender_bandeja'])) return <SinPermiso />
  const id = Number(params.id)
  const supabase = crearCliente()
  const { data: lead } = Number.isInteger(id)
    ? await supabase.from('leads').select('id, telefono, nombre, etapa, estado_chat, asignado_a, valor_estimado, etiquetas, atributos, ' +
        'creado_en, fecha_ultimo_contacto, en_cola_desde, primera_respuesta_en, categoria_interes, uso_equipo, presupuesto, marca_interes, ' +
        'cotiz_producto, origen, archivado_en, eliminado_en, resumen_agente, notas').eq('id', id).maybeSingle()
    : { data: null }
  if (!lead) {
    return (
      <section className="panel"><div className="panel-b">
        Ese lead no existe o lo atiende otro asesor. <Link href="/leads">Volver a Leads</Link>
      </div></section>
    )
  }

  const [{ data: usuarios }, { data: atienden }, { data: etapas }, { data: embudos }, { data: rapidas }, { data: atributos }, { data: tipos },
    { data: etiquetas }, { data: cotizaciones }] = await Promise.all([
    supabase.from('usuarios').select('id, nombre, activo, rol_id').order('nombre'),
    supabase.from('rol_permisos').select('rol_id').eq('permiso', 'atender_bandeja'),
    supabase.from('etapas').select('id, nombre, cierre, color, embudo_id, orden').order('orden'),
    supabase.from('embudos').select('id, nombre').eq('activo', true).order('orden'),
    supabase.from('respuestas_rapidas').select('id, atajo, titulo, texto').eq('activo', true).order('atajo'),
    supabase.from('lead_atributos').select('clave, nombre, tipo, seccion, opciones, archivado_en, solo_venta_online, etapas_obligatorio').order('seccion').order('orden'),
    supabase.from('lead_tarea_tipos').select('nombre').eq('activo', true).order('orden'),
    supabase.rpc('leads_etiquetas'),
    supabase.from('cotizaciones').select('id, consecutivo, total, tipo_cliente, pdf, creado_en, valida_hasta').eq('lead_id', id).order('creado_en', { ascending: false }),
  ])
  const rolesQueAtienden = new Set((atienden ?? []).map((r) => r.rol_id))

  return (
    <Ficha
      lead={lead as unknown as LeadFicha}
      yo={{
        id: sesion.id,
        verTodas: puede(sesion, ['ver_todas_conversaciones']),
        moverEtapas: puede(sesion, ['gestionar_oportunidades']),
        eliminar: puede(sesion, ['eliminar_leads']),
      }}
      usuarios={(usuarios ?? []).map((u) => ({ id: u.id, nombre: u.nombre }))}
      asesores={(usuarios ?? []).filter((u) => u.activo && rolesQueAtienden.has(u.rol_id)).map((u) => ({ id: u.id, nombre: u.nombre }))}
      embudos={embudos ?? []}
      etapas={etapas ?? []}
      rapidas={rapidas ?? []}
      atributos={(atributos ?? []).map((a) => ({ ...a, opciones: (a.opciones ?? []) as string[] }))}
      tiposTarea={(tipos ?? []).map((t) => t.nombre)}
      etiquetas={(etiquetas ?? []) as unknown as string[]}
      cotizaciones={cotizaciones ?? []}
    />
  )
}

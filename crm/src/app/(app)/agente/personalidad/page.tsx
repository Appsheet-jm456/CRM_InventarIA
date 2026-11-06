import { crearCliente } from '@/lib/supabase/server'
import { textoAtributo, type ValorAtributo } from '@/lib/inventario'
import { Personalidad } from './Personalidad'

// F4·28: personalidad, límites y encendido (dónde atiende lo deciden los interruptores, F4·35). El permiso lo revisa el layout del módulo.
export default async function PaginaPersonalidad() {
  const supabase = crearCliente()
  const [{ data: c }, { data: llaves }, { data: interruptores }, { data: ejemplo }, { data: atributos }] = await Promise.all([
    supabase.from('agente_config')
      .select('estado, lista_blanca, nombre, tono, emojis, trato, largo, prompt, herramientas_apagadas, memoria_mensajes, max_pasos, max_mensajes, max_turnos_dia, buffer_segundos, escribiendo, espera_primera_ms, pausa_mensajes_ms, plantilla_equipo, max_equipos, equipos_separados, proveedor, presupuesto_usd')
      .eq('id', 1).maybeSingle(),
    supabase.rpc('agente_llaves_estado'),
    supabase.from('bot_config').select('agente_en_todo').eq('id', 1).maybeSingle(),
    // Un equipo real para la vista previa de la plantilla (F4·37)
    supabase.from('productos').select('codigo, marca, modelo, procesador, generacion, ram, almacenamiento, estado, precio, stock, categoria, descripcion, atributos')
      .gt('stock', 0).ilike('categoria', '%port%').order('precio').limit(1).maybeSingle(),
    supabase.from('producto_atributos').select('clave, nombre, emoji').is('archivado_en', null).order('orden').order('id'),
  ])
  // Los atributos del producto (F4·41) también son datos de la plantilla: en la vista previa, vacíos si el equipo no los tiene.
  const valores = (ejemplo?.atributos ?? {}) as Record<string, ValorAtributo>
  const atributosEjemplo = Object.fromEntries((atributos ?? []).map((a) => [a.clave, textoAtributo(valores[a.clave])]))
  if (!c) return <section className="panel"><div className="panel-b">No se encontró la configuración del agente.</div></section>
  return (
    <Personalidad
      datos={{
        estado: c.estado, lista_blanca: (c.lista_blanca ?? []).join('\n'), nombre: c.nombre, tono: c.tono, emojis: c.emojis, trato: c.trato,
        largo: c.largo, prompt: c.prompt, herramientas_apagadas: c.herramientas_apagadas ?? [], memoria_mensajes: c.memoria_mensajes,
        max_pasos: c.max_pasos, max_mensajes: c.max_mensajes, max_turnos_dia: c.max_turnos_dia, buffer_segundos: c.buffer_segundos,
        escribiendo: c.escribiendo, espera_primera_ms: c.espera_primera_ms, pausa_mensajes_ms: c.pausa_mensajes_ms,
        plantilla_equipo: c.plantilla_equipo, max_equipos: c.max_equipos, equipos_separados: c.equipos_separados,
      }}
      listo={c.proveedor === 'local' || (Boolean(llaves?.principal) && Number(c.presupuesto_usd) > 0)}
      agenteEnTodo={!!interruptores?.agente_en_todo}
      atributos={atributos ?? []}
      ejemplo={ejemplo ? {
        ...atributosEjemplo,
        equipo: `${ejemplo.marca ?? ''} ${ejemplo.modelo ?? ''}`.trim(), codigo: ejemplo.codigo ?? '', marca: ejemplo.marca ?? '', modelo: ejemplo.modelo ?? '',
        procesador: ejemplo.procesador ?? '', generacion: ejemplo.generacion ? `${ejemplo.generacion}.ª gen` : '', ram: ejemplo.ram ?? '',
        disco: ejemplo.almacenamiento ?? '', estado: ejemplo.estado ?? '',
        precio: Number(ejemplo.precio).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }),
        stock: String(ejemplo.stock ?? ''), categoria: ejemplo.categoria ?? '', descripcion: (ejemplo.descripcion ?? '').trim(),
      } : null}
    />
  )
}

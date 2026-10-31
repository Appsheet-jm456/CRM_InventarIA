import { crearCliente } from '@/lib/supabase/server'
import { Personalidad } from './Personalidad'

// F4·28: personalidad, límites, encendido y modo de cada bot. El permiso lo revisa el layout del módulo.
export default async function PaginaPersonalidad() {
  const supabase = crearCliente()
  const [{ data: c }, { data: bots }] = await Promise.all([
    supabase.from('agente_config').select('*').eq('id', 1).maybeSingle(),
    supabase.from('bots').select('id, nombre, principal, modo').eq('archivado', false).order('principal', { ascending: false }).order('nombre'),
  ])
  if (!c) return <section className="panel"><div className="panel-b">No se encontró la configuración del agente.</div></section>
  return (
    <Personalidad
      datos={{
        estado: c.estado, lista_blanca: (c.lista_blanca ?? []).join('\n'), nombre: c.nombre, tono: c.tono, emojis: c.emojis, trato: c.trato,
        largo: c.largo, prompt: c.prompt, herramientas_apagadas: c.herramientas_apagadas ?? [], memoria_mensajes: c.memoria_mensajes,
        max_pasos: c.max_pasos, max_mensajes: c.max_mensajes, max_turnos_dia: c.max_turnos_dia, buffer_segundos: c.buffer_segundos,
      }}
      listo={Boolean(c.llave_id || c.proveedor === 'local') && (Number(c.presupuesto_usd) > 0 || c.proveedor === 'local')}
      bots={(bots ?? []).map((b) => ({ id: b.id, nombre: b.nombre, principal: b.principal, modo: b.modo }))}
    />
  )
}

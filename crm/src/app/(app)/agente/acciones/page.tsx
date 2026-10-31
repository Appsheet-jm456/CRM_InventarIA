import { crearCliente } from '@/lib/supabase/server'
import { Acciones } from './Acciones'
import type { Condicion, Paso } from './tipos'

// F4·24: acciones «Cuando → Hacer». El permiso lo revisa el layout del módulo.
export default async function PaginaAcciones() {
  const supabase = crearCliente()
  const hace30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const [{ data: acciones }, { data: registro }, { data: fichas }, { data: bots }, { data: config }] = await Promise.all([
    supabase.from('acciones').select('id, nombre, prioridad, activa, sistema, cuando, hacer, actualizado_en').order('prioridad'),
    supabase.from('acciones_registro').select('accion_id').gte('en', hace30).limit(20000),
    supabase.from('conocimiento').select('categoria, activa'),
    supabase.from('bots').select('id, nombre').eq('archivado', false).order('nombre'),
    supabase.from('agente_config').select('texto_cuentas').eq('id', 1).maybeSingle(),
  ])
  const usos: Record<number, number> = {}
  for (const r of registro ?? []) usos[r.accion_id] = (usos[r.accion_id] ?? 0) + 1
  const categorias: Record<string, number> = {}
  for (const f of fichas ?? []) categorias[f.categoria] = (categorias[f.categoria] ?? 0) + (f.activa ? 1 : 0)
  return (
    <Acciones
      acciones={(acciones ?? []).map((a) => ({ ...a, cuando: a.cuando as Condicion[], hacer: a.hacer as Paso[] }))}
      usos={usos}
      categorias={categorias}
      bots={bots ?? []}
      hayCuentas={!!config?.texto_cuentas?.trim()}
    />
  )
}

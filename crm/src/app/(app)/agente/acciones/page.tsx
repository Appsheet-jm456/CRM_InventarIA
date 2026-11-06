import { crearCliente } from '@/lib/supabase/server'
import { textoAtributo, type ValorAtributo } from '@/lib/inventario'
import { Acciones } from './Acciones'
import type { Condicion, Paso } from './tipos'

// F4·24: acciones «Cuando → Hacer». El permiso lo revisa el layout del módulo.
export default async function PaginaAcciones() {
  const supabase = crearCliente()
  const hace30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const [{ data: acciones }, { data: registro }, { data: fichas }, { data: bots }, { data: config }, { data: atributos }, { data: equipos }, { data: catalogos }] = await Promise.all([
    supabase.from('acciones').select('id, nombre, prioridad, activa, sistema, cuando, hacer, actualizado_en').order('prioridad'),
    supabase.from('acciones_registro').select('accion_id').gte('en', hace30).limit(20000),
    supabase.from('conocimiento').select('categoria, activa'),
    supabase.from('bots').select('id, nombre').eq('archivado', false).order('nombre'),
    supabase.from('agente_config').select('texto_cuentas').eq('id', 1).maybeSingle(),
    // F4·42: atributos del producto para los renglones de la ficha y un equipo real para la vista previa (el que más atributos tiene)
    supabase.from('producto_atributos').select('clave, nombre, emoji').is('archivado_en', null).order('orden').order('id'),
    supabase.from('productos').select('codigo, marca, modelo, procesador, generacion, ram, almacenamiento, estado, precio, stock, categoria, descripcion, atributos')
      .gt('stock', 0).ilike('categoria', '%port%').order('precio', { ascending: false }).limit(200),
    supabase.from('catalogos').select('id, nombre, tipo, marca').eq('activo', true).order('nombre'), // F4·43
  ])
  const e = [...(equipos ?? [])].sort((a, b) => Object.keys(b.atributos ?? {}).length - Object.keys(a.atributos ?? {}).length)[0]
  const valores = (e?.atributos ?? {}) as Record<string, ValorAtributo>
  const ejemplo = e ? {
    ...Object.fromEntries((atributos ?? []).map((a) => [a.clave, textoAtributo(valores[a.clave])])),
    equipo: `${e.marca ?? ''} ${e.modelo ?? ''}`.trim(), codigo: e.codigo ?? '', marca: e.marca ?? '', modelo: e.modelo ?? '',
    procesador: e.procesador ?? '', generacion: e.generacion ? `${e.generacion}.ª gen` : '', ram: e.ram ?? '', disco: e.almacenamiento ?? '',
    estado: e.estado ?? '', precio: Number(e.precio).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }),
    stock: String(e.stock ?? ''), categoria: e.categoria ?? '', descripcion: (e.descripcion ?? '').trim(),
  } : null
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
      atributos={atributos ?? []}
      ejemplo={ejemplo}
      catalogos={catalogos ?? []}
    />
  )
}

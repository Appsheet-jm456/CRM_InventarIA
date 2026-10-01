import { crearCliente } from '@/lib/supabase/server'
import { textoHorario } from '@/lib/bot'
import { pesos } from '@/lib/inventario'
import type { Cuadro } from './Lienzo'
import type { Contexto } from './Mensajes'

export const COLUMNAS = 'clave, tipo, nombre, orden, inicio, texto, opciones, texto_original, opciones_original, opciones_codigo, max_titulo, marcas, formato, salidas, x, y, actualizado_en'

export type Supabase = ReturnType<typeof crearCliente>

// El horario real, la ficha de un equipo con stock y las marcas con stock: la vista previa muestra lo que ve el cliente.
export async function contexto(supabase: Supabase) {
  const [{ data: franjas }, { data: equipos }] = await Promise.all([
    supabase.from('horario_atencion').select('dia, abre, cierra'),
    supabase.from('productos').select('codigo, marca, modelo, procesador, ram, almacenamiento, estado, precio').gt('stock', 0).order('precio'),
  ])
  const p = equipos?.[0]
  // La ficha de flujo.r11 con el primer equipo con stock.
  const ficha = p
    ? `💻 *${p.marca} ${p.modelo}* · Código ${p.codigo}\n${p.procesador} · ${p.ram} · ${p.almacenamiento}${p.estado ? ` · ${p.estado}` : ''}\n💰 ${pesos(p.precio).replace(/\s/g, '')} · ✅ Disponible`
    : '💻 *DELL LATITUDE 5420* · Código 100-102-1041\nCore i5-1145G7 · 16GB · 256GB NVMe · Usado\n💰 $1.450.000 · ✅ Disponible'
  // Las marcas con stock, como las arma flujo.mostrar_marca.
  const marcas = [...new Set((equipos ?? []).map((e) => e.marca).filter(Boolean))].sort()
    .map((m, i) => ({ id: String(i + 1), titulo: m.toLowerCase().replace(/(^|\s)\S/g, (c: string) => c.toUpperCase()) }))
  const opcionesMarca = marcas.length ? [...marcas, { id: String(marcas.length + 1), titulo: 'Todas las marcas' }] : null
  const ctx: Contexto = { horario: textoHorario(franjas ?? []), ficha }
  return { ctx, opcionesMarca }
}

// Cuadros de la versión publicada, del borrador o de una versión del historial de un bot (decisiones 0026 y 0028).
export async function cuadrosDe(supabase: Supabase, bot: number, cual: 'publicada' | 'borrador' | number, opcionesMarca: Cuadro['opciones_codigo']) {
  const consulta = supabase.from('bot_cuadros').select(`${COLUMNAS}, bot_flujos!inner(version, estado, bot_id)`).eq('bot_flujos.bot_id', bot)
  const { data } = await (typeof cual === 'number' ? consulta.eq('bot_flujos.version', cual) : consulta.eq('bot_flujos.estado', cual))
    .order('orden')
  const version = (data?.[0]?.bot_flujos as unknown as { version: number } | undefined)?.version
  const cuadros = ((data ?? []) as unknown as Cuadro[])
    .map((c) => (c.tipo === 'marca' && opcionesMarca ? { ...c, opciones_codigo: opcionesMarca } : c))
  return { cuadros, version }
}

export type BotBase = { id: number; nombre: string; principal: boolean; archivado: boolean }

export async function botsDe(supabase: Supabase) {
  const { data } = await supabase.from('bots').select('id, nombre, principal, archivado, creado_en').order('principal', { ascending: false }).order('nombre')
  return (data ?? []) as (BotBase & { creado_en: string })[]
}

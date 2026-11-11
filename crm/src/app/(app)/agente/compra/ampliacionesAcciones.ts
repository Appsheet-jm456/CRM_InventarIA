'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

// F4·73 (docs/AMPLIACIONES-RAM-DISCO.md, sección 3): precios de aumentar RAM o disco que el bot ofrece en el resumen del pedido.
// RLS: administrar_agente (0081).
export type Ampliacion = { id?: number; tipo: 'ram' | 'disco'; desde_gb: number; hasta_gb: number; precio: number; precio_rapida: number | null; activa: boolean }
export type DatosAmpliaciones = { activa: boolean; nvme: number; filas: Ampliacion[] }

export async function guardarAmpliaciones(d: DatosAmpliaciones): Promise<{ error?: string; ok?: string }> {
  if (!Number.isInteger(d.nvme) || d.nvme < 0) return { error: 'El adicional NVMe no puede ser negativo.' }
  const vistos = new Set<string>()
  for (const f of d.filas) {
    const que = f.tipo === 'ram' ? 'RAM' : 'disco'
    if (!(f.desde_gb > 0) || !(f.hasta_gb > f.desde_gb)) return { error: `En ${que}, «hasta» tiene que ser mayor que «desde».` }
    if (!(f.precio > 0)) return { error: `Cada renglón de ${que} necesita un precio mayor que cero.` }
    if (f.tipo === 'ram' && !(Number(f.precio_rapida) > 0)) return { error: 'La RAM necesita los dos precios (2400 y 2666-3200 MHz).' }
    const clave = `${f.tipo}-${f.desde_gb}-${f.hasta_gb}`
    if (vistos.has(clave)) return { error: `El aumento de ${que} ${f.desde_gb} → ${f.hasta_gb} GB está repetido.` }
    vistos.add(clave)
  }
  const supabase = crearCliente()
  const { data: config, error: e1 } = await supabase.from('agente_config')
    .update({ ampliacion_activa: d.activa, ampliacion_nvme: d.nvme }).eq('id', 1).select('id')
  if (e1) return { error: e1.message }
  if (!config?.length) return { error: 'No tienes permiso para cambiar la configuración de compra.' }
  const { data: antes, error: e2 } = await supabase.from('ampliaciones').select('id')
  if (e2) return { error: e2.message }
  const quedan = new Set(d.filas.filter((f) => f.id).map((f) => f.id))
  const borrar = (antes ?? []).map((a) => a.id as number).filter((id) => !quedan.has(id))
  if (borrar.length) {
    const { error } = await supabase.from('ampliaciones').delete().in('id', borrar)
    if (error) return { error: error.message }
  }
  for (const [k, f] of d.filas.entries()) {
    const fila = { tipo: f.tipo, desde_gb: f.desde_gb, hasta_gb: f.hasta_gb, precio: Math.round(f.precio),
      precio_rapida: f.tipo === 'ram' ? Math.round(Number(f.precio_rapida)) : null, activa: f.activa, orden: k + 1, actualizado_en: new Date().toISOString() }
    const { error } = f.id ? await supabase.from('ampliaciones').update(fila).eq('id', f.id) : await supabase.from('ampliaciones').insert(fila)
    if (error) return { error: error.code === '23505' ? `El aumento ${f.desde_gb} → ${f.hasta_gb} GB está repetido.` : error.message }
  }
  revalidatePath('/agente/compra')
  return { ok: 'Guardado. El bot usa los precios nuevos en menos de 30 s.' }
}

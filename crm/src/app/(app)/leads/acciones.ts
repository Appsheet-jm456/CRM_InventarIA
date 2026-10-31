'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'
import type { Fila, Filtros } from './filtros'

export type Resultado = { error?: string; ok?: string; errores?: { lead: number; error: string }[] }
export type AccionGrupo = 'responsable' | 'etapa' | 'etiqueta_poner' | 'etiqueta_quitar' | 'tarea' | 'archivar' | 'desarchivar' | 'eliminar' | 'restaurar'

const TEXTO: Record<AccionGrupo, string> = {
  responsable: 'reasignados', etapa: 'movidos de etapa', etiqueta_poner: 'etiquetados', etiqueta_quitar: 'sin esa etiqueta',
  tarea: 'con tarea nueva', archivar: 'archivados', desarchivar: 'desarchivados', eliminar: 'enviados a la papelera', restaurar: 'restaurados',
}

// RL-02: la base valida permisos lead por lead (leads_en_grupo, 0033) y deja cada cambio en el historial.
export async function accionEnGrupo(accion: AccionGrupo, ids: number[], dato: Record<string, unknown> = {}): Promise<Resultado> {
  if (!ids.length) return { error: 'Selecciona al menos un lead.' }
  if (ids.length > 500) return { error: 'Máximo 500 leads por acción.' }
  const { data, error } = await crearCliente().rpc('leads_en_grupo', { p_accion: accion, p_ids: ids, p_dato: dato })
  if (error) return { error: error.code === '42501' ? 'No tienes permiso para esta acción.' : error.message }
  const r = data as { hechos: number; errores: { lead: number; error: string }[] }
  revalidatePath('/leads')
  const sin = ids.length - r.hechos
  return {
    ok: `${r.hechos} de ${ids.length} ${TEXTO[accion]}.` + (sin && !r.errores.length ? ` ${sin} ya estaban así.` : ''),
    errores: r.errores,
  }
}

// Exportar lo filtrado (no solo la página): la base exige exportar_leads. Se arma un CSV que Excel abre bien (BOM y punto y coma).
export async function exportarLeads(filtros: Filtros, atributos: { clave: string; nombre: string }[]): Promise<{ error?: string; csv?: string; total?: number }> {
  const { pagina: _p, tamano: _t, ...resto } = filtros
  const { data, error } = await crearCliente().rpc('leads_lista', { p: { ...resto, exportar: true } })
  if (error) return { error: error.code === '42501' ? 'No tienes permiso para exportar leads.' : error.message }
  const filas = (data as { filas: Fila[] }).filas
  const celda = (v: unknown) => {
    const t = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v)
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const fecha = (v: string | null) => (v ? new Date(v).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '')
  const cabeza = ['Nombre', 'Teléfono', 'Embudo', 'Etapa', 'Estado', 'Responsable', 'Etiquetas', 'Valor', 'Equipo de interés',
    'Último contacto', 'Creado', 'Origen', ...atributos.map((a) => a.nombre)]
  const lineas = filas.map((f) => [f.nombre, f.telefono, f.oportunidad?.embudo, f.oportunidad?.etapa, f.oportunidad?.estado, f.responsable,
    f.etiquetas, f.valor, f.producto, fecha(f.ultimo_contacto), fecha(f.creado), f.origen,
    ...atributos.map((a) => f.atributos?.[a.clave])].map(celda).join(';'))
  return { csv: '﻿' + [cabeza.map(celda).join(';'), ...lineas].join('\r\n'), total: filas.length }
}

// Vistas guardadas (lead_vistas, 0033): solo las propias, una predeterminada.
export async function guardarVista(nombre: string, filtros: Filtros, columnas: string[], predeterminada: boolean): Promise<Resultado> {
  const limpio = nombre.trim()
  if (!limpio || limpio.length > 40) return { error: 'El nombre de la vista va de 1 a 40 caracteres.' }
  const supabase = crearCliente()
  const { pagina: _p, ...sinPagina } = filtros
  if (predeterminada) await supabase.from('lead_vistas').update({ predeterminada: false }).eq('predeterminada', true)
  const { error } = await supabase.from('lead_vistas').upsert({ nombre: limpio, filtros: sinPagina, columnas, predeterminada },
    { onConflict: 'usuario_id,nombre' })
  if (error) return { error: error.message }
  revalidatePath('/leads')
  return { ok: `Vista «${limpio}» guardada.` }
}

export async function borrarVista(id: number): Promise<Resultado> {
  const { error } = await crearCliente().from('lead_vistas').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/leads')
  return { ok: 'Vista borrada.' }
}

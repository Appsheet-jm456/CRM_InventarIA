import { crearCliente } from '@/lib/supabase/server'
import { Conocimiento } from './Conocimiento'
import { Documentos, type Documento } from './Documentos'

// F4·23: preguntas frecuentes y políticas que usan las Acciones (F4·24) y el agente (F4·28); F4·32: documentos para el agente.
// El permiso lo revisa el layout.
export default async function PaginaConocimiento() {
  const supabase = crearCliente()
  const [{ data: fichas }, { data: acciones }, { data: documentos }] = await Promise.all([
    supabase.from('conocimiento').select('id, categoria, titulo, respuesta, archivo, activa, orden, actualizado_en')
      .order('categoria').order('orden'),
    supabase.from('acciones').select('nombre, hacer, activa'),
    supabase.from('conocimiento_documentos')
      .select('id, nombre, tipo, archivo, tamano, estado, error, fragmentos, activo, subido_en, usuarios(nombre)')
      .order('subido_en', { ascending: false }),
  ])
  // Qué acciones responden con cada categoría: así se ve qué se rompe si una categoría queda sin fichas activas.
  const usos: Record<string, string[]> = {}
  for (const a of acciones ?? []) {
    for (const paso of (a.hacer as { tipo: string; categoria?: string }[]) ?? []) {
      if (paso.tipo === 'conocimiento' && paso.categoria) (usos[paso.categoria] ??= []).push(a.nombre)
    }
  }
  return (
    <>
      <Conocimiento fichas={fichas ?? []} usos={usos} />
      <Documentos documentos={(documentos ?? []) as unknown as Documento[]} />
    </>
  )
}

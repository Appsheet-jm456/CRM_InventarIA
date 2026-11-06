import { SinPermiso } from '@/components/SinPermiso'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { COLUMNAS_ATRIBUTO, type AtributoProducto } from '@/lib/inventario'
import { Pestanas } from '../Pestanas'
import { AtributosProducto } from './AtributosProducto'

// F4·41: Inventario → Atributos (RI-07). La base exige administrar_inventario (RLS de 0045).
export default async function PaginaAtributosProducto() {
  const sesion = (await obtenerSesion())!
  if (!puede(sesion, ['administrar_inventario'])) return <SinPermiso />

  const supabase = crearCliente()
  const [{ data: atributos }, { data: productos }] = await Promise.all([
    supabase.from('producto_atributos').select(COLUMNAS_ATRIBUTO).order('orden').order('id'),
    supabase.from('productos').select('categoria, atributos').limit(5000),
  ])
  // Cuántos equipos tienen algo guardado en cada atributo, y las categorías que existen (para elegir dónde aplica).
  const usos: Record<string, number> = {}
  for (const p of productos ?? []) {
    for (const [k, v] of Object.entries((p.atributos ?? {}) as Record<string, unknown>)) {
      if (v !== null && v !== '') usos[k] = (usos[k] ?? 0) + 1
    }
  }
  const categorias = [...new Set((productos ?? []).map((p) => (p.categoria ?? '').trim()).filter(Boolean))].sort()
  return (
    <>
      <Pestanas activa="/inventario/atributos" administra />
      <AtributosProducto
        atributos={(atributos ?? []).map((a) => ({ ...(a as AtributoProducto), usos: usos[a.clave] ?? 0 }))}
        categorias={categorias}
      />
    </>
  )
}

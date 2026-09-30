'use server'

import { obtenerSesion } from '@/lib/sesion'
import { crearCliente } from '@/lib/supabase/server'
import { COLUMNAS_PRODUCTO, type Producto } from '@/lib/inventario'

export type Respuesta = {
  error?: string
  texto?: string
  fuente?: 'codigo' | 'reglas' | 'ia' | 'nada'
  productos?: Producto[]
  cercanos?: boolean
}

type Busqueda = { fuente: Respuesta['fuente']; descripcion: string; codigos: string[]; cercanos: string[] }

// RI-06: el receptor interpreta con el mismo código del bot; los equipos se leen aquí de la base.
export async function buscarEnInventario(pregunta: string): Promise<Respuesta> {
  if (!(await obtenerSesion())) return { error: 'Tu sesión terminó: vuelve a entrar.' }
  const texto = pregunta.trim().slice(0, 500)
  if (!texto) return { error: 'Escribe qué equipo buscas.' }

  let b: Busqueda
  try {
    const r = await fetch(`${process.env.CRM_INTERNO_URL}/interno/buscar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Interno-Token': process.env.CRM_INTERNO_TOKEN ?? '' },
      body: JSON.stringify({ texto }),
      cache: 'no-store',
      signal: AbortSignal.timeout(45000),
    })
    if (!r.ok) throw new Error(String(r.status))
    b = await r.json()
  } catch {
    return { error: 'El intérprete del bot no responde (receptor en el 8095). Mientras tanto usa los filtros de Inventario.' }
  }

  if (b.fuente === 'nada')
    return { fuente: 'nada', productos: [],
      texto: 'No entendí qué buscas. Prueba con marca, procesador, generación, RAM, presupuesto o un código: "Dell i5 de 10 con 16 GB hasta 1.500.000".' }

  const codigos = b.codigos.length ? b.codigos : b.cercanos
  const { data } = codigos.length
    ? await crearCliente().from('productos').select(COLUMNAS_PRODUCTO).in('codigo', codigos)
    : { data: [] }
  const orden = new Map(codigos.map((c, i) => [c, i]))
  const productos = ((data ?? []) as Producto[]).sort((a, z) => (orden.get(a.codigo) ?? 0) - (orden.get(z.codigo) ?? 0))

  if (b.codigos.length)
    return { fuente: b.fuente, productos,
      texto: b.fuente === 'codigo' ? `Este es ${b.descripcion}:` : `Encontré ${productos.length} equipo${productos.length === 1 ? '' : 's'} con ${b.descripcion}:` }
  return { fuente: b.fuente, productos, cercanos: true,
    texto: `No hay equipos con ${b.descripcion} en este momento.${productos.length ? ' Los más parecidos:' : ''}` }
}

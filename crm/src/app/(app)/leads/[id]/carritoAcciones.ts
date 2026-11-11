'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

// F4·72 (docs/CARRITO-DEL-ASESOR.md, RCA-01 a RCA-10): el carrito que el asesor arma en la Ficha. La base valida permisos, stock,
// precios (permiso modificar_precios) y las 24 h; el receptor del bot arma la compra y envía el resumen al cliente.

export type ItemCarrito = {
  codigo: string; equipo: string; precio: number; libre?: boolean
  stock?: number; precio_base?: number | null; estado?: string | null; usado?: boolean
}
export type Carrito = {
  items: ItemCarrito[]; tipo: 'Cliente final' | 'Distribuidor' | null; sin_configuracion: boolean
  aplica_configuracion: boolean; valor_configuracion: number; cargo: number; subtotal: number; total: number
  enviado_en: string | null; enviado_por: string | null; actualizado_en: string | null; actualizado_por: string | null
  puede_precios: boolean
}
export type EquipoInventario = { codigo: string; equipo: string; precio: number; estado: string | null; stock: number; detalle: string }
export type RespuestaCarrito = { error?: string; ok?: string; carrito?: Carrito }

function mensaje(error: { code?: string; message: string }) {
  return error.code === '42501' ? 'No tienes permiso o la conversación la atiende otro asesor.' : error.message
}

export async function leerCarrito(lead: number): Promise<RespuestaCarrito> {
  const { data, error } = await crearCliente().rpc('carrito_de', { p_lead: lead })
  if (error) return { error: mensaje(error) }
  return { carrito: data as Carrito }
}

export async function inventarioCarrito(): Promise<{ equipos: EquipoInventario[]; error?: string }> {
  const { data, error } = await crearCliente().rpc('carrito_inventario')
  if (error) return { equipos: [], error: mensaje(error) }
  return { equipos: (data ?? []) as EquipoInventario[] }
}

export async function guardarCarrito(lead: number, items: ItemCarrito[], tipo: Carrito['tipo'], sinConfiguracion: boolean): Promise<RespuestaCarrito> {
  const limpio = items.map((i) => (i.libre ? { libre: true, equipo: i.equipo, precio: i.precio } : { codigo: i.codigo, precio: i.precio }))
  const { data, error } = await crearCliente().rpc('carrito_guardar', {
    p_lead: lead, p_items: limpio, p_tipo: tipo, p_sin_configuracion: sinConfiguracion,
  })
  if (error) return { error: mensaje(error) }
  revalidatePath(`/leads/${lead}`)
  return { carrito: data as Carrito, ok: 'Carrito guardado.' }
}

// RCA-07: guarda, la base valida y deja el chat al bot con «vuelve a mí»; el receptor envía el resumen.
export async function enviarCarrito(lead: number, items: ItemCarrito[], tipo: Carrito['tipo'], sinConfiguracion: boolean): Promise<RespuestaCarrito> {
  if (!process.env.CRM_INTERNO_URL || !process.env.CRM_INTERNO_TOKEN) return { error: 'Falta la conexión con el receptor del bot.' }
  const guardado = await guardarCarrito(lead, items, tipo, sinConfiguracion)
  if (guardado.error) return guardado
  const { data, error } = await crearCliente().rpc('carrito_enviar', { p_lead: lead })
  if (error) return { error: mensaje(error), carrito: guardado.carrito }
  const pedido = data as { usuario: string; total: number; productos: number }
  try {
    const r = await fetch(`${process.env.CRM_INTERNO_URL}/interno/herramienta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Interno-Token': process.env.CRM_INTERNO_TOKEN },
      body: JSON.stringify({ lead, tipo: 'carrito', ref: 'carrito', usuario: pedido.usuario }),
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    })
    if (!r.ok) return { error: `El receptor del bot respondió ${r.status}: no se envió.`, carrito: guardado.carrito }
    const d = (await r.json()) as { ok: boolean; error?: string }
    if (!d.ok) return { error: d.error ?? 'No se pudo enviar.', carrito: guardado.carrito }
  } catch {
    return { error: 'El receptor del bot no responde: no se envió.', carrito: guardado.carrito }
  }
  revalidatePath(`/leads/${lead}`)
  const releido = await leerCarrito(lead)
  return { carrito: releido.carrito ?? guardado.carrito,
    ok: `Carrito enviado: ${pedido.productos} producto(s). El bot atiende la compra; si el cliente pide asesor, vuelve a ti.` }
}

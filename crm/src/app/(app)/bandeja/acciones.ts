'use server'

import { enviarPlantilla, enviarTexto, listarPlantillas, llenarPlantilla, type Plantilla } from '@/lib/meta'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }

const VENTANA_MS = 24 * 60 * 60 * 1000

// Todas pasan por funciones de la base, que verifican el permiso y que la conversación sea de quien pide.
async function llamar(funcion: string, argumentos: Record<string, unknown>): Promise<Resultado> {
  const { error } = await crearCliente().rpc(funcion, argumentos)
  return error ? { error: error.message } : {}
}

export async function tomar(lead: number) {
  return llamar('tomar_conversacion', { p_lead: lead })
}

export async function liberar(lead: number) {
  return llamar('liberar_conversacion', { p_lead: lead })
}

export async function asignar(lead: number, usuario: string) {
  return llamar('asignar_conversacion', { p_lead: lead, p_usuario: usuario })
}

export async function cerrar(lead: number) {
  return llamar('cerrar_conversacion', { p_lead: lead })
}

export async function reanudarBot(lead: number) {
  return llamar('reanudar_bot', { p_lead: lead })
}

export async function moverOportunidad(oportunidad: number, etapa: number, motivo?: string) {
  return llamar('mover_oportunidad', { p_oportunidad: oportunidad, p_etapa: etapa, p_motivo: motivo || null })
}

export async function abrirOportunidad(lead: number, embudo: number) {
  return llamar('abrir_oportunidad', { p_lead: lead, p_embudo: embudo })
}

// RB-02 y RB-03: dentro de la ventana de 24 h, primero Meta y solo si lo acepta se registra.
export async function responder(lead: number, texto: string): Promise<Resultado> {
  const limpio = texto.trim()
  if (!limpio) return { error: 'Escribe el mensaje.' }
  if (limpio.length > 4096) return { error: 'El mensaje es muy largo (máximo 4.096 caracteres).' }

  const supabase = crearCliente()
  // Si no la ve, no la atiende (RLS): no se envía nada.
  const { data: fila } = await supabase.from('leads').select('telefono').eq('id', lead).maybeSingle()
  if (!fila) return { error: 'Esta conversación la atiende otro asesor.' }

  const { data: ultimo } = await supabase
    .from('mensajes')
    .select('creado_en')
    .eq('lead_id', lead)
    .eq('lado', 'cliente')
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!ultimo || Date.now() - new Date(ultimo.creado_en).getTime() > VENTANA_MS)
    return { error: 'Pasaron más de 24 horas desde el último mensaje del cliente: Meta solo deja escribirle con una plantilla (F3·6).' }

  const envio = await enviarTexto(fila.telefono, limpio)
  if (envio.error) return { error: envio.error }
  const { error } = await supabase.rpc('registrar_mensaje_asesor', { p_lead: lead, p_texto: limpio, p_wamid: envio.wamid ?? '' })
  if (error) return { error: `Se envió, pero no se pudo registrar: ${error.message}` }
  return {}
}

// RS-06: fuera de la ventana solo plantillas aprobadas, con sus variables llenas.
export async function plantillasParaEnviar(): Promise<{ plantillas: Plantilla[]; error?: string }> {
  const { plantillas, error } = await listarPlantillas()
  return { plantillas: plantillas.filter((p) => p.usable), error }
}

export async function responderConPlantilla(lead: number, nombre: string, idioma: string, valores: string[]): Promise<Resultado> {
  const supabase = crearCliente()
  const { data: fila } = await supabase.from('leads').select('telefono').eq('id', lead).maybeSingle()
  if (!fila) return { error: 'Esta conversación la atiende otro asesor.' }

  const { plantillas } = await listarPlantillas()
  const plantilla = plantillas.find((p) => p.nombre === nombre && p.idioma === idioma && p.usable)
  if (!plantilla) return { error: 'Esa plantilla no está aprobada en Meta.' }
  const limpios = valores.slice(0, plantilla.variables).map((v) => v.trim())
  if (limpios.length < plantilla.variables || limpios.some((v) => !v)) return { error: 'Llena todos los datos de la plantilla.' }

  const envio = await enviarPlantilla(fila.telefono, nombre, idioma, limpios)
  if (envio.error) return { error: envio.error }
  const texto = `📋 ${llenarPlantilla(plantilla.cuerpo, limpios)}`
  const { error } = await supabase.rpc('registrar_mensaje_asesor', { p_lead: lead, p_texto: texto, p_wamid: envio.wamid ?? '', p_tipo: 'template' })
  if (error) return { error: `Se envió, pero no se pudo registrar: ${error.message}` }
  return {}
}

// F4·46 (RAG-65, RAG-66): la base exige validar_pagos y lo registra; luego el receptor le escribe al cliente y sigue el despacho.
async function avisarReceptor(lead: number): Promise<{ error?: string; aviso?: string | null }> {
  if (!process.env.CRM_INTERNO_URL || !process.env.CRM_INTERNO_TOKEN) return { error: 'Falta la conexión con el receptor del bot.' }
  try {
    const r = await fetch(`${process.env.CRM_INTERNO_URL}/interno/comprobante`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Interno-Token': process.env.CRM_INTERNO_TOKEN },
      body: JSON.stringify({ lead }),
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    })
    if (!r.ok) return { error: `El receptor del bot respondió ${r.status}.` }
    const d = (await r.json()) as { ok: boolean; error?: string; aviso?: string | null }
    return d.ok ? { aviso: d.aviso ?? null } : { error: d.error ?? 'El receptor no pudo avisar al cliente.' }
  } catch {
    return { error: 'El receptor del bot no responde.' }
  }
}

export async function validarComprobante(lead: number): Promise<Resultado> {
  const { error } = await crearCliente().rpc('validar_comprobante', { p_lead: lead })
  if (error) return { error: error.message }
  const r = await avisarReceptor(lead)
  if (r.error) return { error: `Quedó validado, pero no se le pudo escribir al cliente: ${r.error} Pulsa de nuevo «Avisar al cliente».` }
  return { ok: r.aviso ?? 'Pago validado: el cliente recibió la confirmación y sigue con los datos de despacho.' }
}

export async function rechazarComprobante(lead: number, motivo: string): Promise<Resultado> {
  const limpio = motivo.trim()
  if (!limpio) return { error: 'Elige o escribe el motivo.' }
  const { error } = await crearCliente().rpc('rechazar_comprobante', { p_lead: lead, p_motivo: limpio })
  if (error) return { error: error.message }
  const r = await avisarReceptor(lead)
  if (r.error) return { error: `Quedó rechazado, pero no se le pudo escribir al cliente: ${r.error} Pulsa de nuevo «Avisar al cliente».` }
  return { ok: r.aviso ?? 'Comprobante rechazado: el cliente recibió el motivo y puede mandar otro.' }
}

// Si el receptor no respondió al validar o rechazar: reintenta solo el aviso (la decisión ya quedó en la base).
export async function reintentarAviso(lead: number): Promise<Resultado> {
  const r = await avisarReceptor(lead)
  return r.error ? { error: r.error } : { ok: r.aviso ?? 'Listo: se le escribió al cliente.' }
}

// --------------------------------------------------------------------------- //
// F4·61 (RB-07 a RB-12): catálogos, acciones y flujos que el asesor dispara desde el chat con «/» o el botón ⚡
// --------------------------------------------------------------------------- //
export type Herramienta = { tipo: 'catalogo' | 'accion' | 'flujo'; ref: string; nombre: string; detalle: string }

export async function herramientasChat(): Promise<{ herramientas: Herramienta[]; error?: string }> {
  const { data, error } = await crearCliente().rpc('herramientas_chat')
  if (error) return { herramientas: [], error: error.message }
  const d = (data ?? {}) as Record<string, Omit<Herramienta, 'tipo'>[]>
  const de = (tipo: Herramienta['tipo'], filas?: Omit<Herramienta, 'tipo'>[]) => (filas ?? []).map((f) => ({ ...f, detalle: f.detalle ?? '', tipo }))
  return { herramientas: [...de('catalogo', d.catalogos), ...de('accion', d.acciones), ...de('flujo', d.flujos)] }
}

// La base revisa permiso, que la conversación sea de quien pide y las 24 h, y deja el chat como corresponde; el receptor envía.
export async function usarHerramienta(lead: number, h: Pick<Herramienta, 'tipo' | 'ref'>, alTerminar: 'asesor' | 'bot' = 'asesor'): Promise<Resultado> {
  if (!process.env.CRM_INTERNO_URL || !process.env.CRM_INTERNO_TOKEN) return { error: 'Falta la conexión con el receptor del bot.' }
  const { data, error } = await crearCliente().rpc('herramienta_chat', { p_lead: lead, p_tipo: h.tipo, p_ref: h.ref, p_al_terminar: alTerminar })
  if (error) return { error: error.message }
  const pedido = data as { usuario: string; detalle: string }
  try {
    const r = await fetch(`${process.env.CRM_INTERNO_URL}/interno/herramienta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Interno-Token': process.env.CRM_INTERNO_TOKEN },
      body: JSON.stringify({ lead, tipo: h.tipo, ref: h.ref, usuario: pedido.usuario }),
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    })
    if (!r.ok) return { error: `El receptor del bot respondió ${r.status}: no se envió.` }
    const d = (await r.json()) as { ok: boolean; error?: string }
    if (!d.ok) return { error: d.error ?? 'No se pudo enviar.' }
  } catch {
    return { error: 'El receptor del bot no responde: no se envió.' }
  }
  return { ok: h.tipo === 'flujo' ? `${pedido.detalle}. El bot atiende este tramo; si escribes, vuelve a ti.` : `Enviado: ${pedido.detalle}` }
}

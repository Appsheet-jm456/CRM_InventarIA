import 'server-only'
import { conexionMeta } from '@/lib/metaConexion'

const API = 'https://graph.facebook.com/v25.0'

// Envía un texto por la Cloud API de Meta. Devuelve el wamid, o un error legible si Meta lo rechaza.
export async function enviarTexto(numero: string, texto: string): Promise<{ wamid?: string; error?: string }> {
  const conexion = await conexionMeta()
  if (!conexion) return { error: 'Falta la conexión con Meta: configúrala en Configuración → Meta.' }
  const { token, phoneNumberId: telefono } = conexion
  try {
    const r = await fetch(`${API}/${telefono}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: numero, type: 'text', text: { body: texto } }),
      cache: 'no-store',
    })
    const datos = await r.json()
    if (!r.ok) return { error: `Meta no lo aceptó: ${datos?.error?.message ?? r.status}` }
    return { wamid: datos?.messages?.[0]?.id ?? '' }
  } catch {
    return { error: 'No se pudo conectar con Meta. Intenta de nuevo.' }
  }
}

// ------------------------------------------------------------------ plantillas (F3·6, RS-06)

export type Plantilla = {
  nombre: string
  idioma: string
  categoria: string
  estado: string
  cuerpo: string
  variables: number
  // Solo se ofrecen las que se pueden llenar desde la app: variables en el cuerpo y encabezado sin variables.
  usable: boolean
}

type ComponenteMeta = { type: string; format?: string; text?: string }

export async function listarPlantillas(): Promise<{ plantillas: Plantilla[]; error?: string }> {
  const conexion = await conexionMeta()
  if (!conexion?.wabaId) return { plantillas: [], error: 'Falta la conexión con Meta: configúrala en Configuración → Meta.' }
  const { token, wabaId: waba } = conexion
  try {
    const r = await fetch(`${API}/${waba}/message_templates?fields=name,status,category,language,components&limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 60 },
    })
    const datos = await r.json()
    if (!r.ok) return { plantillas: [], error: `Meta no respondió: ${datos?.error?.message ?? r.status}` }
    const plantillas = (datos.data ?? []).map((t: { name: string; language: string; category: string; status: string; components: ComponenteMeta[] }) => {
      const cuerpo = t.components.find((c) => c.type === 'BODY')?.text ?? ''
      const encabezado = t.components.find((c) => c.type === 'HEADER')
      const variables = new Set(cuerpo.match(/\{\{\d+\}\}/g) ?? []).size
      const usable =
        t.status === 'APPROVED' &&
        !t.components.some((c) => c.type === 'CAROUSEL') &&
        (!encabezado || (encabezado.format === 'TEXT' && !/\{\{\d+\}\}/.test(encabezado.text ?? '')))
      return { nombre: t.name, idioma: t.language, categoria: t.category, estado: t.status, cuerpo, variables, usable }
    })
    return { plantillas }
  } catch {
    return { plantillas: [], error: 'No se pudo conectar con Meta.' }
  }
}

export function llenarPlantilla(cuerpo: string, valores: string[]) {
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] || `{{${n}}}`)
}

export async function enviarPlantilla(numero: string, nombre: string, idioma: string, valores: string[]) {
  const conexion = await conexionMeta()
  if (!conexion) return { error: 'Falta la conexión con Meta: configúrala en Configuración → Meta.' }
  const { token, phoneNumberId: telefono } = conexion
  const plantilla: Record<string, unknown> = { name: nombre, language: { code: idioma } }
  if (valores.length)
    plantilla.components = [{ type: 'body', parameters: valores.map((text) => ({ type: 'text', text })) }]
  try {
    const r = await fetch(`${API}/${telefono}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: numero, type: 'template', template: plantilla }),
      cache: 'no-store',
    })
    const datos = await r.json()
    if (!r.ok) return { error: `Meta no lo aceptó: ${datos?.error?.message ?? r.status}` }
    return { wamid: (datos?.messages?.[0]?.id as string) ?? '' }
  } catch {
    return { error: 'No se pudo conectar con Meta. Intenta de nuevo.' }
  }
}

// Envía una plantilla a aprobación de Meta. Los ejemplos son obligatorios si el cuerpo tiene variables.
export async function crearPlantilla(nombre: string, categoria: string, cuerpo: string, ejemplos: string[]) {
  const conexion = await conexionMeta()
  if (!conexion?.wabaId) return { error: 'Falta la conexión con Meta: configúrala en Configuración → Meta.' }
  const { token, wabaId: waba } = conexion
  const cuerpoMeta: Record<string, unknown> = { type: 'BODY', text: cuerpo }
  if (ejemplos.length) cuerpoMeta.example = { body_text: [ejemplos] }
  try {
    const r = await fetch(`${API}/${waba}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nombre, language: 'es', category: categoria, components: [cuerpoMeta] }),
      cache: 'no-store',
    })
    const datos = await r.json()
    if (!r.ok) return { error: `Meta no la aceptó: ${datos?.error?.error_user_msg ?? datos?.error?.message ?? r.status}` }
    return { estado: (datos?.status as string) ?? 'PENDING' }
  } catch {
    return { error: 'No se pudo conectar con Meta.' }
  }
}

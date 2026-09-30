import 'server-only'

const API = 'https://graph.facebook.com/v25.0'

// Envía un texto por la Cloud API de Meta. Devuelve el wamid, o un error legible si Meta lo rechaza.
export async function enviarTexto(numero: string, texto: string): Promise<{ wamid?: string; error?: string }> {
  const token = process.env.META_TOKEN
  const telefono = process.env.META_PHONE_NUMBER_ID
  if (!token || !telefono) return { error: 'Falta la conexión con Meta (META_TOKEN) en el servidor.' }
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

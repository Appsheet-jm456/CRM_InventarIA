import 'server-only'
import { costoUsd, type Modelo } from './cerebroProveedores'

export type Respuesta = { texto: string; tokens_entrada: number; tokens_salida: number; costo_usd: number; ms: number }

// Un modelo no puede apuntar a servicios internos de la nube (metadatos): la dirección la escribe un administrador, pero se revisa igual.
function direccionPermitida(url: string) {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && !/^169\.254\./.test(u.hostname)
  } catch { return false }
}

// Una llamada a un modelo (RAG-10): compatible con OpenAI (DeepSeek, OpenAI, Gemini, local, otros) o Anthropic.
export async function llamarModelo(m: Modelo, llave: string | null, pregunta: string, o: { temperatura: number; tokensMax: number; esperaMs: number }): Promise<Respuesta> {
  if (!direccionPermitida(m.url_base)) throw new Error('La dirección del modelo no es válida.')
  if (!llave && m.proveedor !== 'local') throw new Error('Falta la llave de este modelo.')
  const base = m.url_base.replace(/\/+$/, '')
  const t0 = Date.now()
  const anthropic = m.protocolo === 'anthropic'
  const r = await fetch(anthropic ? `${base}/v1/messages` : `${base}/chat/completions`, {
    method: 'POST',
    headers: anthropic
      ? { 'Content-Type': 'application/json', 'x-api-key': llave ?? '', 'anthropic-version': '2023-06-01' }
      : { 'Content-Type': 'application/json', ...(llave ? { Authorization: `Bearer ${llave}` } : {}) },
    body: JSON.stringify(anthropic
      ? { model: m.modelo, max_tokens: o.tokensMax, temperature: Math.min(o.temperatura, 1), messages: [{ role: 'user', content: pregunta }] }
      : { model: m.modelo, max_tokens: o.tokensMax, temperature: o.temperatura, messages: [{ role: 'user', content: pregunta }] }),
    cache: 'no-store',
    signal: AbortSignal.timeout(o.esperaMs),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${r.status}: ${String(j?.error?.message ?? j?.message ?? r.statusText).slice(0, 200)}`)
  const texto = String(anthropic ? j?.content?.[0]?.text ?? '' : j?.choices?.[0]?.message?.content ?? '').trim()
  const ent = Number(anthropic ? j?.usage?.input_tokens : j?.usage?.prompt_tokens) || 0
  const sal = Number(anthropic ? j?.usage?.output_tokens : j?.usage?.completion_tokens) || 0
  return { texto, tokens_entrada: ent, tokens_salida: sal, costo_usd: costoUsd(m, ent, sal), ms: Date.now() - t0 }
}

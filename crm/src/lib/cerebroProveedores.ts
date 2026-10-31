// Proveedores de IA del Cerebro (F4·27, RAG-10). Valores de partida editables en la pantalla: los precios cambian,
// hay que confirmarlos en la página del proveedor. Sirve a la pantalla (navegador) y al servidor.
export type Protocolo = 'openai' | 'anthropic'
export type Proveedor = 'deepseek' | 'openai' | 'gemini' | 'anthropic' | 'local' | 'otro'

export type Modelo = {
  proveedor: Proveedor
  modelo: string
  url_base: string
  protocolo: Protocolo
  precio_entrada_usd: number // por millón de tokens
  precio_salida_usd: number
}

export const PROVEEDORES: { id: Proveedor; nombre: string; ayuda: string; base: Omit<Modelo, 'proveedor'> }[] = [
  { id: 'deepseek', nombre: 'DeepSeek', ayuda: 'Muy barato y bueno con herramientas.',
    base: { modelo: 'deepseek-chat', url_base: 'https://api.deepseek.com', protocolo: 'openai', precio_entrada_usd: 0.28, precio_salida_usd: 0.42 } },
  { id: 'openai', nombre: 'OpenAI (GPT)', ayuda: 'Alternativa o respaldo.',
    base: { modelo: 'gpt-4o-mini', url_base: 'https://api.openai.com/v1', protocolo: 'openai', precio_entrada_usd: 0.15, precio_salida_usd: 0.6 } },
  { id: 'gemini', nombre: 'Google Gemini', ayuda: 'Usa la dirección compatible con OpenAI de Google.',
    base: { modelo: 'gemini-2.5-flash', url_base: 'https://generativelanguage.googleapis.com/v1beta/openai', protocolo: 'openai', precio_entrada_usd: 0.3, precio_salida_usd: 2.5 } },
  { id: 'anthropic', nombre: 'Anthropic (Claude)', ayuda: 'API propia de Anthropic.',
    base: { modelo: 'claude-haiku-5-5', url_base: 'https://api.anthropic.com', protocolo: 'anthropic', precio_entrada_usd: 1, precio_salida_usd: 5 } },
  { id: 'local', nombre: 'Local (este servidor)', ayuda: 'Sin costo ni internet; más lento y menos fiable con herramientas.',
    base: { modelo: 'qwen3', url_base: 'http://127.0.0.1:8080/v1', protocolo: 'openai', precio_entrada_usd: 0, precio_salida_usd: 0 } },
  { id: 'otro', nombre: 'Otro proveedor', ayuda: 'Cualquier servicio compatible con OpenAI o Anthropic: escribe su dirección.',
    base: { modelo: '', url_base: '', protocolo: 'openai', precio_entrada_usd: 0, precio_salida_usd: 0 } },
]

export function costoUsd(m: Pick<Modelo, 'precio_entrada_usd' | 'precio_salida_usd'>, tokensEntrada: number, tokensSalida: number) {
  return (tokensEntrada * m.precio_entrada_usd + tokensSalida * m.precio_salida_usd) / 1_000_000
}

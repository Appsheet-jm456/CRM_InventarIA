import 'server-only'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { crearClienteAdmin } from '@/lib/supabase/admin'

// Conexión con Meta (F4·16, RC-04 y RC-07). Manda la base (Configuración → Meta, secretos en Vault); mientras no haya
// una conexión guardada se usan las variables META_* del entorno, como antes. Se relee cada 30 s, sin reiniciar.
export type ConexionMeta = {
  token: string
  appId: string
  wabaId: string
  phoneNumberId: string
  appSecret: string
  verifyToken: string
  origen: 'base' | 'entorno'
}

const VIGENCIA_MS = 30_000
let guardada: { en: number; valor: ConexionMeta | null } | null = null

// Variables META_* del entorno de la app y, si faltan (la app solo trae algunas), las de .env.meta del servidor.
function delArchivo(): Record<string, string> {
  try {
    const texto = readFileSync(path.join(process.cwd(), '..', '.env.meta'), 'utf-8')
    return Object.fromEntries(
      texto.split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
    )
  } catch {
    return {}
  }
}

function delEntorno(): ConexionMeta | null {
  const e = { ...delArchivo(), ...Object.fromEntries(Object.entries(process.env).filter(([k, v]) => k.startsWith('META_') && v)) }
  if (!e.META_TOKEN || !e.META_PHONE_NUMBER_ID) return null
  return {
    token: e.META_TOKEN,
    appId: e.META_APP_ID ?? '',
    wabaId: e.META_WABA_ID ?? '',
    phoneNumberId: e.META_PHONE_NUMBER_ID,
    appSecret: e.META_APP_SECRET ?? '',
    verifyToken: e.META_VERIFY_TOKEN ?? '',
    origen: 'entorno',
  }
}

// null si no hay conexión en ninguna parte. Si la base no responde se conserva la última buena (o el entorno).
export async function conexionMeta(): Promise<ConexionMeta | null> {
  if (guardada && Date.now() - guardada.en < VIGENCIA_MS) return guardada.valor
  let valor: ConexionMeta | null
  try {
    const { data, error } = await crearClienteAdmin().rpc('meta_config')
    if (error) throw error
    valor = data
      ? {
          token: data.token,
          appId: data.app_id,
          wabaId: data.waba_id,
          phoneNumberId: data.phone_number_id,
          appSecret: data.app_secret,
          verifyToken: data.verify_token,
          origen: 'base',
        }
      : delEntorno()
  } catch {
    valor = guardada?.valor ?? delEntorno()
  }
  guardada = { en: Date.now(), valor }
  return valor
}

// Para que un cambio guardado desde la pantalla se vea en el acto en este proceso.
export function olvidarConexionMeta() {
  guardada = null
}

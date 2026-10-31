'use server'

import { revalidatePath } from 'next/cache'
import { llamarModelo } from '@/lib/cerebro'
import { COLUMNAS_CEREBRO, PROVEEDORES, type Modelo } from '@/lib/cerebroProveedores'
import { obtenerSesion, puede } from '@/lib/sesion'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }
export type DatosCerebro = {
  principal: Modelo
  respaldo: Modelo | null
  temperatura: number
  tokens_max: number
  espera_segundos: number
  presupuesto_usd: number
}

const IDS = PROVEEDORES.map((p) => p.id)

function revisar(m: Modelo, nombre: string): string | null {
  if (!IDS.includes(m.proveedor)) return `El proveedor ${nombre} no es válido.`
  if (!m.modelo.trim()) return `Escribe el modelo ${nombre}.`
  if (!/^https?:\/\/\S+$/.test(m.url_base.trim())) return `La dirección ${nombre} debe empezar por http:// o https://`
  if (!(m.precio_entrada_usd >= 0) || !(m.precio_salida_usd >= 0)) return `Los precios ${nombre} no pueden ser negativos.`
  return null
}

// Proveedor, modelos, límites y presupuesto (F4·27). RLS: administrar_agente (0024). La llave va aparte, a Vault.
export async function guardarCerebro(d: DatosCerebro): Promise<Resultado> {
  const malo = revisar(d.principal, 'principal') ?? (d.respaldo ? revisar(d.respaldo, 'de respaldo') : null)
  if (malo) return { error: malo }
  if (!(d.temperatura >= 0 && d.temperatura <= 1.5)) return { error: 'La temperatura va de 0 a 1,5.' }
  if (!Number.isInteger(d.tokens_max) || d.tokens_max < 100 || d.tokens_max > 4000) return { error: 'El largo máximo va de 100 a 4.000 tokens.' }
  if (!Number.isInteger(d.espera_segundos) || d.espera_segundos < 5 || d.espera_segundos > 60) return { error: 'La espera va de 5 a 60 segundos.' }
  if (!(d.presupuesto_usd >= 0)) return { error: 'El presupuesto no puede ser negativo.' }
  const p = d.principal
  const r = d.respaldo
  const { data, error } = await crearCliente().from('agente_config').update({
    proveedor: p.proveedor, modelo: p.modelo.trim(), url_base: p.url_base.trim(), protocolo: p.protocolo,
    precio_entrada_usd: p.precio_entrada_usd, precio_salida_usd: p.precio_salida_usd,
    proveedor_respaldo: r?.proveedor ?? null, modelo_respaldo: r?.modelo.trim() ?? null, url_base_respaldo: r?.url_base.trim() ?? null,
    protocolo_respaldo: r?.protocolo ?? null, precio_entrada_usd_respaldo: r?.precio_entrada_usd ?? null,
    precio_salida_usd_respaldo: r?.precio_salida_usd ?? null,
    temperatura: d.temperatura, tokens_max: d.tokens_max, espera_segundos: d.espera_segundos, presupuesto_usd: d.presupuesto_usd,
  }).eq('id', 1).select('id')
  if (error) {
    // 0030: con Avi encendido para clientes (números de prueba o todos), un modelo de pago necesita llave y presupuesto.
    if (error.message.includes('agente_config_listo_para_clientes'))
      return { error: 'Avi está encendido para clientes: con un proveedor de pago hace falta un presupuesto mensual mayor que 0 (y la llave guardada). Pon el presupuesto y guarda de nuevo, o apaga a Avi en la pestaña Avi.' }
    return { error: error.message }
  }
  if (!data?.length) return { error: 'No tienes permiso para cambiar el cerebro del agente.' }
  revalidatePath('/agente/cerebro')
  return { ok: 'Guardado. Pega la llave si la cambiaste y usa «Probar conexión».' }
}

// La llave se guarda cifrada en Vault y no se vuelve a mostrar (RAG-11).
export async function guardarLlave(llave: string, respaldo: boolean): Promise<Resultado> {
  if (llave.trim().length < 20) return { error: 'La llave es muy corta: cópiala completa desde la página del proveedor.' }
  const { error } = await crearCliente().rpc('agente_guardar_llave', { p_llave: llave.trim(), p_respaldo: respaldo })
  if (error) return { error: error.message.includes('permiso') ? 'No tienes permiso para guardar la llave.' : error.message }
  revalidatePath('/agente/cerebro')
  return { ok: 'Llave guardada y cifrada. Nadie puede volver a verla.' }
}

export type Prueba = { error?: string; texto?: string; ms?: number; tokens?: number; costo_usd?: number }

// Probar conexión: una pregunta mínima al modelo ya guardado. La llave se lee en el servidor, nunca viaja al navegador.
export async function probarConexion(respaldo: boolean): Promise<Prueba> {
  const sesion = await obtenerSesion()
  if (!sesion || !puede(sesion, ['administrar_agente'])) return { error: 'No tienes permiso para probar el cerebro.' }
  const { data: c } = await crearCliente().from('agente_config').select(COLUMNAS_CEREBRO).eq('id', 1).maybeSingle()
  if (!c) return { error: 'No se encontró la configuración del agente.' }
  const m: Modelo | null = respaldo
    ? (c.proveedor_respaldo ? { proveedor: c.proveedor_respaldo, modelo: c.modelo_respaldo, url_base: c.url_base_respaldo, protocolo: c.protocolo_respaldo,
        precio_entrada_usd: Number(c.precio_entrada_usd_respaldo ?? 0), precio_salida_usd: Number(c.precio_salida_usd_respaldo ?? 0) } : null)
    : { proveedor: c.proveedor, modelo: c.modelo, url_base: c.url_base, protocolo: c.protocolo,
        precio_entrada_usd: Number(c.precio_entrada_usd), precio_salida_usd: Number(c.precio_salida_usd) }
  if (!m) return { error: 'No hay modelo de respaldo guardado.' }
  const { data: llaves } = await crearClienteAdmin().rpc('agente_llaves')
  const llave: string | null = (respaldo ? llaves?.llave_respaldo : llaves?.llave) ?? null
  try {
    const r = await llamarModelo(m, llave, 'Responde solo con la palabra: listo', {
      temperatura: 0, tokensMax: 20, esperaMs: Number(c.espera_segundos) * 1000 })
    return { texto: r.texto, ms: r.ms, tokens: r.tokens_entrada + r.tokens_salida, costo_usd: r.costo_usd }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: msg.includes('aborted') || msg.includes('timeout') ? `No respondió en ${c.espera_segundos} s.` : msg }
  }
}

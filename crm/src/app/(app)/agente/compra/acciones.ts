'use server'

import { revalidatePath } from 'next/cache'
import { crearCliente } from '@/lib/supabase/server'

export type Resultado = { error?: string; ok?: string }
export type DatosCompra = {
  texto_cuentas: string
  texto_comprobante: string
  texto_sigue_interesado: string
  texto_cancelacion: string
  horas_sin_respuesta: number
  cargo_configuracion: number
  compra_bot_despues: number | null // F4·34, RF-28: bot del lienzo después del comprobante (null: al asesor como antes)
  // F4·44 (RAG-54): carrito de varios equipos
  carrito_activo: boolean
  carrito_max: number
  carrito_texto_otro: string
  carrito_texto_pedir: string
  carrito_texto_maximo: string
  carrito_encabezado: string
}

const MARCAS_CARRITO = ['n', 'max', 'nombre']

const MAX_WHATSAPP = 4096

// Textos y tiempos del flujo de compra (F4·25), en agente_config. RLS: administrar_agente (0024).
export async function guardarCompra(d: DatosCompra): Promise<Resultado> {
  for (const [campo, nombre] of [['texto_comprobante', 'comprobante recibido'], ['texto_sigue_interesado', '¿sigues interesado?'],
    ['texto_cancelacion', 'cancelación']] as const) {
    if (!d[campo].trim()) return { error: `El texto de ${nombre} no puede quedar vacío.` }
  }
  const raras = [...new Set([...d.texto_comprobante.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).filter((m) => !['horario', 'proxima'].includes(m)))]
  if (raras.length) return { error: `En «comprobante recibido» el bot solo reemplaza {horario} y {proxima}; no {${raras.join('}, {')}}.` }
  if ([d.texto_cuentas, d.texto_comprobante, d.texto_sigue_interesado, d.texto_cancelacion].some((t) => t.length > MAX_WHATSAPP))
    return { error: 'Un mensaje de WhatsApp tiene máximo 4.096 caracteres.' }
  if (!Number.isInteger(d.horas_sin_respuesta) || d.horas_sin_respuesta < 1 || d.horas_sin_respuesta > 23)
    return { error: 'El recordatorio va entre 1 y 23 horas (WhatsApp solo deja escribir libre 24 h después del último mensaje del cliente).' }
  if (!(d.cargo_configuracion >= 0)) return { error: 'El cargo de configuración no puede ser negativo.' }
  if (!Number.isInteger(d.carrito_max) || d.carrito_max < 2 || d.carrito_max > 10) return { error: 'El máximo de equipos por pedido va de 2 a 10.' }
  for (const [campo, nombre, largo] of [['carrito_texto_otro', '¿otro equipo?', 1024], ['carrito_texto_pedir', 'pedir el equipo', 1024],
    ['carrito_texto_maximo', 'máximo alcanzado', 1024], ['carrito_encabezado', 'encabezado del resumen', 300]] as const) {
    if (!d[campo].trim()) return { error: `El texto de ${nombre} del carrito no puede quedar vacío.` }
    if (d[campo].length > largo) return { error: `El texto de ${nombre} tiene máximo ${largo} caracteres.` }
    const otras = [...d[campo].matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).filter((m) => !MARCAS_CARRITO.includes(m))
    if (otras.length) return { error: `En «${nombre}» el bot solo reemplaza {n}, {max} y {nombre}; no {${otras.join('}, {')}}.` }
  }
  const { data, error } = await crearCliente().from('agente_config').update({
    texto_cuentas: d.texto_cuentas.trim(),
    texto_comprobante: d.texto_comprobante.trim(),
    texto_sigue_interesado: d.texto_sigue_interesado.trim(),
    texto_cancelacion: d.texto_cancelacion.trim(),
    horas_sin_respuesta: d.horas_sin_respuesta,
    cargo_configuracion: Math.round(d.cargo_configuracion),
    compra_bot_despues: d.compra_bot_despues,
    carrito_activo: d.carrito_activo,
    carrito_max: d.carrito_max,
    carrito_texto_otro: d.carrito_texto_otro.trim(),
    carrito_texto_pedir: d.carrito_texto_pedir.trim(),
    carrito_texto_maximo: d.carrito_texto_maximo.trim(),
    carrito_encabezado: d.carrito_encabezado.trim(),
  }).eq('id', 1).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'No tienes permiso para cambiar la configuración de compra.' }
  revalidatePath('/agente/compra')
  revalidatePath('/agente/acciones')
  return { ok: 'Guardado. El bot usa los textos nuevos en menos de 30 s.' }
}

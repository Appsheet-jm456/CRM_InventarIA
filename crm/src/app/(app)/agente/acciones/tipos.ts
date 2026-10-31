// Forma de las acciones «Cuando → Hacer» (migración 0024, docs/AGENTE.md RAG-23 a RAG-26). La misma que lee el receptor
// (herramientas/meta-webhook-prueba/acciones.py).

export type Condicion = { forma: 'contiene' | 'igual' | 'empieza'; texto: string }
export type Paso =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'conocimiento'; categoria: string }
  | { tipo: 'cuentas' }
  | { tipo: 'flujo'; flujo: 'compra' | 'cotizacion' }
  | { tipo: 'bot'; bot_id: number }
  | { tipo: 'etiqueta'; etiqueta: string }
  | { tipo: 'asesor'; texto?: string }

export const FORMAS: { valor: Condicion['forma']; texto: string }[] = [
  { valor: 'contiene', texto: 'contiene' },
  { valor: 'igual', texto: 'es igual a' },
  { valor: 'empieza', texto: 'empieza por' },
]

// Pasos que el receptor ya ejecuta (acciones.py). El flujo de compra existe desde F4·25; la cotización llega en F4·26.
export const PASOS_LISTOS: Paso['tipo'][] = ['texto', 'conocimiento', 'cuentas', 'bot', 'etiqueta', 'asesor', 'flujo']
export const FLUJOS_LISTOS = ['compra']
export const pasoListo = (p: Paso) => PASOS_LISTOS.includes(p.tipo) && (p.tipo !== 'flujo' || FLUJOS_LISTOS.includes(p.flujo))

export const PASOS: { tipo: Paso['tipo']; texto: string; ayuda: string }[] = [
  { tipo: 'texto', texto: 'Responder un texto', ayuda: '{nombre} y {horario} se cambian por el nombre del cliente y el horario' },
  { tipo: 'conocimiento', texto: 'Responder con el conocimiento', ayuda: 'Envía las fichas activas de la categoría (texto e imagen o PDF)' },
  { tipo: 'cuentas', texto: 'Enviar las cuentas', ayuda: 'El texto aprobado de Compra (F4·25); sin texto no se envía nada' },
  { tipo: 'flujo', texto: 'Iniciar flujo de compra o cotización', ayuda: 'Compra: equipo → tipo de cliente → total → cuentas → comprobante → asesor (pestaña Compra). Cotización llega en F4·26' },
  { tipo: 'bot', texto: 'Ir a otro bot', ayuda: 'El cliente pasa al inicio de ese bot del lienzo' },
  { tipo: 'etiqueta', texto: 'Poner etiqueta', ayuda: 'Se agrega a las etiquetas del cliente' },
  { tipo: 'asesor', texto: 'Pasar a asesor', ayuda: 'Pausa el bot y deja el chat en la cola de la Bandeja (con el aviso de horario)' },
]

export function pasoVacio(tipo: Paso['tipo']): Paso {
  switch (tipo) {
    case 'texto': return { tipo, texto: '' }
    case 'conocimiento': return { tipo, categoria: '' }
    case 'flujo': return { tipo, flujo: 'compra' }
    case 'bot': return { tipo, bot_id: 0 }
    case 'etiqueta': return { tipo, etiqueta: '' }
    case 'asesor': return { tipo }
    default: return { tipo: 'cuentas' }
  }
}

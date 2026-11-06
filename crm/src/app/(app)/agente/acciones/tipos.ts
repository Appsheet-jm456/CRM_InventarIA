// Forma de las acciones «Cuando → Hacer» (migración 0024, docs/AGENTE.md RAG-23 a RAG-26). La misma que lee el receptor
// (herramientas/meta-webhook-prueba/acciones.py).

export type Condicion =
  | { forma: 'contiene' | 'igual' | 'empieza'; texto: string }
  // F4·42 (RAG-43): el mensaje nombra un equipo del inventario (código o modelo), sin IA
  | { forma: 'equipo'; texto: string; exigir: boolean; palabras: string[]; marca: boolean }
export type CondicionFrase = Extract<Condicion, { forma: 'contiene' | 'igual' | 'empieza' }>

// La ficha del equipo (F4·42, RAG-44 a RAG-47). Marcas: las de la plantilla de Avi, los atributos del producto, {nombre} y {modelo}.
export type PasoFicha = {
  tipo: 'ficha_equipo'; encabezado: string; plantilla: string; cierre: string; varios: string; cierre_varios: string
  agotado: string; si_agotado: 'parecidos' | 'asesor' | 'nada'; foto: boolean
  catalogo?: boolean // F4·43 (RAG-51): el catálogo de la marca al final
}
// F4·43 (RAG-49 y RAG-50): enviar un catálogo de Inventario → Catálogos o un archivo subido en la acción.
export type PasoCatalogo = { tipo: 'catalogo'; modo: 'lista' | 'marca' | 'unificado'; catalogo_id?: number; texto: string }
export type PasoArchivo = { tipo: 'archivo'; archivo: string; nombre: string; texto: string }
export const MAX_PDF_ACCION = 16 * 1024 * 1024
export const MAX_IMAGEN_ACCION = 5 * 1024 * 1024
export const FICHA_INICIAL: PasoFicha = {
  tipo: 'ficha_equipo',
  encabezado: '¡Hola {nombre}! 👋🔥\nGracias por tu interés en nuestro *{equipo}*.',
  plantilla: '🎮 {procesador}\n🚀 {grafica}\n🧠 {ram}\n💾 {disco}\n🌈 {teclado}\n✨ Estado estético {estado_estetico}\n💰 *{precio}*',
  cierre: '¿Te lo separo? Escribe *quiero comprar {codigo}* o pregúntame lo que necesites.',
  varios: 'Tenemos estas opciones de *{modelo}* 👇',
  cierre_varios: '¿Cuál te interesa? Escríbeme su *código*.',
  agotado: '😕 El *{modelo}* no está disponible en este momento.',
  si_agotado: 'parecidos',
  foto: true,
  catalogo: false,
}
export const CONDICION_EQUIPO: Condicion = {
  forma: 'equipo', texto: 'un equipo del inventario', exigir: false, marca: false,
  palabras: ['cuanto', 'vale', 'precio', 'valor', 'info', 'informacion', 'tienen', 'disponible', 'caracteristicas'],
}
export type Paso =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'conocimiento'; categoria: string }
  | { tipo: 'cuentas' }
  | { tipo: 'flujo'; flujo: 'compra' | 'cotizacion' }
  | { tipo: 'bot'; bot_id: number }
  | { tipo: 'etiqueta'; etiqueta: string }
  | { tipo: 'asesor'; texto?: string }
  | PasoFicha
  | PasoCatalogo
  | PasoArchivo

export const FORMAS: { valor: CondicionFrase['forma']; texto: string }[] = [
  { valor: 'contiene', texto: 'contiene' },
  { valor: 'igual', texto: 'es igual a' },
  { valor: 'empieza', texto: 'empieza por' },
]

// Pasos que el receptor ya ejecuta (acciones.py). Flujos: compra (F4·25) y cotización (F4·26).
export const PASOS_LISTOS: Paso['tipo'][] = ['texto', 'conocimiento', 'cuentas', 'bot', 'etiqueta', 'asesor', 'flujo', 'ficha_equipo', 'catalogo', 'archivo']
export const FLUJOS_LISTOS = ['compra', 'cotizacion']
export const pasoListo = (p: Paso) => PASOS_LISTOS.includes(p.tipo) && (p.tipo !== 'flujo' || FLUJOS_LISTOS.includes(p.flujo))

export const PASOS: { tipo: Paso['tipo']; texto: string; ayuda: string }[] = [
  { tipo: 'texto', texto: 'Responder un texto', ayuda: '{nombre} y {horario} se cambian por el nombre del cliente y el horario' },
  { tipo: 'conocimiento', texto: 'Responder con el conocimiento', ayuda: 'Envía las fichas activas de la categoría (texto e imagen o PDF)' },
  { tipo: 'cuentas', texto: 'Enviar las cuentas', ayuda: 'El texto aprobado de Compra (F4·25); sin texto no se envía nada' },
  { tipo: 'flujo', texto: 'Iniciar flujo de compra o cotización', ayuda: 'Compra: equipo → tipo de cliente → total → cuentas → comprobante → asesor. Cotización: nombre, cédula, celular, equipo y cantidad → PDF' },
  { tipo: 'bot', texto: 'Ir a otro bot', ayuda: 'El cliente pasa al inicio de ese bot del lienzo' },
  { tipo: 'etiqueta', texto: 'Poner etiqueta', ayuda: 'Se agrega a las etiquetas del cliente' },
  { tipo: 'asesor', texto: 'Pasar a asesor', ayuda: 'Pausa el bot y deja el chat en la cola de la Bandeja (con el aviso de horario)' },
  { tipo: 'catalogo', texto: 'Enviar catálogo', ayuda: 'Un catálogo de Inventario → Catálogos: PDF como documento o Drive como enlace. «El de la marca» usa el equipo que nombró el cliente o el último que vio' },
  { tipo: 'archivo', texto: 'Enviar archivo (PDF o imagen)', ayuda: 'Ficha técnica, promoción… PDF hasta 16 MB o imagen JPG, PNG o WEBP hasta 5 MB. {nombre} en el texto es el nombre del cliente' },
  { tipo: 'ficha_equipo', texto: 'Responder la ficha del equipo', ayuda: 'El equipo que nombró el cliente: un equipo, su ficha con la plantilla; varios, la lista de Avi; agotado, el aviso. Precios de la base' },
]

export function pasoVacio(tipo: Paso['tipo']): Paso {
  switch (tipo) {
    case 'texto': return { tipo, texto: '' }
    case 'conocimiento': return { tipo, categoria: '' }
    case 'flujo': return { tipo, flujo: 'compra' }
    case 'bot': return { tipo, bot_id: 0 }
    case 'etiqueta': return { tipo, etiqueta: '' }
    case 'asesor': return { tipo }
    case 'ficha_equipo': return { ...FICHA_INICIAL }
    case 'catalogo': return { tipo, modo: 'marca', texto: 'Te envío el catálogo de {marca} 📚' }
    case 'archivo': return { tipo, archivo: '', nombre: '', texto: '' }
    default: return { tipo: 'cuentas' }
  }
}

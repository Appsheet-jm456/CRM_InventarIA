// Filtros de la lista de leads (F4·30 C). Viven en la dirección (?q=…&estado=…) para que se puedan compartir y volver atrás,
// y se pasan tal cual a leads_lista (0033), que valida todo en la base.
export type Filtros = {
  q?: string
  estado?: 'activos' | 'ganados' | 'perdidos' | 'archivados' | 'papelera' | 'todos'
  embudo?: string
  etapa?: string
  responsable?: string // 'sin' | uuid
  etiqueta?: string
  vencidas?: 'true'
  fecha_campo?: 'contacto' | 'creado'
  desde?: string
  hasta?: string
  atributo?: string
  valor_atributo?: string
  orden?: 'contacto' | 'creado' | 'nombre' | 'valor'
  dir?: 'asc' | 'desc'
  pagina?: string
  tamano?: string
}

export const CLAVES_FILTRO: (keyof Filtros)[] = ['q', 'estado', 'embudo', 'etapa', 'responsable', 'etiqueta', 'vencidas', 'fecha_campo',
  'desde', 'hasta', 'atributo', 'valor_atributo', 'orden', 'dir', 'pagina', 'tamano']

export function leerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const f: Record<string, string> = {}
  for (const k of CLAVES_FILTRO) {
    const v = sp[k]
    const texto = Array.isArray(v) ? v[0] : v
    if (texto && texto.trim()) f[k] = texto.trim().slice(0, 200)
  }
  return f as Filtros
}

export const ESTADOS: [NonNullable<Filtros['estado']>, string][] = [
  ['activos', 'Activos'], ['ganados', 'Ganados'], ['perdidos', 'Perdidos'], ['archivados', 'Archivados'], ['papelera', 'Papelera'], ['todos', 'Todos'],
]

export type Fila = {
  id: number
  nombre: string | null
  telefono: string
  etapa_bot: string
  etiquetas: string[]
  valor: number | null
  ultimo_mensaje: string | null
  ultimo_contacto: string | null
  creado: string
  origen: string
  atributos: Record<string, unknown>
  asignado_a: string | null
  responsable: string | null
  estado_chat: string
  producto: string
  archivado: string | null
  eliminado: string | null
  oportunidad: { id: number; embudo: string; etapa: string; estado: string; color: string } | null
  vencidas: number
}

export type Pagina = { total: number; valor: number; pagina: number; tamano: number; filas: Fila[] }

// Columnas que el usuario elige ver (las de atributos van como «a:<clave>»)
export const COLUMNAS: [string, string][] = [
  ['telefono', 'Teléfono'], ['oportunidad', 'Embudo y etapa'], ['responsable', 'Responsable'], ['etiquetas', 'Etiquetas'],
  ['valor', 'Valor'], ['ultimo_mensaje', 'Último mensaje'], ['ultimo_contacto', 'Último contacto'], ['creado', 'Creado'],
  ['origen', 'Origen'], ['producto', 'Equipo de interés'], ['tareas', 'Tareas vencidas'],
]
export const COLUMNAS_INICIALES = ['telefono', 'oportunidad', 'responsable', 'etiquetas', 'valor', 'ultimo_contacto']

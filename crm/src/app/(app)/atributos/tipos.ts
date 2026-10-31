// Tipos de atributo del lead (0032, docs/LEADS.md §4). La base valida los mismos valores.
export type TipoAtributo = 'texto' | 'texto_largo' | 'numero' | 'moneda' | 'fecha' | 'lista' | 'multiseleccion' | 'si_no'
  | 'telefono' | 'correo' | 'direccion' | 'enlace'

export const TIPOS: { id: TipoAtributo; nombre: string; ejemplo: string }[] = [
  { id: 'texto', nombre: 'Texto', ejemplo: 'Número de serie, cédula' },
  { id: 'texto_largo', nombre: 'Texto largo', ejemplo: 'Observaciones' },
  { id: 'numero', nombre: 'Número', ejemplo: 'Cantidad de equipos' },
  { id: 'moneda', nombre: 'Moneda (COP)', ejemplo: 'Cupo de crédito' },
  { id: 'fecha', nombre: 'Fecha', ejemplo: 'Fecha de contrato' },
  { id: 'lista', nombre: 'Lista (una opción)', ejemplo: 'Método de pago' },
  { id: 'multiseleccion', nombre: 'Lista (varias opciones)', ejemplo: 'Accesorios que quiere' },
  { id: 'si_no', nombre: 'Sí / No', ejemplo: '¿Ya compró antes?' },
  { id: 'telefono', nombre: 'Teléfono', ejemplo: 'Teléfono de la oficina' },
  { id: 'correo', nombre: 'Correo', ejemplo: 'Correo para la factura' },
  { id: 'direccion', nombre: 'Dirección', ejemplo: 'Dirección de entrega' },
  { id: 'enlace', nombre: 'Enlace', ejemplo: 'Página web del distribuidor' },
]

export const nombreTipo = (t: string) => TIPOS.find((x) => x.id === t)?.nombre ?? t

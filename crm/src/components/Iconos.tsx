const TRAZOS = {
  inicio: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  bandeja: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/>',
  embudo: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
  seguimientos: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 15l2.5 2.5L16 13"/>',
  inventario: '<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M1.5 19h21M9 9h6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  metricas: '<path d="M4 4v16h16"/><path d="m7 15 4-5 3 3 5-6"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4.5M9 13h.01M15 13h.01M9.5 16h5"/><circle cx="12" cy="4" r="1"/>',
  etapas: '<path d="M4 6h10M4 12h13M4 18h7"/><path d="m18 5 3 3-3 3"/>',
  respuestas: '<path d="M4 5h16v11H9l-5 4z"/><path d="m11 8-2 3h4l-2 3"/>',
  canal: '<path d="M5 19.5 6.2 16A8 8 0 1 1 9 18.8z"/><path d="M9.5 9c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z"/>',
  llave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M14 9l2 2"/>',
  usuarios: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.9-3.6 3.7-5.6 7-5.6s6.1 2 7 5.6"/>',
  roles: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2.5"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  salir: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
} as const

export type ClaveIcono = keyof typeof TRAZOS

export function Icono({ nombre }: { nombre: ClaveIcono }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: TRAZOS[nombre] }}
    />
  )
}

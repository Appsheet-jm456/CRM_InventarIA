import type { ClaveIcono } from '@/components/Iconos'

export type Modulo = {
  clave: string
  titulo: string
  subtitulo: string
  grupo: string | null
  ruta: string
  icono: ClaveIcono
  // Basta uno. Vacío: cualquier usuario activo. Esconder el módulo es comodidad: quien protege
  // es la base (RU-07, decisión 0018).
  permisos: readonly string[]
  // Paso de la Fase 3 que lo construye; sin paso, ya está hecho.
  paso?: string
}

export const MODULOS: readonly Modulo[] = [
  { clave: 'inicio', titulo: 'Inicio', subtitulo: 'Resumen del día', grupo: null, ruta: '/', icono: 'inicio', permisos: [] },

  { clave: 'bandeja', titulo: 'Bandeja', subtitulo: 'Conversaciones de WhatsApp', grupo: 'Atención', ruta: '/bandeja', icono: 'bandeja', permisos: ['atender_bandeja'] },
  { clave: 'embudo', titulo: 'Embudo', subtitulo: 'Oportunidades por etapa', grupo: 'Atención', ruta: '/embudo', icono: 'embudo', permisos: ['gestionar_oportunidades'] },
  { clave: 'seguimientos', titulo: 'Seguimientos', subtitulo: 'Seguimientos y SLA', grupo: 'Atención', ruta: '/seguimientos', icono: 'seguimientos', permisos: ['gestionar_oportunidades'] },

  { clave: 'inventario', titulo: 'Inventario', subtitulo: 'Portátiles, fichas y catálogos', grupo: 'Ventas', ruta: '/inventario', icono: 'inventario', permisos: [] },
  { clave: 'chat', titulo: 'Chat InventarIA', subtitulo: 'Pregúntale al inventario', grupo: 'Ventas', ruta: '/chat', icono: 'chat', permisos: [] },

  { clave: 'metricas', titulo: 'Métricas', subtitulo: 'Embudo, tiempos y asesores', grupo: 'Análisis', ruta: '/metricas', icono: 'metricas', permisos: ['ver_metricas', 'atender_bandeja'] },

  { clave: 'bot', titulo: 'Bot y horario', subtitulo: 'Árbol del bot y horario de atención', grupo: 'Configuración', ruta: '/bot', icono: 'bot', permisos: ['administrar_bot'] },
  { clave: 'etapas', titulo: 'Etapas', subtitulo: 'Etapas del embudo y motivos de pérdida', grupo: 'Configuración', ruta: '/etapas', icono: 'etapas', permisos: ['administrar_embudo'] },
  { clave: 'respuestas-rapidas', titulo: 'Respuestas rápidas', subtitulo: 'Atajos de texto del equipo', grupo: 'Configuración', ruta: '/respuestas-rapidas', icono: 'respuestas', permisos: ['administrar_bot'] },
  { clave: 'canal', titulo: 'Canal WhatsApp', subtitulo: 'Plantillas de Meta', grupo: 'Configuración', ruta: '/canal', icono: 'canal', permisos: ['administrar_canal'] },
  { clave: 'usuarios', titulo: 'Usuarios', subtitulo: 'Usuarios', grupo: 'Configuración', ruta: '/usuarios', icono: 'usuarios', permisos: ['administrar_usuarios'] },
  { clave: 'roles', titulo: 'Roles y permisos', subtitulo: 'Roles y permisos', grupo: 'Configuración', ruta: '/roles', icono: 'roles', permisos: ['administrar_usuarios'] },
]

export function moduloPorRuta(ruta: string) {
  return MODULOS.find((m) => m.ruta === ruta)
}

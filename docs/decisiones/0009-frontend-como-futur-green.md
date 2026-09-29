# 0009 · Frontend con la arquitectura de Futur Green

**Estado:** Aceptada · 29 sep 2026

## Contexto

La v0 es una sola página (`app/page.js`) con botones arriba (Dashboard, Chat InventarIA,
Acciones y CRM) que cambian de pestaña en el cliente. No hay rutas ni permisos por módulo, y
cada módulo nuevo agranda la misma página. Futur Green ya resolvió esto y el dueño quiere el
mismo diseño.

## Decisión

La app nueva copia la arquitectura de frontend de Futur Green:

- **Next.js 14 App Router con TypeScript**, una **ruta por módulo** bajo `src/app/(app)/` y un
  `layout.tsx` que valida la sesión y filtra los módulos por permiso.
- **Panel lateral a la izquierda, plegable** (componente `Shell`): logo y nombre arriba,
  módulos agrupados con icono, usuario y botón de salir abajo. El botón del encabezado lo pliega
  y lo despliega, y la preferencia queda guardada en el navegador. En el celular se abre como
  cajón con fondo oscuro.
- **Lista de módulos en un solo archivo** (`src/lib/modulos.ts`): clave, título, grupo, ruta,
  icono, permisos y el paso de la Fase 3 que lo construye.
- Iconos (`Iconos.tsx`), `MenuAcciones` en las filas y el mismo sistema de estilos claro/oscuro.

Módulos iniciales del panel:

| Grupo | Módulos |
|---|---|
| — | Inicio (resumen del día) |
| Atención | Bandeja · Embudo · Seguimientos |
| Ventas | Inventario · Chat InventarIA |
| Análisis | Métricas |
| Configuración | Bot y horario · Etapas · Respuestas rápidas · Usuarios y roles · Canal WhatsApp |

## Consecuencias

- Esconder un módulo es comodidad: quien protege es la base (RLS), como en Futur Green.
- La v0 no se toca. El panel nace con la app nueva (decisión 0008).

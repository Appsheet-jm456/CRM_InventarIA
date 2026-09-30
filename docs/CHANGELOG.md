# Changelog del brief

## v1.0 · 30 sep 2026 (F3·8)

- Métricas del embudo en `/metricas` (0024, `docs/METRICAS.md`): conversión por etapa, SLA de primera respuesta por
  atención, motivos de pérdida, sin respuesta, entrega y por asesor. Estados de entrega de Meta guardados y visibles
  en la Bandeja; contador de mensajes de servicio del mes contra los 1.000 gratis con aviso al 80 %.

## v1.0 · 30 sep 2026 (F3·7)

- Editor del bot: textos y títulos de botones desde la app, sin tocar la estructura (0023,
  `docs/BOT-Y-HORARIO.md`). Horario y festivos editables; el bot los lee de la base y, fuera de horario,
  avisa cuándo le responden al pasar a asesor. Respuestas rápidas con `/` en la Bandeja.

## v1.0 · 30 sep 2026 (F2·5 y F2·9)

- Usuarios propios y permisos por rol configurables: administrador y asesor, RLS por permiso (0018,
  `docs/USUARIOS-Y-PERMISOS.md`).
- La app nueva CRM InventarIA vive en `crm/`, corre en el 3020 mientras se construye y pasa al 8096 en
  F3·5 (0017, `docs/ARQUITECTURA-FRONTEND.md`).

## v1.0 · 29 sep 2026 (simulación del chat)

- Prototipo `docs/simulacion/simulacion-chat.html`: chat guiado y chat tipo agente sobre el
  inventario real, documentado en `docs/SIMULACION-CHAT.md`. Aprobado por el dueño.
- Nuevas P-11 y F1·9 (tipo de chat del MVP) y F2·12 (perfeccionar la simulación).

## v1.0 · 29 sep 2026 (F1·1 a F1·3)

- Árbol de respuesta guiado (Salesbot) conectado a la base: `docs/ARBOL-DE-RESPUESTA.md` (0012).
- Cola compartida · SLA 10 min con alerta a los 15 · L–V 8–18, Sáb 9–14, festivos cerrado.
- Se conservan las 7 etapas; rangos de presupuesto según el inventario; catálogo desde la base.
- Nuevas F1·7 (ramas que define el dueño) y F1·8 (uso del equipo en el inventario).

## v1.0 · 29 sep 2026 (ajuste)

- Frontend con la arquitectura de Futur Green: panel lateral plegable y una ruta por módulo (0009).
- Supabase propio confirmado en este servidor (0003).
- **API oficial de Meta** en el MVP y Evolution solo hasta el corte (0010, reemplaza a la 0004).
- Precios de Meta desde el 1 oct 2026: bot de un mensaje con botones y contador de consumo (0011).

## v1.0 · 29 sep 2026

- Arranca el SDLC del **CRM InventarIA** (reconstrucción de la v0 por fases).
- Decisiones 0001–0008: git manda, secretos fuera, Supabase propio, capa de canal, bot de menú
  fijo, embudo que solo avanza, mensajes en la base propia y reconstrucción con la v0 viva.
- Alcance del MVP: bandeja multiasesor, seguimientos/SLA, bot configurable y métricas.
- Página "CRM InventarIA" creada en Notion con Fases (5) y Tareas (31).

# CRM InventarIA — Brief del proyecto

`v1.0` · 29 sep 2026 · **Fase actual: 1 de 5 — Planeación** · Responsable: Jhonatan Marín

---

## Qué es

**CRM de WhatsApp con bot de ventas e inventario** para **Ventas Virtuales Colombia**,
distribuidores al por mayor y al detal de equipos de cómputo, enfocados en portátiles usados.
Corre en el servidor propio del negocio y se usa desde el navegador.

El cliente escribe al WhatsApp del local, un **bot de menú fijo** lo atiende (catálogo, fichas con
fotos y video, cotización) y, cuando pide un asesor, la conversación pasa a una **bandeja
compartida** donde el equipo la toma, la sigue hasta la venta y la mide.

| Módulo | Qué hace | Estado |
|---|---|---|
| **Bandeja multiasesor** | Todas las conversaciones en un lugar, en tiempo real. Se asignan a un asesor, se abren y se cierran, con respuestas rápidas y con audio, imagen y documento | Nuevo |
| **Embudo (kanban)** | Cada contacto con su oportunidad en una etapa: de Nuevo a Vendido o Perdido (con motivo) | Existe (v0), se rehace |
| **Bot de menú fijo** | Árbol de menús **editable desde el panel**, con horario de atención y paso a asesor | Existe (v0, en código), pasa a configurable |
| **Seguimientos y SLA** | Tareas por contacto, recontacto programado y alertas de chats sin respuesta | Nuevo |
| **Métricas** | Conversión por etapa, tiempo de primera respuesta, motivos de pérdida y ventas por asesor | Nuevo |
| **Inventario y catálogo** | Productos con fotos y video, fichas que envía el bot y catálogo en PDF | Existe (v0, Baserow), se migra |
| **Canal WhatsApp oficial** | **Cloud API de Meta** detrás de una interfaz de canal. Evolution solo atiende la v0 hasta el corte | Nuevo (decisión 0010) |
| **Consumo de Meta** | Contador de mensajes cobrables del mes contra los 1.000 gratis, con aviso al 80 % | Nuevo (decisión 0011) |

## Problema que resuelve

La versión actual (v0, jun–jul 2026) funciona, pero se construyó sin plan y no escala:

- **Cada mensaje de un cliente lee todos los leads de Baserow, dos veces.** Cada respuesta del
  bot se vuelve más lenta a medida que el negocio crece.
- **El CRM no es dueño de sus conversaciones.** El historial vive solo en el Postgres de Evolution;
  no se puede medir, buscar ni respaldar desde el CRM. Audios e imágenes del cliente se pierden.
- **Una clave compartida, sin usuarios.** No se sabe quién atendió a quién, no se pueden asignar
  chats y no hay forma de medir a los asesores.
- **El panel sondea cada 5 segundos** y vuelve a traer el chat completo en cada vuelta.
- **Cambiar un menú del bot exige un programador**, y la IP y las rutas están fijas en el código.
- **n8n solo reenvía el webhook**: es un salto más que puede fallar sin aportar lógica.
- **Nada se registra** después de que el cliente pide un asesor: ni tiempos ni seguimientos.
  Los leads se enfrían sin que nadie lo note.

## Objetivo

Que **ningún cliente que escribe se pierda por falta de respuesta o de seguimiento**, y que el
dueño sepa en cualquier momento cuántos llegaron, cuántos compraron, por qué se perdieron y cuánto
tarda el equipo en contestar.

### Metas medibles (se confirman en la Fase 1)

| Meta | Cómo se mide |
|---|---|
| Primera respuesta humana en menos de 15 min en horario de atención | Tiempo entre el paso a asesor y el primer mensaje del asesor |
| Cero chats sin respuesta al cierre del día | Conversaciones abiertas con el último mensaje del cliente |
| Cada oportunidad perdida con motivo | % de oportunidades en Perdido sin motivo = 0 |
| El bot responde en menos de 2 s | Tiempo del webhook hasta el envío |

## Usuarios

| Usuario | Qué hace |
|---|---|
| **Dueño / administrador** | Configura etapas, bot, horario y usuarios; ve métricas de todo |
| **Asesor** | Atiende la bandeja, mueve oportunidades y agenda seguimientos; ve lo suyo y lo sin asignar |
| **Cliente de WhatsApp** | Habla con el bot y luego con un asesor; nunca entra a la app |

## Alcance del MVP

Todo lo de la tabla de módulos, sobre **una sola base de datos Supabase propia** (decisión 0003).

**Fuera de alcance en v1:** IA libre respondiendo a clientes (decisión 0005), otros canales
(Instagram, Messenger), campañas masivas, facturación electrónica y pagos en línea.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Evolution usa Baileys (no oficial): Meta puede **bloquear el número** | La app nueva nace sobre la Cloud API (decisión 0010). Los trámites de Meta arrancan ya: [PLAN-META-API.md](PLAN-META-API.md) |
| **Desde el 1 oct 2026 Meta cobra los mensajes de servicio** después de 1.000 al mes por número | Bot de un mensaje por respuesta con botones, contador de consumo y medio de pago en el Billing Hub (decisión 0011) |
| La verificación del negocio en Meta tarda días o semanas | Se empieza en la Fase 1, en paralelo al diseño |
| La Cloud API de Meta solo deja escribir libremente **24 h** después del último mensaje del cliente | Los seguimientos fuera de la ventana usan plantillas aprobadas; se diseñan desde la Fase 2 |
| Conversaciones y fotos son **datos personales** | Bucket privado, acceso por rol y nada en git |
| La reconstrucción deja al local sin bot unos días | La v0 sigue viva en el puerto 3000 hasta el corte (decisión 0008) |
| El webhook de Meta necesita HTTPS público y el servidor está en la red local | Túnel de Cloudflare con dominio propio (decisión 0010) |
| Migrar desde Baserow pierde datos | Script de migración con conteo antes y después, probado en copia |

## Fases

| Fase | Estado | Documento |
|---|---|---|
| 1 · Planeación | 🔵 En curso | [sdlc/1-planeacion.md](sdlc/1-planeacion.md) |
| 2 · Diseño | ⚪ Pendiente | [sdlc/2-diseno.md](sdlc/2-diseno.md) |
| 3 · Implementación | ⚪ Pendiente | [sdlc/3-implementacion.md](sdlc/3-implementacion.md) |
| 4 · Pruebas | ⚪ Pendiente | [sdlc/4-pruebas.md](sdlc/4-pruebas.md) |
| 5 · Despliegue | ⚪ Pendiente | [sdlc/5-despliegue.md](sdlc/5-despliegue.md) |

## Stack

- **Frontend:** Next.js 14 App Router con TypeScript y la **misma arquitectura de Futur Green**:
  una ruta por módulo y **panel lateral izquierdo plegable** con los módulos agrupados
  (decisión 0009). Reemplaza los botones de arriba de la v0 (Dashboard, Chat InventarIA y CRM).
- **Backend:** **Supabase propio en este servidor** (Postgres, Auth, Realtime y Storage), en
  Docker y separado de Futur Green (decisión 0003).
- **Canal:** **WhatsApp Cloud API de Meta** (oficial) detrás de una interfaz de canal, con el
  webhook directo a la app por un túnel de Cloudflare. Sin n8n en el camino del mensaje
  (decisión 0010).

## Referencias

- Brief de la v0: [BRIEF.md](BRIEF.md). Describe lo construido en jun–jul 2026 y es la base de
  lo que se reutiliza.
- Migración a Meta: [PLAN-META-API.md](PLAN-META-API.md).
- Decisiones: [decisiones/](decisiones/).

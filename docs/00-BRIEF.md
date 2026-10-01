# CRM InventarIA — Brief del proyecto

`v1.2` · 30 sep 2026 · **Fase actual: 3 de 5 construida; en Pruebas (Fase 4) con el dueño** · Responsable: Jhonatan Marín

---

## Qué es

**CRM de WhatsApp con bot de ventas e inventario** para **Ventas Virtuales Colombia** (local **Tech Ventas Virtuales**),
distribuidores al por mayor y al detal de equipos de cómputo, enfocados en portátiles usados.
Corre en el servidor propio del negocio y se usa desde el navegador.

El cliente escribe al WhatsApp del local y un **bot guiado** lo atiende (catálogo, fichas con fotos y video,
cotización): lo lleva por cada flujo para saber qué busca e **identificar clientes potenciales**, con el fin de
**aumentar la tasa de conversión**, que es la razón de ser de la atención al cliente. El bot está conectado
al **inventario actual**: envía la lista de productos disponibles y, si el cliente pregunta por un código, responde
al instante el nombre, las especificaciones, el precio y la disponibilidad. Es un modelo **híbrido**: guiado por
menús y, cuando el cliente escribe libremente, la IA entiende lo que pide; **la respuesta siempre sale de la base**
(decisión 0016), nunca de la IA.

Cuando el cliente pide un asesor, la conversación pasa a una **bandeja compartida** donde el equipo la toma,
la sigue por las etapas del embudo hasta la venta y la posventa, y la mide.

| Módulo | Qué hace | Estado |
|---|---|---|
| **Bandeja multiasesor** | Todas las conversaciones en un lugar, en tiempo real; asignar, tomar, cerrar, respuestas rápidas, audio, imagen y documento | ✅ Construido (F3·5) |
| **Embudos (kanban)** | Cliente Final, Pos Venta y Distribuidor, cada uno con sus etapas hasta Vendido o Perdido (con motivo) | ✅ Construido (F3·5, F3·10) |
| **Bot y horario** | Guía al cliente por menús; responde fichas, precios y stock desde la base; flujo editable en un lienzo, con borrador, versiones y simulador — [FLUJO-DEL-BOT.md](FLUJO-DEL-BOT.md) | ✅ Construido (F3·7, F4·4–8) |
| **Seguimientos y SLA** | Notas, tareas, etiquetas y recontacto por cliente; alertas de chats sin respuesta | ✅ Construido (F3·6) |
| **Métricas** | Conversión por etapa, tiempo de primera respuesta, motivos de pérdida y ventas por asesor | ✅ Construido (F3·8) |
| **Inventario y catálogos** | Productos con foto, fichas que envía el bot, catálogos en PDF o enlace de Drive, carga por Excel y Chat InventarIA para el equipo | ✅ Construido (F3·9); faltan fotos y PDF del dueño |
| **Canal WhatsApp oficial** | **Cloud API de Meta** detrás de una interfaz de canal | 🔵 Probado con número de prueba; falta verificar el negocio |
| **Consumo de Meta** | Contador de mensajes cobrables del mes contra los 1.000 gratis, con aviso al 80 % | ✅ Construido (sin pesos hasta F1·6) |
| **Campañas de marketing** | Promociones de la tienda por plantillas autorizadas por Meta | ⚪ Por definir (ver objetivos) |

## Problema que resuelve

**Lo que pasa hoy en el local:**

- **Demora en la atención.** Los clientes reciben respuesta entre **1 y 3 horas**; se desaniman o consultan a la competencia.
- **Los catálogos se envían a mano.** El asesor debe mandar el PDF cada vez que alguien lo pide, una tarea operativa que le quita tiempo.
- **No se sabe si hay disponibilidad.** Cuando el cliente pregunta por una referencia, el asesor tarda porque no sabe si el equipo está.
- **Pérdidas de ventas.** Por una atención deficiente los clientes se van a la competencia o se llevan una mala imagen del local.

**Cómo lo soluciona el CRM:**

- **Respuesta inmediata**, con un chat guiado por flujo o de forma agéntica con IA (modelo híbrido): el tiempo de respuesta baja al mínimo o a nada.
- **Clientes potenciales identificados.** El asesor valida los que quieren cerrar la venta y la app le permite dejar nota, tarea, etiqueta y seguimiento, para un control efectivo.
- **Cierre guiado y supervisado.** La automatización lleva a los clientes hacia el cierre y todos los flujos quedan bajo control del asesor, pasando por todas las etapas del embudo hasta el cierre y la posventa.
- **Una sola interfaz** para todos los leads y clientes que preguntan, con mejor control de cada uno.

## Objetivos

1. **Aumentar entre 10 % y 20 % las ventas del local** mediante una mayor tasa de cierre.
2. **Reducir al mínimo el tiempo de contestación**, con mejor atención: resolver dudas y enviar la lista de productos de forma rápida.
3. **Enviar los catálogos de forma rápida a los distribuidores**, para que reciban las ofertas del local y generen ventas bajo el modelo de reventa.
4. **Realizar campañas de marketing autorizadas por Meta** para enviar las promociones de la tienda.

### Metas medibles (confirmadas el 29 sep 2026)

| Meta | Cómo se mide |
|---|---|
| Primera respuesta humana en **10 min** (alerta a los 15) en horario de atención | Tiempo entre el paso a asesor y el primer mensaje del asesor |
| Cero chats sin respuesta al cierre del día | Conversaciones abiertas con el último mensaje del cliente |
| Cada oportunidad perdida con motivo | % de oportunidades en Perdido sin motivo = 0 |
| El bot responde en menos de 2 s | Tiempo del webhook hasta el envío |
| Ventas del local **+10 % a +20 %** | Por fijar: línea base de ventas y periodo de comparación |

## Usuarios

| Usuario | Qué hace |
|---|---|
| **Dueño / administrador** | Configura etapas, bot, horario y usuarios; ve métricas de todo |
| **Asesor** | Atiende la bandeja, mueve oportunidades y agenda seguimientos; ve lo suyo y lo sin asignar |
| **Distribuidor** | Recibe catálogos y ofertas del local por WhatsApp; tiene su propio embudo |
| **Cliente de WhatsApp** | Habla con el bot y luego con un asesor; nunca entra a la app |

## Alcance del MVP

Todo lo de la tabla de módulos, sobre **una sola base de datos Supabase propia** (decisión 0003).

**Modelo de chat híbrido confirmado por el dueño el 1 oct 2026** (decisión 0016, que modifica la 0005): menús guiados más
texto libre con IA, y la respuesta siempre sale de la base.

**Por decidir con el dueño:** si las campañas de marketing por Meta entran al MVP o a una v2.

**Fuera de alcance en v1:** otros canales (Instagram, Messenger), facturación electrónica y pagos en línea.

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
| 1 · Planeación | 🔵 Pendientes del dueño (F1·6 a F1·9) | [sdlc/1-planeacion.md](sdlc/1-planeacion.md) |
| 2 · Diseño | 🔵 En curso | [sdlc/2-diseno.md](sdlc/2-diseno.md) |
| 3 · Implementación | ✅ Construida (F3·1 a F3·10); falta revisar el criterio de cierre | [sdlc/3-implementacion.md](sdlc/3-implementacion.md) |
| 4 · Pruebas | 🔵 En curso: mejoras módulo por módulo (Bot y horario completo) | [sdlc/4-pruebas.md](sdlc/4-pruebas.md) |
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

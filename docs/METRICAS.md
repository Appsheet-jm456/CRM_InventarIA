# Métricas del embudo y consumo de Meta (F3·8)

> Decisión 0024. Mide las metas del brief (primera respuesta en 10 min hábiles, cero chats sin respuesta,
> toda pérdida con motivo) y el consumo de Meta de la decisión 0011. Se apoya en `historial_etapas` y
> `oportunidades` (0020, 0022) y en `minutos_habiles` (0021).

---

## Reglas

**RM-01 · Período y embudo.** `/metricas` abre en el mes actual (hora de Colombia) y deja elegir hoy, esta
semana, este mes, el mes anterior o un rango, y un embudo o todos.

**RM-02 · Quién ve qué.** Con `ver_metricas`, todo el equipo y la tabla por asesor. Con solo
`atender_bandeja`, lo suyo: las atenciones que tomó y las oportunidades que tiene o cerró.

**RM-03 · Una atención es cada paso a la cola.** Empieza cuando el cliente pide asesor (o alguien toma la
conversación) y su primera respuesta es el primer mensaje de un asesor. La espera se mide en minutos hábiles
(RS-04); cumple el SLA si responde en 10 o menos.

**RM-04 · Conversión por etapa.** De las oportunidades abiertas en el período, cuántas llegaron a cada etapa
o más allá (por orden, sin contar la de perdida), y qué parte se ganó.

**RM-05 · Resultado del período.** Oportunidades ganadas y perdidas **cerradas** en el período, con el valor
ganado y los motivos de pérdida; el % perdidas sin motivo debe ser 0.

**RM-06 · Sin respuesta ahora.** Conversaciones en cola o asignadas cuyo último mensaje es del cliente. Es el
estado de este momento, no del período.

**RM-07 · Estados de entrega.** Cada mensaje saliente guarda el último estado de Meta: enviado → entregado →
leído, o fallido con su error. Un estado nunca retrocede (un "entregado" tardío no pisa un "leído").

**RM-08 · Consumo de Meta.** Del mes calendario: mensajes salientes de categoría servicio contra los 1.000
gratis, cuántos fueron cobrables (según Meta, por categoría) y aviso al 80 %. Sin pesos hasta F1·6.

## Modelo (migración 0008)

| Tabla / función | Para qué |
|---|---|
| `atenciones` | Cliente, cuándo entró a la cola, asesor, primera respuesta y minutos hábiles de espera. La llenan triggers sobre `leads` |
| `estados_meta` | Cada estado recibido de Meta (wamid, estado, categoría, cobrable, tipo de precio, error, hora). Solo el servidor |
| `mensajes` + columnas | `estado_entrega`, `categoria_meta`, `cobrable`, `error_meta`, `entregado_en`, `leido_en` |
| `registrar_estado_meta(...)` | La llama el receptor por cada estado: lo guarda y lo aplica al mensaje (RM-07) |
| `metricas(desde, hasta, embudo)` | Todo el tablero en un JSON, con el alcance de RM-02 |
| `consumo_meta(mes)` | El contador de RM-08, solo con `ver_metricas` |

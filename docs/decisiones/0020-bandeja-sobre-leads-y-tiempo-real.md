# 0020 · La Bandeja amplía `leads` y se actualiza con Supabase Realtime

**Estado:** Aceptada · 30 sep 2026 · Diseño de F3·5

## Contexto

F3·5 necesita saber quién atiende cada conversación y en qué estado está. El borrador de F2·2 separaba
contactos, conversaciones y oportunidades, pero el bot que ya funciona guarda todo en `leads` (una fila por
teléfono). La Bandeja además debe mostrar los mensajes al instante.

## Decisión

- **Se amplía `leads`** con `estado_chat`, `asignado_a`, `en_cola_desde` y `primera_respuesta_en`, y
  `mensajes` con quién lo envió y la media. Una tabla nueva, `historial_etapas`. Separar contactos y
  oportunidades queda para cuando haga falta.
- **La base deriva el estado** a partir de lo que ya escribe el bot (`pausar_bot`): el bot no cambia.
- **Las acciones del asesor son funciones de la base** que verifican el permiso, no escrituras directas.
- **Tiempo real con Supabase Realtime** desde el navegador, con la sesión del asesor y su RLS.
- Los huecos de F3·3 y F3·4 se reparten: media del cliente en F3·5; categoría, cobro y estados de entrega en
  F3·8; `bot_nodos` y fuera de horario en F3·7 (dueño, 30 sep 2026).

Detalle en [BANDEJA-Y-EMBUDO.md](../BANDEJA-Y-EMBUDO.md).

## Consecuencias

- El navegador necesita llegar a la API de Supabase (puerto 8020) por la red local o Tailscale.
- Un cliente sigue siendo una sola oportunidad a la vez; una segunda compra reutiliza su fila.

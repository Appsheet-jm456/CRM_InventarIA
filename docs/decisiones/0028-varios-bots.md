# 0028 · Varios bots, cada uno con su lienzo, y formas de arrancarlos

**Estado:** Aceptada · 1 oct 2026 (ajustada el mismo día: el asesor tiene la última palabra) · Amplía la 0026 (un solo flujo) · Diseño de F4·9 y F4·14

## Contexto

La 0026 dejó un único flujo del bot, con una sola versión publicada y un solo borrador. El dueño quiere trabajar
como en los Salesbots de Kommo: **varios bots**, cada uno con su lienzo, que se puedan conectar entre sí. Además, la
pantalla del lienzo queda apretada dentro de la pestaña.

## Decisión (dueño, 1 oct 2026)

- **Configuración → Bot y horario → Flujo muestra la lista de bots**, no un lienzo. Se crean, renombran, duplican y
  archivan; cada uno se abre en su propio lienzo, con borrador, versiones, historial y simulador.
- **Un bot es el principal:** atiende el primer mensaje de cada cliente. El bot actual pasa a serlo.
- **Un bot arranca de cuatro formas:**
  1. es el principal;
  2. el cuadro **"Ir a otro bot"** de otro lienzo;
  3. **palabra clave**: el cliente nuevo, o en el inicio del principal, escribe una de sus palabras;
  4. **etapa del embudo**: una oportunidad entra a la etapa elegida (por ejemplo, Despachado arranca el bot de posventa).
- El asesor **no** lanza bots desde la Bandeja (no se eligió).
- **El asesor tiene la última palabra y el bot no se apaga.** Mover una oportunidad de etapa es la orden: el bot
  arranca aunque el chat esté con un asesor, que sabe en qué punto está el cliente. El chat sigue asignado al
  asesor; el bot lleva al cliente por los pasos y atiende sus respuestas dentro de su flujo, y el asesor ve todo y
  puede escribir cuando quiera. Si el cliente pide un asesor (`9`), el bot se calla, como hoy. Objetivo: que el bot
  lleve al cliente por todos los pasos **con la guía del asesor**.
- **Primer uso: la posventa de la entrega.** Cuando se despacha el pedido, se envía por transportadora y llega
  satisfactoriamente. Esas etapas se agregan a **Cliente Final** después de Vendido: **Despachado → En transportadora →
  Entregado**. Las tres son «ganada» como Vendido, para que la venta se cuente una sola vez y las Métricas no cambien. El embudo Pos Venta sigue siendo soporte técnico y garantías.
- Se hace **antes** que los cuadros de la 0027, porque cambia la base del flujo: varios bots es F4·9 y los cuadros
  pasan a F4·10 a F4·13; los arranques por palabra y por etapa son F4·14.

## Consecuencias

- `bot_flujos` cuelga de una tabla `bots`; "una sola publicada" y "un solo borrador" pasan a ser por bot.
- El cliente guarda en qué bot va (`leads.bot_id`, desde F4·10), además del cuadro. "hola", "menú" y `0` vuelven siempre al principal.
- El arranque por etapa **envía un mensaje sin que el cliente escriba** y cuenta en el consumo (0011). Lo atiende el
  mismo reloj de la Pausa (0027).
- **Ventana de 24 h de Meta:** el despacho suele ocurrir días después del último mensaje del cliente. Pasadas las 24 h
  el bot **no puede enviar texto libre**: el arranque por etapa usa una **plantilla aprobada** de Meta (utilidad: aviso
  de despacho o entrega) elegida en el bot. Sin plantilla o sin aprobar, no se envía y queda registrado. La
  plantilla se redacta y aprueba como las de F3·6 (decisión 0021) y cuenta en el consumo (0011).
- Cuando el cliente responde a la plantilla, se abre la ventana de 24 h y el bot sigue su flujo con texto normal.
- Migraciones `0015` (bots) y `0016` (+ Agregar e Ir a otro bot); las de F4·11 a F4·14 llevan las siguientes; el detalle está en [FLUJO-DEL-BOT.md](../FLUJO-DEL-BOT.md).

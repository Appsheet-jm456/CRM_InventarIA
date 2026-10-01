# 0028 · Varios bots, cada uno con su lienzo, y formas de arrancarlos

**Estado:** Aceptada · 1 oct 2026 · Amplía la 0026 (un solo flujo) · Diseño de F4·9 y F4·14

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
  4. **etapa del embudo**: una oportunidad entra a la etapa elegida (por ejemplo, Vendido arranca un bot de posventa).
- El asesor **no** lanza bots desde la Bandeja (no se eligió).
- Se hace **antes** que los cuadros de la 0027, porque cambia la base del flujo: varios bots es F4·9 y los cuadros
  pasan a F4·10 a F4·13; los arranques por palabra y por etapa son F4·14.

## Consecuencias

- `bot_flujos` cuelga de una tabla `bots`; "una sola publicada" y "un solo borrador" pasan a ser por bot.
- El cliente guarda en qué bot va, además del cuadro. "hola", "menú" y `0` vuelven siempre al principal.
- El arranque por etapa **envía un mensaje sin que el cliente escriba**: solo dentro de las 24 h de Meta (0011), nunca
  con el chat en manos de un asesor, y cuenta en el consumo. Lo atiende el mismo reloj de la Pausa (0027).
- **Supuesto a confirmar:** si el chat está con un asesor, el bot por etapa no arranca (queda registrado). La otra
  opción sería devolver el chat al bot.
- Migraciones `0015` (bots) y `0017` (arranques); el detalle está en [FLUJO-DEL-BOT.md](../FLUJO-DEL-BOT.md).

# 0034 · Interruptores del bot y cuadro Agente en el lienzo

**Estado:** Aceptada por el dueño el 1 nov 2026 («sí procede, me parece») · Diseño de F4·35 · Detalle en [FLUJO-DEL-BOT.md](../FLUJO-DEL-BOT.md#interruptores-del-bot-y-cuadro-agente-f435) · Modifica RAG-14 y RAG-15 de la [0032](0032-modulo-agente.md)

## Contexto

Hoy el agente Avi se elige **por bot completo** (`bots.modo`: Menú guiado, Híbrido o Agente) y no hay forma de apagar toda la
automatización: el bot solo se calla chat por chat, cuando un asesor toma la conversación. El dueño quiere decidir en el lienzo **en qué punto**
entra Avi (bot guiado + agente + asesor dibujado con flechas) y tener un **sí o no** general del chatbot.

## Decisión

- **Tres interruptores** en Configuración → Bot → Interruptores, de mayor a menor: **Chatbot** (todo lo automático), **Menú guiado** (los bots del
  lienzo) y **Avi en texto libre en todo el bot**. Apagar el Chatbot manda cada mensaje a la cola de la Bandeja; opcionalmente el cliente recibe un
  mensaje fijo, una vez por conversación.
- **Cuadro 🤖 Agente** en el lienzo: Avi atiende desde ese punto con una instrucción propia, herramientas permitidas y un límite de vueltas, y sale
  por flechas (*Inició compra*, *Pidió asesor o no avanza*, *Volvió al menú*, *Error del cerebro*).
- El **modo por bot se retira**: lo reemplazan el interruptor 3 (Avi en todo) y el cuadro 🤖. El bot que hoy está en modo Agente queda con «Avi
  en todo» encendido, para no cambiar lo que el dueño ve.
- Sigue la 0016: los precios y datos salen de la base y Avi los verifica antes de enviarlos (RAG-02).

## Alternativas descartadas

- **Mantener el modo por bot y sumar el cuadro:** dos formas de decir lo mismo; confunde saber quién responde.
- **Apagar el bot chat por chat (como hoy) en vez de un interruptor general:** no sirve para un día sin bot, una falla o una revisión.
- **Encendido por horario** (chatbot solo fuera de horario): útil, pero queda para después; el horario ya existe y se puede sumar sin cambiar esto.

## Consecuencias

- `bots.modo` deja de leerse (se conserva la columna hasta confirmar). Las pruebas que lo usan se ajustan.
- La Bandeja y el panel lateral muestran «🤖 Chatbot apagado» mientras lo esté.
- El costo de IA se gasta solo donde hay cuadros 🤖 o con «Avi en todo» encendido.

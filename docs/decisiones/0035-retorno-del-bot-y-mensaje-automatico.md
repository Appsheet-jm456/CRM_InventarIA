# 0035 · Retorno del bot tras el asesor y mensaje automático «¿Sigues necesitando ayuda?»

**Estado:** Aceptada por el dueño el 6 nov 2026 («Sí, documéntala») · Diseño de F4·45 · Detalle en
[SEGUIMIENTOS-Y-SLA.md](../SEGUIMIENTOS-Y-SLA.md#retorno-del-bot-y-seguimiento-automático-f445) · **Modifica RS-01** de la
[0021](0021-seguimientos-recuerdan-y-sla-habil.md) · Origen: mejora 1 de [MEJORAS-FLUJO.md](../MEJORAS-FLUJO.md)

## Contexto

El 30 sep 2026 el dueño decidió que un seguimiento solo recuerda a una persona y que **ningún mensaje sale solo hacia el cliente**
(RS-01). En la revisión del 6 nov se vio el costo: cuando un asesor toma un chat, el bot queda en pausa para siempre (clientes con el
bot callado 3 y 6 días), y un cliente que deja de responder no recibe nada hasta que alguien se acuerde. Pasadas 24 h desde su
último mensaje, Meta solo deja escribirle con plantilla aprobada (cobrable).

## Decisión

- **El bot puede escribir solo al cliente, una vez por silencio y solo dentro de las 24 h de Meta**, en dos casos configurables:
  **A** el cliente dejó de responder (5 h por defecto) y **B** el asesor no respondió al cliente (2 h hábiles por defecto).
- **El bot vuelve a atender** un chat que estaba con asesor cuando el cliente responde a ese mensaje, cuando el asesor pulsa
  **«Devolver al bot»** en la Bandeja o cuando se cierra el chat. A dónde vuelve (menú principal, otro bot o un cuadro) se configura,
  y con la etapa Vendido puede ir a otro destino (postventa).
- **Todo se parametriza** en Configuración → Bot → Retorno y seguimiento: encendido, tiempos, textos, botones, destino, horario y
  etiquetas excluidas. Nace **apagado**: el dueño lo enciende.
- **Nunca se envía** a un chat cerrado, archivado, en etapa de cierre (Vendido o Perdido), con una compra en «pago por confirmar», con
  una etiqueta excluida, con el chatbot apagado ni fuera de las 24 h. RS-01 sigue igual para los seguimientos manuales (tareas).

## Alternativas descartadas

- **Mantener RS-01 y solo crear tareas para el asesor:** no resuelve el chat callado si el asesor tampoco atiende.
- **Escribir después de 24 h con plantilla:** cuesta por mensaje y requiere plantilla aprobada; queda para una mejora posterior
  (seguimiento tras la cotización, mejora 3).
- **Insistir varias veces:** riesgo de molestar y de reportes de spam que bajan la calidad del número en Meta.

## Consecuencias

- El reloj del receptor suma una tarea (cada minuto) además de las Pausas.
- Cada mensaje automático queda en `mensajes` como del bot y en el historial del cliente (`lead_eventos`), con su etiqueta.
- Las métricas de «sin respuesta» deben distinguir el mensaje automático de la respuesta de una persona.

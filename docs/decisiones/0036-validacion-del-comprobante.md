# 0036 · El asesor valida el comprobante antes de confirmar el pago y seguir con el despacho

**Estado:** Aceptada por el dueño el 6 nov 2026 («todo soporte debe ser validado por un asesor») · Diseño de F4·46 · Detalle en
[AGENTE.md](../AGENTE.md#4g-validación-del-comprobante-por-el-asesor-f446) (RAG-63 a RAG-70) · **Modifica RAG-20** de la
[0032](0032-modulo-agente.md) y el bot de después del comprobante de F4·34

## Contexto

Hoy, cuando el cliente manda la foto del comprobante, el bot responde «✅ Recibimos tu comprobante» y arranca enseguida «Datos de
despacho» (*¿Cómo recibes tu equipo?*). Ningún pago se confirma solo (RAG-21), pero el cliente percibe que sí y el despacho avanza antes de
que alguien vea la plata en el banco. Hay estafas con comprobantes editados o transferencias que no entran.

## Decisión

- Al llegar el soporte, el bot **solo acusa recibo** con un texto que no confirma el pago y pasa el chat a la cola.
- Un asesor con el permiso **`validar_pagos`** revisa la cuenta bancaria y pulsa **✅ Comprobante validado** o **❌ No es válido** en la
  Bandeja. Solo con «validado» el cliente recibe «✅ Recibimos tu comprobante» y arranca el bot de despacho.
- Un rechazo devuelve la compra a *esperando el pago* con el motivo; al segundo, el chat queda marcado para revisar posible fraude.
- Queda registrado quién validó, cuándo y el monto. Se configura en Agente → Compra y viene **encendido**.

## Alternativas descartadas

- **Dejarlo como hoy y que el asesor revise después:** el cliente ya recibió la confirmación y el despacho avanzó.
- **Leer el comprobante con IA y confirmar solo:** un comprobante editado engaña a la IA; RAG-21 se mantiene (la IA, si se usa, solo
  ayuda al asesor).
- **Validar moviendo la etapa a mano en el embudo:** no avisa al cliente ni arranca el despacho; es fácil olvidarlo.

## Consecuencias

- El cliente espera la validación: pesa el SLA de la Bandeja (alertas a los 10 y 15 min hábiles) y fuera de horario recibe `{proxima}`.
- La flecha «Pedido pagado» del cuadro 🛒 Carrito y el bot de después del comprobante se siguen al validar, no al recibir.
- Nuevo permiso `validar_pagos` en Roles.

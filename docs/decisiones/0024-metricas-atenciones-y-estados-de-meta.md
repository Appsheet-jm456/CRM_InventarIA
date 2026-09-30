# 0024 · Las métricas salen de la base: atenciones con su SLA y estados de entrega de Meta

**Estado:** Aceptada · 30 sep 2026 · Diseño de F3·8

## Contexto

El brief pide saber cuántos clientes llegaron, cuántos compraron, por qué se perdieron y cuánto tarda el
equipo en contestar, y la decisión 0011 pide contar los mensajes cobrables del mes contra los 1.000 gratis.
Dos datos no se guardaban:

- `leads.primera_respuesta_en` se **borra cada vez que el cliente vuelve a la cola**: solo queda la última
  atención, así que el SLA de un mes no se puede medir.
- El receptor recibe los **estados de Meta** (enviado, entregado, leído, fallido, con su categoría y si
  fue cobrable) pero solo los escribía en el registro.

## Decisión (dueño, 30 sep 2026)

- **Cada paso a la cola es una atención** (`atenciones`): cuándo entró, quién la tomó, cuándo le
  respondieron y los minutos hábiles de espera. La base la lleva sola desde `leads`.
- **Cada estado de Meta se guarda** (`estados_meta`) y se aplica al mensaje: estado de entrega, categoría,
  cobrable y error. Si el estado llega antes que el mensaje, se aplica cuando el mensaje se registra.
- **Métricas en `/metricas`**, abriendo en el **mes actual con selector** de período y embudo. Quien tiene
  `ver_metricas` ve todo el equipo; el asesor, solo lo suyo. Las calcula una función de la base.
- **Estado de entrega en la Bandeja** con ✓ (enviado), ✓✓ (entregado), ✓✓ azul (leído) y rojo si falló.
- **Consumo de Meta**: mensajes de servicio del mes contra 1.000 y cuántos fueron cobrables, con aviso al
  80 % en Métricas y en el Inicio de quien tiene `ver_metricas`. **Solo el conteo**: sin pesos hasta que
  se confirmen las tarifas (F1·6).

Detalle en [METRICAS.md](../METRICAS.md).

## Consecuencias

- Las atenciones de antes de la migración se reconstruyen solo desde el estado actual de cada cliente (una
  por cliente que haya pasado por la cola). Los datos son de prueba (0019), no importa.
- El mes del contador es el calendario de Colombia; Meta factura en UTC: cerca del cambio de mes puede haber
  unas horas de diferencia. Es un contador de aviso, no la factura.

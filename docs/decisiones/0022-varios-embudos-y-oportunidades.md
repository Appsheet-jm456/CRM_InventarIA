# 0022 · Varios embudos, y un cliente puede tener una oportunidad en cada uno

**Estado:** Aceptada · 30 sep 2026 · Amplía la 0020 · Tarea F3·10 (va antes de F3·7)

## Contexto

El CRM tenía un solo embudo, y la etapa vivía en el cliente (`leads.etapa`). El dueño necesita embudos
distintos para la compra online (Cliente Final), el soporte técnico (Pos Venta) y la venta al por mayor
(Distribuidor), y un mismo cliente puede comprar y después pedir soporte.

## Decisión (dueño, 30 sep 2026)

- **Varios embudos**, cada uno con sus etapas. Arrancan Cliente Final, Pos Venta y Distribuidor.
- **Un cliente puede estar en varios a la vez**: cada paso por un embudo es una **oportunidad** con su etapa,
  valor, motivo e historial. Una sola abierta por cliente y embudo.
- **El bot la abre según la opción del menú** (Productos, Distribuidores, Servicio al cliente) y el asesor
  también la abre a mano.
- Se construye **antes de F3·7**, porque el editor del bot y las métricas trabajan por embudo.

Detalle en [EMBUDOS.md](../EMBUDOS.md).

## Consecuencias

- `leads.etapa` queda solo como la etapa del bot en Cliente Final; el tablero y las métricas leen
  `oportunidades`.
- La etapa *Distribuidores* del embudo único desaparece: pasa a ser el embudo Distribuidor.
- Las ramas 2 y 3 del menú siguen yendo a asesor (F1·7), pero ahora dejan al cliente en su embudo.

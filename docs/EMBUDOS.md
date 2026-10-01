# Varios embudos: Cliente Final, Pos Venta y Distribuidor (F3·10)

> Decisión 0022 (dueño, 30 sep 2026). Se construye **antes de F3·7**, porque el editor del bot y las
> métricas trabajan por embudo. Amplía la Bandeja y el embudo de la 0020.

---

## Reglas

**RE-01 · Hay varios embudos, cada uno con sus etapas.** Arrancan tres:

| Embudo | Para qué | Etapas (se editan en Configuración → Etapas) |
|---|---|---|
| **Cliente Final** (predeterminado) | Compra online | Nuevo → En Conversación → Cotización → Negociación → Confirmar transfer → **Vendido** (ganada) → Despachado → En transportadora → Entregado (las tres también ganada) · **Perdido** (perdida). *Despachado, En transportadora y Entregado: decisión 0028 (F4·14); el bot de posventa las usa. La venta se cuenta una sola vez, al llegar a Vendido* |
| **Pos Venta** | Soporte técnico y garantías | Recibido → Diagnóstico → En garantía o reparación → Listo para entregar → **Resuelto** (ganada) · **No procede** (perdida) |
| **Distribuidor** | Venta al por mayor | Nuevo → Datos de la empresa → Lista de precios enviada → Negociación → **Primer pedido** (ganada) · **Perdido** (perdida) |

El administrador (`administrar_embudo`) crea más embudos y edita sus etapas.

**RE-02 · Un cliente puede estar en varios embudos a la vez.** Cada paso por un embudo es una
**oportunidad**: el mismo cliente puede tener una compra cerrada en Cliente Final y un caso abierto en
Pos Venta, cada uno con su etapa, valor, motivo e historial. La conversación de WhatsApp sigue siendo una.

**RE-03 · Una sola oportunidad abierta por cliente y embudo.** Cuando se cierra (ganada o perdida), la
siguiente vez se abre una nueva: así queda el historial de cada compra o caso.

**RE-04 · El bot abre la oportunidad según la opción del menú**, y el asesor también puede abrirla a mano
desde la Bandeja:

| El cliente elige | Embudo |
|---|---|
| 1 · Productos (o busca un equipo por texto) | Cliente Final |
| 2 · Distribuidores | Distribuidor |
| 3 · Servicio al cliente, garantía, soporte | Pos Venta |

Cada embudo tiene su **etiqueta del bot** (`Interes-Productos`, `Interes-Distribuidor`, `Interes-Soporte`):
cuando el bot le pone esa etiqueta al cliente, se abre la oportunidad si no hay una abierta.

**RE-05 · El bot solo mueve el embudo Cliente Final, y solo hacia adelante** (0006). Nuevo → En
Conversación → Cotización, como hoy. Las personas mueven cualquier oportunidad a cualquier etapa de su
embudo, y queda en el historial.

**RE-06 · Cerrar como perdida pide motivo** (RB-04), en cualquier embudo.

## Modelo (migración 0006)

| Tabla | Cambio |
|---|---|
| `embudos` | Nueva: nombre, descripción, orden, etiqueta del bot, predeterminado, activo |
| `etapas` | Pertenece a un embudo; el nombre es único **dentro** del embudo |
| `oportunidades` | Nueva: cliente, embudo, etapa, estado (`abierta`, `ganada`, `perdida`, lo deriva la etapa), valor, equipo, motivo, notas, quién la abrió, cuándo se cerró |
| `historial_etapas` | Cada cambio queda por oportunidad (y su embudo) |
| `leads.etapa` | Queda como la etapa del **bot** en Cliente Final; ya no amarra a `etapas`. La base la traslada a la oportunidad |

Funciones: `abrir_oportunidad(lead, embudo)` y `mover_oportunidad(oportunidad, etapa, motivo)` con
`gestionar_oportunidades`; `mover_etapa` desaparece. Leer oportunidades = poder ver su conversación (RU-08).

## Pantallas

- **Embudo:** una pestaña por embudo, con su tablero de oportunidades.
- **Bandeja:** en la ficha, las oportunidades del cliente (embudo y etapa) y *Abrir en otro embudo*.
- **Etapas:** elegir el embudo, crear embudos y editar sus etapas.
- **Inicio:** oportunidades abiertas por embudo.

# Aumentar RAM o disco en el pedido (F4·73)

> **Estado:** 🔵 construida el 11 nov 2026 por pedido del dueño (migración 0081). Falta la prueba del dueño por WhatsApp.
> Decisiones del dueño del 11 nov 2026 en la sección 6.

**Pedido del dueño:** en el resumen del pedido del bot, una opción **«Aumentar RAM o disco»**. El local amplía la RAM y el disco de los
equipos que lo permiten y cobra un precio adicional (lista de precios del afiche «Ampliaciones de RAM y discos»). Hay equipos con la RAM
**soldada (onboard)** que no se pueden ampliar (X1 Yoga, X1 Carbon y algunos Lenovo) y otros con RAM soldada **más una ranura libre**.

---

## 1. Cómo está hoy (revisado en el código el 11 nov 2026)

- El resumen del carrito del bot (F4·44) tiene: Confirmar · Agregar otro equipo · Quitar un equipo · Cotizar · Hablar con asesor · Cancelar.
- No hay forma de vender un aumento: el asesor lo tenía que cobrar a mano.
- Los equipos ya tienen **Atributos del producto** (F4·41): se llenan en Inventario o en el Excel de carga, una columna por atributo.

## 2. Atributos nuevos del equipo (Inventario)

| Atributo | Clave | Valores | Para qué |
|---|---|---|---|
| 🧩 RAM soldada (onboard) | `ram_onboard` | Sí / No | Si tiene memoria soldada a la tarjeta |
| 🧩 Ranuras de RAM | `ram_ranuras` | Ninguna, 1, 2, 4, 6, 8 | Ranuras para módulos (sin contar la soldada). **Ninguna = no se amplía** |
| ⚡ Velocidad RAM | `ram_velocidad` | 2400, 2666-3200 | Precio de la RAM. Vacío: se deduce del procesador |
| 💽 Ranuras de disco | `disco_ranuras` | 1, 2 | Informativo para el técnico (sale en la nota) |
| 💽 Tipo de disco | `disco_tipo` | SATA, NVMe | NVMe suma el adicional. Vacío: «NVMe» en el texto del disco, si no SATA |

Ejemplos: **X1 Carbon Gen 6** → onboard Sí, ranuras Ninguna. **Lenovo con 8 GB soldados + 1 ranura** → onboard Sí, ranuras 1.
**Dell Latitude 5490** → onboard No, ranuras 2.

## 3. Precios (Agente → Compra → Aumentos de RAM y disco)

Tabla editable (activar/desactivar renglones y cambiar precios); arranca con los del afiche:

| RAM DDR4 | 2400 MHz | 2666-3200 MHz |
|---|---|---|
| 8 GB → 16 GB · 16 GB → 24 GB (+8 GB) | $120.000 | $140.000 |
| 8 GB → 24 GB · 16 GB → 32 GB (+16 GB) | $200.000 | $220.000 |
| 8 GB → 40 GB · 16 GB → 48 GB · 32 GB → 64 GB (+32 GB) | $450.000 | $500.000 |

| Disco SSD SATA | Precio |
|---|---|
| 128 GB → 256 GB | $80.000 |
| 128 GB → 512 GB | $180.000 |
| 256 GB → 512 GB | $130.000 |
| 256 GB → 1 TB | $280.000 |
| 512 GB → 1 TB | $180.000 |

**NVMe:** + $30.000 sobre el precio SATA (valor editable). Interruptor general «Ofrecer aumentos en el resumen del pedido».

## 4. Qué ve el cliente

```
🛒 Resumen de tu pedido
1. 💻 LENOVO T490 · Código 100-101-1121-2
     💰 $1.300.000
🔧 Configuración (…): $80.000
Total (1 equipo): $1.380.000

1️⃣ Confirmar pedido
2️⃣ Agregar otro equipo
3️⃣ Aumentar RAM o disco
4️⃣ Quitar un equipo
5️⃣ Cotizar este pedido
6️⃣ Hablar con asesor
7️⃣ Cancelar
```

→ **3** (con varios equipos, primero «¿A cuál equipo?») → «Tu *LENOVO T490* tiene 8GB de RAM y 256GB SSD. ¿Qué quieres aumentar?»
**[RAM] [Disco] [Ver mi pedido]**

- **RAM, se puede:** lista con las opciones de su RAM actual y su velocidad: «8GB → 16GB (+8GB) · $140.000», …
- **RAM soldada sin ranura:** «Este equipo tiene la RAM soldada (onboard) y no tiene ranura adicional: no es posible aumentar la RAM.
  ¿Quieres aumentar el disco?» **[Sí] [No, continuar]**
- **Sin datos del equipo:** «Para este equipo un asesor te confirma si se puede ampliar la RAM.» **[Aumentar disco] [Hablar con asesor] [Ver mi pedido]**
- **Disco:** lista con las opciones de su disco actual (con el adicional si es NVMe): «256GB → 512GB · $130.000», …

Al elegir, el aumento entra al pedido como renglón y vuelve el resumen:

```
1. 💻 LENOVO T490 · Código 100-101-1121-2
     💰 $1.300.000
2. ⚡ Aumento RAM 8GB → 16GB (LENOVO T490)
     💰 $140.000
Total (1 equipo + 1 aumento): $1.520.000
```

## 5. Reglas (RAM)

- **RAM-01 · Dónde:** opción del resumen del carrito del bot (F4·44, Agente → Compra → Carrito encendido), solo si el interruptor está
  encendido y hay renglones activos en la tabla. No sale en la compra de un solo equipo con carrito apagado ni en el carrito del asesor
  (el asesor lo agrega como renglón libre).
- **RAM-02 · RAM:** se ofrece solo si `ram_ranuras` está lleno y no es «Ninguna». Si es «Ninguna» → mensaje de onboard y pregunta por el disco.
  Si está vacío → «un asesor te confirma» (decisión del dueño: nunca vender un aumento que no se puede hacer).
- **RAM-03 · Velocidad:** `ram_velocidad`; si está vacío, Intel de 7.ª generación o anterior → 2400; 8.ª o más nueva → 2666-3200. Sin
  generación (AMD u otro) y sin atributo → «un asesor te confirma».
- **RAM-04 · Disco:** siempre se ofrece según el tamaño actual (128/256/512 GB, «1TB» = 1024). NVMe si `disco_tipo` = NVMe o el texto
  del disco dice NVMe; si no, precio SATA.
- **RAM-05 · Opciones:** las de la tabla cuyo «desde» es la RAM o el disco actual del equipo. Si no hay ninguna (ya tiene 1 TB, o 64 GB)
  → «Tu equipo ya tiene X; un asesor te confirma otras opciones» con [Ver mi pedido] [Hablar con asesor].
- **RAM-06 · En el pedido:** un aumento de RAM y uno de disco por equipo (si elige otro, reemplaza el anterior). Es un renglón sin stock ni
  código de inventario (como el renglón libre de F4·72): no entra a «Código producto» ni descuenta stock; sí al total, a las cuentas, a los
  pagos y a la nota del asesor (que dice qué instalar). Precio del momento en que lo eligió.
- **RAM-07 · Quitar:** «Quitar un equipo» lista también los aumentos; quitar un equipo quita sus aumentos. Si un equipo se vende mientras
  compra, sus aumentos salen con él.
- **RAM-08 · Conteo:** el máximo de equipos del carrito no cuenta los aumentos. El total dice «(N equipos + M aumentos)».

- **RAM-09 · Volver a iniciar la compra** (corregido el 11 nov 2026 tras la prueba del dueño): si el asesor toma el chat y después usa
  Flujos → Iniciar compra, vuelve **el mismo pedido con sus aumentos** y sale directo el resumen (antes arrancaba de cero solo con el
  código del equipo y se perdían los aumentos). Vale con la compra aún en curso o con el pedido guardado al pasar al asesor (24 h). No
  vuelve si el cliente canceló, si ya se enviaron las cuentas o si escribió el código de otro equipo. Un equipo vendido sale con aviso.

- **RAM-10 · Los aumentos quedan en el pedido** (11 nov 2026, migración 0082): al enviar las cuentas, el bot los anota en la oportunidad
  (`oportunidades.aumentos`) y el alistamiento nace con ellos (`alistamientos.aumentos`, y los sigue si cambian).
- **RAM-11 · Se ven donde se trabajan:** el «🧾 Resumen de tu pedido» los lista debajo de su equipo («   ⚡ Aumento RAM 8GB → 16GB»), y
  Pedidos, la Ficha → Oportunidades y el Servicio técnico muestran «⚡ Instalar RAM 8GB → 16GB» bajo el equipo.
- **RAM-12 · Reenviar resumen:** botón «🧾 Reenviar resumen» en el pedido (Ficha → Oportunidades). Envía el mismo resumen (equipos, aumentos,
  total, pagado, saldo y entrega) como mensaje del asesor, sin reiniciar la compra, sin pedir pago y sin cambiar el chat. Solo dentro de
  las 24 h de WhatsApp; queda en el historial «🧾 Resumen del pedido PED-… reenviado por …». No usar el Carrito para esto: el carrito arranca
  una compra nueva.

## 6. Decisiones del dueño (11 nov 2026)

| Pregunta | Respuesta |
|---|---|
| Equipo sin datos de RAM | **No se ofrece; un asesor confirma** |
| Velocidad de la RAM | **Atributo y, si falta, la generación del procesador** |
| Aumento de disco | **Siempre, según el tamaño actual** (NVMe por atributo o texto) |

Fuera de alcance por ahora: el aumento en la cotización PDF (el resumen, Pedidos y el Servicio técnico sí lo muestran desde la 0082) y agregar un
segundo disco en equipos con dos ranuras.

## 7. Qué cambia por dentro

| Pieza | Cambio |
|---|---|
| Base (0081) | 5 atributos del producto; tabla `ampliaciones` (tipo, desde, hasta, precio, precio 2666-3200, activa); `agente_config.ampliacion_activa` y `ampliacion_nvme`. |
| Receptor | `ampliacion.py` (opciones según el equipo) y `compra.py` (opción del resumen, pasos `ampliar_*`, renglones ⚡). `db.ampliaciones()`. |
| CRM | Agente → Compra: sección «Aumentos de RAM y disco». Los atributos salen solos en Inventario. |
| Base (0082) | `aumentos` en oportunidades y alistamientos, `compra_aumentos` (bot) y `pedido_reenviar_resumen`; Pedidos y Servicio técnico los reciben. |
| Pruebas | SQL de la 0081 y 0082, `prueba_ampliaciones.py` y `prueba_resumen_pedido.py`. |

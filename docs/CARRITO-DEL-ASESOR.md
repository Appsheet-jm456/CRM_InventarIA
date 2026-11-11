# Carrito del asesor: armar el pedido en la ficha y enviarlo al cliente (F4·72)

> **Estado:** 🔵 construida el 11 nov 2026 por pedido del dueño (migración 0078). Falta la prueba del dueño por WhatsApp.
> Decisiones del dueño del 11 nov 2026 en la sección 6.

**Pedido del dueño:** que el asesor, desde la **Ficha completa**, arme un carrito para el cliente: agregar equipos del inventario o
productos que no existen, cambiar precios y quitar renglones; y que lo **envíe desde el chat** como resumen del pedido. Si el cliente
dice **Sí**, arranca el flujo de compra. Es una herramienta de venta del asesor.

---

## 1. Cómo está hoy (revisado en el código el 11 nov 2026)

- El **carrito del bot** (F4·44) lo arma el **cliente** con el bot («¿Quieres agregar otro equipo?»). El asesor no lo puede armar ni editar.
- El asesor puede **iniciar la compra** desde el chat (F4·61, Flujos → Iniciar compra), pero con **un solo equipo**: el último que vio el cliente.
- Los precios salen **siempre** de Inventario (RAG-57): el bot los vuelve a leer antes del resumen y antes de las cuentas.
- No hay forma de vender algo que no esté en Inventario (un mouse, un cargador, un equipo por pedido).

## 2. Qué ve el asesor

En la Ficha completa, pestaña nueva **🛒 Carrito** (y desde el chat, «+» → **Carrito del cliente**):

```
🛒 Carrito de Juan Pérez                     Tipo de cliente: (•) Cliente final ( ) Distribuidor
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🔍 Agregar del inventario: código, marca, modelo…                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ 💻 LENOVO T490 · 100-101-1121-2 · Usado          [$ 1.250.000]  (base $1.300.000) ✕ │
│ 💻 DELL 5490 · 100-102-1041 · Usado              [$   980.000]                    ✕ │
│ 📦 Mouse inalámbrico (fuera de inventario)       [$    45.000]                    ✕ │
│ + Producto que no está en el inventario                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ [x] 🔧 Configuración (1 vez por pedido)                               $80.000 │
│ Total (3 productos)                                                 $2.355.000 │
└──────────────────────────────────────────────────────────────────────────────┘
[Guardar]   [📤 Enviar al cliente]   [Vaciar]          Último envío: hoy 3:40 p. m. por Jhonatan
```

## 3. Qué recibe el cliente

```
🛒 *Resumen de tu pedido*
1. 💻 LENOVO T490 · Código 100-101-1121-2
     💰 $1.250.000
2. 💻 DELL 5490 · Código 100-102-1041
     💰 $980.000
3. 📦 Mouse inalámbrico
     💰 $45.000
🔧 Configuración (…1 sola vez por pedido): $80.000
*Total (3 productos): $2.355.000*

¿Confirmas tu pedido? Te envío los datos para pagar.
[✅ Sí, confirmar]  [Hablar con asesor]  [Cancelar]
```

Con **Sí** (botón o «sí» escrito) sigue la compra de siempre: cuentas para pagar (F4·49) e instructivo (F4·68) → comprobante →
validación del asesor (F4·46 / F4·59) → stock (F4·66) → Datos de despacho → resumen del pedido (F4·64).

## 4. Reglas (RCA)

- **RCA-01 · Un carrito por cliente**, guardado en la base (no se pierde al cerrar la ficha). Lo arma quien atiende la conversación
  (permiso `atender_bandeja`, conversación suya o sin asignar). Máximo **10 renglones**.
- **RCA-02 · Del inventario:** solo equipos **con stock**; cada renglón es una unidad. El mismo código no se repite.
- **RCA-03 · Fuera del inventario (renglón libre):** nombre (hasta 80 caracteres) y precio. Va en el resumen, el total, los pagos y la nota del
  asesor, pero **no descuenta stock** y **no entra al Servicio técnico** (no pide video).
- **RCA-04 · Cambiar el precio** de un equipo del inventario solo con el permiso nuevo **`modificar_precios`** (Configuración → Roles; el
  administrador lo tiene). Sin el permiso, el precio queda el de Inventario y el campo no se edita. El precio de un renglón libre lo pone
  cualquier asesor. Cada cambio de precio queda en el historial del cliente (precio de la base, precio nuevo y quién).
- **RCA-05 · Configuración:** se calcula como en la compra del bot (F4·48): cliente final con al menos un equipo usado del inventario →
  una vez el valor de Agente → Compra ($80.000). El asesor puede **quitarla** con la casilla. Distribuidor nunca.
  Un equipo cuyo estado empieza por «nuev» («Nuevo», «NUEVA») no la paga; «Semi nuevo» sí (corregido el 11 nov 2026, migración 0079).
- **RCA-06 · Tipo de cliente:** sale de la ficha («Tipo de cliente»); si no se sabe, el asesor lo elige en el carrito y queda guardado en la ficha.
- **RCA-07 · Enviar al cliente** solo dentro de las 24 h de WhatsApp. Al enviar, se revisa que cada equipo siga con stock; si uno se vendió,
  no se envía y se avisa cuál. El bot toma el tramo de la compra con «vuelve a mí»: si el cliente pide asesor o la compra pasa a validación,
  la conversación vuelve a quien envió el carrito. Si el asesor escribe en el chat, el bot deja de contestar, como hoy.
- **RCA-08 · Los precios del carrito se respetan** hasta las cuentas: el bot no los vuelve a leer de Inventario (excepción a RAG-57). Sí
  revisa el **stock** antes de las cuentas: si un equipo se vendió, lo quita del pedido y avisa (como RPD-53).
- **RCA-09 · Registro:** en el historial queda «🛒 Carrito enviado por <asesor>: N productos · total». En el chat se ve el resumen
  como mensaje del bot.
- **RCA-11 · Traer lo que eligió el cliente:** botón 🧾 en el carrito. Junta lo que el cliente armó con el bot, en este orden: compra en curso
  (uno o varios equipos y renglones libres, con el precio cotizado), pedido abierto (códigos del campo producto) o último equipo cotizado.
  Solo lee; no repite lo que ya está y respeta el máximo de 10. Si el cliente era Cliente final/Distribuidor, lo deja elegido.
- **RCA-12 · Editable:** lo traído se edita igual que el resto (quitar, agregar, precio con el permiso `modificar_precios`). Sin el permiso,
  trae el precio del inventario. Así el asesor puede dar un descuento autorizado por gerencia: lo cambia quien tenga el permiso y queda en el historial.
- **RCA-13 · Ya vendido:** si el equipo ya no tiene stock (p. ej. pedido pagado), se trae marcado «sin stock» para verlo, pero no se puede enviar
  hasta quitarlo. Corregir un pedido ya pagado se hace en Oportunidades/Pedidos, no aquí.
- **RCA-10 · El carrito se puede volver a enviar** (después de cambiarlo); el último envío reemplaza la compra en curso del cliente.
  No se puede reenviar si el cliente ya tiene una compra **esperando pago o por validar** (para no pisar un pago).

## 5. Qué cambia por dentro

| Pieza | Cambio |
|---|---|
| Base (0080) | `carrito_traer(lead)` (solo lectura). |
| Base (0078) | Permiso `modificar_precios` (administrador). Tabla `carritos` (un renglón por cliente; sin acceso directo). `carrito_de(lead)`, `carrito_guardar(lead, items, tipo, sin_configuracion)` y `carrito_enviar(lead)`, que valida y deja el chat al bot con «vuelve a mí». |
| Receptor | `/interno/herramienta` con tipo `carrito`: arma la compra (`compra.desde_asesor`) en el paso «confirmar» con los renglones del asesor y envía el resumen. `compra.py`: los renglones con precio del asesor y los libres no se vuelven a leer de Inventario; los libres no cuentan para stock, video ni «Código producto». |
| CRM | Pestaña 🛒 Carrito en la Ficha (`leads/[id]/Carrito.tsx`) y «+» → Carrito del cliente en el chat. |
| Pruebas | SQL de la 0078 y `prueba_carrito_asesor.py`. |

## 6. Decisiones del dueño (11 nov 2026)

| Pregunta | Respuesta |
|---|---|
| Cuando el cliente dice Sí | **Directo a las cuentas** (resumen con «Sí, confirmar · Hablar con asesor · Cancelar»; los cambios los hace el asesor) |
| Producto que no está en inventario | **Renglón libre** (nombre y precio, sin stock) |
| Quién cambia precios | **Con permiso** que se le da al usuario (por su rol) y el administrador |
| Configuración $80.000 | **Automática y se puede quitar** |

Fuera de alcance por ahora: cantidades mayores a 1 por renglón (se agrega otro renglón o un renglón libre), descuentos en porcentaje y
cotización en PDF desde el carrito del asesor.

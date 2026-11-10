# Pago parcial, catálogos editables y herramientas del asesor en el chat (F4·59 a F4·62)

> **Estado:** 📝 documentadas el 10 nov 2026 por pedido del dueño. **Ninguna está construida; se construyen cuando el dueño dé la orden.**
> Hay preguntas abiertas en la sección 6: cada una trae una propuesta, que vale hasta que el dueño diga otra cosa.

| Tarea | Mejora | Dónde se ve | Migración |
|---|---|---|---|
| **F4·59** | Pago completo o pago parcial (abono) al validar el comprobante | Bandeja, Ficha → Chat, Ficha → Oportunidades | Sí |
| **F4·60** | Catálogos: modificar el enlace o el PDF, desactivar y eliminar | Inventario → Catálogos (y acceso desde Bot) | No |
| **F4·61** | El asesor envía catálogos y dispara acciones desde el chat con «/» | Bandeja y Ficha → Chat | Sí (pequeña) |
| **F4·62** | Emojis, documentos, imágenes y audios desde el chat | Bandeja y Ficha → Chat | No |

---

## 1. Cómo está hoy (revisado en el código el 10 nov 2026)

- **Comprobante (F4·46):** cuando el cliente manda el soporte, la tarjeta de la Bandeja tiene dos botones: «✅ Comprobante validado» y
  «❌ No es válido». Validar **siempre registra un pago por el total** del pedido (RPD-33) y arranca «Datos de despacho».
  Si el cliente pagó la mitad, el asesor no tiene cómo decirlo desde el chat.
- **Abonos (F4·54, migración 0061):** la tabla `pagos` ya acepta varios pagos por pedido y calcula *Total · Pagado · Saldo*, pero solo
  con «Registrar pago» **a mano** en la ficha del pedido. No envía nada al cliente.
- **Catálogos:** están en **Inventario → Catálogos**. Se puede **agregar**, **activar o desactivar** y **borrar**. **No se puede modificar**:
  para cambiar un enlace hay que borrar el catálogo y crearlo otra vez (y los cuadros del bot que lo usaban quedan sin catálogo).
  Hoy hay 5 catálogos, y la categoría está escrita de dos formas («Portatiles» y «Portatil»).
- **Chat de la Bandeja:** el asesor escribe texto y tiene respuestas rápidas con «/». **No puede adjuntar archivos**, no hay selector de
  emojis, y los catálogos y las Acciones (Ubicación, Cuentas para pagar, Garantía…) solo los dispara el bot, no el asesor.

---

## 2. F4·59 · Pago completo o pago parcial al validar el comprobante

**Ejemplo del dueño:** el carrito suma **$2.000.000**. El cliente puede mandar un solo soporte por todo, o dos soportes de $1.000.000.

### Qué ve el asesor

La tarjeta del comprobante (la misma en la Bandeja, en Ficha → Chat y en Ficha → Oportunidades → Pago) cambia a:

```
┌ 🧾 Comprobante por validar ─────────────────────────────────┐
│ Total del pedido  $2.000.000 · Pagado $0 · Saldo $2.000.000 │
│                                                             │
│ [ ✅ Pago completo $2.000.000 ]  [ ◐ Pago parcial ]  [ ❌ No es válido ] │
└─────────────────────────────────────────────────────────────┘
```

Al pulsar **◐ Pago parcial**:

```
¿Cuánto pagó?   [ $ 1.000.000 ]
Total $2.000.000 − Pagado $1.000.000 = Saldo $1.000.000
[ Enviar al cliente ]  [ Volver ]
```

### Reglas

- **RPD-41 · Tres respuestas al comprobante:** *Pago completo*, *Pago parcial* y *No es válido*. «Pago completo» hace lo mismo que
  hoy «Comprobante validado» (RAG-63 a RAG-70), por el **saldo** que falte.
- **RPD-42 · Pago parcial pide el valor.** Mayor que cero y **menor que el saldo** (si es igual al saldo, es pago completo). La pantalla
  muestra la cuenta antes de enviar: *Total − Pagado = Saldo*.
- **RPD-43 · El abono queda registrado** como un pago del pedido (tabla `pagos`, origen WhatsApp) con la foto o PDF que mandó el cliente
  como soporte. Se ve en la sección Pago y en el módulo Pedidos, igual que los pagos a mano.
- **RPD-44 · Mensaje al cliente con el saldo.** Texto editable en Configuración → Agente → Compra, con las marcas `{abono}`, `{pagado}`,
  `{saldo}` y `{total}`. Propuesta:
  > ✅ Recibimos tu abono de **$1.000.000**. Queda pendiente un saldo de **$1.000.000**. Quedamos atentos al soporte faltante. 🙌
- **RPD-45 · El pedido espera el saldo.** Con un abono, el cliente queda con la etiqueta **Saldo-Pendiente**, el bot sigue esperando el
  siguiente comprobante y **no arranca «Datos de despacho»** *(propuesta; pregunta 1)*.
- **RPD-46 · El segundo soporte muestra lo que falta.** La tarjeta vuelve a salir con *Pagado $1.000.000 · Saldo $1.000.000* y el botón
  dice «✅ Pago completo $1.000.000». Se puede abonar otra vez (tres o más soportes).
- **RPD-47 · Cuando el saldo llega a cero** pasa lo de hoy: mensaje de pago confirmado, se quita Saldo-Pendiente, queda Pago-Validado y
  arranca «Datos de despacho».
- **RPD-48 · Quién:** el mismo permiso `validar_pagos`. Un abono equivocado se **anula** con motivo (RPD-36) y el saldo vuelve a subir.
- **RPD-49 · Fuera de las 24 h de WhatsApp** el abono se registra igual y el aviso sale con plantilla (`crm_pago_confirmado`, aún
  por crear) o queda «sin avisar» con el botón «Avisar al cliente», como hoy.
- **Sin cambio de reglas:** el embudo no se mueve solo y siempre valida una persona (RAG-21).

### Construcción prevista

Migración nueva: `validar_comprobante(p_lead, p_valor)` (sin valor = pago completo), textos `texto_abono` en `agente_config` con sus
permisos por columna, etiqueta Saldo-Pendiente y pruebas SQL. Receptor: `/interno/comprobante` con el caso «abono».
Pantalla: `ComprobanteCliente.tsx` (ya se usa en los tres sitios).

---

## 3. F4·60 · Catálogos: modificar, desactivar y eliminar

- **RI-11 · Botón «Acciones» por catálogo** con: **Modificar**, **Desactivar / Activar** y **Eliminar**.
- **RI-12 · Modificar** abre el mismo formulario de «Agregar» con los datos cargados: nombre, categoría, marca, tipo y **el enlace de
  Drive o el PDF**. Se puede cambiar el enlace, reemplazar el PDF por otro, o pasar de PDF a enlace y al revés.
- **RI-13 · Modificar no rompe el bot.** El catálogo conserva su número: los cuadros del lienzo y las Acciones que lo envían siguen
  funcionando. Al cambiar el PDF se borra el archivo anterior y se olvida la copia que Meta tenía guardada, para que el cliente
  reciba el nuevo.
- **RI-14 · Eliminar avisa dónde se usa.** Si un cuadro del bot o una Acción envía ese catálogo, la pantalla lo dice antes de borrar
  («Lo usa el bot Avi Ventas, cuadro Lenovo») y propone **desactivar** en su lugar.
- **RI-15 · Categoría y marca de una lista**, no escritas a mano, para que no vuelva a pasar «Portatiles» y «Portatil». La lista sale
  de las categorías y marcas del inventario, con opción de agregar una nueva.
- **RI-16 · Dónde vive** *(pregunta 2)*: se queda en Inventario → Catálogos y se agrega un acceso «Catálogos» en el menú de Bot.
- **Quién:** el permiso `administrar_inventario`, como hoy.

**Categorías que el dueño va a cargar:** Portátiles usados, Portátiles nuevos, Torres Tiny, SFF, Combos, Portátiles Gamer, Monitores
nuevos y usados, y Tablets.

---

## 4. F4·61 · El asesor envía catálogos y dispara acciones desde el chat

**Ejemplo del dueño:** el asesor apagó el bot y quiere mandar el catálogo Lenovo: escribe `/catalogo lenovo`, elige, y al cliente le
llega el mensaje del catálogo con su enlace o PDF.

### Qué ve el asesor

Al escribir «/» se abre una sola lista con tres grupos, que se filtra mientras escribe:

```
/cat len
─ 📚 Catálogos ───────────────
  Portátiles Lenovo
  Portátiles Gamer Lenovo
─ ⚡ Acciones ────────────────
  Ubicación del local · Cuentas para pagar · Garantía · Horario · Devoluciones · Cotización
─ 🧭 Flujos ──────────────────
  Iniciar compra · Datos de despacho
─ 💬 Respuestas rápidas ──────
  (las de hoy)
```

Además, un botón **⚡** junto a la caja abre la misma lista para quien no use el teclado.

### Reglas

- **RB-07 · Catálogo desde el chat.** Envía lo mismo que enviaría el bot: el texto del catálogo y su enlace de Drive o el PDF adjunto.
  Solo salen los catálogos activos.
- **RB-08 · Acciones desde el chat.** El asesor puede disparar cualquier Acción activa cuya respuesta sea enviar algo (texto, ficha de
  Conocimiento con imagen, archivo, catálogo). Se envía tal cual la tiene configurada en Agente → Acciones: **el asesor no reescribe**.
  Las acciones que solo sirven al bot («Pasar a asesor») no aparecen.
- **RB-09 · Flujos desde el chat.** «Iniciar compra» arranca el cierre de compra con el equipo o el carrito del cliente (cuentas para
  pagar → comprobante → validación → despacho) y «Datos de despacho» arranca ese bot. Disparar un flujo **devuelve ese tramo al bot**:
  el bot hace las preguntas y, al terminar, la conversación vuelve al asesor *(propuesta; pregunta 3)*.
- **RB-10 · Vista previa antes de enviar.** Al elegir, el asesor ve qué va a salir (texto, imagen, enlace) y confirma con Enter.
  Las respuestas rápidas siguen igual: el texto queda en la caja para revisarlo.
- **RB-11 · Queda registrado.** Lo enviado se guarda como mensaje del asesor con la marca de qué fue («📚 Catálogo Lenovo»,
  «⚡ Ubicación del local»), se ve en la línea de tiempo y cuenta en `acciones_registro`.
- **RB-12 · Mismas reglas del chat:** responder toma la conversación (RB-01) y solo dentro de las 24 h de WhatsApp (RB-02).

### Construcción prevista

Ruta nueva del receptor `/interno/enviar` que reutiliza `enviar_catalogo` y los pasos de las Acciones (no se duplica la lógica en la
pantalla). Migración pequeña: columna «Disponible para el asesor» en `acciones` (encendida por defecto en las de envío).

---

## 5. F4·62 · Emojis, documentos, imágenes y audios desde el chat

- **RB-13 · Selector de emojis** 😊 junto a la caja de respuesta, con buscador y «recientes». Inserta donde está el cursor.
- **RB-14 · Adjuntar con 📎**, arrastrando el archivo al chat o pegando una imagen con Ctrl+V. Con vista previa y un texto opcional
  (pie de foto) antes de enviar.
- **RB-15 · Qué se puede enviar** (límites de WhatsApp):

  | Tipo | Formatos | Tamaño máximo |
  |---|---|---|
  | Imagen | JPG, PNG | 5 MB |
  | Documento | PDF, Word, Excel | 100 MB (por internet, 95 MB) |
  | Video | MP4 | 16 MB |
  | Audio | MP3, M4A, OGG | 16 MB |

  Si el archivo no cumple, la pantalla lo dice antes de subir.
- **RB-16 · Nota de voz** *(pregunta 4)*: botón 🎤 que graba desde el navegador y la envía como nota de voz de WhatsApp. El servidor la
  convierte al formato que pide Meta con `ffmpeg` (ya instalado). **Propuesta: construirla en un segundo bloque**, después de los adjuntos.
- **RB-17 · Lo enviado se ve en el chat** igual que lo que manda el cliente (imagen, reproductor de audio, documento para abrir) y
  queda guardado en el almacenamiento privado `media`.
- **RB-18 · Mismas reglas del chat:** RB-01, RB-02 y RB-03 (si Meta no lo acepta, no se guarda).

### Construcción prevista

Sin migración. Acción `responderConArchivo` en la Bandeja: sube el archivo a Storage, lo sube a Meta y envía por identificador.
El receptor ya sabe enviar imagen, documento y video (catálogos, guías, videos del técnico); falta el audio.

---

## 6. Preguntas para el dueño

| # | Pregunta | Propuesta |
|---|---|---|
| 1 | Con un **pago parcial**, ¿el pedido espera el saldo o ya arranca Datos de despacho y el alistamiento? | Espera el saldo completo |
| 2 | ¿Los **catálogos** se quedan en Inventario → Catálogos o se mudan al módulo Bot? | Se quedan, con acceso desde Bot |
| 3 | Al **disparar un flujo** desde el chat (compra, despacho), ¿el bot retoma ese tramo solo? | Sí, y al terminar vuelve al asesor |
| 4 | **Audios:** ¿adjuntar archivos de audio alcanza, o también grabar nota de voz desde el CRM? | Adjuntar primero; grabar en un segundo bloque |

## 7. Orden sugerido de construcción

1. **F4·60 Catálogos** (pequeña, sin migración, y el dueño está cargando catálogos ahora).
2. **F4·59 Pago parcial** (toca dinero: con pruebas SQL y del motor).
3. **F4·61 «/» con catálogos y acciones**.
4. **F4·62 Emojis y adjuntos**, y después la nota de voz.

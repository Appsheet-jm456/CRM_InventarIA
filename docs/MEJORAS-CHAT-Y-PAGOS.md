# Pago parcial, catálogos editables y herramientas del asesor en el chat (F4·59 a F4·62)

> **Estado:** 📝 documentadas el 10 nov 2026 por pedido del dueño. **Ninguna está construida; se construyen cuando el dueño dé la orden.**
> Las cuatro preguntas quedaron respondidas por el dueño el 10 nov 2026 (sección 6).

| Tarea | Mejora | Dónde se ve | Migración |
|---|---|---|---|
| **F4·59** 🔵 | Pago completo o pago parcial (abono) al validar el comprobante | Bandeja, Ficha → Chat, Ficha → Oportunidades | 0067 |
| **F4·60** ✅ | Catálogos: modificar el enlace o el PDF, desactivar y eliminar | Inventario → Catálogos (y acceso desde Bot) | 0063 |
| **F4·61** 🔵 | El asesor envía catálogos y dispara acciones desde el chat con «/» | Bandeja y Ficha → Chat | 0064 |
| **F4·62** 🔵 | Emojis, documentos, imágenes y audios desde el chat | Bandeja y Ficha → Chat | 0066 |
| **F4·66** 🔵 | Equipo vendido: el stock baja al validar el pago y el bot avisa «agotado» con alternativas | Bandeja (tarjeta del comprobante), bot de compra | 0071 |

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
- **RPD-45 · El pedido espera el saldo** *(decidido por el dueño el 10 nov 2026)*. Con un abono, el cliente queda con la etiqueta
  **Saldo-Pendiente**, el bot sigue esperando el siguiente comprobante y **no arranca «Datos de despacho»**.
- **RPD-45b · Excepción: despachar con saldo pendiente.** Para clientes excepcionales, en la tarjeta del abono hay un botón
  «🚚 Despachar con saldo pendiente» que pide un **motivo** obligatorio (p. ej. «cliente frecuente, paga contraentrega»), arranca
  «Datos de despacho» y deja la etiqueta Saldo-Pendiente y la alerta «Saldo pendiente» en Pedidos hasta que el saldo llegue a cero.
  Lo puede hacer quien tiene `validar_pagos` y queda en la línea de tiempo con su nombre.
- **RPD-46 · El segundo soporte muestra lo que falta.** La tarjeta vuelve a salir con *Pagado $1.000.000 · Saldo $1.000.000* y el botón
  dice «✅ Pago completo $1.000.000». Se puede abonar otra vez (tres o más soportes).
- **RPD-47 · Cuando el saldo llega a cero** pasa lo de hoy: mensaje de pago confirmado, se quita Saldo-Pendiente, queda Pago-Validado y
  arranca «Datos de despacho».
- **RPD-48 · Quién:** el mismo permiso `validar_pagos`. Un abono equivocado se **anula** con motivo (RPD-36) y el saldo vuelve a subir.
- **RPD-49 · Fuera de las 24 h de WhatsApp** el abono se registra igual y el aviso sale con plantilla (`crm_pago_confirmado`, aún
  por crear) o queda «sin avisar» con el botón «Avisar al cliente», como hoy.
- **Sin cambio de reglas:** el embudo no se mueve solo y siempre valida una persona (RAG-21).

### Construida el 10 nov 2026 🔵 (falta la prueba del dueño por WhatsApp)

- **Base (migración 0067, 10 pruebas SQL; 0050 y 0061 siguen en verde):** `validar_comprobante(lead, valor)`: sin valor es pago
  completo **por el saldo** que falte (solo ese valor entra a `pagos`); con valor menor que el saldo es abono (`validacion = 'abono'`,
  `pagado`, `saldo`, etiqueta Saldo-Pendiente, oportunidad en Esperando pago). Lo pagado se toma de la tabla `pagos` del pedido (cuenta
  también los pagos a mano). `despachar_con_saldo(lead, motivo)` (RPD-45b). `agente_config.texto_abono` con su permiso por columna.
- **Bot (`compra.py`):** `_abono` envía el texto del abono y la compra vuelve a «esperando pago» (sin despacho; conserva lo pagado);
  el siguiente soporte vuelve a la tarjeta. Con el saldo en cero, como siempre. Con «despachar con saldo», la confirmación recuerda
  el saldo. `prueba_validacion.py` 20/20; compra, carrito, despacho, cuentas, tipo de cliente y pregunta siguen en verde.
- **Pantalla:** `ComprobanteCliente.tsx` en la Bandeja, en Ficha → Oportunidades y ahora también **junto al chat de la Ficha**:
  *Total · Pagado · Saldo*, botones **✅ Pago completo $saldo**, **◐ Pago parcial** (pide el valor y muestra *saldo − abono = queda*)
  y **❌ No es válido**. Tras un abono la tarjeta pasa a **«◐ Saldo pendiente»** con **🚚 Despachar con saldo pendiente** (motivo).
  El texto del abono se edita en Agente → Compra → «Abono recibido (pago parcial)».
- App y receptor compilados y reiniciados.

**Para probarlo (dueño), con una compra de prueba de $2.000.000:** mandar un comprobante → ◐ Pago parcial → $1.000.000 → Enviar: el
cliente recibe el saldo de $1.000.000 y la tarjeta queda «Saldo pendiente». Mandar otro comprobante → ✅ Pago completo $1.000.000:
sigue Datos de despacho. En Pedidos se ven los dos pagos.

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
- **RI-16 · Dónde vive** *(decidido por el dueño el 10 nov 2026)*: se queda en Inventario → Catálogos, con un acceso «Catálogos» en el
  menú de Bot. Lo importante para el dueño es **enviarlos desde el chat** (F4·61).
- **Quién:** el permiso `administrar_inventario`, como hoy.

**Construida y aprobada por el dueño el 10 nov 2026 ✅.** Migración **0063** (`catalogo_usos`, 5 pruebas en
`supabase/pruebas/0063_catalogos_usos.sql`). `inventario/acciones.ts`: `modificarCatalogo` (borra el PDF anterior y limpia
`meta_media_id` si cambia el archivo o el enlace), `usosCatalogo`, y la categoría o marca se guarda como ya existe si solo cambian tildes
o mayúsculas. `FormCatalogo.tsx`: el mismo formulario agrega y modifica, con listas de categorías y marcas (del inventario y de los
catálogos) que también aceptan una nueva; botón «Acciones ▾» con Modificar, Desactivar/Activar y Eliminar (ventana con los usos y
«Desactivar» como alternativa). Pestaña «Catálogos ↗» en Bot. App compilada y reiniciada.

**Para probarlo (dueño):** recargar Inventario → Catálogos; en un catálogo, Acciones ▾ → Modificar, cambiar el enlace y guardar; luego
Eliminar en uno que use el bot (sale la lista de cuadros) y pulsar Cancelar.

**Hallazgos al revisar los datos (10 nov 2026):**
- La categoría está escrita «Portatil» en Lenovo (305), HP (307) y los Gamer (308, 309, 311), y «Portatiles» en Dell (304) y el
  Unificado (312). El bot busca el catálogo **por marca** con la categoría «Portátiles» (Acciones con «el catálogo de la marca» y
  la ruta de marcas del menú), así que **Lenovo, HP y Gamer nunca salen por esa vía**. Los cuadros de Avi Ventas sí funcionan porque
  eligen el catálogo por número. Arreglo: Modificar y poner la categoría «Portatiles» en esos cinco.
- **Corregido el 10 nov 2026 con OK del dueño:** Lenovo (305) y HP (307) pasaron a «Portatiles»; los Gamer (308, 309, 311) a
  «Portatiles Gamer» (con «Portatiles» Lenovo elegía el Gamer Lenovo, por ser el más nuevo con la misma categoría y marca); el Unificado
  (312) quedó **sin marca** (con «Multimarca» el bot no lo tomaba como general y el modo «Unificado» no enviaba nada). Verificado con
  `db.catalogo_para`: Lenovo, HP y Dell dan su catálogo; otra marca o sin marca da el Unificado; Gamer + Lenovo da el Gamer Lenovo.
  **Regla para cargar los demás:** la categoría igual a la del inventario, la marca solo si el catálogo es de una marca, y el
  catálogo general de cada categoría **sin marca**.
- **Gamer en un solo catálogo (orden del dueño, 10 nov 2026):** el 311 pasó a llamarse «Portatiles Gamer», sin marca (es el que usan
  los cuadros de Avi Ventas, que siguen igual); el 308 (Gamer Multimarca) y el 309 (Gamer Lenovo) quedaron **desactivados**, no
  borrados (no los usaba ningún cuadro ni Acción). Cualquier Gamer, de cualquier marca, recibe «Portatiles Gamer».
- El cuadro «Catálogo Dell» del bot **Distribuidor** (versión publicada) apunta al catálogo 39, que ya no existe: no envía nada.

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
- **RB-07b · Mensaje propio de cada catálogo** *(pedido del dueño el 10 nov 2026, tras probar; migración 0065)*. En Inventario →
  Catálogos → Acciones ▾ → Modificar hay un campo «Mensaje al enviarlo desde el chat» (hasta 1.500 caracteres). Acepta `{nombre}`
  (primer nombre del cliente) y `{enlace}` (dónde va el enlace de Drive; sin la marca, va al final). Vacío: «Te envío nuestro
  catálogo 📚» con el nombre y el enlace. Solo aplica al envío del asesor: los cuadros del bot y las Acciones usan su propio texto.
  El Catálogo Unificado quedó cargado con el texto que dio el dueño (precios de distribución, $80.000 de configuración, «Asesor» y
  la comunidad de WhatsApp). `receptor.catalogo_del_asesor`, `prueba_herramientas.py` 18/18.
- **RB-08 · Acciones desde el chat.** El asesor puede disparar cualquier Acción activa cuya respuesta sea enviar algo (texto, ficha de
  Conocimiento con imagen, archivo, catálogo). Se envía tal cual la tiene configurada en Agente → Acciones: **el asesor no reescribe**.
  Las acciones que solo sirven al bot («Pasar a asesor») no aparecen.
- **RB-09 · Flujos desde el chat.** «Iniciar compra» arranca el cierre de compra con el equipo o el carrito del cliente (cuentas para
  pagar → comprobante → validación → despacho) y «Datos de despacho» arranca ese bot. Disparar un flujo **devuelve ese tramo al bot**:
  el bot hace las preguntas.
- **RB-09b · Híbrido: el asesor elige qué pasa al terminar** *(decidido por el dueño el 10 nov 2026)*. Al disparar el flujo, la vista
  previa trae «Al terminar: **Vuelve a mí**» (por defecto) o «**Sigue el bot**». Mientras el bot hace el tramo, el asesor ve el chat en
  vivo y puede **escribir en cualquier momento**: si escribe, el flujo se detiene y la conversación vuelve a él (RB-01).
- **RB-10 · Vista previa antes de enviar.** Al elegir, el asesor ve qué va a salir (texto, imagen, enlace) y confirma con Enter.
  Las respuestas rápidas siguen igual: el texto queda en la caja para revisarlo.
- **RB-11 · Queda registrado.** Lo enviado se guarda como mensaje del asesor con la marca de qué fue («📚 Catálogo Lenovo»,
  «⚡ Ubicación del local»), se ve en la línea de tiempo y cuenta en `acciones_registro`.
- **RB-12 · Mismas reglas del chat:** responder toma la conversación (RB-01) y solo dentro de las 24 h de WhatsApp (RB-02).

### Construida el 10 nov 2026 🔵 (falta la prueba del dueño por WhatsApp)

- **Base (migración 0064, 11 pruebas SQL):** `herramientas_chat()` arma la lista y `herramienta_chat(lead, tipo, ref, al_terminar)` revisa
  el permiso `atender_bandeja`, que la conversación sea del asesor y las 24 h; deja el chat como corresponde y lo anota en la línea de
  tiempo (evento «herramienta»). No hizo falta la columna «Disponible para el asesor»: salen las Acciones **activas que solo envían**
  (texto, ficha de conocimiento, cuentas, archivo, catálogo, etiqueta). Hoy: Cuentas para pagar, Ubicación, Garantía, Devoluciones,
  Horario y Línea P Lenovo. «Pasar a asesor», «Quiero comprar» y «Cotización» no salen como acción (las dos últimas están en Flujos).
- **Flujos disponibles:** Iniciar compra, Cotización y **cada bot publicado** desde su inicio (Datos de despacho, Avi Ventas, Distribuidor).
- **Receptor:** ruta `/interno/herramienta` (`receptor.herramienta`). Catálogo y acción salen **como mensajes del asesor** (con su
  nombre en el chat); un flujo sale como mensajes del bot. «Vuelve a mí» (`estado_bot.volver_a`, 24 h): cuando el bot pasa a asesor,
  el chat queda asignado a quien disparó el flujo y no en la cola. `prueba_herramientas.py` 16/16.
- **Pantalla:** `bandeja/Herramientas.tsx` (lo usan la Bandeja y la Ficha → Chat). «/» abre la lista por grupos y filtra por palabras
  («/catalogo lenovo», «/cat len», «/ubic»); botón **⚡** junto a la caja; Enter elige el primero; confirmación con Enter (Esc cancela).
- **Diferencia con lo documentado (RB-10):** la confirmación muestra **qué** se va a enviar (nombre y tipo), no el contenido completo
  del mensaje. Si el dueño quiere ver el texto y la imagen antes de enviar, es un bloque aparte.
- App y receptor compilados y reiniciados el 10 nov 2026.

**Para probarlo (dueño), con un número de prueba que haya escrito hace menos de 24 h:**
1. Bandeja → abrir el chat → escribir `/cat len` → Enter → Enter. Llega el texto y el enlace del catálogo, a tu nombre.
2. `/ubic` → Enter → Enter: llega la ubicación con su imagen.
3. ⚡ → Flujos → Bot «Datos de despacho» → «Vuelve a mí» → Iniciar flujo: el bot pregunta; al terminar, el chat vuelve a ti.

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
  convierte al formato que pide Meta con `ffmpeg` (ya instalado). **Se construye en un segundo bloque**, después de los adjuntos
  (decidido por el dueño el 10 nov 2026).
- **RB-17 · Lo enviado se ve en el chat** igual que lo que manda el cliente (imagen, reproductor de audio, documento para abrir) y
  queda guardado en el almacenamiento privado `media`.
- **RB-18 · Mismas reglas del chat:** RB-01, RB-02 y RB-03 (si Meta no lo acepta, no se guarda).

### Bloque 1 construido el 10 nov 2026 🔵 (falta la prueba del dueño por WhatsApp)

- **Base (migración 0066, 6 pruebas SQL):** `registrar_mensaje_asesor_archivo`, como `registrar_mensaje_asesor` (permiso, conversación
  suya, el asesor la toma) más el archivo (`media_ruta`, tipo y nombre). Solo acepta rutas de esa conversación.
- **Servidor:** `responderConArchivo` (Bandeja → `acciones.ts`) revisa formato, tamaño y 24 h; guarda el archivo en el bucket privado
  `media` (`<lead>/asesor-….ext`), lo sube a Meta y lo envía por id (`enviarArchivo` en `lib/meta.ts`), y solo si Meta lo acepta lo
  registra; si no, borra el archivo (RB-03). El audio no lleva pie en WhatsApp: el texto sale aparte.
- **Pantalla:** `bandeja/Adjuntos.tsx` (Bandeja y Ficha → Chat): **😊** con buscador en español («precio», «envío», «gracias») y
  recientes del navegador; **📎**, arrastrar al chat o **Ctrl+V** con vista previa (imagen, video, audio) y pie opcional.
- **Límite real de documentos: 20 MB** (no 100 MB): la app recibe hasta 21 MB por envío (`next.config.js`). Para documentos más
  grandes, enviar el enlace de Drive.
- **Sin probar de punta a punta:** compilado, tipos y pruebas SQL en verde, pero no se envió ningún archivo real a WhatsApp.
- **Bloque 2 (pendiente):** 🎤 grabar nota de voz desde el navegador (RB-16).

**Para probarlo (dueño):** recargar con Ctrl+Shift+R; en un chat de prueba con menos de 24 h: 😊 → buscar «gracias» → Enter; 📎 → una
foto con pie; arrastrar un PDF al chat; pegar una captura con Ctrl+V; un MP3 o M4A. Todo debe verse en el chat a tu nombre.

---

## 6. Decisiones del dueño (10 nov 2026)

| # | Pregunta | Respuesta del dueño |
|---|---|---|
| 1 | Con un **pago parcial**, ¿el pedido espera el saldo o arranca Datos de despacho? | **Espera el saldo**; con clientes excepcionales se puede despachar con saldo pendiente (RPD-45b) |
| 2 | ¿Los **catálogos** se quedan en Inventario → Catálogos o se mudan al módulo Bot? | **Se quedan**; lo importante es enviarlos desde el chat |
| 3 | Al **disparar un flujo** desde el chat, ¿el bot retoma ese tramo solo? | **El asesor activa flujos, y es híbrido** (RB-09b: el asesor elige si vuelve a él o sigue el bot) |
| 4 | **Audios:** ¿adjuntar o también grabar nota de voz? | **En ese orden**: adjuntar primero, grabar después |

## 7. Orden sugerido de construcción

1. **F4·60 Catálogos** (pequeña, sin migración, y el dueño está cargando catálogos ahora).
2. **F4·59 Pago parcial** (toca dinero: con pruebas SQL y del motor).
3. **F4·61 «/» con catálogos y acciones**.
4. **F4·62 Emojis y adjuntos**, y después la nota de voz.

---

## 8. F4·66 · Equipo vendido: el stock baja al validar el pago

**Problema (dueño, 11 nov 2026):** dos clientes hacen «Quiero comprar» con el mismo *LENOVO T490* de $950.000 y los dos pagan. Solo hay
uno y se vende doble. Hoy validar el pago **no toca el stock** y el bot revisa el inventario con una copia que se refresca cada 30 s.

**Propuesta del dueño:** cuando el asesor confirma el **abono o el pago total**, el equipo queda agotado; si otro cliente lo toma, el bot
le dice que está agotado, le muestra alternativas o le ofrece un asesor.

### Reglas

- **RPD-50 · El stock baja con el primer pago validado.** Al validar el comprobante en el chat, sea **Pago completo** o **Pago parcial**,
  cada equipo del pedido baja **una unidad** de stock (con stock 1 queda en 0, agotado). Se hace **una sola vez por pedido**: el segundo
  abono o el pago del saldo no vuelven a descontar. Lo hace la base, en la misma operación que registra el pago.
- **RPD-51 · El stock nunca queda negativo.** Si el equipo ya estaba en 0 (otro cliente pagó primero), no baja más y queda en la línea de
  tiempo «⚠ Se validó un pago de un equipo sin stock: X». Lo resuelve el asesor con el cliente.
- **RPD-52 · El bot se entera en el acto.** Al validar, el receptor olvida su copia del inventario: el siguiente cliente ya ve el stock
  nuevo (antes podía tardar hasta 30 s).
- **RPD-53 · Antes del resumen y antes de las cuentas, el bot pregunta a la base.** Al armar el resumen del pedido y al tocar «Sí, enviar
  cuentas», el bot revisa el stock **en la base, sin copia**. Si un equipo se vendió mientras tanto: lo quita del pedido y avisa.
- **RPD-54 · Mensaje de agotado con alternativas.** «😕 El *LENOVO T490* (100-101-1121-2) se acaba de vender y ya no está disponible.»,
  luego la lista de **hasta 3 parecidos** con stock (misma marca, del precio más cercano al más lejano; si no hay de la marca, los de precio
  más cercano) y los botones **Ver equipos** y **Hablar con asesor**. Con carrito, los demás equipos siguen en el pedido.
- **RPD-55 · Comprobante de un equipo ya vendido.** Si un cliente manda el soporte y su equipo ya no tiene stock, el soporte se recibe
  igual (el bot no rechaza pagos) y el asesor ve en la tarjeta del comprobante **«⚠ Sin stock: LENOVO T490»** y la misma nota en el chat.
  Decide él (otro equipo o devolución).
- **RPD-56 · Fuera de alcance por ahora:** apartar el equipo antes del pago (al enviar las cuentas), devolver el stock solo al cancelar el
  pedido o anular el pago (se repone a mano en Inventario), y descontar los pagos registrados a mano en Pedidos.

### Criterios de aceptación

| # | Dado / cuando | Entonces |
|---|---|---|
| RVD-01 | T490 con stock 1; el asesor valida el **pago completo** de Ana | El T490 queda en stock 0 |
| RVD-02 | T490 con stock 1; el asesor valida un **abono** de Ana | El T490 queda en stock 0 |
| RVD-03 | Ana ya abonó; el asesor valida el **saldo** | El stock no vuelve a bajar |
| RVD-04 | Pedido con dos equipos (carrito) | Cada uno baja una unidad |
| RVD-05 | El T490 ya está en 0 y se valida el pago de Luis | El stock sigue en 0 y queda el aviso en la línea de tiempo |
| RVD-06 | El T490 se vendió; Luis está en el resumen y toca «Sí, enviar cuentas» | No recibe cuentas: «se acaba de vender», alternativas y botones |
| RVD-07 | El T490 se vendió; Luis escribe «quiero comprar el 100-101-1121-2» | «Ya no está disponible» con alternativas y asesor |
| RVD-08 | El T490 se vendió; Luis ya tenía las cuentas y manda el soporte | Se recibe y el asesor ve «⚠ Sin stock: LENOVO T490» |

### Construida el 11 nov 2026 🔵 (falta la prueba del dueño por WhatsApp)

- **Base (migración 0071, 8 pruebas SQL):** disparador `leads_descontar_stock` (función `compra_descontar_stock`): cuando la compra pasa a
  «validado» o «abono», baja una unidad de cada equipo, marca `stock_descontado` y deja el evento en la línea de tiempo (📦 o ⚠ sin stock).
  No se tocó `validar_comprobante`; las pruebas de 0061 y 0067 siguen en verde.
- **Bot:** `db.sin_stock` (stock en la base, sin copia) y `db.olvidar_inventario` (el receptor la llama al recibir la validación);
  `compra._confirmar` revisa con la base con o sin carrito, antes del resumen y al tocar «Sí, enviar cuentas»; `_mensajes_agotado` con
  hasta 3 parecidos (`_alternativas`) y «Ver equipos · Hablar con asesor»; «quiero comprar» con el código de uno vendido dice cuál fue; el
  soporte de un equipo vendido lleva «⚠ Sin stock» en la nota del asesor. `prueba_stock_vendido.py` 12/12 y todas las del bot en verde
  (las que usan códigos inventados ahora toman el stock del inventario de la prueba).
- **Pantalla:** la tarjeta «💳 Comprobante por validar» muestra «⚠ Sin stock: …» en rojo si el equipo ya se vendió.
- App y receptor compilados y reiniciados.

**Para probarlo (dueño), con dos números de prueba y un equipo con stock 1:** el número A y el B hacen «quiero comprar» del mismo código y
llegan al resumen; A toca «Sí, enviar cuentas», manda el soporte y en la Bandeja se valida (completo o abono): el equipo queda en stock 0
en Inventario. B toca «Sí, enviar cuentas»: recibe «se acaba de vender», los parecidos y los botones. Para RVD-08, que B reciba las cuentas
antes de validar el de A y mande su soporte después: su tarjeta muestra «⚠ Sin stock». **Ojo:** si se cancela ese pedido, el stock se
repone a mano en Inventario.



---

## 9. F4·70 · Botón «+» del chat, como en WhatsApp

> **Estado:** 🔵 construida el 11 nov 2026 por pedido del dueño (sin migración). Falta la prueba del dueño.

Antes la caja del chat tenía tres botones sueltos (😊 emojis, 📎 adjuntar y ⚡ herramientas). Ahora queda como WhatsApp Web:

```
┌──────────────────────────┐
│ 📄 Documento              │   morado
│ 🖼 Fotos y videos         │   azul
│ 🎤 Audio                  │   naranja
│ ──────────────────────── │
│ 📚 Catálogos              │
│ ⚡ Acciones               │
│ 🧭 Flujos                 │
│ 💬 Respuestas rápidas     │
└──────────────────────────┘
 [+] [😊]  Escribe tu respuesta…                [Enviar]
```

- **RB-19 · Un solo botón «+»** a la izquierda de la caja, en la Bandeja y en Ficha → Chat. Un clic abre el menú hacia arriba; otro clic,
  un clic fuera o Escape lo cierran. El «+» gira a «×» mientras está abierto.
- **RB-20 · Adjuntar por tipo:** Documento (PDF, Word, Excel, PowerPoint, texto), Fotos y videos (JPG, PNG, MP4) y Audio abren el selector
  de archivos ya filtrado. Después sale la misma vista previa con pie de foto de F4·62, con los mismos límites.
- **RB-21 · Herramientas por grupo:** Catálogos, Acciones, Flujos y Respuestas rápidas abren la lista de F4·61 con solo ese grupo, y la
  misma confirmación antes de enviar. Escribir «/» en la caja sigue buscando en todos.
- **RB-22 · Sin cambios en lo demás:** 😊 queda al lado del «+»; arrastrar un archivo al chat y pegar con Ctrl+V siguen igual; fuera de las
  24 h el menú no aparece (sale la plantilla, como hoy).

Archivos: `crm/src/app/(app)/bandeja/MenuMas.tsx` (nuevo), `Adjuntos.tsx`, `Herramientas.tsx`, `Bandeja.tsx`, `leads/[id]/Ficha.tsx` y `globals.css`.

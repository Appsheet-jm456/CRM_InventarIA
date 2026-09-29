# Árbol de respuesta del bot — Salesbot guiado

`v2` · 29 sep 2026 · validado con el dueño (F1·1 a F1·3) · Fuente: "Árbol de Flujo — Salesbot Kommo" del dueño, adaptado al CRM
InventarIA (decisiones 0005, 0006, 0010 y 0011)

> Simulación interactiva de este árbol: [SIMULACION-CHAT.md](SIMULACION-CHAT.md).
>
> El bot **guía por módulos** con menús numerados y responde con **datos reales del inventario**
> (tabla `productos`). No usa IA libre. Cada respuesta guarda campos, etiquetas y la etapa del
> embudo, y el asesor la ve en la bandeja en tiempo real.

---

## 1. Árbol general

```
B00  BIENVENIDA + MENÚ PRINCIPAL
├── 1 Productos ...................... → B001A
│    B001A  CATEGORÍAS
│    ├── 1 Portátiles corporativos ... → B001A1
│    │    B001A1  ¿Uso del equipo?  Hogar / Ejecutivo / Diseño
│    │    └── B001A2  ¿Presupuesto?
│    │         └── B001A3  ¿Te envío el catálogo?
│    │              ├── 1 Sí ........ → B001A4  Marca
│    │              │                   └── B001A5  Catálogo desde la base
│    │              │                        └── R11  Cliente envía código → ficha
│    │              ├── 2 Asesor .... → B-ASESOR
│    │              └── 3 Volver .... → B001A
│    ├── 2 Torres Tiny ............... → B001B   (por definir: P-05)
│    ├── 3 Torres SFF ................ → B001C   (por definir: P-05)
│    ├── 4 Partes .................... → B001D   (por definir: P-05)
│    └── 0 Volver .................... → B00
├── 2 Distribuidores ................. → B002    (por definir: P-06)
└── 3 Servicio al cliente ............ → B003    (por definir: P-07)

Transversales (desde cualquier bloque):
├── Código de producto en el mensaje → R11 (atajo global de la v0)
├── HOLA / MENU / INICIO ........... → B00
├── 9 / "asesor" ................... → B-ASESOR
├── B-ASESOR  Escalado a asesor humano
└── B-ERR     Respuesta no reconocida (3 seguidas → B-ASESOR)
```

**Convención:** cada menú va como **lista interactiva de WhatsApp** (API oficial de Meta) con las
opciones numeradas: el cliente **toca la opción o escribe el número**, y las dos cosas funcionan
igual. Cada menú es un solo mensaje (decisión 0011).

## 2. Datos que guarda el bot

Lo que en Kommo son campos, etiquetas y etapas, en el CRM son columnas y catálogos (modelo en
la Fase 2):

| Tipo | Nombre | Valores | Dónde vive |
|---|---|---|---|
| Campo | Categoría interés | Portátiles / Tiny / SFF / Partes | `oportunidades.categoria_interes` |
| Campo | Uso equipo | Hogar / Ejecutivo / Diseño | `oportunidades.uso_equipo` |
| Campo | Presupuesto | Uno de los 4 rangos de B001A2 | `oportunidades.presupuesto` |
| Campo | Marca interés | Lenovo / Dell / HP / Todas | `oportunidades.marca_interes` |
| Campo | Código producto | Código enviado por el cliente | `oportunidades.producto_id` (el código se valida contra `productos`) |
| Campo | Errores bot | Contador | `conversaciones.errores_bot`, vuelve a 0 al avanzar |
| Etiquetas | WhatsApp-Bot · Interes-Productos · Interes-Portatil · Catalogo-Enviado · Cotizacion-Personalizada · Escalado-Asesor | | `contacto_etiquetas` |

### Etapas del embudo

Se conservan las 7 etapas de la v0; el bot solo empuja las primeras y nunca retrocede
(decisión 0006). "En atención" de Kommo **no es una etapa**: es el estado de la conversación
(asignada a un asesor), porque un cliente puede estar en Cotización y a la vez siendo atendido.

| Etapa Kommo | Etapa del CRM | Quién la mueve |
|---|---|---|
| Nuevo contacto | **Nuevo** | Bot (B00) |
| Interesado / Calificado | **En Conversación** | Bot (B001A2) |
| Cotización solicitada | **Cotización** | Bot (R11) |
| En atención | Conversación `asignada` (no es etapa) | Bot (B-ASESOR) |
| — | **Negociación** · **Confirmar transfer** · **Vendido** · **Perdido** (con motivo) | Asesor |

Ver P-02.

## 3. Bloques

### B00 · Bienvenida + menú principal

**Se activa:** primer mensaje del contacto, o HOLA / MENU / INICIO.

```
¡Hola! 👋 Bienvenido a *Ventas Virtuales Colombia*, distribuidores al por mayor y detal de
equipos de cómputo en Cali.
Soy el *Bot Ventas Virtuales* 🤖 ¿En qué te podemos ayudar hoy?

1️⃣ Productos
2️⃣ Distribuidores
3️⃣ Servicio al cliente
```

| Opción | Palabras | Destino |
|---|---|---|
| 1 | producto · portátil · torre | B001A |
| 2 | distribuidor · mayor · mayorista | B002 |
| 3 | servicio · garantía · soporte | B003 |
| otro | | B-ERR |

**Acciones:** crear contacto y oportunidad si es nuevo · etiqueta WhatsApp-Bot · etapa **Nuevo**.

### B001A · Productos: categorías

```
¡Perfecto! ¿Qué producto estás buscando?

1️⃣ Portátiles corporativos
2️⃣ Torres Tiny
3️⃣ Torres SFF
4️⃣ Partes
0️⃣ Volver al menú principal
```

| Opción | Palabras | Destino |
|---|---|---|
| 1 | portátil · portatil · laptop | B001A1 |
| 2 | tiny | B001B |
| 3 | sff | B001C |
| 4 | partes · repuesto | B001D |
| 0 | volver · menu | B00 |

**Acciones:** etiqueta Interes-Productos · guarda **Categoría interés**.
Una categoría sin productos con stock en la base **no se muestra en el menú** (P-05).

### B001A1 · Portátiles: uso del equipo

```
¿Para qué tipo de trabajo necesitas el portátil?

1️⃣ Hogar / estudio
2️⃣ Ejecutivo / oficina
3️⃣ Diseño / edición
0️⃣ Volver
```

| Opción | Palabras | Destino |
|---|---|---|
| 1 | hogar · casa · estudio | B001A2 |
| 2 | ejecutivo · oficina · trabajo | B001A2 |
| 3 | diseño · edición | B001A2 |
| 0 | volver | B001A |

**Acciones:** etiqueta Interes-Portatil · guarda **Uso equipo**. El uso filtra el catálogo:
ver P-04.

### B001A2 · Presupuesto

```
¿Cuál es tu presupuesto aproximado?

1️⃣ Menos de $1.000.000
2️⃣ $1.000.000 – $1.500.000
3️⃣ $1.500.000 – $2.000.000
4️⃣ Más de $2.000.000
```

**Acciones:** guarda **Presupuesto** · etapa **En Conversación**.

> **Rangos ajustados al inventario** (17 portátiles con stock al 29 sep 2026): quedan 4, 9, 2 y
> 2 equipos por rango. Con los rangos del borrador de Kommo el último (más de $2,5 M) quedaba
> vacío. Los rangos se guardan en la base y se editan desde el panel.

### B001A3 · ¿Enviar catálogo?

```
¿Deseas que te enviemos el catálogo de portátiles disponibles para *{{Uso equipo}}* y así
revises cuál te interesa?

1️⃣ Sí, envíame el catálogo
2️⃣ Quiero cotización personalizada con un asesor
3️⃣ Volver al menú anterior
```

| Opción | Palabras | Destino |
|---|---|---|
| 1 | si · sí · catálogo | B001A4 |
| 2 | asesor · cotización | B-ASESOR (antes: etiqueta Cotizacion-Personalizada) |
| 3 | volver | B001A |

### B001A4 · Marca

```
¿De qué marca quieres ver los portátiles corporativos?

1️⃣ Lenovo
2️⃣ Dell
3️⃣ HP
4️⃣ Todas las marcas
```

**Acciones:** guarda **Marca interés**. Las marcas del menú **salen de la base**: solo aparecen
las que tienen stock. Hoy solo hay Dell (P-04).

### B001A5 · Catálogo desde la base

```
📎 Te envío el catálogo de *{{Marca interés}}*.

Revisa el equipo que te interesa y envíanos su *código* (ejemplo: 100-102-1041). Te enviamos
disponibilidad, especificaciones y precio. ✅

0️⃣ Menú principal
```

**El catálogo no es un PDF fijo.** Se arma **desde la tabla `productos`** con el filtro que dio
el cliente (marca, rango de presupuesto y uso), solo con equipos con stock y con el código
visible en cada uno. Así no hay 4 PDF que mantener, y no se ofrece un equipo que ya se vendió.
Ver P-04.

**Acciones:** etiqueta Catalogo-Enviado · espera un código.

### R11 · El cliente envía un código → ficha desde la base

**Se activa:** en B001A5 o desde cualquier bloque, si el mensaje trae un código válido (atajo
global de la v0: "info del 100-102-1041").

El bot **busca el código en `productos` y responde con la ficha completa**. No hay espera por
un asesor:

```
💻 *{{Marca}} {{Modelo}}* · Código {{Código}}
{{Procesador}} · {{RAM}} · {{Almacenamiento}} · {{Estado}}
💰 {{Precio}} · ✅ Disponible

1️⃣ Lo quiero · hablar con un asesor
2️⃣ Ver otro código
0️⃣ Menú principal
```

- Va como **una sola imagen con la ficha en el pie** y un enlace a más fotos y al video
  (decisión 0011: una ficha de la v0 eran ~6 mensajes cobrables).
- **Código sin stock o inexistente:** "Ese equipo ya no está disponible 😕" y se ofrecen hasta
  3 parecidos en el mismo rango de precio.
- **Acciones:** guarda **Código producto** · etapa **Cotización** · valor estimado = precio del
  producto. Opción 1 → B-ASESOR con tarea "Cerrar venta de {{código}}".

**Formato del código:** el inventario usa `100-102-1041`, `100-102-1007-3` (con sufijo) y
`PU-23`. El reconocimiento **se valida contra la base**, no solo con un patrón fijo.

### B001B / B001C / B001D · Torres Tiny, Torres SFF y Partes

**Las define el dueño (P-05).** Mientras tanto, al elegirlas el bot pasa directo a B-ASESOR.
Propuesta para cuando se definan: el mismo patrón de portátiles (uso → presupuesto → catálogo
→ código).

### B002 · Distribuidores

**Lo define el dueño (P-06).** Mientras tanto → B-ASESOR. Propuesta: empresa / NIT → tipo de equipo → cantidad → ciudad → B-ASESOR
mayorista, con etiqueta Distribuidor.

### B003 · Servicio al cliente

**Lo define el dueño (P-07).** Mientras tanto → B-ASESOR. Propuesta: 1 Garantía · 2 Soporte técnico · 3 Estado de pedido · 0 Volver;
cada una recoge el dato mínimo (código o número de pedido) y pasa a B-ASESOR.

### B-ASESOR · Escalado a asesor (transversal)

```
¡Entendido! 🙌 En breve un asesor de *Ventas Virtuales Colombia* te atenderá personalmente.

🕗 Lunes a viernes: 8:00 am – 6:00 pm
🕘 Sábados: 9:00 am – 2:00 pm
Festivos: cerrado.

Si nos escribes fuera del horario, te respondemos a primera hora del siguiente día hábil.
```

**Acciones:** el bot se pausa para ese número · la conversación entra a la **cola compartida**
y el primer asesor libre la toma · etiqueta Escalado-Asesor · tarea "Atender cliente WhatsApp".

**SLA:** meta de **10 min** para la primera respuesta del asesor; a los **15 min** la tarea
vence y salta la alerta en la bandeja. Solo corre en horario de atención: un chat que llega
fuera de horario empieza a contar al abrir el siguiente día hábil. El horario y los festivos de
Colombia salen de `horario_atencion`, y fuera de horario el mensaje cambia solo.

### B-ERR · Respuesta no reconocida (transversal)

```
🤔 No entendí tu respuesta. Escribe el *número* de la opción que deseas, o *MENU* para volver
al inicio.
```

- Suma 1 a **Errores bot** y repite el bloque actual.
- **3 errores seguidos → B-ASESOR.** El contador vuelve a 0 al avanzar de bloque.
- Un audio, una imagen o un sticker **no cuentan como error**: pasan a B-ASESOR, porque la
  v0 los descartaba sin avisar.

---

## 4. Decisiones del dueño y pendientes

| # | Punto | Estado |
|---|---|---|
| P-01 | Números o botones | ✅ **Lista interactiva y números**: se toca o se escribe |
| P-02 | Etapas | ✅ **Las 7 de la app**; "En atención" es el estado del chat |
| P-03 | Rangos de presupuesto | ✅ **<$1 M · $1–1,5 M · $1,5–2 M · >$2 M**, editables desde el panel |
| P-04 | Catálogo | ✅ **Desde la base, filtrado** por marca, presupuesto y uso, solo con stock; las marcas sin stock no aparecen |
| P-04b | Qué equipo es Hogar, Ejecutivo o Diseño | ⏳ Pendiente: el inventario no tiene ese campo (tarea F1·8) |
| P-05 | Torres Tiny, SFF y Partes | ⏳ **Las define el dueño**; mientras tanto → B-ASESOR (tarea F1·7) |
| P-06 | Distribuidores | ⏳ **Lo define el dueño**; mientras tanto → B-ASESOR (tarea F1·7) |
| P-07 | Servicio al cliente | ⏳ **Lo define el dueño**; mientras tanto → B-ASESOR (tarea F1·7) |
| P-08 | Reparto de chats | ✅ **Cola compartida**: el primer asesor libre toma el chat |
| P-09 | SLA | ✅ **Meta 10 min, alerta a los 15 min**, solo en horario |
| P-11 | Tipo de chat del MVP: guiado, agente o híbrido | ⏳ Pendiente: ver [SIMULACION-CHAT.md](SIMULACION-CHAT.md) (tarea F1·9) |
| P-10 | Horario | ✅ **L–V 8:00–18:00 · Sáb 9:00–14:00 · festivos cerrado** |

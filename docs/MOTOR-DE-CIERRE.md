# El motor del cierre de ventas: lo que no está en el lienzo

> Documento de referencia del 10 nov 2026, escrito leyendo el código y **probado con el motor real** (la corrida de la sección 3 es
> verdadera). Explica cómo el bot pasa de «envíame el código» a «pago confirmado», incluso en los tramos que **no se ven ni se editan
> en el lienzo**. Sirve para saber **quién decide qué** y **dónde se cambia cada cosa**.

---

## 1. La idea en una página

El bot tiene **dos mundos** que se turnan la conversación:

| | **Lienzo** (Configuración → Bot → Flujos) | **Motor** (código en `herramientas/meta-webhook-prueba/`) |
|---|---|---|
| Qué es | Conversaciones guiadas que tú dibujas: saludo, menú, catálogos, Avi, datos de despacho | Reglas fijas que corren *entre* los cuadros: reconocer un código, abrir una compra, pedir el tipo de cliente, calcular el total, enviar cuentas, esperar el comprobante |
| Quién lo cambia | Tú, arrastrando cuadros y flechas | Se ajusta por **pantallas de configuración** (Agente → Compra, Acciones, Avi) o con código |
| Estado del cliente | `leads.paso_menu` = el cuadro en el que está | `leads.estado_bot.compra` = el paso de la compra, y `paso_menu = COMPRA` |

**La compra no es un cuadro.** Es una *máquina de estados* en `compra.py`: cuando se abre, el cliente deja el cuadro del lienzo en el
que estaba y queda en un nodo especial llamado `COMPRA`. Mientras dure, **la compra atiende primero**; el lienzo vuelve a mandar
cuando la compra termina y «entrega» al cliente a un bot (el de despacho) o al asesor.

Regla de oro del proyecto que el motor cumple siempre: **los precios, el stock y las cuentas salen de la base**, nunca de la IA ni de
un texto escrito a mano en el flujo.

---

## 2. Cómo decide el receptor cada mensaje (el orden importa)

Cada mensaje del cliente entra por el receptor (`receptor._contestar`) y pasa por esta fila. **Gana el primero que lo atiende**:

```
Mensaje del cliente
 │
 ├─ 1. ¿Chatbot apagado?  ........................ sí → a la cola, sin respuesta automática
 ├─ 2. ¿Responde a «¿Sigues necesitando ayuda?»? . sí → lo atiende el retorno (F4·45)
 ├─ 3. ¿Hay una COMPRA en curso?  ................ sí → compra.py decide (botones, datos, comprobante, cancelar)
 │      (si el chat está con un asesor, solo entra el comprobante: foto o PDF)
 ├─ 4. ¿Hay una COTIZACIÓN en curso?  ............ sí → cotizacion.py decide
 ├─ 5. ¿Coincide con una ACCIÓN activa?  ......... sí → esa acción (texto o botón; no con el chat en manos del asesor)
 │      «Quiero comprar», «Cotización», «Cuentas para pagar», «Ubicación», «Garantía»…
 ├─ 6. ¿El cliente está en un cuadro 🤖 AGENTE?  . sí (y Avi está encendido para él) → Avi responde con herramientas
 │      «Avi en todo el bot» encendido → Avi también fuera de ese cuadro
 └─ 7. Motor del menú (flujo.py): código escrito → ficha; opción de un cuadro; texto libre → intérprete (reglas, luego IA)
```

Consecuencias que conviene tener presentes:

- **Una Acción le gana a Avi.** Si el cliente escribe «lo quiero» mientras Avi lo atiende, la acción «Quiero comprar» lo atrapa antes
  de que Avi vea el mensaje. Por eso la compra arranca igual con o sin Avi.
- **La compra le gana a las Acciones.** Con una compra abierta, «ubicación» o «garantía» no disparan su acción: el motor de compra
  contesta o lo anota para el asesor (sección 6.2).
- **Con un asesor en el chat, el bot calla** (pausa), salvo el comprobante de pago, que siempre llega a la tarjeta de la Bandeja.
- **Avi solo atiende a quien está en su alcance**: hoy `estado = lista_blanca` (números de prueba). Quien no está en la lista pasa de
  largo por el cuadro Agente y lo atiende el menú del paso 7; los dos caminos llegan a la misma compra.

---

## 3. Tu ejemplo, paso a paso: «envíame el código» → compra

El bot **Avi Ventas** termina sus catálogos en el cuadro **A1 «Avi: resuelve y cierra»**, que dice *«Cuando veas el que te gusta,
envíame su código…»*. Así sigue la conversación (corrida real del motor, equipo `100-101-1152`):

| # | Cliente | Quién decide | Qué pasa | Estado después |
|---|---|---|---|---|
| 1 | *(llega a A1)* | Lienzo | Recibe el catálogo y el texto «envíame su código» | `paso_menu = A1` |
| 2 | Escribe `100-101-1152` | **Menú (paso 7)** o **Avi (paso 6)** | El código se **valida contra la base** (`buscar_codigo`) y sale la **ficha**: foto, procesador, RAM, disco, estado, precio y botones **Lo quiero · Ver otro código · Menú principal**. Si el código no existe o se vendió: «el código no está disponible». La etapa del bot del cliente pasa a **Cotización** | `paso_menu = R11` (ficha), `Código producto` y `Valor estimado` en la ficha del cliente |
| 3 | Toca **«Lo quiero»** | **Receptor (paso 5)** | El botón lleva la marca `quiere_comprar`: el receptor lo trata como si el cliente hubiera escrito *«quiero comprar»* y busca una Acción que coincida → **«Quiero comprar»** (paso `flujo: compra`) | — |
| 4 | — | **`compra.iniciar`** | Arranca la compra. El equipo sale del último que vio (`Código producto`) o del código escrito. Si el carrito está encendido (hoy sí), pregunta **«¿Quieres agregar otro equipo? Llevas 1.»** | `paso_menu = COMPRA`, `compra.paso = otro` |
| 5 | Responde | **`compra.py`** | Sigue la máquina de estados de la sección 5 | … |

Lo que **no** está en el lienzo y ocurre en los pasos 3 y 4: el reconocimiento de «lo quiero» (`interprete.quiere_comprar`), la
búsqueda de la acción, la apertura de la compra, el cálculo del total y la pregunta del tipo de cliente.

> **Si apagas la acción «Quiero comprar»**, el botón «Lo quiero» **ya no abre la compra**: el motor cae a la flecha dibujada en el
> lienzo (en Avi Ventas, **«Lo quiero» → Asesor**) y el cliente pasa a una persona. Es un interruptor general de la compra por menú.

---

## 4. Las cuatro puertas de entrada a la compra

Todas terminan en la misma función, `compra.iniciar(...)`. Cambia **quién la dispara**:

| Puerta | Quién la dispara | Dónde se configura | Si la apagas |
|---|---|---|---|
| **1. Acción «Quiero comprar»** | El cliente escribe «quiero comprar», «deseo comprar», «lo quiero», «lo compro» (con o sin código) | Configuración → Agente → Acciones | Nadie abre compra por frases ni por el botón «Lo quiero» |
| **2. Botón «Lo quiero» de la ficha** | El cliente toca el botón de la ficha del equipo | El botón vive en el cuadro «Botones de la ficha» del lienzo; usa la acción 1 | Sigue la flecha del lienzo (asesor) |
| **3. Avi: herramienta `iniciar_compra`** | Avi decide que el cliente quiere comprar («cómo pago», «lo quiero») | Instrucciones de Avi y «Herramientas apagadas» en Agente → Avi | Avi ya no abre compras; pasa a asesor |
| **4. Cuadro 🛒 Carrito del lienzo** | El cliente llega a ese cuadro por una flecha | Lo colocas tú en el lienzo; sus flechas **«Pedido pagado»** y **«Pidió asesor»** deciden qué sigue | Quitas el cuadro |

Detalles que cambian el comportamiento:

- **Con Avi (puerta 3):** `iniciar_compra` **termina el turno de Avi**: lo que sigue ya no lo escribe la IA sino `compra.py`, con
  textos y cuentas aprobados. Avi tiene prohibido escribir cuentas, titulares o cédulas (regla fija 2).
- **Con el cuadro Agente del lienzo:** si unes la flecha **«Inició compra»**, el dueño decide qué sigue (por ejemplo un cuadro 🛒 Carrito);
  sin unir, corre el flujo de compra normal.
- **Desde una cotización:** la opción «Cotizar este pedido» genera el PDF (otro motor, `cotizacion.py`) y la compra puede retomarse con
  *«quiero comprar»*, que recupera los equipos cotizados.

---

## 5. La máquina de estados de la compra (`compra.py`)

El estado vive en `leads.estado_bot.compra`. Cada paso espera una respuesta y decide el siguiente:

```
                         ┌──────────────────────── «asesor» / 9 en cualquier paso ──► ASESOR (compra anotada)
                         │
  iniciar ─► codigo ─► [agregar ⇄ otro]* ─► tipo ─► confirmar ─► esperando_pago ─► pago_por_confirmar
            (pide el      carrito: ficha,   (solo si    resumen y    cuentas        comprobante recibido,
             código)      «agregar este»    no se sabe) total         enviadas       chat a la cola
                          «¿otro equipo?»                  │              │                │
                                                           │              │                ▼
                          cancelar / 0 / menú ◄────────────┴──────────────┘      ASESOR VALIDA en la Bandeja
                          («ya no quiero»)                                      ✅ completo ─► texto de pago confirmado ─► bot de despacho
                                                                                ◐ parcial  ─► abono: vuelve a esperando_pago con saldo
                                                                                ❌ no válido ► motivo al cliente, vuelve a esperando_pago
```

### 5.1 Paso a paso: qué hace, qué guarda y qué mueve

| Paso | Qué dice el bot | Qué decide el motor | Qué guarda / mueve |
|---|---|---|---|
| **codigo** | «¿Cuál es el código del equipo?» (o «¿Qué equipo quieres?» con carrito) | Valida el código contra `productos`. Si no existe: «no lo encuentro». Si se vendió: ofrece otros o asesor | — |
| **agregar / otro** *(solo con carrito)* | Ficha con **Agregar este / Ver otro código / Ver mi pedido** y «¿Quieres agregar otro?» | Acepta código **o modelo** (sin IA: `detectar_equipo`). Nunca agrega un equipo sin stock ni repetido. Máximo configurable (hoy 5) | `compra.equipos` (lista) |
| **tipo** | «¿Compras como distribuidor o como cliente final?» | **Solo pregunta si no lo sabe.** Lo lee de la ficha («Tipo de cliente»), de lo que marcó el menú o de la etiqueta `Interes-Distribuidor` (F4·48) | Ficha → `tipo_cliente`: no se vuelve a preguntar |
| **confirmar** | Resumen con equipos y **total**, y «Sí, enviar cuentas / Asesor / Cancelar» | **Recalcula con la base**: precio vigente de cada equipo, quita los agotados con aviso. **Configuración $80.000**: una sola vez por pedido, solo si es cliente final y algún equipo no es «Nuevo» (usados grado A/B, «Usado», «Semi nuevo»); distribuidor nunca | `st.valor`, `Código producto`, `Valor estimado` |
| **esperando_pago** | Imagen de medios de pago + texto de cuentas (Agente → Compra) | Si **no hay texto de cuentas aprobado**, no inventa nada: pasa a un asesor para que las envíe. Arma un recordatorio a las **12 h** | Etiqueta `Compra-Iniciada`, oportunidad → **Esperando pago**, nota para el asesor |
| **pago_por_confirmar** | «Recibimos tu soporte. Un asesor está validando el pago…» | La **foto o PDF** del cliente (o «ya pagué» con archivo) cierra este paso. **Nadie confirma el pago solo.** El chat pasa a la cola | Etiquetas `Pago-Por-Confirmar` y `Comprobante-Por-Validar`, oportunidad → **Pago por confirmar**, tarjeta en la Bandeja |

Reglas transversales de cualquier paso:

- **«asesor», «9» o el botón «Hablar con asesor»**: se deja una nota para el asesor con *qué compra llevaba* y se pasa a la cola. Con
  un cuadro 🛒 Carrito, sigue su flecha **«Pidió asesor»**.
- **«ya no quiero», «cancelar», «mejor no»**: texto de cancelación (Agente → Compra) y etiqueta `Compra-Cancelada`. El embudo puede llevar la
  oportunidad a una etapa de «cancelada» (la única vez que puede ir hacia atrás), **pero hoy ninguno de los dos embudos la tiene
  configurada** (`compra_etapas.cancelada_id` vacío): la oportunidad se queda donde estaba y queda solo la etiqueta.
- **«0», «menú», «inicio»** (antes de las cuentas): sale de la compra y el menú vuelve a mandar.
- **Un archivo antes de recibir las cuentas**: al asesor (el bot no sabe qué es).
- **Esperando el pago, el cliente escribe otra cosa** (su dirección, una duda): se anota para el asesor y se le recuerda **una sola vez**
  que mande el comprobante.

### 5.2 Después del comprobante (lo valida una persona)

1. **La Bandeja** muestra la tarjeta «💳 Comprobante por validar» con **✅ Pago completo · ◐ Pago parcial · ❌ No es válido** (F4·46 y F4·59).
2. **Pago completo:** el pago queda registrado con su soporte; la oportunidad pasa a **Alistamiento** (y se crea el pedido PED-0000
   del servicio técnico); el cliente recibe el texto de **pago confirmado**.
3. **Después de validar**, el motor decide a dónde va el cliente, en este orden: la flecha **«Pedido pagado»** del cuadro Carrito → el
   **bot de despacho** elegido en Agente → Compra (hoy «Datos de despacho») → el asesor.
4. **El bot de despacho** (que sí es un flujo del lienzo) pregunta cómo recibe el equipo, recoge los datos de envío y termina en el cuadro
   **Asesor con «solo el texto de cierre»**: política de despacho + el **resumen del pedido** (F4·64); el chat queda con el asesor.
5. **Pago parcial:** se registra el abono, el cliente recibe el saldo pendiente y el pedido **espera el resto** (con la excepción
   «Despachar con saldo pendiente» para clientes especiales).
6. **No válido:** el cliente recibe el motivo y puede mandar otro comprobante; al **segundo rechazo** queda `Revisar-Posible-Fraude` y el
   chat con el asesor.

---

## 6. Qué guarda el motor y dónde mirarlo

| Dato | Dónde | Quién lo ve |
|---|---|---|
| Paso de la compra, equipos, total, tipo, abono y saldo | `leads.estado_bot.compra` | Se ve en el simulador y en la base; no hay pantalla |
| Etiquetas (`Compra-Iniciada`, `Pago-Por-Confirmar`, `Comprobante-Por-Validar`, `Pago-Validado`, `Saldo-Pendiente`, `Compra-Cancelada`) | `leads.etiquetas` | Bandeja y Ficha |
| Nota del asesor («🛒 Cuentas enviadas… esperando comprobante») | `leads.notas` | Ficha |
| Etapa del embudo | `oportunidades` (por `compra_mover`: **solo avanza**, salvo cancelar) | Embudo, Ficha → Oportunidades |
| Pagos y soportes | tabla `pagos` + bucket `pagos` / `media` | Ficha → Pedido, módulo Pedidos |
| Pedido y servicio técnico | tabla `alistamientos` | Servicio técnico, Pedidos |
| Valor del pedido y código del equipo | `Valor estimado` y `Código producto` de la ficha | Ficha |

---

## 7. Cómo ejecuta esto Avi (el agente)

Avi **no vende por su cuenta**: es un conversador con **herramientas**, y las herramientas son las mismas piezas del motor.

- **Ciclo de un turno:** Avi lee el mensaje + la memoria del cliente → decide una herramienta → el sistema la ejecuta y le devuelve el
  resultado → repite hasta responder o hasta una herramienta que **termina el turno** (`iniciar_compra`, `iniciar_cotizacion`,
  `pasar_a_asesor`). Hay un máximo de vueltas por cuadro (hoy 8) y de pasos por turno (hoy 6).
- **Herramientas:** `buscar_productos`, `ficha_producto`, `buscar_conocimiento`, `enviar_catalogo`, `mover_etapa`, `crear_seguimiento`,
  `capturar_datos`, `iniciar_compra`, `iniciar_cotizacion`, `pasar_a_asesor`. Cada una consulta la base; **Avi no puede decir precio,
  stock ni garantía que no haya consultado en ese turno** (regla fija 1).
- **Reglas que no se pueden quitar desde la pantalla:** nunca cuentas ni cédulas en un texto de Avi; ante un descuento o condición
  especial, a asesor; si el cliente dice «quiero comprar», Avi usa `iniciar_compra` **de inmediato** y no pide antes ciudad ni otros datos.
- **Después de `iniciar_compra`** la conversación ya es del motor: Avi no vuelve a hablar hasta que la compra termine (o el cliente
  salga con «0»).
- **Control y costo:** Configuración → Agente → Cerebro (modelo, tope mensual y respaldo) y Registro (cada llamada con su costo). Si Avi
  falla, atiende el menú como siempre.
- **Alcance:** hoy `lista_blanca`. Para todos los clientes se cambia a «Todos» en Agente → Avi (con el presupuesto y la llave en regla).

---

## 8. Relojes y tiempos

| Qué | Cuánto | Dónde se cambia |
|---|---|---|
| Recordatorio «¿Sigues interesado?» esperando el pago | 12 h, **una sola vez** | Agente → Compra → horas sin respuesta |
| Ventana de WhatsApp para escribir libre | 24 h desde el último mensaje del cliente | Regla de Meta (fuera de ella, solo plantillas) |
| Espera de cada pregunta de los datos de despacho | 15 a 30 min | Cada cuadro del lienzo |
| Retorno del bot tras el asesor | Regla A: cliente callado 5 h · Regla B: asesor sin responder 2 h hábiles | Configuración → Bot → Retorno y seguimiento |
| Cancelación por inactividad | No hay: la compra sigue abierta; el asesor decide | — |

---

## 9. Qué se puede cambiar sin tocar código

| Quiero cambiar… | Voy a… |
|---|---|
| Las frases que abren la compra | Agente → Acciones → «Quiero comprar» → Cuando |
| Si se pueden comprar varios equipos | Agente → Compra → Carrito (casilla y máximo) |
| Las cuentas y la imagen de pago | Agente → Compra (texto) y Agente → Conocimiento → «Medios de pago» (imagen) |
| El cargo de configuración | Agente → Compra → cargo de configuración |
| Los textos de soporte recibido, pago confirmado, abono, no válido y resumen del pedido | Agente → Compra |
| El bot al que va el cliente tras validar el pago | Agente → Compra → «Después de validar el pago, ir al bot» |
| Las preguntas de envío, las políticas y el cierre | Lienzo del bot «Datos de despacho» (borrador → probar → publicar) |
| Quién valida pagos | Roles → permiso «Validar pagos» |
| Qué hace Avi, su tono y sus herramientas | Agente → Avi / Conocimiento / Cerebro |

**Lo que sí es código** (se cambia con una tarea y una prueba): los pasos de la máquina de la sección 5, la regla de cuándo se cobra la
configuración, el orden de la fila de la sección 2, los textos de las preguntas internas de la compra («¿Compras como…?», el resumen
con carrito) y las expresiones que reconocen «ya pagué» o «ya no quiero».

---

## 10. Si algo no funciona: dónde mirar

| Síntoma | Causa probable | Cómo comprobarlo |
|---|---|---|
| «Lo quiero» manda al asesor en vez de abrir la compra | La acción «Quiero comprar» está apagada | Agente → Acciones |
| El bot pregunta «¿otro equipo?» y no el tipo de cliente | El carrito está encendido (es lo esperado) | Agente → Compra → Carrito |
| Repite la pregunta de distribuidor / cliente final | Falta el atributo «Tipo de cliente» o la opción del menú no lo marca | Ficha del cliente → Tipo de cliente |
| No salen las cuentas, pasa a un asesor | El texto de cuentas está vacío | Agente → Compra |
| Pagó y el chat quedó en silencio | Espera la validación: tarjeta «Comprobante por validar» en la Bandeja | Bandeja, y permiso «Validar pagos» |
| Después de validar no pregunta cómo recibir el equipo | No hay bot de despacho elegido o no está publicado | Agente → Compra → bot de despacho |
| Avi no contesta a un cliente | El cliente no está en la lista blanca | Agente → Avi → alcance |
| Algo raro y no sé por dónde | Registro del receptor | `journalctl --user -u crm-meta-receptor -f` (cada mensaje anota el paso: «🛒 compra · confirmar», «⚡ acción», «🤖 Avi») |

Para **reproducir sin molestar a un cliente**: el simulador del lienzo corre el motor del menú sobre un borrador sin escribir ni
enviar; la compra con cuadro 🛒 Carrito también se simula (no la cotización, que guarda un PDF).

---

## 11. Mapa de archivos

| Pieza | Archivo |
|---|---|
| Orden de decisión por mensaje | `herramientas/meta-webhook-prueba/receptor.py` (`_contestar`) |
| Máquina de la compra, carrito, validación, abono, resumen | `.../compra.py` |
| Menú: código → ficha, opciones, texto libre, cuadro Asesor, Carrito | `.../flujo.py` |
| Acciones «Cuando → Hacer» y sus pasos | `.../acciones.py` |
| Avi: herramientas, prompt, memoria, cuadro Agente | `.../agente.py` |
| Cotización en PDF | `.../cotizacion.py` |
| Retorno y recordatorios | `.../retorno.py` y el reloj del receptor |
| Reglas de la base (pagos, validar, abono, etapas, pedido) | `supabase/migrations/` (0046 a 0069) |
| Pantallas de configuración | `crm/src/app/(app)/agente/` |

Documentos relacionados: [AGENTE.md](AGENTE.md) (módulo Agente y compra, RAG-19 a RAG-80), [FLUJO-DEL-BOT.md](FLUJO-DEL-BOT.md) (lienzo y
cierre de despacho, RF-40 a RF-51), [MEJORAS-CHAT-Y-PAGOS.md](MEJORAS-CHAT-Y-PAGOS.md) (pago parcial y chat del asesor),
[ALISTAMIENTO-Y-VIDEO-TECNICO.md](ALISTAMIENTO-Y-VIDEO-TECNICO.md) y [PEDIDOS.md](PEDIDOS.md) (lo que ocurre después del pago).

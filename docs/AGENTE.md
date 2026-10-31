# Módulo Agente: un bot con IA que entiende, decide, responde y lleva a la venta (F4·22)

**Estado:** 📝 Documentado, por construir · 31 oct 2026 · ajustado el mismo día con el flujo Menú guiado + Agente de compra + Asesor · Decisión [0032](decisiones/0032-modulo-agente.md) (modifica la 0016)
Referencias que trajo el dueño: diagramas de agentes de otros CRM (canales → buffer → agente → respuesta, con modelo, memoria,
conocimiento y herramientas alrededor).

## Qué pidió el dueño (31 oct 2026)

Un módulo **Agente** como en otros CRM: un bot que **entiende, decide, envía y cierra ventas**, con:

- **Cerebro:** el modelo de IA, a elegir (DeepSeek, OpenAI…).
- **Memoria:** las conversaciones y los datos de cada cliente.
- **Conocimiento:** la base de datos (inventario), las preguntas frecuentes y lo que el bot sabe del negocio.
- **Personalidad** y **prompt** del agente, editables.

El CRM queda con **tres formas de atender**, no una:

| Modo | Cómo responde | Quién escribe el texto | Costo |
|---|---|---|---|
| **Menú guiado** | Solo el árbol del lienzo, con botones | Las plantillas del lienzo | Gratis |
| **Híbrido** (decisión 0016, el de hoy) | Árbol + texto libre: la IA solo extrae filtros | Las plantillas, con datos de la base | Casi gratis |
| **Agente** (nuevo) | Conversación libre: la IA entiende y decide qué hacer | La IA, con datos que trae de la base por herramientas | Por mensaje (tokens) |

## La idea del dueño: Menú guiado + Agente + Asesor = venta cerrada (31 oct 2026)

El dueño no quiere el agente en toda la conversación, sino **en el tramo de compra**. Es lo que intentó en Kommo y se frenó por los créditos:
si la IA solo entra cuando el cliente ya quiere comprar, se usa en pocas conversaciones y el costo baja mucho.

```
1. MENÚ GUIADO (gratis)            2. AGENTE DE COMPRA (IA)              3. ASESOR (humano)
Bienvenida → Productos → uso →     Confirma equipo y total →             Verifica el pago en el banco →
presupuesto → catálogo → ficha     resuelve dudas (envío, garantía) →    Pago confirmado → Alistamiento →
técnica del equipo                 envía las cuentas (texto aprobado) →  Despachado → venta cerrada
     │                             pide datos de envío → espera pago
     │  "quiero comprar 100-102-1030"        │  llega foto / PDF del comprobante
     └──────────────► entra el agente        └──────────────► el agente se apaga y pasa al asesor
```

### Tramo 1 · Menú guiado (como hoy)

- El cliente recorre el árbol del lienzo hasta la **ficha técnica** del equipo (o hace sus preguntas en el Híbrido).
- La ficha termina invitando a comprar: *«¿Te gusta? Escribe **quiero comprar 100-102-1030**»* y, si cabe, un botón **Comprar**.
- RAG-19. **Disparo sin IA:** las reglas del intérprete (0016) detectan la intención de compra ("quiero comprar", "deseo comprar", "lo quiero",
  "lo compro", "cómo pago", botón Comprar) y el código del equipo, escrito o el de la última ficha que vio. Detectarlo no gasta tokens.
  "Ya pagué" o "ya transferí" **no** cuentan como intención de compra (error que tuvo el agente de Kommo).

### Tramo 2 · Agente de compra

Entra con el equipo ya elegido y la memoria del cliente. Hace, en este orden flexible (conversando, no con menú):

1. **Confirma el equipo y el total** con `buscar_productos`/`cotizar`: precio de la ficha y, si es **cliente final**, los $80.000 de
   configuración (pregunta si es distribuidor o cliente final si no lo sabe). Comprueba que siga en stock.
2. **Resuelve dudas** del cierre con el conocimiento: envíos, tiempos, garantía, pago con tarjeta (+6 %), contra entrega o no.
3. **Envía las cuentas** con la herramienta `enviar_datos_pago`: manda **el texto exacto que aprobó el dueño**, completo y sin cortes
   (en Kommo se cortaba a ~330 caracteres). La IA **nunca escribe** números de cuenta, titulares ni llaves.
4. **Pide los datos de envío** (nombre completo, cédula, ciudad y dirección, teléfono) y los guarda con `capturar_datos`.
5. Mueve la oportunidad a **Esperando pago** y deja la tarea *«Esperar comprobante»*.
6. Si el cliente se arrepiente ("ya no quiero", "cancelar") → etapa **En atención**, etiqueta `Compra-Cancelada`, mensaje de despedida y asesor.

### El paso al asesor (sin IA)

- RAG-20. **Detección del comprobante:** con la oportunidad en *Esperando pago*, si el cliente manda una **foto o un PDF**, o escribe "ya pagué",
  "ya transferí", "listo el pago", el **sistema** (no la IA):
  1. mueve la oportunidad a **Pago por confirmar** y pone la etiqueta `Pago-Por-Confirmar`;
  2. responde el texto fijo *«✅ Recibimos tu comprobante. Un asesor valida tu pago y te confirma por aquí. 🙌»*;
  3. **apaga el agente** en ese chat (`Pausar bot`) y lo pone en la **cola de la Bandeja** con aviso y la tarea *«Verificar transferencia y datos de envío»*;
  4. deja al asesor un **resumen**: equipo, total, tipo de cliente, datos de envío y el comprobante a la vista.
- RAG-21. **Nadie confirma un pago automáticamente.** Opcional (después): un modelo con visión puede leer la foto y anotar *«parece comprobante
  de Bancolombia por $1.930.000»* como **ayuda** para el asesor; nunca cambia la etapa a *Pago confirmado*.
- RAG-22. **Tiempos:** el texto de cuentas avisa *20 minutos* para pagar (luego se vuelve a validar disponibilidad). Si en **12 horas** no hay
  respuesta, el sistema manda *«👋 ¿Sigues interesado en el equipo?»* (reloj de la Pausa, F4·13) y deja seguimiento al asesor. Más de 24 h solo con
  plantilla de Meta.

### Tramo 3 · Asesor

El asesor revisa el banco, confirma y mueve **Pago confirmado → Alistamiento → Despachado** (avisos al cliente con plantillas de Meta cuando
pasaron más de 24 h). Esa es la **venta cerrada** que cuentan las Métricas.

### Por qué así cuesta poco

La IA solo trabaja en el tramo 2: unos pocos turnos por compra, y solo en las conversaciones que llegaron a "quiero comprar". El resto
(menú, ficha, detección de compra y de comprobante, avisos) es gratis porque lo hace el sistema. El costo real por compra se ve en el Registro (RAG-18).

## Lección de Kommo (por qué este diseño)

El 30 oct se apagó el Agente IA de Kommo: gastó 456 de 1.250 créditos con pocas pruebas (15 por respuesta), **falló en pasos
exactos** y **mandó las cuentas de banco a clientes reales**. De ahí salen tres reglas de este módulo:

1. Los **pasos exactos** (precio, stock, ficha, catálogo, mover etapa, pasar a asesor) los hace el sistema con **herramientas**, no la IA de memoria.
2. El **costo se ve y tiene tope**: presupuesto mensual, contador por conversación y vuelta automática a Híbrido al llegar al tope.
3. **Datos de pago:** solo el **texto exacto aprobado por el dueño**, enviado por una herramienta; la IA nunca los escribe. **Confirmar un pago:
   siempre una persona** (RAG-09, RAG-21).

## Cómo funciona (el recorrido de un mensaje)

```
Cliente (WhatsApp) → Buffer → Agente ──────────────→ Respuesta → WhatsApp
                      15 s     │ prompt + personalidad   máx. 3 mensajes,
                      agrupa   │ máx. 6 pasos por turno  1 s entre mensajes
                      mensajes │
          ┌────────────┬───────┴──────┬──────────────────┐
        Cerebro      Memoria     Conocimiento        Herramientas
        (modelo)   (cliente y   (FAQ, políticas,   (buscar productos, ficha,
                   conversación) catálogos)         catálogo, asesor, etapa…)
```

1. **Buffer.** El cliente suele escribir en varios mensajes cortos ("hola" · "busco un portátil" · "i5"). El agente espera unos segundos
   (por defecto 15) y los toma juntos: una sola respuesta, menos costo.
2. **Agente.** Recibe el prompt del sistema (reglas fijas + personalidad + prompt del dueño), la memoria del cliente y los mensajes. Decide:
   responder, o usar una herramienta y seguir (hasta **6 pasos por turno**).
3. **Herramientas.** Cada una es código del sistema que lee o escribe en la base. La IA pide ("busca Dell i5 hasta 2 millones") y el sistema
   devuelve datos reales.
4. **Verificación.** Antes de enviar, el sistema revisa la respuesta (RAG-02): ningún precio que no haya salido de una herramienta en ese turno.
5. **Respuesta.** Máximo 3 mensajes por turno, 1 s entre uno y otro. Fichas y catálogos salen con fotos y PDF como hoy.

## Las piezas del agente

### 1. Cerebro (modelo de IA)

| Proveedor | Para qué | Nota |
|---|---|---|
| **DeepSeek** | Recomendado para empezar | Muy barato y bueno con herramientas; API compatible con OpenAI |
| **OpenAI** (GPT) | Alternativa o respaldo | Compatible con OpenAI |
| **Google Gemini** | Alternativa | Ya hay soporte parcial en el intérprete (0016) |
| **Anthropic** (Claude) | Alternativa de alta calidad | API propia |
| **Local (qwen3, llama.cpp)** | Respaldo gratis sin internet | Lento (10–12 s) y menos fiable con herramientas |

- RAG-10. Se elige **modelo principal** y **modelo de respaldo**: si el principal falla o tarda más de 20 s, responde el respaldo; si los
  dos fallan, el mensaje lo atiende el modo **Híbrido** y queda anotado.
- RAG-11. Las **llaves de API** se guardan cifradas en Vault, igual que las de Meta (decisión 0029): se pegan en la pantalla y nunca se vuelven a mostrar.
- Ajustes: temperatura (por defecto baja, 0,3), largo máximo de respuesta y botón **Probar conexión**.

### 2. Memoria

| Qué recuerda | De dónde sale |
|---|---|
| Los **últimos 20 mensajes** de la conversación (ajustable) | Tabla `mensajes` |
| La **ficha del cliente**: nombre, ciudad, etapa, etiquetas, presupuesto, equipo de interés, oportunidades abiertas | `leads` y `oportunidades` |
| Un **resumen** de conversaciones anteriores (si volvió días después) | Columna nueva `leads.resumen_agente`, la escribe el agente al cerrar un turno largo |
| Los datos que el agente **capturó** | Herramienta `capturar_datos` → campos del lead |

- RAG-12. La memoria es **por cliente**: el agente nunca ve conversaciones de otros clientes.

### 3. Conocimiento (lo que sabe del negocio)

| Fuente | Cómo la usa |
|---|---|
| **Inventario en vivo** (`productos`) | Solo por herramientas (`buscar_productos`, `ficha_producto`). **No** se copia al prompt: siempre está al día y no gasta tokens |
| **Preguntas frecuentes** (tabla nueva `conocimiento`) | El dueño escribe pregunta y respuesta por categoría (Envíos, Garantía, Pagos, Configuración, Distribuidores…) y las activa o apaga. El agente las busca con `buscar_conocimiento` |
| **Políticas** del negocio | Las mismas fichas de `conocimiento`, categoría Políticas: garantía, envíos, devoluciones, precio de distribución + $80.000 de configuración |
| **Catálogos** (`catalogos`) | Herramienta `enviar_catalogo`, igual que el bot de hoy |
| **Horario** (`horario_atencion`, festivos) | Lo sabe siempre (va en el prompt): cuándo hay asesores |

- MVP: búsqueda por texto en Postgres. Búsqueda por significado (embeddings) queda para después si hace falta.

### 4. Personalidad y prompt

- **Nombre del agente** (ej. «Valentina de Ventas Virtuales»), **tono** (cercano / formal), **emojis** (sí / pocos / no), **largo** de las
  respuestas (corto / medio) y **trato** (tú / usted).
- **Prompt del dueño:** texto libre con lo que quiera que haga ("pregunta siempre para qué lo va a usar", "ofrece primero los grado A").
- RAG-13. Sobre el prompt del dueño van siempre las **reglas fijas** del sistema (RAG-01 a RAG-09), que no se pueden borrar desde la pantalla.
  Se muestran en gris para que el dueño sepa que existen.

### 5. Herramientas (lo que el agente puede hacer)

| Herramienta | Qué hace | Escribe en la base |
|---|---|---|
| `buscar_productos` | Busca en el inventario por marca, procesador, RAM, precio, uso; devuelve código, nombre, precio y stock reales | No |
| `ficha_producto` | Envía la ficha de un código con fotos y video (la misma del bot de hoy) | No |
| `enviar_catalogo` | Envía el catálogo PDF o el enlace de Drive que corresponde | No |
| `buscar_conocimiento` | Busca en preguntas frecuentes y políticas | No |
| `capturar_datos` | Guarda nombre, ciudad, presupuesto, uso, equipo de interés | Sí, en el lead |
| `cotizar` | Arma una cotización con precios de la base (precio × cantidad) y la guarda | Sí |
| `mover_etapa` | Mueve la oportunidad **solo hacia adelante** (regla del proyecto) | Sí |
| `crear_seguimiento` | Deja un recordatorio para un asesor | Sí |
| `enviar_datos_pago` | Envía el **texto de cuentas aprobado por el dueño**, completo, y mueve a *Esperando pago* (solo en el tramo de compra) | Sí |
| `cancelar_compra` | Etapa *En atención*, etiqueta `Compra-Cancelada`, despedida y asesor | Sí |
| `pasar_a_asesor` | Pausa al agente y pone el chat en la cola de la Bandeja, con un resumen para el asesor | Sí |

- Cada herramienta se puede **apagar** desde la pantalla. Cada uso queda en el registro.

## Reglas fijas del agente (no se pueden quitar desde la pantalla)

- RAG-01. **Precios, stock, especificaciones y condiciones salen solo de las herramientas.** Si no las consultó, no los dice.
- RAG-02. **Verificación antes de enviar:** si la respuesta trae un precio (`$`, "millones", cifras) que no apareció en un resultado de herramienta de
  ese turno, no se envía: el agente lo intenta una vez más y, si vuelve a pasar, el chat pasa a asesor y queda marcado para revisión.
- RAG-03. **No promete** descuentos, tiempos de entrega ni garantías que no estén en el conocimiento.
- RAG-04. Si no sabe o el cliente lo pide, **pasa a asesor** (la misma cola y avisos de hoy). Tres respuestas sin avance también pasan a asesor.
- RAG-05. **No responde** si el chat está con un asesor (`Pausar bot`): el asesor manda, como hoy.
- RAG-06. El **embudo solo avanza**; el agente nunca devuelve una oportunidad.
- RAG-07. Respeta la **ventana de 24 h** de Meta y el **horario**: fuera de horario puede atender, pero avisa cuándo responde un asesor.
- RAG-08. **Límite por turno** (6 pasos, 3 mensajes) y **por conversación** (por defecto 40 turnos al día); al pasarlo, a asesor.
- RAG-09. **Datos de pago solo con el texto aprobado** (cambiado por el dueño el 31 oct 2026): el agente envía las cuentas únicamente con
  `enviar_datos_pago`, que manda el texto que el dueño escribió en la pantalla; la IA no puede escribir ni modificar números de cuenta,
  titulares, cédulas ni llaves (la verificación de RAG-02 también bloquea números de cuenta sueltos). El agente **no confirma pagos**: con el
  comprobante, el sistema lo apaga y pasa el chat al asesor (RAG-20, RAG-21).

## Dónde se usa el agente

- RAG-14. El modo se elige **por bot** (lista de bots del lienzo): Menú guiado, Híbrido o Agente. Así se puede tener, por ejemplo, el bot
  principal en Híbrido y el bot de **Distribuidores** en Agente.
- RAG-15. Un bot en modo Agente puede seguir usando el **menú de bienvenida** del lienzo y entregar al agente cuando el cliente escribe libre
  (opción «Hablar con el agente» o salida «Otra respuesta» hacia el agente).
- RAG-16. **Encendido por etapas:** primero solo en el simulador; luego **solo para números de prueba** (lista blanca); después para todos.
  Un interruptor general **Apagar agente** lo devuelve a Híbrido al instante.

## Costos y control

- RAG-17. **Presupuesto mensual** en dólares (ej. US$10). Al 80 % avisa en Inicio y Métricas; al 100 % el agente se apaga solo y atiende el Híbrido.
- RAG-18. Cada turno guarda **tokens de entrada y salida, costo estimado, modelo, herramientas usadas, tiempo y resultado** (tabla `agente_turnos`).
- Métricas nuevas: conversaciones atendidas por el agente, pasadas a asesor, cotizaciones, oportunidades llevadas a *Lista para pagar*, costo por
  conversación y costo por venta.

## Pantalla: Configuración → Agente

| Pestaña | Qué tiene |
|---|---|
| **Resumen** | El diagrama del agente (canal → buffer → agente → respuesta, con cerebro, memoria, conocimiento y herramientas), cada pieza con su estado y su actividad de los últimos 30 días; interruptor **Agente encendido / apagado** |
| **Cerebro** | Proveedor, modelo principal y de respaldo, llave (cifrada), temperatura, Probar conexión |
| **Personalidad** | Nombre, tono, emojis, trato, largo y el prompt del dueño; reglas fijas en gris |
| **Compra** | Texto de cuentas aprobado, frases que disparan la compra, textos fijos (comprobante recibido, ¿sigues interesado?, cancelación), tiempos (20 min, 12 h) y si el $80.000 aplica |
| **Conocimiento** | Preguntas frecuentes y políticas por categoría: crear, editar, activar; fuentes conectadas (inventario, catálogos, horario) |
| **Herramientas** | Lista con interruptor y uso de 30 días |
| **Memoria** | Mensajes que recuerda, resumen activado o no |
| **Probar** | Chat de prueba con el agente (como el simulador del lienzo) mostrando qué herramienta usó en cada paso y cuánto costó |
| **Registro** | Turnos recientes: cliente, qué entendió, herramientas, respuesta, costo; filtro por "pasados a asesor" y "bloqueados por RAG-02" |

Permiso nuevo **`administrar_agente`** (del administrador). En la Bandeja, los mensajes del agente se ven con su propia etiqueta (Agente)
distinta de Bot y Asesor, y el asesor ve el resumen que dejó el agente al pasarle el chat.

## Qué hay que construir (por bloques)

| Bloque | Qué | Dónde |
|---|---|---|
| **A · Base** | Tablas `agente_config`, `conocimiento`, `agente_turnos`; `bots.modo`; `leads.resumen_agente`; llaves en Vault; permiso `administrar_agente`; etapas **Esperando pago** y **Pago por confirmar** en Cliente Final; etiquetas `Compra-Iniciada`, `Compra-Cancelada`, `Pago-Por-Confirmar`; pruebas SQL | Migración nueva (la siguiente libre; la 0022 sigue reservada para F4·14) |
| **B · Motor** | `agente.py` en el receptor: buffer, armado del prompt, bucle de herramientas, verificación RAG-02, respaldo de modelo, registro de turnos; en `flujo.py`, el disparo de compra (RAG-19) y la detección del comprobante (RAG-20) sin IA | `herramientas/meta-webhook-prueba/` |
| **C · Pantallas** | Configuración → Agente con sus pestañas; modo por bot en el lienzo; etiqueta Agente en la Bandeja | `crm/src/app/(app)/agente/` |
| **D · Probar** | Pestaña Probar y un juego fijo de conversaciones (precio, stock, código, catálogo, garantía, "quiero comprar", fuera de horario, cliente grosero) que se corre antes de encender | Simulador + prueba automática |
| **E · Piloto** | Lista blanca de números, presupuesto, métricas de costo | Producción con el número de prueba |

## Fuera de alcance (por ahora)

- Instagram, Messenger y Telegram (el brief deja otros canales fuera de v1; el diseño no lo impide).
- Notas de voz e imágenes que manda el cliente (el agente responde "un asesor lo revisa").
- Búsqueda por significado (embeddings) y entrenar modelos propios.
- Que el agente confirme pagos o lea comprobantes para decidir (RAG-21).

## Criterio de terminado

- [ ] Con el mismo juego de conversaciones, el agente **nunca** dice un precio que no esté en la base (RAG-02 probado).
- [ ] Recorrido completo con el número de prueba: menú → ficha → "quiero comprar 100-…" → agente confirma total → cuentas exactas →
      datos de envío → foto del comprobante → agente apagado, chat en la Bandeja con resumen → asesor confirma.
- [ ] "Ya pagué" no reenvía las cuentas; "ya no quiero" cancela; 12 h sin respuesta manda «¿Sigues interesado?».
- [ ] Pasa a asesor cuando lo piden y cuando no sabe; el asesor ve el resumen.
- [ ] Cambiar de proveedor o apagar el agente no deja al cliente sin respuesta (respaldo e Híbrido).
- [ ] El costo de cada conversación se ve en el Registro y el tope mensual apaga el agente.
- [ ] Un asesor sin permiso no ve el módulo ni las llaves; pruebas SQL de permisos.
- [ ] Piloto con números de prueba aprobado por el dueño antes de abrirlo a todos.

## Preguntas al dueño

1. **Proveedor para empezar:** ¿DeepSeek (recomendado por costo) con respaldo OpenAI o el modelo local?
2. **Presupuesto mensual** para el agente (US$).
3. **¿En qué bot arranca?** El tramo de compra sirve en cualquier bot; la pregunta es qué número atiende el CRM propio (el local va por Kommo
   y el CRM propio quedó para Distribuidores).
4. **Nombre y personalidad** del agente.
5. Las **preguntas frecuentes** y políticas iniciales (envíos, garantía, pagos, configuración, distribuidores).
6. ~~¿El agente envía las cuentas?~~ **Respondida el 31 oct 2026:** sí, con el texto exacto aprobado (RAG-09). Falta confirmar si el texto de
   cuentas del Salesbot «Compra» de Kommo (`~/kommo-salesbot/docs/SALESBOT-COMPRA.md`) sirve tal cual.

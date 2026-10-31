# Módulo Agente: un bot con IA que entiende, decide, responde y lleva a la venta (F4·22)

**Estado:** 📝 Documentado, por construir · 31 oct 2026 · Decisión [0032](decisiones/0032-modulo-agente.md) (modifica la 0016)
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

## Lección de Kommo (por qué este diseño)

El 30 oct se apagó el Agente IA de Kommo: gastó 456 de 1.250 créditos con pocas pruebas (15 por respuesta), **falló en pasos
exactos** y **mandó las cuentas de banco a clientes reales**. De ahí salen tres reglas de este módulo:

1. Los **pasos exactos** (precio, stock, ficha, catálogo, mover etapa, pasar a asesor) los hace el sistema con **herramientas**, no la IA de memoria.
2. El **costo se ve y tiene tope**: presupuesto mensual, contador por conversación y vuelta automática a Híbrido al llegar al tope.
3. **Datos de pago y confirmación de pago: siempre una persona**, salvo que el dueño lo active después de forma explícita (RAG-09).

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
- RAG-09. **No envía datos de pago ni confirma pagos.** "Cerrar la venta" para el agente es dejar la oportunidad en **Lista para pagar**
  (cotización hecha, datos del cliente completos) y pasar al asesor, que envía las cuentas y confirma el pago. El dueño puede habilitar después
  el envío de un texto de pago **aprobado por él**, nunca escrito por la IA.

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
| **A · Base** | Tablas `agente_config`, `conocimiento`, `agente_turnos`; `bots.modo`; `leads.resumen_agente`; llaves en Vault; permiso `administrar_agente`; etapa **Lista para pagar**; pruebas SQL | Migración nueva (la siguiente libre; la 0022 sigue reservada para F4·14) |
| **B · Motor** | `agente.py` en el receptor: buffer, armado del prompt, bucle de herramientas, verificación RAG-02, respaldo de modelo, registro de turnos | `herramientas/meta-webhook-prueba/` |
| **C · Pantallas** | Configuración → Agente con sus pestañas; modo por bot en el lienzo; etiqueta Agente en la Bandeja | `crm/src/app/(app)/agente/` |
| **D · Probar** | Pestaña Probar y un juego fijo de conversaciones (precio, stock, código, catálogo, garantía, "quiero comprar", fuera de horario, cliente grosero) que se corre antes de encender | Simulador + prueba automática |
| **E · Piloto** | Lista blanca de números, presupuesto, métricas de costo | Producción con el número de prueba |

## Fuera de alcance (por ahora)

- Instagram, Messenger y Telegram (el brief deja otros canales fuera de v1; el diseño no lo impide).
- Notas de voz e imágenes que manda el cliente (el agente responde "un asesor lo revisa").
- Búsqueda por significado (embeddings) y entrenar modelos propios.
- Que el agente cobre o confirme pagos (RAG-09).

## Criterio de terminado

- [ ] Con el mismo juego de conversaciones, el agente **nunca** dice un precio que no esté en la base (RAG-02 probado).
- [ ] Pasa a asesor cuando lo piden, cuando no sabe y con datos de pago; el asesor ve el resumen.
- [ ] Cambiar de proveedor o apagar el agente no deja al cliente sin respuesta (respaldo e Híbrido).
- [ ] El costo de cada conversación se ve en el Registro y el tope mensual apaga el agente.
- [ ] Un asesor sin permiso no ve el módulo ni las llaves; pruebas SQL de permisos.
- [ ] Piloto con números de prueba aprobado por el dueño antes de abrirlo a todos.

## Preguntas al dueño

1. **Proveedor para empezar:** ¿DeepSeek (recomendado por costo) con respaldo OpenAI o el modelo local?
2. **Presupuesto mensual** para el agente (US$).
3. **¿En qué bot arranca?** Recomendado: **Distribuidores** (el CRM propio quedó para esa línea; el local va por Kommo).
4. **Nombre y personalidad** del agente.
5. Las **preguntas frecuentes** y políticas iniciales (envíos, garantía, pagos, configuración, distribuidores).
6. ¿Más adelante el agente podrá enviar un texto de pago aprobado (RAG-09) o siempre lo hará un asesor?

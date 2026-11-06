# Módulo Agente: menú, acciones, compra, cotización y el agente Avi (F4·22 a F4·29)

**Estado:** 🔵 En construcción · F4·22 (base) hecha; F4·23 a F4·26 y F4·32 (conocimiento, acciones, compra, cotización y documentos) construidas el 31 oct 2026 · Dividido en F4·22 a F4·29 · 31 oct 2026 · con las respuestas del dueño, Acciones y flujo de cotización · Decisión [0032](decisiones/0032-modulo-agente.md) (modifica la 0016)
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

> Por orden de construcción, primero este tramo lo hace el **flujo de compra fijo** (F4·25, sin IA). Cuando llegue **Avi** (F4·28), el
> mismo tramo se vuelve conversación: los pasos exactos siguen siendo los del flujo fijo y Avi conversa alrededor.

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

- RAG-19c. **Los textos fijos entienden el horario** (1 nov 2026): el de «comprobante recibido» (pestaña Compra) y el de «chatbot apagado»
  (Bot → Interruptores) pueden llevar `{horario}` (los días y franjas de atención) y `{proxima}` («en breve» si hay atención ahora, o «mañana a las
  8:00 am» según el horario y los festivos). Ejemplo: «Un asesor te responde {proxima}.» No admiten otras marcas. El paso a asesor de siempre ya elige
  entre B-ASESOR (en horario) y B-CERRADO (fuera) en el menú, en la compra y en Avi.
- RAG-19b. **El botón «Lo quiero» de la ficha abre la compra** (arreglo del 1 nov 2026): cuenta como «quiero comprar» si la acción «Quiero comprar»
  está activa, con el equipo de la ficha. Antes pasaba el chat al asesor. Con la acción apagada, sigue pasando al asesor.
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

> **F4·34 (1 nov 2026):** en la pestaña Compra se podrá elegir un bot del lienzo para **después del comprobante** (por ejemplo «Datos de despacho»):
> el cliente responde los datos de envío y luego pasa al asesor. Ver [FLUJO-DEL-BOT.md](FLUJO-DEL-BOT.md#cuadro-pregunta-y-datos-de-despacho-tras-el-pago-f434).

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

## Acciones: «Cuando… → Hacer…» (como Kommo, sin IA)

Al dueño le gustaron las **Acciones** de Kommo. En el CRM propio son reglas que el administrador arma en la pantalla: **cuando** el cliente
escribe algo, **hacer** algo. Se revisan **antes** que el menú y que el agente, cuestan cero y responden al instante. Funcionan en los tres
modos (Menú guiado, Híbrido y Agente).

| Cuando el cliente escribe… | Hacer… |
|---|---|
| «ubicación», «dirección del local», «dónde quedan» | Responder el texto de la ubicación (y el enlace de Google Maps o una foto) |
| «cuentas», «mándame las cuentas», «cómo pago», «número de cuenta» | **Enviar las cuentas** (texto aprobado) y mover a *Esperando pago* |
| «quiero comprar», «deseo comprar», «lo quiero» (+ código) | **Iniciar el flujo de compra** (tramo 2) |
| «cotización», «cotízame», «necesito una cotización» | **Iniciar el flujo de cotización** |
| «devolución», «devolver», «cambio» | Responder la **política de devoluciones** (texto o imagen) |
| «garantía» | Responder la **política de garantía** (texto o imagen) |
| «horario», «a qué hora abren» | Responder el horario (sale de Bot y horario) |
| «asesor», «hablar con alguien», «humano» | **Pasar a asesor**: *«Te paso con un asesor, en breve te escribe 🙌»* + cola de la Bandeja |

- RAG-23. **Cuándo:** una o varias frases por acción, con las mismas formas del cuadro Condiciones del lienzo (contiene, es igual a, empieza por).
  Opcional para frases que no coinciden: la IA solo **clasifica** a cuál acción se parece (no responde); se puede apagar para no gastar.
- RAG-24. **Hacer** es una lista de pasos, en orden: *responder texto*, *responder imagen o PDF*, *enviar cuentas*, *iniciar flujo* (compra,
  cotización u otro bot del lienzo), *mover etapa* (solo adelante), *poner etiqueta*, *crear seguimiento*, *pasar a asesor*.
- RAG-25. **Prioridad:** las acciones se revisan de arriba abajo y gana la primera que coincide. «Asesor» va siempre primero y no se puede
  borrar. Una acción **no corre** si el chat está con un asesor (RAG-05), salvo «Pasar a asesor».
- RAG-26. Cada acción guarda cuántas veces corrió (30 días) y se puede **probar** desde la pantalla escribiendo una frase.
- Esto **absorbe la parte de palabras clave de F4·14** (arrancar un bot por palabra clave = acción «iniciar flujo»). La parte de arrancar por
  etapa del embudo sigue en F4·14.

## Flujo de cotización (sin IA)

Pedido del dueño: capturar los datos y enviar una cotización con las reglas del negocio.

1. **Disparo:** acción «cotización», botón *Cotizar* en la ficha, o el agente lo propone en el tramo de compra.
2. **Captura**, una pregunta por mensaje y validando cada dato: **nombre completo**, **cédula** (solo números, 6 a 10 dígitos), **celular**
   (10 dígitos, empieza por 3; por defecto el mismo número de WhatsApp: «¿Es este? 1 Sí / 2 Otro»), **producto** (código; si viene de una
   ficha, ya lo sabe) y **cantidad**.
3. **Reglas del negocio** (editables en la pantalla Compra/Cotización):
   - Precio = el de la base al momento de cotizar (la IA no lo toca).
   - **Distribuidor** (el CRM propio atiende esta línea): precio de distribución, sin cargo de configuración.
   - **Cliente final:** + **$80.000** de configuración por equipo.
   - Pago con tarjeta: + **6 %** (se muestra como opción, no se suma por defecto).
   - **Validez** de la cotización (ej. 24 horas o hasta agotar existencias) y nota de disponibilidad.
4. **Envío:** un **PDF de cotización** con logo (el de Apariencia), número consecutivo, fecha, datos del cliente, equipo con código y
   especificaciones, cantidad, subtotal, cargos y total, validez y cómo pagar. Lo acompaña un mensaje corto: *«Te envío tu cotización 📄.
   Si quieres comprar, escribe **quiero comprar**»*.
5. **En el CRM:** guarda la cotización (consecutivo, cliente, ítems, total, PDF), llena los datos del lead, mueve a la etapa **Cotización** y
   deja un seguimiento al asesor.

- RAG-27. La cotización es un documento del sistema: se puede **reenviar** y **descargar** desde la ficha del cliente en la Bandeja.
- RAG-28. Si el equipo ya no tiene stock al cotizar, no se cotiza: se ofrece pasar a asesor o ver equipos parecidos.

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
- RAG-34. **Cualquier proveedor** (pedido del dueño, 31 oct 2026): además de los cinco de la tabla, existe **Otro proveedor**: se escribe la dirección del
  servicio y se elige si habla como OpenAI o como Anthropic. Cada modelo (principal y respaldo) guarda su dirección, su tipo de API y sus
  **precios por millón de tokens** (valores de partida editables: cambian y hay que confirmarlos con el proveedor); con ellos se estima el costo de cada turno.
  El modelo local no necesita llave ni cuesta, y nunca se detiene por el presupuesto.

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

### 3b. Documentos de conocimiento (F4·32)

Pedido del dueño (31 oct 2026): **subir documentos en texto, PDF o Excel** para que el agente los tenga como conocimiento y los use, y poder
**reemplazarlos, apagarlos o eliminarlos**. Las fichas (F4·23) son respuestas exactas que el bot envía tal cual; los documentos son material
de consulta que el agente **lee para redactar** su respuesta.

| | Fichas (F4·23) | Documentos (F4·32) |
|---|---|---|
| Qué son | Una pregunta y su respuesta exacta | Manuales, políticas largas, listas de preguntas, condiciones de distribuidores |
| Quién las usa | Acciones (sin IA) y el agente | Solo el agente |
| Cómo llegan al cliente | Se envían tal cual (texto, imagen o PDF) | El agente busca los trozos que sirven y redacta con ellos |

**Formatos:** texto (`.txt`, `.md`), **PDF con texto** (`.pdf`), **Excel** (`.xlsx`) y **CSV**. Word (`.docx`) después. Hasta **10 MB** por archivo.

**Cómo se procesa al subir:**

1. El archivo se guarda en el bucket privado `conocimiento` (carpeta `documentos/`).
2. El servidor **extrae el texto**: PDF con `pdftotext` (ya instalado), Excel y CSV fila por fila (cada fila es un trozo con sus
   encabezados: «Pregunta: … · Respuesta: …»), texto tal cual.
3. Lo parte en **trozos** de unos 800 caracteres que se solapan un poco, sin cortar a mitad de frase, y los guarda con un índice de
   búsqueda en español.
4. El documento queda **Listo** con el número de trozos, o con **Error** y el motivo (por ejemplo, un PDF escaneado sin texto).

**En la pantalla (pestaña Conocimiento → Documentos):**

- Lista con nombre, tipo, tamaño, trozos, estado (Procesando / Listo / Error), activo, quién y cuándo lo subió.
- **Subir** (uno o varios), **Reemplazar** (sube la versión nueva y vuelve a procesar; la vieja se borra), **Activar / apagar** (el agente
  deja de consultarlo sin borrarlo), **Eliminar** (borra archivo y trozos, con confirmación).
- **Ver texto extraído**: los trozos tal como los leerá el agente, para revisar que el PDF se leyó bien.
- **Probar búsqueda**: escribir una pregunta («¿cuánto tarda un envío a Cali?») y ver qué trozos encuentra.

**Reglas:**

- RAG-29. El agente consulta fichas y documentos **activos** con `buscar_conocimiento` (los 5 trozos más parecidos); nunca el archivo entero.
- RAG-30. **Precios y stock no salen de documentos**: aunque un documento tenga una lista de precios vieja, para el agente solo cuentan los
  precios de `buscar_productos` (RAG-01); la verificación RAG-02 no acepta un precio que venga de un documento.
- RAG-31. Si dos fuentes se contradicen, gana la **ficha** sobre el documento y el documento **más reciente** sobre el viejo.
- RAG-32. Los trozos que el agente usó quedan en el Registro del turno: se puede ver de qué documento sacó cada respuesta.
- RAG-33. Lo que el agente envía al proveedor de IA son solo los trozos encontrados, no los documentos completos.

**Fuera de alcance por ahora:** PDF escaneados (necesitan reconocimiento de texto, OCR), imágenes con texto, Word, páginas web y búsqueda
por significado (embeddings con `pgvector`); se suman si la búsqueda por palabras se queda corta.

### 4. Personalidad y prompt

- **Nombre del agente** (ej. «Valentina de Ventas Virtuales»), **tono** (cercano / formal), **emojis** (sí / pocos / no), **largo** de las
  respuestas (corto / medio) y **trato** (tú / usted).
- **Prompt del dueño:** texto libre con lo que quiera que haga ("pregunta siempre para qué lo va a usar", "ofrece primero los grado A").
- RAG-13. Sobre el prompt del dueño van siempre las **reglas fijas** del sistema (RAG-01 a RAG-09), que no se pueden borrar desde la pantalla.
  Se muestran en gris para que el dueño sepa que existen.

### 4b. Responder como una persona: «escribiendo…» y pausas (F4·36)

**Pedido el 1 nov 2026.** Que el cliente vea **«escribiendo…»** en WhatsApp antes de cada respuesta y que una respuesta larga llegue en varios
mensajes con una pausa entre ellos, como escribe una persona y no como un muro de texto. Se ajusta en **Configuración → Agente → Avi**, sección
**Respuesta**.

- RAG-35. **Mostrar «escribiendo…»** (encendido por defecto). Al llegar el mensaje del cliente, el receptor le pide a Meta el indicador de
  escritura con el id de ese mensaje (`status: read` + `typing_indicator: text`). WhatsApp lo muestra hasta que sale la respuesta o hasta 25 s.
  **Ojo:** ese mismo pedido marca el mensaje del cliente como **leído** (✓✓ azul). Vale para todo lo que responde el bot (menú, preguntas,
  compra, Avi), no para los chats que atiende un asesor ni con el Chatbot apagado.
- RAG-36. **Espera antes de responder** (0 a 5 s, por defecto 1,5 s): el bot no contesta al instante aunque la respuesta esté lista. Si preparar la
  respuesta tardó más (Avi), no se espera de más.
- RAG-37. **Pausa entre mensajes** (0 a 5 s, por defecto 1 s): entre los mensajes de una misma respuesta se vuelve a mostrar «escribiendo…» y se
  espera. El **máximo de mensajes por respuesta** (1 a 5) de Avi pasa a esta sección (antes estaba en Límites).
- RAG-38. El simulador y Probar no esperan (son para probar rápido). El indicador no cuesta: no es un mensaje de Meta.

### 4c. Lista de equipos con plantilla (F4·37)

**Pedido el 1 nov 2026.** Que Avi muestre siempre los equipos organizados (lista, especificaciones, precio y emojis) y que el dueño pueda
**modificar o agregar atributos** de esa lista desde **Configuración → Agente → Avi → Cómo muestra los equipos**.

- RAG-39. **El sistema arma la lista, no la IA.** Avi decide qué equipos recomendar (por código) y escribe una frase antes y una pregunta
  después; cada equipo se arma con la plantilla y los datos de la tabla `productos`. Así la forma es siempre igual y los precios salen de la base
  (decisión 0016). Formato de Avi: `{"responder": "frase", "equipos": ["código", …], "despues": "pregunta"}`.
- RAG-40. **Plantilla por atributos.** Cada renglón es un atributo: un emoji y uno o varios datos del equipo, con texto libre si se quiere
  (ej. `⚙️ {procesador} · {ram} · {disco}`). Se puede **modificar** un renglón, **agregar** otro (botón «+ Agregar atributo» con la lista de
  datos), quitarlo y cambiarlo de orden. Datos: `{equipo}` (marca y modelo), `{codigo}`, `{marca}`, `{modelo}`, `{procesador}`, `{generacion}`,
  `{ram}`, `{disco}`, `{estado}`, `{precio}`, `{stock}`, `{categoria}`, `{descripcion}`, más cada **atributo del producto** con su clave
  (F4·41, por ejemplo `{grafica}`). Un renglón cuyo dato está vacío no sale.
- RAG-41. **Máximo de equipos** (1 a 5, por defecto 3) y **cómo se envían**: todos en un mensaje, o un mensaje por equipo (con la pausa y el
  «escribiendo…» de F4·36). Vista previa con un equipo real del inventario.
- RAG-42. Un código que no existe o que no tiene stock no sale (la lista se arma solo con lo que hay). Si no queda ninguno, Avi responde solo su
  frase. Si en la frase escribe un precio, se revisa como siempre (RAG-02).
- Un atributo **nuevo del inventario** (por ejemplo pantalla o batería, que hoy no existen en `productos`) es otra mejora: hoy se puede usar
  `{descripcion}` para eso.

### 4d. Acción «Pregunta por un equipo» con ficha de plantilla (F4·42)

**Pedido el 6 nov 2026 por el cliente Ventas Tech.** Cuando el cliente pregunta por un equipo («Hola, ¿cuánto vale el Lenovo Legion 7?»),
el bot responde al instante con la ficha de ese equipo, ordenada con emojis, sin gastar IA. Se configura en **Configuración → Agente →
Acciones**, como cualquier otra acción «Cuando → Hacer» (RAG-23 a RAG-26). Decisiones del dueño (6 nov 2026): el disparador vive en
Acciones (no en Avi), la ficha lleva precio de la base, los datos que faltan van como atributos del producto (F4·41, antes) y con varias
coincidencias se envía una lista.

Respuesta esperada (ejemplo con F4·41 cargado; precio y código ilustrativos):

```
¡Hola! 👋🔥
Gracias por tu interés en nuestro Lenovo Legion 7.

🎮 Intel Core i9-11980HK
🚀 NVIDIA GeForce RTX 3080
🧠 32 GB RAM DDR4
💾 SSD NVMe 512 GB
🌈 Teclado RGB
✨ Estado estético 10/10
💰 $ 4.800.000

¿Te lo separo? Escribe *quiero comprar LG7-01*
```

- RAG-43. **Cuándo nuevo: «El mensaje nombra un equipo del inventario».** Además de las frases, una acción puede dispararse cuando el
  mensaje trae un **código** o un **modelo** que existe en `productos` (marca + modelo, como «Legion 7», con `interprete.por_modelo`, el mismo
  del Híbrido y de Avi). Sin IA. Opcional: exigir además una palabra de interés («cuánto», «vale», «precio», «info», «tienen»), editable.
- RAG-44. **Hacer nuevo: «Responder ficha del equipo».** Plantilla en tres partes editables: **encabezado** (texto con datos, ej.
  `¡Hola! 👋🔥 Gracias por tu interés en nuestro {equipo}.`; acepta `{nombre}` del cliente si se conoce), **renglones de atributos** (el mismo
  editor de F4·37: emoji + datos, modificar, agregar, quitar y ordenar; incluye los atributos de F4·41 y `{precio}` por defecto) y **cierre**
  (ej. `¿Te lo separo? Escribe *quiero comprar {codigo}*`). Interruptor «Enviar la foto del equipo» (si tiene). Vista previa con un equipo real.
- RAG-45. **Un equipo → ficha; varios → lista.** Si coincide un solo equipo con stock, sale su ficha. Si coinciden dos o más (dos Legion 7, o
  solo «Lenovo»), sale la lista de F4·37 / F4·40 (hasta el máximo configurado) y «¿Cuál te interesa? Escribe el código». La plantilla de la
  lista sigue siendo la de Avi → «Cómo muestra los equipos».
- RAG-46. **Sin stock o no existe:** mensaje editable («Ese equipo ya no está disponible 😕») y, según se configure, equipos parecidos de la
  misma marca con stock o pasar a asesor. Nunca se ofrece un equipo sin stock (como el arreglo del 3 nov).
- RAG-47. **Precio siempre de la base** (RAG-01). El renglón `{precio}` viene puesto y se puede quitar. La ficha la arma el sistema: la IA
  no interviene.
- RAG-48. **Prioridad y memoria.** Va en la lista de Acciones con su prioridad: «Asesor», «Quiero comprar» y «Cotización» quedan arriba
  (así «quiero comprar el Legion 7» abre la compra y no la ficha). El equipo enviado queda como **último equipo visto** del lead, para que
  «Lo quiero» y «quiero comprar» funcionen sin repetir el código. No corre si el chat está con un asesor (RAG-25). Contador y **Probar con una
  frase**, como las demás acciones.

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

- RAG-14. *(Reemplazada por F4·35, construida el 1 nov 2026, decisión 0034: interruptor «Avi en todo el bot» en Bot → Interruptores y cuadro 🤖 Agente en el lienzo.)* El modo se elige **por bot** (lista de bots del lienzo): Menú guiado, Híbrido o Agente. Así se puede tener, por ejemplo, el bot
  principal en Híbrido y el bot de **Distribuidores** en Agente.
- RAG-15. Un bot en modo Agente puede seguir usando el **menú de bienvenida** del lienzo y entregar al agente cuando el cliente escribe libre
  (opción «Hablar con el agente» o salida «Otra respuesta» hacia el agente).
- RAG-16. **Encendido por etapas:** primero solo en el simulador; luego **solo para números de prueba** (lista blanca); después para todos.
  Un interruptor general **Apagar agente** lo devuelve a Híbrido al instante.

## Costos y control

- RAG-17. **Presupuesto mensual** en dólares, lo fija la empresa en la pantalla Cerebro. Al 80 % avisa en Inicio y Métricas. Al 100 % (o si
  el modelo no responde) el agente **no se queda callado**: responde *«¿Quieres que te atienda un asesor? 🙌»* y pasa el chat a la Bandeja
  para que **un asesor cierre la venta de inmediato** (decisión del dueño, 31 oct 2026). Las Acciones, el menú y los flujos de compra y
  cotización siguen funcionando porque no usan IA.
- RAG-18. Cada turno guarda **tokens de entrada y salida, costo estimado, modelo, herramientas usadas, tiempo y resultado** (tabla `agente_turnos`).
- Métricas nuevas: conversaciones atendidas por el agente, pasadas a asesor, cotizaciones, oportunidades llevadas a *Esperando pago* y *Pago por confirmar*, costo por
  conversación y costo por venta.

## Pantalla: Configuración → Agente

| Pestaña | Qué tiene |
|---|---|
| **Resumen** | El diagrama del agente (canal → buffer → agente → respuesta, con cerebro, memoria, conocimiento y herramientas), cada pieza con su estado y su actividad de los últimos 30 días; interruptor **Agente encendido / apagado** |
| **Cerebro** | Proveedor, modelo principal y de respaldo, llave (cifrada), temperatura, Probar conexión |
| **Personalidad** | Nombre, tono, emojis, trato, largo y el prompt del dueño; reglas fijas en gris |
| **Acciones** | Lista «Cuando… → Hacer…» con prioridad, interruptor, contador de 30 días y prueba con una frase |
| **Compra y cotización** | Texto de cuentas aprobado, textos fijos (comprobante recibido, ¿sigues interesado?, cancelación), tiempos (20 min, 12 h), reglas de precio (distribuidor, cliente final + $80.000, tarjeta + 6 %), validez y consecutivo de la cotización |
| **Conocimiento** | Preguntas frecuentes y políticas por categoría: crear, editar, activar; fuentes conectadas (inventario, catálogos, horario) |
| **Herramientas** | Lista con interruptor y uso de 30 días |
| **Memoria** | Mensajes que recuerda, resumen activado o no |
| **Probar** | Chat de prueba con el agente (como el simulador del lienzo) mostrando qué herramienta usó en cada paso y cuánto costó |
| **Registro** | Turnos recientes: cliente, qué entendió, herramientas, respuesta, costo; filtro por "pasados a asesor" y "bloqueados por RAG-02" |

Permiso nuevo **`administrar_agente`** (del administrador). En la Bandeja, los mensajes del agente se ven con su propia etiqueta (Agente)
distinta de Bot y Asesor, y el asesor ve el resumen que dejó el agente al pasarle el chat.

## Plan de construcción (en orden)

El orden pone primero lo que **no usa IA**: da valor desde el primer bloque, sin costo y sin riesgo, y deja la base lista para el agente.
Cada tarea se construye, la prueba el dueño y se aprueba antes de pasar a la siguiente (como F4·19 a F4·21).

| # | Tarea | Qué entrega | Usa IA |
|---|---|---|---|
| **F4·22** ✅ | **Base del agente** (migración 0024, 15 pruebas SQL, 31 oct 2026) | Migración: `acciones`, `conocimiento`, `cotizaciones` (con consecutivo), `agente_config`, `agente_turnos`; `bots.modo`; `leads.resumen_agente`; etapas *Esperando pago* y *Pago por confirmar*; etiquetas de compra; permiso `administrar_agente`; llaves del proveedor en Vault; pruebas SQL | No |
| **F4·23** ✅ | **Conocimiento** (hecha y probada por WhatsApp el 31 oct 2026) | Pantalla de preguntas frecuentes y políticas (texto o imagen) por categoría: ubicación, garantía, devoluciones, envíos, pagos, distribuidores | No |
| **F4·24** ✅ | **Acciones «Cuando → Hacer»** (hecha y probada por WhatsApp el 31 oct 2026) | Motor en el receptor + pantalla con prioridad, prueba con una frase y contador. Acciones iniciales: ubicación, cuentas, garantía, devoluciones, horario, asesor | No |
| **F4·25** 🔵 | **Flujo de compra** (construida 31 oct 2026, falta la prueba del dueño) | «Quiero comprar <código>» → confirmar equipo y total → cuentas con texto aprobado → datos de envío → *Esperando pago* → comprobante (foto/PDF/«ya pagué») → *Pago por confirmar* → Bandeja con resumen; 20 min, 12 h y cancelación | No |
| **F4·26** 🔵 | **Flujo de cotización** (construida 31 oct 2026, falta la prueba del dueño) | Captura nombre, cédula, celular, producto y cantidad → PDF con reglas del negocio y logo → etapa Cotización; reenviar y descargar desde la Bandeja | No |
| **F4·32** 🔵 | **Documentos de conocimiento** (construida 31 oct 2026, falta la prueba del dueño) | Subir texto, PDF, Excel o CSV; extraer texto, partir en trozos con índice en español; reemplazar, apagar, eliminar, ver texto extraído y probar búsqueda. Lo usa el agente (F4·28) | No |
| **F4·27** 🔵 | **Cerebro (cualquier proveedor)** | Pantalla Cerebro: proveedor, llave cifrada, modelo de respaldo, Probar conexión, presupuesto mensual y contador de costo | Conexión |
| **F4·28** 🔵 | **Agente Avi** (completo 31 oct 2026, falta la prueba del dueño con llave real) | Motor del agente en el tramo de compra: memoria, herramientas, verificación RAG-02, personalidad parametrizable, tope → «¿Quieres un asesor?»; pestañas Personalidad, Probar y Registro; etiqueta *Agente* en la Bandeja | Sí |
| **F4·29** | **Piloto Distribuidores** | Bot de Distribuidores en modo Agente con números de prueba (lista blanca), juego fijo de conversaciones, métricas de costo y conversión; requisito: **webhook fijo** (F2·17) | Sí |

Al terminar F4·26 el CRM ya cierra ventas con **menú + acciones + compra + cotización + asesor**, sin IA. F4·32 (documentos) va antes de Avi
porque es su material de consulta; F4·27 a F4·29 suman a Avi encima. (F4·32 tiene número posterior porque se pidió después de numerar el plan.)

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

## Respuestas del dueño (31 oct 2026)

1. **Proveedor:** **DeepSeek**, con la llave configurada desde la app (Configuración → Agente → Cerebro), guardada cifrada (RAG-11).
2. **Presupuesto:** lo pone la empresa y se fija en la pantalla. Al agotarse, el agente ofrece asesor y **el asesor cierra de inmediato** (RAG-17).
3. **Canales:** **Kommo** sigue con el **cliente final** (ya se pagó). El **CRM propio** atiende a **Distribuidores**. Si el CRM propio se
   perfecciona, se cierra Kommo y se **unifica** todo aquí. Por eso el agente arranca en el bot de Distribuidores (F4·29) y los precios de la
   cotización por defecto son de distribución.
4. **Nombre:** **Avi**. Personalidad **amigable**, parametrizable desde la pantalla.
5. **Acciones como Kommo** («Cuando… → Hacer…»): ubicación, cuentas, compra, cotización con captura de datos, devoluciones, garantía (texto o
   imagen) y asesor. Documentadas arriba (RAG-23 a RAG-28).
6. **Cuentas:** el agente las envía con el texto exacto aprobado (RAG-09). Falta confirmar si el texto del Salesbot «Compra» de Kommo
   (`~/kommo-salesbot/docs/SALESBOT-COMPRA.md`) sirve tal cual.

**Pendiente del dueño antes de F4·23:** los textos de ubicación (con enlace de Maps), garantía, devoluciones, envíos y pagos (o sus imágenes).

## Notas de construcción

- **F4·22 (31 oct 2026), migración 0024:** permiso `administrar_agente`; etapas *Esperando pago* y *Pago por confirmar* en Cliente Final
  («Confirmar transfer» pasó a llamarse *Pago por confirmar*) y en Distribuidor, con `compra_etapas` para que el motor no dependa del nombre;
  `bots.modo` (todos en `hibrido`); `leads.resumen_agente`; tablas `conocimiento` (6 fichas vacías y apagadas: Ubicación, Garantía,
  Devoluciones, Envíos, Pagos, Distribuidores), `acciones` (8 iniciales: solo «Pasar a asesor» activa, no se puede apagar ni borrar),
  `acciones_registro`, `cotizaciones` (consecutivo, cédula y celular validados), `agente_config` (Avi, amigable, DeepSeek, apagado; no se
  enciende para clientes sin llave y presupuesto), `agente_turnos` y `agente_gasto_mes()`; llaves en Vault (`agente_guardar_llave`,
  `agente_llaves` solo para el servidor); buckets privados `conocimiento` y `cotizaciones`. **El texto de cuentas no va en el repositorio:**
  se pega en la pantalla (F4·25). Nada de esto cambia todavía cómo responde el bot.
- **F4·23 (31 oct 2026):** módulo **Configuración → Agente** (permiso `administrar_agente`) con su primera pestaña, **Conocimiento**:
  fichas por categoría con título, respuesta (contador hasta 4.096 caracteres, el límite de WhatsApp), imagen o PDF opcional (bucket
  `conocimiento`, servido por `/archivos/conocimiento/…`), interruptor Activa (no se activa sin contenido), borrar y crear con categoría
  nueva. Cada categoría muestra qué acción la usa y avisa si una acción quedaría sin fichas activas.
- **F4·24 (31 oct 2026):** motor `acciones.py` en el receptor: corre antes del menú, solo con texto escrito (no con botones del menú
  ni media) y nunca con el chat en manos de un asesor; gana la primera acción activa que coincide; si la acción no tiene nada que enviar
  (categoría sin fichas activas, cuentas sin texto) el mensaje sigue por el menú. Pasos que ya corren: texto (con `{nombre}` y `{horario}`),
  conocimiento (texto e imagen o PDF de las fichas, subidos a Meta y reutilizados 25 días), cuentas, ir a otro bot, etiqueta y pasar a asesor.
  Compra y cotización quedan para F4·25 y F4·26 (una acción con esos pasos no se puede activar). Cada uso queda en `acciones_registro`.
  Pestaña **Acciones**: editar frases (contiene / es igual a / empieza por) y pasos, activar, subir y bajar, borrar, crear, contador de 30 días
  y **Probar con una frase** (ruta interna `/interno/acciones` del receptor, el mismo motor sin enviar nada). 18 pruebas del motor en
  `herramientas/meta-webhook-prueba/prueba_acciones.py`. Migraciones 0025 y 0026 ajustan las frases iniciales (sin «una persona», con
  «dónde queda») y quitan el motivo repetido de «Pasar a asesor».
- **F4·25 (31 oct 2026):** `compra.py` en el receptor, sin IA. Se inicia con la acción que tiene el paso «Iniciar flujo de compra»
  («Quiero comprar», apagada hasta que el dueño la active). Equipo: el código escrito, el de la última ficha o lo pide; un código sin stock
  no inicia la compra. Tipo de cliente: botones Distribuidor / Cliente final (los que traen la etiqueta `Interes-Distribuidor` no la ven).
  Resumen con el total (precio de la base + configuración si es cliente final) y botones Sí, enviar cuentas · Hablar con asesor · Cancelar.
  Al confirmar: texto de cuentas tal cual, oportunidad a *Esperando pago* (`compra_mover`, migraciones 0027 y 0028; Distribuidor si tiene
  oportunidad abierta, si no Cliente Final), etiqueta `Compra-Iniciada` y espera de 12 h. Comprobante (foto, PDF, «ya pagué», «comprobante»):
  *Pago por confirmar*, texto fijo, bot pausado (cola de la Bandeja) y una nota en el cliente con equipo, tipo, total y hora. Otros mensajes
  mientras espera (datos de envío) se anotan y se recuerda el comprobante una vez. «asesor» en cualquier paso pasa al asesor con la compra
  anotada. **Cancelar** manda el texto fijo y la etiqueta `Compra-Cancelada` sin pausar el bot (el asesor lo ve por la etiqueta; no hay
  etapa de cancelación elegida: `compra_etapas.cancelada_id` vacío). Sin texto de cuentas, al confirmar pasa al asesor para que las envíe.
  Pestaña **Compra**: los seis pasos, estado de la acción que la inicia, texto de cuentas (solo en la base, no en el repositorio), textos de
  comprobante, ¿sigues interesado? y cancelación, horas del recordatorio y cargo de configuración. 21 pruebas en `prueba_compra.py` y 5 SQL.
- **F4·26 (31 oct 2026):** `cotizacion.py` en el receptor, sin IA. Se inicia con la acción que tiene el paso «Iniciar flujo de
  cotización» («Cotización», apagada). Pide **nombre** (completo, sin números), **cédula o NIT** (6 a 10 números; se limpian puntos y guiones),
  **celular** (ofrece el de WhatsApp con botones Sí, ese / Otro número; 10 dígitos que empiezan por 3), **equipo** (el escrito, el de la última
  ficha o lo pide), **cantidad** (hasta el stock) y **tipo** (los de `Interes-Distribuidor` no lo ven). Precio del inventario al generar; cliente
  final + configuración por equipo; si se agotó, no cotiza (RAG-28). Guarda la fila en `cotizaciones` (consecutivo `COT-000123`), genera el PDF
  con `pdf_cotizacion.py` (wkhtmltopdf, colores y logo de Apariencia, validez, recargo con tarjeta como opción que no se suma), lo sube al bucket
  `cotizaciones` y lo envía como documento con un mensaje que invita a escribir «quiero comprar». El cliente pasa a la etapa *Cotización*, con
  valor y código (así la compra sigue con ese equipo), etiqueta `Cotizacion-Enviada` y nota para el asesor. Pestaña **Cotización**: estado de la
  acción, validez, recargo y las 50 últimas con su PDF. 22 pruebas en `prueba_cotizacion.py` (generan un PDF real). **Pendiente de RAG-27:**
  reenviar y descargar desde la ficha del cliente en la Bandeja (llega con la ficha de F4·30).
- **F4·32 (31 oct 2026), migración 0029:** tablas `conocimiento_documentos` y `conocimiento_fragmentos` con índice de búsqueda en español
  **sin tildes** (configuración `es_sin_tildes` con `unaccent`); las fichas también tienen índice. `buscar_conocimiento(texto, límite)` busca
  en fichas activas y trozos de documentos activos y listos, une las palabras con «o» (una pregunta natural no trae todas las palabras del
  documento) y ordena por parecido; ante empate gana la ficha y el documento más reciente. El bucket `conocimiento` acepta texto, Excel y CSV
  hasta 10 MB. `herramientas/conocimiento/extraer_documento.py` (lo usa la app y sirve en consola): PDF con `pdftotext` (avisa si es escaneado),
  Excel con el mismo lector de la carga del inventario y CSV fila por fila con encabezados, texto partido en trozos de ~800 caracteres que no
  cortan frases y repiten la última frase corta. En la pestaña Conocimiento: **Documentos para el agente** (subir, reemplazar, activar o
  apagar, borrar con sus trozos, ver el texto extraído) y **Probar búsqueda**. 9 pruebas SQL. Lo usará Avi (F4·28) con `buscar_conocimiento`.
- **Prueba real (31 oct 2026):** el dueño probó por WhatsApp la ficha y la acción «Devoluciones» y respondió bien. En esa prueba salieron tres
  hallazgos, ya corregidos: (1) la regla «contiene» exigía la palabra entera y no reconocía plurales (ahora busca al inicio de la palabra);
  (2) una lista de más de 1.024 caracteres la rechazaba Meta (la lista de equipos ahora se corta y avisa cuántos más hay); (3) una ficha activa
  no responde si su acción está apagada: Conocimiento ya lo avisa. Falta probar por WhatsApp Compra (F4·25) y Cotización (F4·26).
- **F4·27 (31 oct 2026), migración 0030:** `agente_config` guarda por modelo `url_base`, `protocolo` (openai/anthropic) y precios por millón de tokens
  (más `tokens_max` y `espera_segundos`); proveedor `otro`; el respaldo debe venir completo; no se enciende para clientes sin llave y presupuesto,
  salvo con modelo local; `agente_tope()` da gasto, porcentaje y si está agotado (el simulador no cuenta). Pantalla **Configuración → Agente → Cerebro**
  (`/agente/cerebro`): contador de gasto con barra, modelo principal y de respaldo (proveedor, modelo, dirección, tipo de API, precios, llave a Vault que
  no se vuelve a mostrar, **Probar conexión** leyendo la llave solo en el servidor), presupuesto, temperatura, largo y espera, y las últimas respuestas.
  `cerebro.py` en el receptor: principal → respaldo → `CerebroError` (atiende el Híbrido), `TopeAgotado` (asesor), cada intento anotado en
  `agente_turnos`. Pruebas: 12 SQL (`0030_cerebro.sql`) y 16 de `prueba_cerebro.py` con un proveedor falso. **Aún no responde a clientes**: eso es F4·28.
  Falta que el dueño consiga la llave de DeepSeek (con saldo), la pegue en Cerebro, ponga el presupuesto (propuesta: US$ 5 al mes) y pruebe la conexión.
- **F4·28 (31 oct 2026):** `agente.py` en el receptor y pestañas **Avi** (`/agente/personalidad`), **Probar** y **Registro**. Avi pide las herramientas en JSON
  dentro del texto (`{"herramienta", "args"}` o `{"responder"}`), así funciona con cualquier proveedor de F4·27. Herramientas: `buscar_productos`, `ficha_producto`,
  `buscar_conocimiento`, `capturar_datos`, `iniciar_compra`, `iniciar_cotizacion` y `pasar_a_asesor` (esta no se puede apagar). **La compra y la cotización siguen siendo
  los flujos fijos**: Avi solo los inicia y el turno termina ahí, así nunca escribe cuentas (RAG-09). Verificación RAG-02 antes de enviar: todo valor en pesos debe
  haber salido de `buscar_productos`, `ficha_producto` o una ficha de conocimiento (no de un documento, RAG-30) y no pasa un número largo que no sea de una herramienta;
  si falla, un reintento y luego asesor con la etiqueta `Revisar-Agente` y la nota. Límites: pasos y mensajes por turno, turnos por día y cliente, memoria. Sin presupuesto:
  «¿Quieres que te atienda un asesor? 🙌» y a la Bandeja. Si ningún modelo responde, atiende el Híbrido. **Cuándo entra:** texto escrito (los números 0 a 9 van al menú), chat sin
  asesor, **bot en modo Agente** (se cambia en la pestaña Avi) y agente **encendido** (Solo en Probar / Números de prueba / Todos); antes corren las Acciones y los flujos de
  compra y cotización. Probar usa el inventario real pero no guarda, no envía y no cuenta para el presupuesto (`/interno/agente`). Pruebas: 28 de `prueba_agente.py`.
  **Completado el mismo día (segunda parte):** buffer en el receptor (los mensajes seguidos se guardan al llegar y Avi responde una vez con
  todo junto; lo que atiende una Acción, la compra, la cotización o una foto no espera; los segundos se cambian en la pestaña Avi, 0 = sin buffer);
  **resumen** de conversaciones anteriores en `leads.resumen_agente` (una llamada barata cada 20 mensajes que salen de la memoria corta, sin números largos,
  va en el prompt); herramientas `enviar_catalogo`, `mover_etapa` (solo avanza las etapas del bot) y `crear_seguimiento` (al asesor del cliente o, si no
  tiene, a quien configuró el agente; si no hay nadie, queda en la nota); **tres respuestas seguidas sin avance → asesor** (avance = búsqueda con
  resultados, ficha, catálogo, datos, etapa); etiquetas `Agente` y `Revisar-Agente` con chips *🤖 Avi* y *Revisar Avi* en la Bandeja; cada paso a
  asesor queda en `agente_turnos`; **métricas del mes** arriba del Registro: conversaciones, pasadas a asesor, cotizaciones, en pago, ventas, costo
  total, por conversación y por venta. Pruebas: 42 de `prueba_agente.py` y 5 de `prueba_buffer.py`.

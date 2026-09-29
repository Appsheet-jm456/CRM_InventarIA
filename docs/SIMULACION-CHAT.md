# Simulación del chat: guiado con bot y tipo agente

`v1` · 29 sep 2026 · Estado: **prototipo aprobado por el dueño ("está perfecto"); se va a perfeccionar**

> Prototipo interactivo, sin backend, que muestra cómo respondería el bot por WhatsApp con el
> inventario real. Sirve para validar el árbol de [ARBOL-DE-RESPUESTA.md](ARBOL-DE-RESPUESTA.md) y
> para decidir qué tipo de chat lleva el MVP. **No envía nada por WhatsApp.**

## Cómo abrirla

Archivo: [simulacion/simulacion-chat.html](simulacion/simulacion-chat.html). Es una sola página:
se abre con doble clic en el navegador y no necesita servidor. Trae los 17 portátiles con stock del
inventario al **29 sep 2026** (copia estática de Baserow: si el inventario cambia, la simulación
no se entera).

## Las dos formas de chat

### 1. Chat guiado con bot

El cliente avanza por menús numerados, como el árbol del dueño. Cada paso guarda un dato:

| Nodo | Qué hace | Guarda |
|---|---|---|
| `B00` | Bienvenida y menú principal | Etiqueta WhatsApp-Bot · etapa **Nuevo** |
| `B001A` | Categorías de producto | Categoría interés · etiqueta Interes-Productos |
| `B001A1` | Uso: hogar, ejecutivo o diseño | Uso equipo |
| `B001A2` | Presupuesto (4 rangos) | Presupuesto · etapa **En Conversación** |
| `B001A3` | ¿Enviar catálogo? | — |
| `B001A4` | Marca (solo las que tienen stock) | Marca interés |
| `B001A5` | Catálogo armado **desde la base** con los filtros elegidos | Etiqueta Catalogo-Enviado |
| `R11` | Código de producto → ficha con precio y disponibilidad | Código producto · valor estimado · etapa **Cotización** |
| `B-ASESOR` | Pausa el bot y pasa a la cola compartida | Etiqueta Escalado-Asesor |
| `B-ERR` | Respuesta no reconocida; 3 seguidas → asesor | Errores bot |

Reglas que ya cumple el prototipo:

- Un **código de producto** dentro del mensaje muestra la ficha desde cualquier nodo.
- `9` o "asesor" pasa a un humano desde cualquier nodo; `hola`, `menu` o `inicio` vuelven a B00.
- Distribuidores, Servicio al cliente, Tiny, SFF y Partes pasan a asesor (pendiente F1·7).
- Lenovo o HP responden "no tenemos esa marca en stock" y vuelven al menú de marcas.
- Un rango de presupuesto sin equipos ofrece cambiar el presupuesto o hablar con un asesor.
- El embudo solo avanza (decisión 0006).

### 2. Chat tipo agente

El cliente escribe libre y el agente **consulta la base y responde con lo que hay**:

- Entiende presupuesto ("1,5 millones", "1500000"), procesador (i5, i7), RAM (8 o 16 GB),
  uso de diseño y "barato".
- Herramientas simuladas, visibles en el chat: `buscar_producto(codigo)` y
  `buscar_productos(filtros)`.
- Sin resultados, ofrece los 2 más baratos. Sin intención reconocida, pregunta presupuesto o uso.
- Un código de producto devuelve la ficha; "asesor" o "humano" pasa a la cola.

**No es IA real:** son reglas de texto que imitan lo que haría un modelo de lenguaje. Su fin es
mostrar la experiencia, no la tecnología.

### Panel de la derecha

Muestra en vivo el modo, el nodo del árbol, la **etapa del embudo**, los **campos guardados**, el
**contador de mensajes cobrables de Meta** (de los 1.000 gratis al mes, decisión 0011) y si el bot
está activo o pausado.

## Comparación

| | Guiado | Agente |
|---|---|---|
| Control | Total: dice solo lo que el árbol permite | Menor: interpreta lo que el cliente escribe |
| Riesgo de inventar precios | Ninguno | Ninguno mientras solo cite la base |
| Cliente que sabe qué quiere | 5 pasos hasta el equipo | Un mensaje |
| Cliente que no sabe | Lo guía paso a paso | Puede quedar sin rumbo |
| Mensajes cobrables hasta la ficha | 6 a 8 | 2 a 3 |

## Decisión pendiente (P-11)

¿Qué lleva el MVP? El dueño no ha elegido; las opciones son:

1. **Solo guiado.** Lo que dice la decisión 0005 hoy.
2. **Guiado, con el agente como segunda opción.**
3. **Híbrido:** un modelo de lenguaje solo *interpreta* lo que pide el cliente (uso, presupuesto,
   marca) y la respuesta la arma siempre la plantilla con datos de la base. Entiende frases
   libres sin poder inventar nada.

Elegir 2 o 3 obliga a revisar la decisión 0005 ("sin IA libre"). Queda como tarea **F1·9**.

## Qué se simula y qué no

| Simulado | No incluido todavía |
|---|---|
| Menús, filtros, fichas y catálogo con el inventario real | Horario de atención y festivos: el mensaje de B-ASESOR siempre es el mismo |
| Etapas, campos y etiquetas | Alerta de SLA (10 y 15 min) |
| Pausa del bot y cola de asesor | Tomar el chat desde la bandeja: solo se ve el aviso |
| Contador de mensajes de Meta | Fotos, video, audios y la lista interactiva de WhatsApp |
| Errores y paso a asesor tras 3 fallos | Ramas Tiny, SFF, Partes, Distribuidores y Servicio |

## Para perfeccionar (ideas que ya se ven)

1. El filtro **Diseño** es provisional (RAM de 16 GB o procesador H/HQ); sale de la decisión
   F1·8 sobre qué equipo es Hogar, Ejecutivo o Diseño.
2. El agente no recuerda lo dicho antes: cada mensaje empieza de cero. Falta acumular filtros
   ("y que sea i7") sobre la búsqueda anterior.
3. Simular el **horario de atención** (mensaje distinto fuera de horario) y el **reloj del SLA**.
4. Mostrar la **ficha como una sola imagen** con la foto, no solo texto.
5. Mostrar el menú como **lista interactiva** de WhatsApp además de los botones.
6. Una vista para el **asesor** que reciba el chat pausado con el historial y los campos.
7. Cargar el inventario **en vivo** desde la base en vez de una copia estática.
8. Un modo **híbrido** para comparar (P-11).

Cada mejora se anota como tarea (F2·12) o entra al diseño de la Fase 2.

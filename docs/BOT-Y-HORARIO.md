# Editor del bot, horario y respuestas rápidas (F3·7)

> Decisión 0023. Se apoya en el motor de prueba (`herramientas/meta-webhook-prueba/flujo.py`), el horario y los
> festivos de la 0021 y el permiso `administrar_bot` (0018). Decisiones del dueño, 30 sep 2026.

---

## Reglas

**RBOT-01 · Se editan textos y títulos de botones, no la estructura.** El árbol (qué nodo lleva a cuál) y las
reglas del negocio siguen en el código (decisión 0005: menú fijo, sin IA libre). Quien tiene `administrar_bot`
cambia el texto de cada nodo y el título de sus opciones.

**RBOT-02 · El bot reconoce por el número o por palabras clave, nunca por el título.** Renombrar un botón no
rompe el flujo. Los títulos respetan el límite de WhatsApp: 20 caracteres en botones (hasta 3 opciones), 24 en
listas.

**RBOT-03 · Cada nodo se puede restaurar** a su texto original (queda guardado en la misma fila).

**RBOT-04 · Los nodos de datos no se editan como texto.** Presupuesto (rangos) y marcas salen del código y del
inventario; de ellos solo se edita el texto de la pregunta. La ficha del equipo sale de `productos`.

**RBOT-05 · Fuera de horario el bot sigue atendiendo** (menú, inventario, fichas). Solo al pasar a un asesor
avisa que estamos cerrados y cuándo le responden (siguiente franja hábil). El chat entra igual a la cola y el
SLA empieza a contar al abrir (RS-04).

**RBOT-06 · El horario se lee de `horario_atencion` y `festivos`** en cada consulta (caché de 30 s): editarlo en
la app cambia al bot y al SLA a la vez. El texto del horario que ve el cliente se arma con esa misma tabla.

**RBOT-07 · Una franja no puede cerrar antes de abrir ni solaparse con otra del mismo día.** Los festivos
se agregan y quitan a mano; la app avisa cuando faltan los del año siguiente.

**RBOT-08 · Las respuestas rápidas son atajos del asesor, no del bot.** Se escribe `/` en la Bandeja, se filtra
por atajo o título y se inserta el texto para revisarlo antes de enviar (nunca se envía solo). `{nombre}` se
cambia por el primer nombre del cliente. Las crea `administrar_bot`; las ve todo usuario activo.

## Modelo (migración 0007)

| Tabla | Para qué |
|---|---|
| `bot_nodos` | `clave`, `nombre`, `texto`, `opciones` (lista de `{id, titulo}`), `texto_original`, `opciones_original`, quién y cuándo editó |
| `respuestas_rapidas` | `atajo` (único), `titulo`, `texto`, `activo`, quién la creó |

`horario_atencion` y `festivos` ya existen (0005): solo se agregan políticas de escritura si faltan y la
comprobación de solapamiento.

### Nodos

| Clave | Qué es | Opciones editables | Marcas |
|---|---|---|---|
| `B00` | Saludo y menú principal | 3 | |
| `B001A` | ¿Qué producto busca? | 5 | |
| `B001A1` | ¿Para qué trabajo? | 4 | |
| `B001A2` | Presupuesto | no (rangos) | |
| `B001A3` | ¿Envío el catálogo? | 3 | `{uso}` |
| `B001A4` | Marca | no (del inventario) | |
| `R11` | Botones de la ficha del equipo | 3 | |
| `B-ASESOR` | Aviso al pasar a asesor (dentro de horario) | — | `{horario}` `{motivo}` |
| `B-CERRADO` | Aviso al pasar a asesor fuera de horario | — | `{horario}` `{proxima}` `{motivo}` |
| `ERROR` | No entendió la respuesta | — | |
| `ERROR-3` | Tres errores seguidos: pasa a asesor | — | |

`{motivo}` es la frase que pone el código cuando hay una razón concreta (por ejemplo, rama aún sin definir).

## Pantallas

- **Bot y horario** (`/bot`, permiso `administrar_bot`): pestañas *Mensajes del bot* y *Horario y festivos*.
  Mensajes: lista de nodos, editor de texto y opciones con contador de caracteres y vista previa; botón
  Restaurar. Horario: franjas por día (varias por día), aviso del próximo cierre y festivos por año.
- **Respuestas rápidas** (`/respuestas-rapidas`): crear, editar, activar y borrar. Uso desde la Bandeja con `/`.

## Fuera de alcance

Crear o reordenar nodos, cambiar a dónde lleva cada opción y las ramas Torres Tiny, SFF, Partes,
Distribuidores y Servicio (F1·7, las define el dueño).

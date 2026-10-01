# Flujo del bot: lienzo, borrador, versiones y simulador (F4·4 a F4·15)

> Decisiones 0026 (reemplaza RBOT-01 de la 0023), 0027 (Condiciones, Catálogos y Pausa) y 0028 (varios bots). Sigue la 0016 (bot
> híbrido: la respuesta sale siempre de la base) y la 0011 (un mensaje por respuesta, botones y listas).

---

## Tareas

| Tarea | Qué |
|---|---|
| ✅ **F4·4** Vista previa real y límites (30 sep, migración 0010) | En el editor actual: burbuja como WhatsApp (*negrita*, _cursiva_, botones o lista tal como llegan), contador del mensaje (1.024 con botones, 4.096 en lista o texto: hoy el bot corta sin avisar) y aviso si una marca como `{horario}` se borró o está mal escrita. Se reutiliza en el lienzo |
| ✅ **F4·5** Flujo en la base (30 sep, migración 0011) | Modelo de versiones, motor de `flujo.py` que recorre la versión publicada y versión 1 igual al árbol actual |
| ✅ **F4·6** Lienzo (30 sep, migraciones 0012 y 0013) | Cuadros y flechas en `/bot`: crear, editar, unir y borrar mensajes; cuadros del sistema fijos; marca de editado |
| ✅ **F4·7** Borrador, publicar e historial (30 sep, migración 0014) | Validación al publicar, lista de versiones con quién y cuándo, volver a una anterior |
| ✅ **F4·8** Simulador (30 sep) | Probar el borrador como cliente, sin WhatsApp |
| **F4·9** Varios bots (migración 0015) | "Flujo" abre la lista de bots: crear, renombrar, duplicar, archivar y marcar el principal; cada bot con su lienzo, borrador, versiones y simulador. Pantalla rediseñada con más espacio para el lienzo |
| **F4·10** "+ Agregar", mensaje sin botones e "Ir a otro bot" (migración 0016) | Desplegable con Mensaje, Condiciones, Catálogos, Pausa e Ir a otro bot; mensaje sin botones con la flecha "Cuando el cliente responda" |
| **F4·11** Condiciones | Cuadro que compara el último mensaje del cliente ("es igual a", varias palabras por condición) y sale por la primera que se cumpla o por "Ninguna se cumple" |
| **F4·12** Catálogos | Encabezado más un catálogo elegido de Inventario o subido en una ventana; envía y sigue |
| **F4·13** Pausa y recordatorio | Espera horas, minutos y segundos; salidas "El cliente respondió" y "Pasó el tiempo"; reloj en el receptor |
| **F4·14** Arranque por palabra clave y por etapa del embudo (migración 0017) | Un bot arranca si el cliente escribe su palabra clave o si su oportunidad entra a cierta etapa |
| **F4·15** Simulador y pruebas | Probar los cuadros y bots nuevos en el simulador (la Pausa con "Simular que pasó el tiempo"), pruebas de la base y del motor |

## Reglas

**RF-01 · Un cuadro de mensaje** tiene texto (hasta 1.024 caracteres con botones, 4.096 con lista) y de 1 a 3
botones (título ≤ 20) o de 1 a 10 opciones de lista (título ≤ 24). Cada opción lleva a otro cuadro.

**RF-02 · El bot reconoce la opción por su número o por su título**, como hoy (RBOT-02).

**RF-03 · Los cuadros del sistema son fijos.** Se edita su texto y se unen con flechas; no se borran ni se cambia
lo que hacen (buscar en el inventario, la ficha, el catálogo, pasar a asesor, error).

**RF-04 · Todo cuadro tiene por dónde volver.** Cada mensaje nuevo trae por defecto la opción 0 al menú principal.

**RF-05 · Solo se publica un flujo sano:** toda opción tiene destino, todo cuadro se alcanza desde el saludo, y
los textos y títulos están dentro de los límites. Si no, la app dice qué cuadro falla.

**RF-06 · Publicar crea una versión** (número, quién, cuándo, nota opcional). La publicada es la única que usa el
bot. Volver a una anterior la copia como borrador para publicarla de nuevo.

**RF-07 · El simulador corre el borrador con el mismo motor del bot**, sin escribir en `leads` ni en `mensajes` y
sin enviar a WhatsApp.

**RF-08 · El dueño crea cinco cuadros** desde "+ Agregar": Mensaje, Condiciones, Catálogos, Pausa (0027) e Ir a otro bot (0028). Todos se
editan, se unen y se borran como el mensaje; los del sistema siguen fijos (RF-03).

**RF-09 · Un mensaje puede no llevar botones.** Entonces tiene una sola salida, "Cuando el cliente responda", que
lleva lo que escriba al cuadro siguiente. Sin botones no se agrega la opción 0 (RF-04 aplica a los que tienen opciones).

**RF-10 · Condiciones no envía nada y decide con el último mensaje del cliente.** Revisa las condiciones en orden y
sale por la primera que se cumpla; si ninguna, por "Ninguna se cumple", que es obligatoria. Cada condición es
"es igual a" una o varias palabras, sin distinguir mayúsculas, tildes, espacios de más ni signos (`Uno!` = `uno`).
De 1 a 10 condiciones, cada una con al menos una palabra; una palabra no se repite en dos condiciones.

**RF-11 · Las reglas globales van primero.** `reiniciar`, saludos, código de equipo, `9` y `0` se atienden antes que
las Condiciones, igual que antes que los botones. Si el dueño pone `9` en una condición, el lienzo lo avisa.

**RF-12 · Catálogos envía y sigue.** Manda el encabezado (hasta 1.024 caracteres) y el catálogo (PDF como documento o
el enlace de Drive) y pasa enseguida al cuadro de "Siguiente", que es obligatoria. El catálogo debe existir y estar
activo para publicar; si se apaga después, el bot envía el encabezado con "catálogo no disponible" y sigue.

**RF-13 · Subir un catálogo desde el lienzo** abre el mismo formulario de Inventario → Catálogos en una ventana y deja
elegido el catálogo nuevo. Solo aparece para quien tiene `administrar_bot` y `administrar_inventario`.

**RF-14 · La Pausa espera entre 1 s y 23 h 59 min 59 s** (ventana de 24 h de Meta) y no envía nada al entrar. Si el
cliente escribe antes, sale por "El cliente respondió" con ese mensaje y la espera se cancela. Si no, al vencer sale
por "Pasó el tiempo". Las dos salidas son obligatorias.

**RF-15 · El recordatorio respeta la ventana y al asesor.** Al vencer la Pausa no se envía nada si el chat está con
un asesor (bot en pausa), si el cliente ya está en otro cuadro o si pasaron 24 h desde su último mensaje; esto
último queda registrado en el chat.

**RF-16 · Hay varios bots y uno es el principal** (0028). Cada bot tiene su lienzo, su borrador, sus versiones y su
historial. El principal atiende a todo cliente que no está en otro bot; siempre hay exactamente uno. El bot que hoy
existe pasa a ser el principal, sin cambios para los clientes.

**RF-17 · "Ir a otro bot"** lleva al cliente al inicio de la versión publicada del bot elegido. No se publica si ese bot
no tiene versión publicada o está archivado; un bot que otro usa no se archiva. "hola", "menú" y `0` vuelven siempre
al inicio del **principal**.

**RF-18 · Un bot puede arrancar por palabra clave.** Cada bot no principal tiene de 0 a 10 palabras ("es igual a", con
la misma comparación de RF-10). Se revisan cuando el cliente es nuevo o está en el inicio del principal, nunca con un
asesor, y antes que el resto de reglas del principal. Una palabra no se repite entre bots ni puede ser `0`, `9`,
"hola", "menú" o "reiniciar".

**RF-19 · Un bot puede arrancar por etapa del embudo, y el asesor tiene la última palabra.** Se elige un embudo y una
etapa; cuando una oportunidad entra a esa etapa (la mueva el asesor o el bot), el bot arranca **aunque el chat esté
con un asesor**: el chat sigue asignado a él, el bot lleva al cliente por su flujo y atiende sus respuestas, y el
asesor ve todo y puede escribir (el bot no se apaga). Si el cliente pide asesor (`9`), el bot se calla. Si pasaron más
de 24 h desde el último mensaje del cliente, el inicio se envía como **plantilla aprobada** del bot; sin plantilla
aprobada no se envía y queda registrado en el chat. No arranca si el bot no tiene versión publicada. Una etapa solo
dispara un bot.

## Límites de WhatsApp (F4·4, migración 0010)

`bot_nodos.formato` dice cómo sale cada mensaje: `menu` (texto + opciones numeradas; botones si son hasta 3 de
≤ 20 caracteres, si no lista), `texto`, `ficha` (el texto sale del inventario; solo se editan los botones) y
`motivo` (frase dentro del aviso de asesor, ≤ 200). `bot_medir()` cuenta como `flujo.menu`, con el valor más
largo de cada marca (`{uso}` 9, `{motivo}` 204, `{horario}` 400, `{proxima}` 40); el trigger `bot_nodos_limites`
rechaza lo que pase de 1.024 con botones o 4.096 en lista o texto, y las marcas que el bot no reemplaza. La app
hace la misma cuenta en `crm/src/lib/bot.ts` (espejo de `flujo.py`) y avisa si se quitó una marca.

## Modelo (migración 0011)

| Tabla / función | Para qué |
|---|---|
| `bot_flujos` | Versión: número, estado (`borrador`, `publicada`, `archivada`), nota, quién y cuándo. Una sola publicada y un solo borrador |
| `bot_cuadros` | Cuadro de una versión: `clave`, `tipo`, texto (con su original), `opciones`, `salidas`, `al_entrar`, formato y límites (0010), posición `x`/`y` en el lienzo. Un solo `inicio` por versión |
| `editar_cuadro(clave, texto, títulos)` · `restaurar_cuadro(clave)` | El editor cambia textos y títulos de la versión publicada; nunca a dónde lleva una opción |

**Tipos de cuadro.** `mensaje` (texto y opciones: lo único que el dueño crea en el lienzo) y los del sistema, cuya
lógica está en `flujo.py`: `presupuesto`, `marca`, `equipos`, `ficha`, `asesor` y `aviso` (textos sueltos: fuera de
horario, no entendí, tres errores).

**Una opción** (`opciones[]`) lleva `id`, `titulo`, `destino` (clave de otro cuadro, o `@pedir_codigo`), y
opcionalmente `palabras` (exacta; `*x` si contiene x; `re:x` expresión desde el inicio), `reconocer` (`uso` o
`quiere_comprar`, del intérprete) y `efectos` (`campos`, `etiqueta`, `etapa`, `motivo`: lo que se anota al elegirla;
con destino asesor, la etiqueta y el motivo van al aviso). Un cuadro del sistema sigue por `salidas`
(`siguiente`, `cambiar_presupuesto`) y puede anotar algo al llegar (`al_entrar`).

**Reglas globales, en el código:** `reiniciar`, saludos al inicio, código de un equipo a su ficha, `9` o "asesor",
`0` desde la lista, la ficha o una búsqueda, texto libre al intérprete y el error (tres seguidos pasan a asesor).
Un cliente cuyo cuadro ya no existe en la versión publicada vuelve al inicio.

**Versión 1 = árbol de F3·4.** Se comprobó con el motor anterior: 85.536 conversaciones simuladas (todas las
combinaciones de 4 pasos de 16 entradas, más 20.000 al azar de hasta 12), mismos mensajes y mismo estado en cada paso.

## Lienzo (F4·6, migraciones 0012 y 0013)

`/bot` → **Flujo (lienzo)**, con React Flow (`@xyflow/react`, MIT). Sin borrador se ve la versión publicada;
**Editar el flujo** abre un borrador (copia de la publicada) y todo lo que se cambie queda ahí hasta publicar.

- **+ Mensaje** crea un cuadro con una opción y la de volver al inicio (RF-04). Se arrastra para moverlo.
- **Unir:** se arrastra desde el punto de una opción y se suelta en cualquier parte del cuadro destino. Una flecha
  se borra eligiéndola y pulsando Supr. En el panel, cada opción también tiene su selector "Lleva a".
- **Panel del cuadro:** nombre, texto con contador y avisos (F4·4), opciones (número, título, destino; hasta 10;
  el 9 está reservado para el asesor) y la vista de WhatsApp. **Borrar cuadro** suelta las flechas que llegaban.
- **Cuadros 🔒 del sistema:** se cambia su texto y el título de sus botones; sus salidas no (RF-03). A la ficha, la
  lista de equipos y los avisos no se llega con flecha: los abre el bot.
- **Marcas:** "nuevo" y "cambiado" frente a la versión publicada, y ⚠ con lo que impediría publicar (opción sin
  destino, mensaje al que no llega nadie, texto que pasa el límite), listado también en el panel.
- **Descartar borrador** lo borra entero; el bot nunca se enteró.

| Función | Para qué |
|---|---|
| `crear_borrador()` · `descartar_borrador()` | Abrir (o reabrir) y descartar el borrador |
| `borrador_crear_mensaje(x, y)` | Cuadro nuevo `M1`, `M2`… |
| `borrador_guardar_cuadro(clave, nombre, texto, opciones)` | Guarda desde el panel; conserva palabras, reconocedor y efectos de cada opción por su número |
| `borrador_conectar(clave, opción, destino)` · `borrador_mover(clave, x, y)` · `borrador_borrar_cuadro(clave)` | Flechas, posición y borrar |

## Publicar e historial (F4·7, migración 0014)

- **Publicar…** abre en el panel el resumen frente a la versión publicada (cuadros nuevos, cambiados y borrados) y
  una nota para el historial. Se deshabilita mientras haya algo por resolver o si el borrador es igual.
- `problemas_del_flujo()` revisa en la base lo mismo que marca el lienzo (RF-05): un solo inicio, toda opción de un
  mensaje con destino válido, todo mensaje alcanzable desde el inicio y textos dentro del límite.
  `publicar_borrador(nota, pisar)` no publica si hay alguno.
- **Choque:** si alguien cambió un texto en *Mensajes del bot* después de abrir el borrador
  (`cambios_publicados_despues()`), publicar avisa cuáles y pide "Entiendo, publicar igual". La pestaña *Mensajes*
  avisa mientras haya un borrador abierto.
- Publicar archiva la versión anterior y deja quién, cuándo y la nota. Una versión archivada no se cambia (trigger).
- **Historial de versiones** (`/bot?t=historial`): versión, estado, nota, quién y cuándo, cuántos cuadros. *Ver* la
  abre en el lienzo en solo lectura; *Volver a esta* (`borrador_desde_version`) la copia como borrador para revisarla
  y publicarla (si ya hay un borrador, pide reemplazarlo).
- El bot toma la versión nueva en menos de 30 s. Un cliente parado en un cuadro que ya no existe vuelve al saludo.

## Simulador (F4·8)

**▶ Probar** en el lienzo abre un chat tipo WhatsApp sobre la versión que se está viendo (borrador, publicada o
una anterior). Se escribe como el cliente o se tocan los botones y las filas de las listas; el lienzo resalta el
cuadro en el que va la charla y el panel muestra lo que el bot anotaría (etapa, etiqueta, uso, presupuesto, marca,
equipo, valor, paso a asesor). *Empezar de nuevo* borra la charla.

- La app llama a `POST /interno/simular` del receptor (mismo token y bloqueo del túnel que el Chat InventarIA) con la
  versión, el estado de la charla y el texto. El receptor corre `flujo.responder` con `flujo.con_cuadros()` sobre
  esa versión, solo en ese hilo: el bot en vivo sigue con la publicada.
- Usa el inventario, el horario y los catálogos reales; **no escribe** en `leads` ni en `mensajes` y **no envía** a
  WhatsApp (RF-07). La foto y el PDF se muestran como marcas, sin subirlos a Meta.
- Lo pide `administrar_bot` (lo revisa la app antes de llamar al receptor, que lee con la llave de servicio).


## Varios bots (F4·9, decisión 0028, migración 0015)

**Pantalla.** Configuración → Bot y horario → **Flujo** muestra la lista de bots: nombre, ⭐ principal, estado
(publicado, solo borrador, archivado), versión publicada y si hay borrador abierto, cómo arranca (principal,
palabras clave, etapa) y quién lo cambió por última vez. **+ Nuevo bot** pide el nombre y abre su lienzo con solo el
cuadro de inicio. **Abrir** lleva al lienzo (`/bot/flujo/<bot>`), con "← Bots" para volver; el lienzo ocupa todo el
ancho y el panel del cuadro se abre al lado solo al elegir uno. Menú ⋯: renombrar, duplicar (copia la versión
publicada como borrador de un bot nuevo), marcar como principal y archivar.

**Modelo.** Tabla `bots` (`id`, `nombre` único, `principal` con un solo verdadero, `archivado`, `palabras text[]`,
`embudo_id`/`etapa_id`, quién y cuándo). `bot_flujos.bot_id`: los índices de "una sola publicada" y "un solo
borrador" pasan a ser por bot, y las funciones del borrador reciben el bot. El cliente guarda en qué bot va
(`leads.bot_id`) además del cuadro; un cliente cuyo bot se archivó vuelve al inicio del principal.

## Condiciones, Catálogos y Pausa (F4·10 a F4·13, decisión 0027, migración 0016)

**Lienzo.** "+ Mensaje" pasa a **"+ Agregar ▾"** con los cinco cuadros (Ir a otro bot es el quinto: un desplegable con los bots y una sola flecha de entrada); cada uno se crea en el centro de la vista y
queda elegido. Un mensaje sin botones muestra la flecha "Cuando el cliente responda". Cómo se ve cada cuadro nuevo:

| Cuadro | En el lienzo | Panel |
|---|---|---|
| **Condiciones** 🔀 | Una fila por condición ("= 1 · uno · asesor") con su punto de flecha, y al final "Ninguna se cumple" | Lista de condiciones en orden (subir, bajar, borrar); cada una con sus palabras como etiquetas: se escribe y Enter |
| **Catálogos** 📚 | Encabezado, nombre del catálogo y la flecha "Siguiente" | Encabezado con contador, desplegable de catálogos activos y "+ Subir catálogo" (ventana con el formulario de Inventario) |
| **Pausa** ⏳ | "Espera 0 h 15 min 15 s" y las flechas "El cliente respondió" y "Pasó el tiempo" | Horas, minutos y segundos |

**Modelo.** `bot_cuadros.tipo` admite además `condicion`, `catalogo` y `pausa`, y suma la columna `ajustes jsonb`
(se agrega a las listas de columnas de `crear_borrador` y `borrador_desde_version`):

- Condiciones: `opciones` = `[{id, titulo, palabras: [...], destino}]` (el título es el rótulo, por ejemplo
  "Hablar con asesor"); `salidas.ninguna`.
- Mensaje sin botones: `opciones = []` y `salidas.respuesta`.
- Catálogos: `texto` (encabezado), `ajustes.catalogo_id`, `salidas.siguiente`.
- Pausa: `ajustes.segundos` (1 a 86.399), `salidas.respondio` y `salidas.tiempo`.
- `leads.pausa_vence_en` (cuándo vence la espera) y `leads.pausa_cuadro` (en qué cuadro empezó).

Funciones nuevas o ampliadas: `borrador_crear_cuadro(tipo, x, y)` (reemplaza a `borrador_crear_mensaje`),
`borrador_guardar_condiciones`, `borrador_guardar_catalogo`, `borrador_guardar_pausa`, y `borrador_conectar` para
las salidas con nombre. `problemas_del_flujo()` revisa las reglas RF-09 a RF-14 y RF-17 y `borrador_borrar_cuadro` acepta los
tipos nuevos.

**Motor (`flujo.py`).**
- Condiciones: `ir()` no envía; resuelve en el acto con el texto que llevó al cliente ahí (el mensaje que respondió
  o el título del botón que tocó) y sigue al destino. Compara con `normalizar()` exacto.
- Mensaje sin botones: al responder el cliente, sigue por `respuesta` llevando su texto.
- Catálogos: envía el encabezado y `{"_pdf": catálogo}` (el receptor ya lo sube a Meta y lo reutiliza 25 días) o el
  enlace, y sigue por `siguiente`. Lee el catálogo por id.
- Pausa: anota `pausa_vence_en` y se queda. Si el cliente escribe, sigue por `respondio` con su texto.
- Para no dar vueltas sin fin (Condiciones → Condiciones…), una respuesta encadena como máximo 10 cuadros sin
  esperar al cliente; si pasa, va al error.

**Reloj (receptor).** Un hilo revisa cada 5 s los `leads` con `pausa_vence_en` vencida; bajo el candado del número,
comprueba RF-15, sigue por `tiempo`, envía y guarda. Si el receptor estuvo apagado, al volver atiende las vencidas
que sigan dentro de la ventana.

**Simulador.** Condiciones y Catálogos funcionan solos (mismo motor). La Pausa muestra "⏳ Esperando 0 h 15 min 15 s"
con el botón **"Simular que pasó el tiempo"**; escribir antes prueba la salida "El cliente respondió".

**Arranques (F4·14, migración 0017).** La palabra clave se revisa en `flujo.responder` (RF-18). El cambio de etapa lo
anota un trigger de `oportunidades` en una cola `bot_disparos`, que atiende el mismo reloj de la Pausa con las
reglas de RF-19. `bots.plantilla_id` guarda la plantilla de Meta para fuera de ventana. La migración 0017 también
agrega a Cliente Final las etapas Despachado, En transportadora y Entregado, **las tres ganadas** como Vendido: la
venta y el valor se cuentan una sola vez (al primer cierre) y las Métricas no cambian; ver [EMBUDOS.md](EMBUDOS.md).
Hay que comprobar que `mover_oportunidad` deje avanzar una oportunidad ya ganada entre etapas ganadas.

**Pruebas (F4·15).** `supabase/pruebas/0015_*.sql` a `0017_*.sql` (bots, tipos, ajustes, validaciones al guardar y al publicar, copia en
borradores) y una prueba del motor en Python que recorre la versión 1 con un juego fijo de conversaciones
(mismos mensajes antes y después) más casos de cada cuadro nuevo, incluido el reloj con la hora simulada.

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
| ✅ **F4·9** Varios bots (1 oct, migración 0015) | "Flujo" abre la lista de bots: crear, renombrar, duplicar, archivar y marcar el principal; cada bot con su lienzo, borrador, versiones y simulador. Pantalla rediseñada con más espacio para el lienzo |
| ✅ **F4·10** "+ Agregar", mensaje sin botones e "Ir a otro bot" (1 oct, migración 0016) | Desplegable con Mensaje, Condiciones, Catálogos, Pausa e Ir a otro bot; mensaje sin botones con la flecha "Cuando el cliente responda" |
| ✅ **F4·11** Condiciones (1 oct, migración 0017) | Cuadro que compara el último mensaje del cliente ("es igual a", varias palabras por condición) y sale por la primera que se cumpla o por "Ninguna se cumple" |
| ✅ **F4·12** Catálogos (1 oct, migración 0018) | Encabezado más un catálogo elegido de Inventario o subido en una ventana; envía y sigue |
| ✅ **F4·13** Pausa y recordatorio (1 oct, migración 0019) | Espera horas, minutos y segundos; salidas "El cliente respondió" y "Pasó el tiempo"; reloj en el receptor |
| **F4·14** Arranque por palabra clave y por etapa del embudo | Un bot arranca si el cliente escribe su palabra clave o si su oportunidad entra a cierta etapa |
| ✅ **F4·17** Lienzo a pantalla completa (3 oct, decisión 0030) | El lienzo de un bot ocupa toda la pantalla, con barra superior: ← Cancelar, Probar, Publicar… y Guardar. Se mantiene el borrador |
| ✅ **F4·18** Salidas del Mensaje (3 oct, decisión 0030, migración 0021) | «Otra respuesta», «Sin respuesta» (con tiempo) y «Error al enviar el mensaje», como en Kommo |
| 🔵 **F4·34** Cuadro Pregunta, datos en los mensajes y datos de despacho tras el pago (construida 1 nov 2026, migraciones 0038 y 0039; falta la prueba del dueño) | Cuadro ❓ Pregunta que guarda la respuesta en un dato de la ficha y la valida; marcas `{dato}` en los mensajes; efecto «Marcar un dato» en los botones; la compra sigue en un bot del lienzo después del comprobante; bot de ejemplo «Datos de despacho» |
| 🔵 **F4·35** Interruptores del bot y cuadro 🤖 Agente (construida 1 nov 2026, decisión 0034, migración 0040; falta la prueba del dueño) | Chatbot, Menú guiado y Avi en texto libre en todo el bot, con mensaje fijo opcional; cuadro 🤖 Agente con instrucción, herramientas, límite y salidas; se retira el modo por bot |
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

**RF-12 · Catálogos envía y sigue.** Manda el encabezado (un mensaje de texto, hasta 4.096 caracteres) y el catálogo (PDF como documento o
el enlace de Drive) y pasa enseguida al cuadro de "Siguiente", que es obligatoria. El catálogo debe existir y estar
activo para publicar; si se apaga después, el bot envía el encabezado con "catálogo no disponible" y sigue.

**RF-13 · Subir un catálogo desde el lienzo** abre el mismo formulario de Inventario → Catálogos en una ventana y deja
elegido el catálogo nuevo. Solo aparece para quien tiene `administrar_bot` y `administrar_inventario`.

**RF-14 · La Pausa espera entre 1 s y 23 h 59 min 59 s** (ventana de 24 h de Meta) y no envía nada al entrar. Si el
cliente escribe antes, sale por "El cliente respondió" con ese mensaje y la espera se cancela. Si no, al vencer sale
por "Pasó el tiempo". Las dos salidas son obligatorias.

**RF-15 · El recordatorio respeta la ventana y al asesor.** Al vencer la Pausa no se envía nada si el chat está con
un asesor (bot en pausa), si el cliente ya está en otro cuadro o si pasaron 24 h desde su último mensaje; esto
último queda registrado con la etiqueta «Recordatorio-no-enviado» en el cliente (no como mensaje, para no cambiar las
métricas de chats sin respuesta).

**RF-16 · Hay varios bots y uno es el principal** (0028). Cada bot tiene su lienzo, su borrador, sus versiones y su
historial. El principal atiende a todo cliente que no está en otro bot; siempre hay exactamente uno, y está publicado. El bot que hoy
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

**RF-20 · Otra respuesta** (0030). Un Mensaje con botones o lista puede tener una salida «Otra respuesta»: si lo que escribe el cliente no es
ninguna opción, sigue esa flecha en vez de la búsqueda con IA. Las reglas globales de RF-11 (`reiniciar`, saludos, código de equipo, `9`) van
primero, y un audio o una imagen sigue pasando a asesor. Sin flecha conectada todo queda como antes (búsqueda con IA y, tras tres fallos, asesor).
No es obligatoria al publicar.

**RF-21 · Sin respuesta** (0030). Cualquier Mensaje puede tener una salida «Sin respuesta» con su propio tiempo (de 1 s a 23 h 59 min 59 s, por
defecto 15 min). El tiempo cuenta desde que el bot lo envía; si el cliente escribe antes, se cancela. Al vencer sigue la flecha, con las reglas de
RF-15 (nada si hay asesor, si el cliente ya está en otro cuadro o si pasaron 24 h). No puede apuntar al mismo cuadro (se repetiría sin fin). Con
la flecha conectada hace falta el tiempo; sin flecha no pasa nada.

**RF-22 · Error al enviar el mensaje** (0030). Un Mensaje puede tener una salida «Error al enviar el mensaje» que se sigue si Meta **rechaza**
el envío al instante o si luego avisa por el webhook que el mensaje **falló** (estado `failed`: fuera de las 24 h, número inválido, cliente que bloqueó).
Solo se sigue una vez por mensaje, solo si el cliente sigue en ese cuadro y el bot no está en pausa, y lo que se envía desde esa salida no vuelve
a dispararla. A dónde lleva lo decide el dueño (por ejemplo a un asesor o a un aviso).

## Salidas del Mensaje (F4·18, migración 0021)

**Base.** `salidas_opcionales(tipo, opciones)` dice cuáles admite un Mensaje (`otra`, `sin_respuesta`, `error`; sin botones, sin `otra`).
Solo se guardan las conectadas, así que un mensaje sin ellas queda igual que antes. `ajustes.espera_segundos` (900 por defecto) es el
tiempo de «Sin respuesta». `borrador_guardar_cuadro` las recibe en `p_salidas` junto con `espera_segundos`; `borrador_conectar` las une
con flechas; `problemas_del_flujo` revisa destino, tiempo y que «Sin respuesta» no vuelva al mismo cuadro. `mensajes.cuadro`,
`desde_error` y `error_atendido` ligan un `failed` al cuadro que lo envió. Pruebas: `supabase/pruebas/0021_salidas_del_mensaje.sql` (11).

**Motor (`flujo.py`).** «Otra respuesta» va después de las reglas globales y antes del intérprete. Mostrar un Mensaje con «Sin
respuesta» fija `espera_hasta`; cualquier mensaje del cliente la cancela; `tiempo_cumplido` sigue `tiempo` (Pausa) o `sin_respuesta`
(Mensaje). Un Mensaje con «Error al enviar» lleva la marca interna `_cuadro`; `envio_fallido(st, clave)` sigue la salida si el cliente
sigue en ese cuadro y el bot no está en pausa.

**Receptor.** `enviar_mensajes` guarda el cuadro de cada envío y, si Meta lo rechaza al instante, sigue «Error al enviar».
Un estado `failed` del webhook llama a `error_tardio`, que toma el mensaje una sola vez (`tomar_error_de_envio`) y lo atiende con el
candado del número. Lo enviado desde esa salida lleva `desde_error` y no la vuelve a disparar.

**Lienzo y simulador.** Las salidas van abajo del Mensaje, en gris y la de error en rojo; el panel tiene «Otras salidas» con el tiempo.
El simulador muestra «Simular que pasó el tiempo» también en un Mensaje con «Sin respuesta» y «Simular fallo de envío» si tiene error.

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
borrador" pasan a ser por bot, y la numeración de versiones es por bot (cada uno empieza en 1). Todas las funciones del
borrador (`crear_borrador`, `borrador_guardar_cuadro`, `publicar_borrador`…) reciben `p_bot` al final, con `null` =
el principal, así que las llamadas de antes siguen funcionando. Funciones nuevas: `crear_bot(nombre, desde)`,
`renombrar_bot`, `marcar_principal`, `archivar_bot` y `desarchivar_bot`. *En blanco* trae el saludo (`B00`) y los
cuadros que el motor necesita siempre (asesor, avisos y ficha), copiados del principal; *duplicar* copia la versión
publicada (o el borrador si nunca se publicó). Un bot nuevo nace como borrador: no atiende a nadie hasta publicarse y,
para ser principal, debe estar publicado. El principal no se archiva; un bot archivado se ve pero no se cambia.
`leads.bot_id` (en qué bot va el cliente) llega con F4·10, cuando exista «Ir a otro bot».

**Motor.** Hasta F4·10 solo atiende el principal: `db.flujo()` lee la versión publicada del bot con `principal`. El
simulador recibe el bot y la versión (`POST /interno/simular` con `bot`). **Mensajes del bot** edita la versión
publicada de un bot a la vez, con selector si hay más de uno.

**Pantallas.** `/bot?t=bots` («Flujos (lienzo)») es la lista; `/bot/flujo/<bot>` es el lienzo de un bot, a todo el
ancho, con su pestaña de Historial. El panel de la derecha solo se abre al elegir un cuadro, probar, publicar o ver lo
que falta (el contador «N por resolver» es un botón). Las direcciones viejas `?t=flujo` y `?t=historial` abren la lista.
Pruebas: `supabase/pruebas/0015_varios_bots.sql` (14).

## "+ Agregar", mensaje sin botones e "Ir a otro bot" (F4·10, decisiones 0027 y 0028, migración 0016)

**Lienzo.** "+ Mensaje" pasó a **"+ Agregar ▾"**: Mensaje e Ir a otro bot; Condiciones, Catálogos y Pausa aparecen como
"Próximamente" hasta F4·11 a F4·13. El cuadro nuevo cae en el primer hueco libre cerca del centro de la vista y queda
elegido. Los cuadros del dueño (`mensaje`, `ir_bot` y los que vienen) se editan, se unen y se borran; sus salidas con
nombre se unen arrastrando como las opciones.

- **Mensaje sin botones:** en el panel se quitan todas las opciones y aparece «Cuando el cliente responda, sigue a».
  Sale como texto (hasta 4.096) y lo que escriba el cliente sigue esa flecha (`salidas.respuesta`); las reglas globales
  van antes. Volver a ponerle opciones lo deja como menú.
- **Ir a otro bot (↪):** se elige el bot en el panel; el cuadro muestra «Va al inicio de …». El cliente pasa al inicio
  de la versión publicada de ese bot y sigue ahí hasta escribir «hola», «menú», `0` (desde la lista, la ficha o una
  búsqueda) o «reiniciar», que lo devuelven al principal. Si ese bot se archiva o deja de tener versión publicada,
  el cliente vuelve al principal.

**Base (0016).** Tipos `ir_bot`, `condicion`, `catalogo` y `pausa` en el CHECK; columna `bot_cuadros.ajustes` (copiada en
`copiar_cuadros`); `leads.bot_id` (null = el principal, así un cambio de principal se lleva a sus clientes).
`borrador_crear_cuadro(tipo, x, y, bot)`, `borrador_guardar_cuadro(…, p_salidas)` (0 a 10 opciones),
`borrador_guardar_ajustes(clave, nombre, ajustes, bot)` para `ir_bot` (no a sí mismo ni a un bot que no existe),
`borrador_conectar` también une salidas con nombre (`salidas_del_cuadro`), `borrador_borrar_cuadro` suelta opciones y
salidas que llegaban, `problemas_del_flujo` revisa salidas sueltas, cuadros a los que no se llega y el bot de destino
(elegido, publicado, no archivado, no él mismo), y `archivar_bot` no archiva un bot al que otro lleva.

**Motor.** El estado del cliente lleva `bot`; `flujo.cuadros()` lee la versión publicada de ese bot (`db.flujo(bot)`) y el
simulador sobrescribe solo la del bot que se prueba. El receptor guarda `leads.bot_id`. El simulador avisa «El cliente
pasó al bot …» y no resalta cuadros de otro bot. Comprobado: el bot principal responde igual que antes en 70.536
conversaciones (todas las de 4 pasos con 16 entradas y 5.000 al azar de 5 a 12). Pruebas:
`supabase/pruebas/0016_agregar_cuadros.sql` (13); las de 0011, 0012 y 0014 ahora quitan los otros bots dentro de su
transacción.

## Condiciones (F4·11, decisión 0027, migración 0017)

**Lienzo.** "+ Agregar" → 🔀 **Condiciones**. El cuadro muestra cada condición como «Envíos = envio · envios · despacho» con su
flecha, y al final «Ninguna se cumple». En el panel: nombre, condiciones en orden (subir, bajar, quitar; hasta 10), sus
palabras como etiquetas (se escriben y Enter o coma), a dónde lleva cada una y «Ninguna se cumple, sigue a». Avisa si
una palabra está en dos condiciones (no se guarda) o si choca con las reglas de siempre (`9`, «asesor», `0`, «hola»,
«menú», «reiniciar»: se guarda, pero esa palabra nunca se cumpliría).

**Cómo decide.** Con el último mensaje del cliente: lo que escribió (desde un mensaje sin botones, una Pausa o el saludo
de un cliente nuevo) o el título de la opción que tocó. Compara exacto tras normalizar (minúsculas, sin tildes, sin
signos ni emojis, un solo espacio): `flujo.normalizar_condicion` y `normalizar_condicion()` en la base, que guarda las
palabras ya normalizadas. Un turno encadena como máximo 10 cuadros sin esperar al cliente; si pasa, va al error.

**Base (0017).** `borrador_crear_cuadro('condicion', …)` crea `C<n>` con una condición vacía y `salidas.ninguna`;
`borrador_guardar_condiciones(clave, nombre, condiciones, ninguna, bot)` valida de 1 a 10 condiciones con nombre, hasta 20
palabras cada una, sin repetir entre condiciones y sin llevar a la ficha ni a sí mismo; `problemas_del_flujo` exige
palabras y destino en cada condición. Pruebas: `supabase/pruebas/0017_condiciones.sql` (8). El bot principal responde
igual que antes en 70.536 conversaciones.

## Catálogos (F4·12, decisión 0027, migración 0018)

**Lienzo.** "+ Agregar" → 📚 **Catálogos**. El cuadro muestra su encabezado, el catálogo elegido y la flecha «Luego». En el
panel: nombre, encabezado (con contador), el catálogo (los de Inventario → Catálogos, PDF 📄 o enlace 🔗, con su categoría y
marca) y «Siguiente». **+ Subir catálogo** abre en una ventana el mismo formulario de Inventario → Catálogos y deja elegido el
catálogo nuevo; solo aparece con `administrar_inventario` (RF-13). La vista previa muestra el encabezado y el documento.

**Motor.** `flujo.enviar_catalogo`: el encabezado como texto y el PDF como documento (`{"_pdf": …}`, el receptor lo sube a Meta y
lo reutiliza 25 días) o, si es de Drive, el encabezado con el enlace; luego sigue en el acto por `siguiente`. Si el catálogo se
apagó o se borró después de publicar, envía el encabezado con «El catálogo no está disponible en este momento» y sigue
(`db.catalogo`). El encabezado también se corrige desde **Mensajes del bot** en la versión publicada.

**Base (0018).** `borrador_crear_cuadro('catalogo', …)` crea `CAT<n>`; `borrador_guardar_catalogo(clave, nombre, texto,
catálogo, siguiente, bot)` exige encabezado y un catálogo que exista, y no deja ir a la ficha ni a sí mismo;
`problemas_del_flujo` exige catálogo elegido, existente y activo. `crearCatalogo` devuelve el id creado. Pruebas:
`supabase/pruebas/0018_catalogos.sql` (6). El bot principal responde igual que antes en 70.536 conversaciones.

## Pausa y recordatorio (F4·13, decisión 0027, migración 0019)

**Lienzo.** "+ Agregar" → ⏳ **Pausa** (15 min por defecto). El cuadro muestra «Espera 0 h 15 min 15 s» y las flechas «El cliente
respondió» y «Pasó el tiempo». En el panel: horas, minutos y segundos (de 1 s a 23 h 59 min 59 s) y a dónde sigue en cada caso.
Uso típico: Mensaje → Pausa → «Pasó el tiempo» a un mensaje de recordatorio y «El cliente respondió» a unas Condiciones.

**Motor.** `flujo.esperar` deja al cliente en la Pausa con `espera_hasta`; si escribe antes, sigue por `respondio` con su texto
(las reglas de siempre van primero); si sale de la Pausa por cualquier otro camino, la espera se borra (`limpiar_espera`).
`flujo.tiempo_cumplido` sigue por `tiempo`. El receptor guarda `leads.espera_vence_en` y `leads.espera_cuadro` (se llaman
«espera» para no confundirlas con `pausar_bot`, el chat en manos de un asesor).

**Reloj.** Un hilo del receptor revisa cada 5 s `db.esperas_vencidas()` y atiende cada una con el mismo candado por número
que al contestar (`vencer_espera`): si el chat está con un asesor o el cliente ya está en otro cuadro, solo quita la
espera; si pasaron más de 24 h (menos un minuto) desde el último mensaje del cliente, no envía y deja la etiqueta
«Recordatorio-no-enviado»; si no, envía lo que sigue y guarda el estado sin tocar el último mensaje del cliente. Si el
receptor estuvo apagado, al volver atiende las vencidas (con las mismas reglas). Probado contra la base con tres
clientes de prueba: dentro de la ventana, fuera de ella y con asesor.

**Simulador.** En una Pausa muestra «⏳ Esperando …» con **Simular que pasó el tiempo** (`evento: "tiempo"` en
`/interno/simular`); escribir antes prueba «El cliente respondió».

**Base (0019).** `borrador_crear_cuadro('pausa', …)` crea `P<n>`; `borrador_guardar_pausa(clave, nombre, segundos, respondio,
tiempo, bot)` valida el rango y que no lleve a la ficha ni a sí misma; `problemas_del_flujo` revisa el rango. Pruebas:
`supabase/pruebas/0019_pausa.sql` (6). El bot principal responde igual que antes en 70.536 conversaciones.

## Cuadro Pregunta y datos de despacho tras el pago (F4·34)

**Pedido el 1 nov 2026.** Cuando el cliente paga, el bot le pide los datos para el envío y los deja en la ficha, y el dueño arma esa
conversación en el lienzo (no queda fija en el código). Se apoya en F4·33 (Venta online o tienda y Datos de despacho, [LEADS.md](LEADS.md)).
Sin IA: la respuesta la escribe el cliente, el bot la valida y la guarda en la base (decisión 0016).

**RF-23 · Cuadro ❓ Pregunta.** "+ Agregar" → Pregunta. En el panel se elige:
- el **texto** de la pregunta (ej. «¿Tu nombre completo?»), con los mismos límites y la vista de WhatsApp de un Mensaje;
- **dónde se guarda**: uno de los atributos activos de la ficha (Nombre completo, Cédula, Celular, Correo, Ciudad y departamento, Dirección…);
- el **mensaje cuando la respuesta no sirve** (ej. «La cédula va solo con números 🙏»).
El cuadro muestra «Guarda en: Cédula (CC)». Salidas: **Siguiente** (obligatoria), **Sin respuesta** (con tiempo, como el Mensaje, RF de F4·18)
y **No logró responder** (después de 3 intentos fallidos; si no se une, pasa al asesor).

**RF-24 · La validación sale del tipo del atributo.** Es la misma de la base (`lead_atributo_error`), con una limpieza antes de validar:
- **Documento** (Cédula): quita puntos, espacios y guiones («1.020.345.678» → 1020345678); de 5 a 12 números.
- **Teléfono** (Celular): quita espacios y el +57; 10 números que empiezan por 3.
- **Correo**: debe tener @ y dominio; se guarda en minúsculas.
- **Lista**: muestra las opciones como botones y solo acepta una de ellas.
- **Texto, Dirección y Texto largo**: cualquier respuesta no vacía, hasta su largo máximo.
Si no sirve, manda el mensaje de error y vuelve a preguntar; al tercer intento sale por *No logró responder*.

**RF-25 · El dato queda en la ficha al instante**, con el historial del lead («Sistema · Cédula (CC): — → 1020345678», RL-12). Si el dato ya
estaba lleno, la pregunta igual se hace y lo reemplaza (el cliente pudo cambiar de dirección). Escribir *asesor*, *menú* o *reiniciar* sigue
funcionando como en todo el bot.

**RF-26 · Datos de la ficha dentro de los mensajes.** En el texto de cualquier cuadro se puede escribir una marca con la clave del atributo,
por ejemplo `{nombre_completo}`, `{cedula}`, `{celular}`, `{correo_para_la_factura}`, `{ciudad}`, `{direccion_entrega}`. El bot la cambia por
el dato del cliente; si está vacío, por «—». El panel ofrece un botón **Insertar dato** con la lista (para no escribir las claves a mano) y
la vista previa avisa si una marca no existe (como `{horario}`, F4·4). El límite de 1.024 caracteres se cuenta con el texto ya armado.

**RF-27 · Efecto «Marcar un dato» en los botones.** A cada opción de un Mensaje se le puede poner, además de lo que ya anota (etapa, etiqueta),
**un dato de la ficha con un valor fijo**: por ejemplo el botón «🚚 Envío a domicilio» marca *Venta online = Sí* y «🏬 Recojo en tienda»
marca *Venta online = No*. Solo atributos de tipo Sí/No o Lista.

**RF-28 · La compra sigue en un bot del lienzo.** En Configuración → Agente → **Compra** se agrega «**Después del comprobante, ir al bot:**
[ninguno · lista de bots]». Con *ninguno*, todo queda como hoy (texto fijo de recibido y paso al asesor). Con un bot elegido:
1. la oportunidad pasa a *Pago por confirmar* y se pone la etiqueta `Pago-Por-Confirmar`, como hoy (RAG-20);
2. el bot **no se pausa todavía**: el cliente entra al inicio del bot elegido;
3. el bot termina en el cuadro 🔒 **Asesor**, que hace el paso a la cola; la nota de la compra (equipo, total, comprobante) queda para el asesor como hoy.
Si el cliente no termina (Sin respuesta), el asesor igual recibe el chat: el pago nunca se queda sin revisar.

**RF-29 · Bot de ejemplo «Datos de despacho».** Se crea ya dibujado y publicado, para que el dueño lo ajuste:

```
✅ Recibimos tu comprobante. ¿Cómo recibes tu equipo?
  [🚚 Envío a domicilio] (marca Venta online) → ❓Nombre completo → ❓Cédula → ❓Celular → ❓Correo
                                              → ❓Ciudad y departamento → ❓Dirección
                                              → «Confirma tus datos: 👤 {nombre_completo} · CC {cedula} · 📱 {celular} ·
                                                 ✉️ {correo_para_la_factura} · 📍 {direccion_entrega}, {ciudad}»
                                                 [Sí] → «🙌 Listo. Un asesor valida tu pago y despacha tu pedido.» → 🔒Asesor
                                                 [Corregir] → ❓Nombre completo
  [🏬 Recojo en tienda] (marca Venta tienda) → «🙌 Listo. Un asesor valida tu pago y te avisa cuándo recogerlo.» → 🔒Asesor
```

**RF-30 · Simulador.** Probar el bot muestra en el panel los datos que se van guardando, sin escribir en ningún lead real.

**Modelo.** Tipo `pregunta` en `bot_cuadros` con `ajustes.atributo` y `ajustes.texto_error`; las salidas `siguiente`, `sin_respuesta` y
`no_logro`. `opciones[].efectos.atributos` para RF-27. `agente_config.compra_bot_despues` (id de bot o null) para RF-28, con su `grant`
de columna (la pantalla lo lee columna por columna). `problemas_del_flujo` revisa que una Pregunta apunte a un atributo activo y que toda
marca `{dato}` exista. Motor: `flujo.py` (Pregunta y marcas) y `compra.py` (RF-28).

**Fuera de esta tarea:** varios equipos en una compra, leer los datos de una foto de la cédula y que el agente Avi llene las preguntas.

**Cómo quedó construida (1 nov 2026).** Migración **0038** (tipo `pregunta`, `borrador_guardar_pregunta`, `marcar` en
`borrador_guardar_cuadro` → `efectos.atributos`, `marcas_desconocidas`, `problemas_del_flujo` y el disparador `bot_cuadros_limites` aceptan
las marcas `{dato}` de atributos activos, `agente_config.compra_bot_despues` con su permiso de columna; 10 pruebas en
`supabase/pruebas/0038_cuadro_pregunta.sql`). Migración **0039**: bot de ejemplo **«Datos de despacho»** publicado (no se conecta solo: se
elige en Compra). Motor: `flujo.py` (`preguntar`, `responder_pregunta`, `limpiar_respuesta`, `con_datos`, `marcar_datos`, `en_pregunta`),
`receptor.py` guarda `st["atributos"]` en `leads.atributos` (si la base rechaza un dato, guarda la charla sin él) y no deja que las Acciones
ni Avi atiendan mientras el cliente responde una Pregunta; `compra.py` sigue al bot elegido. 15 pruebas en `prueba_pregunta.py`.
Lienzo: «+ Agregar → ❓ Pregunta» con su panel, «+ Insertar dato» en los textos, «🏷 Marca un dato» en cada opción, el simulador muestra
los datos guardados. Compra: «Después del comprobante, ir al bot».

## Interruptores del bot y cuadro Agente (F4·35)

**Pedido el 1 nov 2026, decisión [0034](decisiones/0034-interruptores-y-cuadro-agente.md).** Va después de F4·34 (usa sus salidas y datos).

### Interruptores (Configuración → Bot → Interruptores)

**RF-31 · Tres interruptores, de mayor a menor:**

| Interruptor | Encendido | Apagado |
|---|---|---|
| **1. Chatbot** (general) | La automatización funciona según los otros dos | **Nada automático contesta**: ni menú, ni Avi, ni acciones, ni recordatorios. Cada mensaje entra a la cola de la Bandeja con aviso |
| **2. Menú guiado** (el lienzo) | Los bots del lienzo atienden: menús, preguntas, cuadros 🤖 | Sin menús; el texto lo atiende Avi si el 3 está encendido |
| **3. Avi en texto libre en todo el bot** | Toda pregunta abierta, en cualquier punto, la responde Avi | Avi solo entra en los cuadros 🤖; el texto libre fuera de ellos lo atiende el Híbrido (decisión 0016) |

| Chatbot | Menú | Avi en todo | Resultado |
|---|---|---|---|
| ✅ | ✅ | ✅ | Menú + Avi en cualquier pregunta abierta + asesor |
| ✅ | ✅ | ❌ | Menú + Avi solo en sus cuadros + asesor (guiado + agente + asesor con flechas) |
| ✅ | ❌ | ✅ | Solo Avi, sin menús; pasa al asesor cuando hace falta |
| ✅ | ❌ | ❌ | Igual que apagar el Chatbot (la pantalla lo avisa) |
| ❌ | — | — | Todo lo atienden los asesores |

**Con el Menú guiado apagado** (arreglo del 1 nov 2026, probado por el dueño): solo deja de atender el **texto** que Avi no toma. Los **botones**
que ya se enviaron (por ejemplo la ficha que manda Avi), la media y «reiniciar» los sigue atendiendo el motor; antes el cliente tocaba
«Lo quiero» y su chat se iba a la cola sin respuesta.

**RF-32 · Mensaje con el Chatbot apagado (opcional).** Un texto que escribe el dueño (ej. «Hola 👋 En un momento te atiende un asesor») y que el
cliente recibe **una vez por conversación** (no en cada mensaje). Vacío = no se envía nada. Se cuenta como mensaje de Meta.

**RF-33 · Apagar y encender sin dejar a nadie colgado.** Con el Chatbot **apagado**, cada cliente que escribe pasa a la cola en ese momento (con el
mensaje fijo, una vez) y no sale ningún recordatorio ni pausa pendiente. Así no se llena la cola con chats viejos que nadie está esperando. Al
**encender**, los chats que ya están en la cola o con un asesor siguen ahí (el asesor los devuelve al bot con «Devolver al bot» si quiere); el bot
atiende a los nuevos.

**RF-34 · Quién y cómo.** Solo el administrador (permiso `administrar_bot`). Cada cambio pide confirmar y queda en el historial (quién, cuándo,
antes → después). Mientras el Chatbot esté apagado, la Bandeja y el panel lateral muestran **«🤖 Chatbot apagado»**. El interruptor del agente
que ya existe (Apagado · Solo en Probar · Números de prueba · Todos) sigue: decide **a quién** atiende Avi; el 3 decide **dónde**.

**RF-35 · Se retira el modo por bot** (Menú guiado, Híbrido, Agente; RAG-14). El bot que hoy está en Agente («Bienvenida») deja «Avi en todo»
encendido al migrar, para que el comportamiento no cambie.

### Cuadro 🤖 Agente

**RF-36 · "+ Agregar" → 🤖 Agente.** Desde ese punto Avi conversa con el cliente. En el panel:
- **Instrucción para este punto** (se suma a la personalidad de Avi): ej. «Resuelve dudas del equipo que vio y llévalo a comprar»;
- **Herramientas permitidas** (buscar en inventario, conocimiento, ficha, iniciar compra, cotización, pasar a asesor), marcadas por defecto las que
  no estén apagadas en Avi;
- **Límite de vueltas** (mensajes del cliente dentro del cuadro; 8 por defecto).

**RF-37 · Salidas:** **Inició compra** (si no se une, sigue el flujo de compra de siempre), **Pidió asesor o no avanza** (pidió asesor, 3 sin avance,
llegó al límite o al tope de costo; si no se une, va al asesor), **Volvió al menú** (el cliente escribió *menú*, *0* o *hola*; si no se une, va al
inicio) y **Error del cerebro** (ningún modelo respondió; si no se une, atiende el Híbrido). El cliente nunca se queda sin respuesta.

**RF-38 · Reglas de Avi que no cambian:** precios y datos verificados contra la base (RAG-02), cuentas solo con el texto aprobado (RAG-09), no confirma
pagos, el asesor tiene la última palabra (un chat tomado no lo atiende Avi). Si el agente está apagado o el número no está en su alcance
(Solo en Probar / Números de prueba), el cuadro sale por *Error del cerebro*.

**RF-39 · Simulador y Registro.** El simulador del lienzo prueba el cuadro (gasta del presupuesto como Probar, sin contar en Métricas). El Registro de Avi
anota en qué cuadro y bot respondió.

**Cómo quedó construida (1 nov 2026).** Migración **0040**: `bot_config` (una fila, solo lectura con la sesión) y `bot_config_historial`;
`bot_config_cambiar` exige `administrar_bot` y deja el historial; cuadro `agente` (`borrador_guardar_agente`, salidas opcionales `compra`, `asesor`,
`menu` y `falla`); el modo por bot se retiró (el bot en Agente dejó «Avi en todo» encendido). 7 pruebas en `supabase/pruebas/0040_…`. Motor:
`receptor.py` (`sin_bot`, interruptores en `_contestar`, el búfer de Avi, el reloj y el simulador), `agente.py` (`atiende` con los interruptores,
`responder_cuadro` con instrucción, herramientas, vueltas y salidas), `flujo.py` (`entrar_agente`, `en_agente`, «menú» dentro del cuadro). 16 pruebas
en `prueba_interruptores.py`. Pantallas: Bot → **Interruptores** (con el resultado de cada combinación e historial), aviso «🤖 Chatbot apagado» arriba
en toda la app, «+ Agregar → 🤖 Agente» con su panel, y en Agente → Avi el aviso de dónde atiende (sin modo por bot). Si «Pidió asesor» está unida, se
sigue la flecha y no se envía lo que Avi dijo en ese turno.

**Modelo.** `bot_config` (una fila): `chatbot_activo`, `menu_activo`, `agente_en_todo`, `texto_apagado`, `actualizado_por`, `actualizado_en`, con
historial en `bot_config_historial`. Tipo `agente` en `bot_cuadros` con `ajustes.instruccion`, `ajustes.herramientas`, `ajustes.max_vueltas`, y
salidas `compra`, `asesor`, `menu`, `falla`. `leads.estado_bot` guarda las vueltas dentro del cuadro. Receptor: lee la configuración cada 30 s
como el resto; `agente.py` recibe la instrucción y las herramientas del cuadro.

## Bot «Avi Ventas»: el Salesbot de Kommo en el CRM (F4·39, migración 0043)

**Pedido el 3 nov 2026.** Lleva al CRM el flujo del Salesbot #5 de Kommo (`~/kommo-salesbot`) con la fórmula **Menú guiado + Avi + Asesor = cierre
de venta**. Queda en **borrador**: no atiende a nadie y no cambia el bot principal «Bienvenida» hasta que el dueño lo publique y lo marque como principal.

```
Bienvenida ─ Productos ─ Lista de productos
   │                       ├─ Portátiles Usados ─ Marcas ─ Lenovo / Dell / HP / Unificado ─ Catálogo      ─ 🤖 Avi
   │                       │                                                                                    ├─ Inició compra → compra de siempre
   │                       │                                                                                    ├─ Pidió asesor o no avanza → Asesor
   │                       │                                                                                    ├─ Volvió al menú → Bienvenida
   │                       │                                                                                    └─ Error del cerebro → Híbrido
   │                       └─ Nuevos, Gamer, Escritorio, Monitores, Impresoras, Accesorios, Tablet, Otros → Asesor
   ├─ Distribuidores ─ bot «Distribuidor»
   └─ Servicio al cliente ─ Asesor
```

**Qué anota.** Categoría interés y etiqueta `Interes-Productos` al elegir producto; Marca interés y `Catalogo-Enviado` al elegir marca;
`Interes-Distribuidor` e `Interes-Soporte` en esas ramas. El `9` está reservado para pasar a asesor (RF), por eso «Otros» es la opción 10.

**Diferencias con Kommo.** La lista no permite cambiar el texto del botón («Ver opciones») ni el título de sección o el pie: el motor los fija. El `0`
vuelve al menú en vez de pasar a asesor; para el asesor son `9` o la palabra *asesor*. Las descripciones de las filas se guardan directo en la opción:
el lienzo las conserva, pero no las muestra para editar.

**Catálogos (3 nov 2026).** Lenovo, Dell, HP y Unificado son enlaces de Drive públicos, con categoría «Portátiles usados» para que el bot principal no los elija. **Gaming varios se quitó de la lista** hasta tener su catálogo (decisión del dueño); la migración 0043 todavía crea ese cuadro: el borrador en la base es el que manda. Para volver a tenerlo: cargar el catálogo y agregar el cuadro y la opción en el lienzo.

**Publicado y marcado como principal el 3 nov 2026** (versión 1). Para volver atrás: marcar «Bienvenida» como principal. Avi solo
atiende los números de su alcance (hoy «Números de prueba»); a los demás los atiende el Híbrido hasta pasarlo a «Todos». **Avi responde según el
inventario del CRM**, que hoy solo tiene 17 equipos Dell: sin cargar Lenovo y HP dirá que no los tiene aunque estén en el catálogo.

**Verificación (3 nov 2026).** Ensayo de la migración con `ROLLBACK`; 8 rutas por el simulador (`/interno/simular`) con el motor real, y un turno real
de Avi desde el catálogo. El único problema para publicar son los catálogos sin elegir. **Falta la prueba del dueño** por WhatsApp, con el bot publicado.

## Arranques y pruebas (F4·14 y F4·15, decisión 0028)

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

**Arranques (F4·14).** La palabra clave se revisa en `flujo.responder` (RF-18). El cambio de etapa lo
anota un trigger de `oportunidades` en una cola `bot_disparos`, que atiende el mismo reloj de la Pausa con las
reglas de RF-19. `bots.plantilla_id` guarda la plantilla de Meta para fuera de ventana. Su migración también
agrega a Cliente Final las etapas Despachado, En transportadora y Entregado, **las tres ganadas** como Vendido: la
venta y el valor se cuentan una sola vez (al primer cierre) y las Métricas no cambian; ver [EMBUDOS.md](EMBUDOS.md).
Hay que comprobar que `mover_oportunidad` deje avanzar una oportunidad ya ganada entre etapas ganadas.

**Pruebas (F4·15).** `supabase/pruebas/0015_*.sql` en adelante (bots, tipos, ajustes, validaciones al guardar y al publicar, copia en
borradores) y una prueba del motor en Python que recorre la versión 1 con un juego fijo de conversaciones
(mismos mensajes antes y después) más casos de cada cuadro nuevo, incluido el reloj con la hora simulada.

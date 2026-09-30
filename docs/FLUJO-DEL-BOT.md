# Flujo del bot: lienzo, borrador, versiones y simulador (F4·4 a F4·8)

> Decisión 0026 (reemplaza RBOT-01 de la 0023). Sigue la 0005 (menú, sin IA libre) y la 0011 (un mensaje por
> respuesta, botones y listas).

---

## Tareas

| Tarea | Qué |
|---|---|
| ✅ **F4·4** Vista previa real y límites (30 sep, migración 0010) | En el editor actual: burbuja como WhatsApp (*negrita*, _cursiva_, botones o lista tal como llegan), contador del mensaje (1.024 con botones, 4.096 en lista o texto: hoy el bot corta sin avisar) y aviso si una marca como `{horario}` se borró o está mal escrita. Se reutiliza en el lienzo |
| ✅ **F4·5** Flujo en la base (30 sep, migración 0011) | Modelo de versiones, motor de `flujo.py` que recorre la versión publicada y versión 1 igual al árbol actual |
| ✅ **F4·6** Lienzo (30 sep, migraciones 0012 y 0013) | Cuadros y flechas en `/bot`: crear, editar, unir y borrar mensajes; cuadros del sistema fijos; marca de editado |
| ✅ **F4·7** Borrador, publicar e historial (30 sep, migración 0014) | Validación al publicar, lista de versiones con quién y cuándo, volver a una anterior |
| **F4·8** Simulador | Probar el borrador como cliente, sin WhatsApp |

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

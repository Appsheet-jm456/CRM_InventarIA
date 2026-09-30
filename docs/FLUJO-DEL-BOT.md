# Flujo del bot: lienzo, borrador, versiones y simulador (F4·4 a F4·8)

> Decisión 0026 (reemplaza RBOT-01 de la 0023). Sigue la 0005 (menú, sin IA libre) y la 0011 (un mensaje por
> respuesta, botones y listas).

---

## Tareas

| Tarea | Qué |
|---|---|
| **F4·4** Vista previa real y límites | En el editor actual: burbuja como WhatsApp (*negrita*, _cursiva_, botones o lista tal como llegan), contador del mensaje (1.024 con botones, 4.096 en lista o texto: hoy el bot corta sin avisar) y aviso si una marca como `{horario}` se borró o está mal escrita. Se reutiliza en el lienzo |
| **F4·5** Flujo en la base | Modelo de versiones, motor de `flujo.py` que recorre la versión publicada y versión 1 igual al árbol actual |
| **F4·6** Lienzo | Cuadros y flechas en `/bot`: crear, editar, unir y borrar mensajes; cuadros del sistema fijos; marca de editado |
| **F4·7** Borrador, publicar e historial | Validación al publicar, lista de versiones con quién y cuándo, volver a una anterior |
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

## Modelo (borrador, se afina en F4·5)

| Tabla | Para qué |
|---|---|
| `bot_flujos` | Versión: número, estado (`borrador`, `publicada`, `archivada`), nota, quién y cuándo |
| `bot_cuadros` | Cuadro de una versión: clave, tipo (`mensaje` o uno del sistema), texto, forma (`botones` o `lista`), posición en el lienzo |
| `bot_flechas` | Opción de un cuadro: número, título y cuadro destino |

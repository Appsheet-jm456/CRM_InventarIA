# 0023 · El editor del bot cambia textos y horario, no la estructura

**Estado:** Aceptada · 30 sep 2026 · Tarea F3·7 · Amplía la 0005

## Contexto

El árbol del bot vive en el código (`flujo.py`). El dueño necesita cambiar saludos, preguntas y el horario sin
pedir un despliegue, pero el bot sigue siendo de menú fijo para no improvisar precios (0005).

## Decisión (dueño, 30 sep 2026)

- **Solo textos y títulos de opciones** se editan desde la app (`bot_nodos`); la estructura sigue en el código.
- **Fuera de horario el bot sigue atendiendo** y avisa solo al pasar a asesor, con la hora en que le responden.
- **Horario editable por franjas y festivos**, y el bot lo lee de la misma tabla que el SLA.
- **Respuestas rápidas incluidas** en este bloque, como atajos que el asesor revisa antes de enviar.

Detalle en [BOT-Y-HORARIO.md](../BOT-Y-HORARIO.md).

## Consecuencias

- Si un nodo falta en la tabla, el bot usa el texto que trae el código: nunca se queda mudo.
- Reconocer por número y palabra clave (no por título) hace seguro renombrar botones.
- Crear nodos o cambiar el destino de una opción exigirá una decisión nueva.

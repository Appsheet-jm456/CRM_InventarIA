# 0005 · Bot de menú fijo, sin IA libre

**Estado:** Modificada por la 0016 (30 sep 2026) · 29 sep 2026

## Decisión

El bot responde **solo con menús numerados y datos del inventario**, nunca con IA generativa
libre, para que no invente precios ni condiciones. El árbol vive en la tabla `bot_nodos` y se
edita desde el panel. El atajo global se conserva: un código de producto dentro de una frase
muestra la ficha desde cualquier paso, y `9` o "asesor" pasa a un humano.

La IA sigue disponible **para el equipo** (chat de inventario), no para el cliente.

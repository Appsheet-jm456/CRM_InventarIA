# 0026 · El flujo del bot vive en la base y se arma en un lienzo, con borrador, versiones y simulador

**Estado:** Aceptada · 30 sep 2026 · Reemplaza RBOT-01 de la 0023 · Diseño de F4·5 a F4·8

## Contexto

La 0023 dejó el árbol del bot en el código (`flujo.py`) y en la app solo se editan textos y títulos de botones.
El dueño quiere **crear el flujo** él mismo, con una interfaz de cuadros y flechas, sin pasar por el código.
Sigue vigente la 0005: el bot responde por menú, nunca con IA libre (la IA solo interpreta texto para buscar en
el inventario, 0016).

## Decisión (dueño, 30 sep 2026)

- **El flujo se guarda en la base como versiones** (`bot_flujos`): cuadros y flechas. El bot recorre la
  versión publicada; ya no la tiene escrita en el código.
- **Lienzo con cuadros y flechas** en `/bot`: se arrastran, se unen y al tocar un cuadro se edita a un lado.
  Librería React Flow (`@xyflow/react`, licencia MIT).
- **El dueño crea un solo tipo de cuadro: mensaje con botones o lista** (texto, hasta 3 botones o hasta 10
  opciones en lista; cada opción es una flecha a otro cuadro).
- **Los pasos que no son mensajes quedan como cuadros del sistema, fijos:** saludo de entrada, equipos por
  presupuesto, por marca, ficha del equipo, catálogo, búsqueda por texto libre, pasar a asesor y error. Se unen
  con flechas, se edita su texto, pero su lógica sigue en el código. *(Supuesto a confirmar con el dueño: no
  eligió bloques de inventario ni acciones del CRM configurables.)*
- **Borrador y Publicar.** Se edita un borrador sin tocar el bot en vivo; publicar deja una versión con quién y
  cuándo, que es el **historial**, y se puede volver a una anterior.
- **Simulador**: antes de publicar, el borrador se prueba escribiendo como cliente, sin enviar nada a WhatsApp.
- **La base rechaza un flujo roto al publicar**: opción sin destino, cuadro al que no se llega, textos que
  pasan el límite de WhatsApp.

Detalle en [FLUJO-DEL-BOT.md](../FLUJO-DEL-BOT.md).

## Consecuencias

- La versión 1 se arma desde el árbol actual: el bot debe comportarse igual antes y después de la migración.
- `bot_nodos` (0023) pasa a ser el texto de los cuadros del sistema dentro de cada versión.
- Un cliente a mitad de conversación cuando se publica sigue desde su cuadro si todavía existe; si no, vuelve
  al saludo.
- Cambiar el flujo pide `administrar_bot`; el receptor necesita leer la versión publicada (caché de 30 s).

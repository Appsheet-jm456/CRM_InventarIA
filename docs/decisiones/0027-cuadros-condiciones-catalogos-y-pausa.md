# 0027 · Lienzo con más acciones: Condiciones, Catálogos y Pausa

**Estado:** Aceptada · 1 oct 2026 · Amplía la 0026 (el dueño ya no crea un solo tipo de cuadro) · Diseño de F4·10 a F4·13 (renumeradas por la 0028)

## Contexto

En el lienzo (0026) el dueño solo crea cuadros de mensaje con botones o lista; todo lo demás son cuadros del
sistema fijos. Quiere armar el flujo con más acciones, como en Kommo: decidir el camino según lo que escribe el
cliente, enviar un catálogo concreto y esperar un tiempo para mandar un recordatorio si el cliente no responde.

## Decisión (dueño, 1 oct 2026)

- **El botón "+ Mensaje" pasa a "+ Agregar ▾"**, un desplegable con cuatro cuadros que crea el dueño:
  **Mensaje**, **Condiciones**, **Catálogos** y **Pausa**. Los cuadros del sistema siguen fijos (RF-03).
- **Condiciones:** no envía nada. Compara el último mensaje del cliente contra una lista de condiciones en orden;
  cada condición es **"es igual a"** con una o varias palabras (por ejemplo `1`, `uno` o `asesor`), y gana la
  primera que se cumpla. Siempre tiene la salida **"Ninguna se cumple"**.
- **Mensaje sin botones:** un mensaje puede no llevar opciones; entonces tiene una sola flecha,
  **"Cuando el cliente responda"**, que lleva lo que escriba al cuadro siguiente (normalmente unas Condiciones).
- **Catálogos:** un encabezado ("Catálogos de la marca Lenovo") y un catálogo elegido de los subidos en
  Inventario → Catálogos, o subido ahí mismo en una ventana. Envía el encabezado y el PDF o el enlace, y sigue.
  **"+ Subir catálogo" solo aparece si el usuario también tiene `administrar_inventario`.**
- **Pausa:** espera un tiempo (horas, minutos y segundos) y tiene dos salidas: **"El cliente respondió"** (lleva lo
  que escribió, y la espera se cancela) y **"Pasó el tiempo"** (normalmente a un mensaje de recordatorio).
- Se mantiene el bot híbrido (0016): la respuesta y los precios siempre salen de la base, nunca de la IA.

## Consecuencias

- **Meta solo entrega texto libre dentro de las 24 h** desde el último mensaje del cliente (0011): la Pausa tiene
  tope de 23 h 59 min 59 s. Si al vencer ya pasó la ventana, el recordatorio no se envía y queda registrado.
- **La Pausa necesita un reloj**, que hoy no existe: el bot solo reacciona cuando el cliente escribe. Un hilo del
  receptor revisa cada 5 s las pausas vencidas, con el mismo candado por número que usa al contestar. La
  precisión es de unos segundos.
- Cada recordatorio es un mensaje más que cuenta en el consumo de Meta.
- Un catálogo borrado o apagado deja el cuadro sin destino: el flujo no se publica mientras pase, y si ocurre con el
  flujo ya publicado el bot envía el encabezado con "catálogo no disponible" y sigue.
- Las reglas globales (`reiniciar`, saludos, código de equipo, `9`, `0`) se revisan antes que las Condiciones,
  como hoy antes que los botones.
- Migración `0016` (la `0015` es de varios bots, 0028); el detalle está en [FLUJO-DEL-BOT.md](../FLUJO-DEL-BOT.md).

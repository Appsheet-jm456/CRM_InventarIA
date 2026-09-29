# 0012 · Bot guiado por módulos y conectado a la base

**Estado:** Aceptada · 29 sep 2026

## Contexto

El dueño armó el árbol de atención como un Salesbot de Kommo (B00 → Productos → uso →
presupuesto → catálogo → código) y pide que **responda los productos desde la base de datos**.
En el borrador de Kommo el código lo contestaba un asesor, y el catálogo eran 4 PDF fijos.

## Decisión

- El árbol vive en [ARBOL-DE-RESPUESTA.md](../ARBOL-DE-RESPUESTA.md) y se carga en `bot_nodos`.
- **El bot contesta solo con la base**: el catálogo se arma con los equipos con stock que
  cumplen el filtro del cliente (marca, presupuesto y uso), y el código (R11) devuelve la ficha
  con precio y disponibilidad sin esperar a un asesor. El asesor entra para cerrar la venta.
- Los menús solo ofrecen marcas o categorías con stock.
- El código se reconoce **contra la tabla `productos`**, porque el inventario mezcla formatos
  (`100-102-1041`, `100-102-1007-3` y `PU-23`).
- Se conservan las **7 etapas** de la app. El bot mueve Nuevo → En Conversación → Cotización;
  "En atención" es el estado del chat, no una etapa.
- Escalado: **cola compartida**, SLA de **10 min** con alerta a los **15**, solo en horario
  (L–V 8–18, Sáb 9–14, festivos cerrado).

## Consecuencias

- `productos` necesita saber para qué uso sirve cada equipo (tarea F1·8).
- Las ramas sin desarrollar pasan a asesor hasta que el dueño las defina (F1·7).

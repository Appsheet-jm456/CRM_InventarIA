# 0015 · Catálogos en PDF del servidor y enlace de Drive

**Estado:** Aceptada · 30 sep 2026

## Decisión

- Los catálogos se registran en la tabla `catalogos`, cada uno con **marca y categoría** (por ejemplo,
  Portátiles Dell). El bot envía el que corresponde a lo que eligió el cliente; si no hay uno específico,
  el de la categoría, y si no, el general.
- Un catálogo puede ser un **PDF guardado en el servidor** (Supabase Storage, bucket privado `catalogos`)
  o un **enlace de Google Drive**. Siempre se ofrece además el **enlace de Drive donde están todos**.
- El PDF **se sube a Meta y se envía por su identificador de medio**, así no hace falta publicar el
  archivo en una URL abierta. El identificador se guarda y se reutiliza hasta que Meta lo vence.
- La lista de equipos con stock armada desde la base se sigue mostrando para que el cliente toque uno y
  reciba la ficha.

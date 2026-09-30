# 0025 · El inventario se administra en la app: fotos en el servidor, Excel con vista previa y chat sobre la base

**Estado:** Aceptada · 30 sep 2026 · Diseño de F3·9

## Contexto

El inventario vive en Supabase (0014) y se cargaba con un script de consola. Las fotos eran enlaces de Drive
(ninguno cargado) y Meta no puede leer un archivo de la red local por enlace. Los catálogos (0015) no tenían
dónde subirse. El Chat InventarIA de la v0 respondía con IA sobre Baserow.

## Decisión (dueño, 30 sep 2026)

- **Fotos subidas a la app**, una principal por equipo, en el bucket privado `productos`. El bot la **sube a
  Meta y la envía por su identificador** (como el PDF de la 0015), guardado y reutilizado 25 días. Si un
  equipo no tiene foto subida, se usa el enlace de la columna `foto` como hasta ahora. El video sigue siendo
  un enlace.
- **Ficha editable** (crear y editar cada equipo) y **carga del Excel desde la app**, con vista previa antes
  de aplicar. Las reglas de la carga pasan a una función de la base (`cargar_inventario`) que usan la app y
  el script de consola: empareja por código, lo que no viene queda en stock 0, rechaza la hoja con errores.
- **Catálogos: solo PDF subidos y enlaces de Drive** administrados en la app; no se generan PDF automáticos.
- **Chat InventarIA** con el mismo intérprete del bot (reglas y, si no alcanzan, Gemini o qwen local). La IA
  solo arma el filtro; los equipos, precios y stock salen de la base. El receptor lo expone en una ruta
  interna con token, que no responde a lo que llega por el túnel de Cloudflare.
- Escribir inventario y catálogos pide `administrar_inventario`, exigido por el RLS y por la función de carga.

Detalle en [INVENTARIO.md](../INVENTARIO.md).

## Consecuencias

- Un solo juego de reglas para la carga: el script de consola queda como otra entrada a la misma función.
- El chat depende del receptor (8095): si está caído, la app lo dice y la tabla con filtros sigue sirviendo.
- La foto por identificador de Meta cuesta una subida cada 25 días por equipo; no cambia el conteo de mensajes.

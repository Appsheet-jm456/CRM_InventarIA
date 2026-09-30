# Inventario, fichas, catálogos y Chat InventarIA (F3·9)

> Decisión 0025. Se apoya en la 0014 (Supabase manda, carga por Excel), la 0015 (catálogos PDF y Drive), la
> 0016 (texto libre híbrido) y la 0011 (una sola imagen por ficha).

---

## Reglas

**RI-01 · Todos ven, solo `administrar_inventario` escribe.** Cualquier usuario activo ve la tabla, la ficha
y los catálogos, y usa el chat. Crear, editar, subir fotos, cargar el Excel y administrar catálogos pide el
permiso, y lo exige la base.

**RI-02 · El código es único y no cambia.** Es la llave con la que empareja el Excel y la que el cliente
escribe por WhatsApp. Un equipo no se borra: se deja en stock 0 (puede tener clientes que preguntaron por él).

**RI-03 · Una foto principal por equipo** (JPG, PNG o WEBP, hasta 5 MB), en el bucket privado `productos`. Al
cambiarla, el identificador de Meta se borra para que el bot suba la nueva. Sin foto subida, el bot usa el
enlace de `foto`.

**RI-04 · La carga del Excel primero muestra y después escribe.** Nuevos, los que cambian (campo por campo) y
los que quedan en stock 0 por no venir en la hoja. Si hay errores (código vacío o repetido, precio o stock que
no son número, precio negativo), no se carga nada. Las columnas que no vienen no se tocan.

**RI-05 · Catálogos.** PDF (hasta 20 MB, bucket `catalogos`) o enlace de Drive, con categoría y marca
opcionales. Uno solo marcado *Todos* (el Drive con todos los catálogos). El bot envía el más específico (0015).

**RI-06 · El chat nunca inventa.** El texto pasa por el intérprete del bot (código, reglas, IA); la IA solo
devuelve filtros. La respuesta lista equipos de la base con stock; si nada cumple, los más cercanos.

## Modelo (migración 0009)

| Pieza | Para qué |
|---|---|
| `productos` + `foto_ruta`, `foto_meta_id`, `foto_meta_en` | La foto subida y su identificador en Meta |
| Buckets `productos` y `catalogos` | Privados; leer, cualquier usuario activo; escribir, `administrar_inventario` |
| RLS de escritura en `productos` y `catalogos` | `administrar_inventario` (alta y edición; sin borrar productos) |
| `cargar_inventario(productos jsonb, aplicar boolean)` | RI-04; la usan la app y `cargar_inventario.py` |

## Chat InventarIA

La app llama a `POST /interno/buscar` del receptor (127.0.0.1:8095) con el token `CRM_INTERNO_TOKEN`
(`.env.meta` y `crm/.env.local`). El receptor rechaza esa ruta si la petición llegó por el túnel. Responde los
filtros entendidos, de dónde salieron (código, reglas o IA) y los códigos de los equipos; la app los lee de
`productos` y los muestra como tarjetas con foto, precio y stock.

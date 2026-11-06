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

## Atributos del producto (F4·41)

**Pedido el 6 nov 2026** (cliente Ventas Tech, para la ficha de F4·42). Hoy `productos` solo tiene procesador, generación, RAM, disco,
estado y descripción: no hay dónde guardar la tarjeta gráfica, la pantalla, el teclado o el estado estético. Se agregan **atributos
configurables**, como los atributos del lead (F4·30).

**RI-07 · Atributos que crea el administrador.** En **Inventario → Atributos**: nombre («Tarjeta gráfica»), clave para las plantillas
(`{grafica}`), tipo (texto, número, sí/no o lista de opciones), emoji sugerido, orden y categorías donde aplica (opcional). Se editan,
ordenan, archivan y restauran; no se borran si tienen datos. Pide `administrar_inventario`. Sugeridos al crear: Tarjeta gráfica, Pantalla,
Teclado, Batería y Estado estético.

**RI-08 · Valores por equipo.** Se llenan en la ficha del equipo (crear y editar) y se validan por tipo. Se guardan en `productos.atributos`
(jsonb, validado en la base). Un atributo vacío no sale en ninguna plantilla.

**RI-09 · Carga por Excel.** Cada atributo activo es una columna de la hoja (encabezado = nombre del atributo) y sale en la plantilla
`docs/plantillas/inventario.xlsx`. Aplica RI-04: primero muestra los cambios, un valor que no cumple el tipo detiene la carga, y una columna
que no viene no se toca.

**RI-10 · Dónde se usan.** En la plantilla de la ficha (F4·42), en la lista de Avi (F4·37) como `{clave}`, en la ficha de Inventario y en
la vista «cómo lo ve el cliente». `buscar_productos` de Avi los devuelve. Filtrar por atributo (ej. «con RTX») queda fuera por ahora.

## Chat InventarIA

La app llama a `POST /interno/buscar` del receptor (127.0.0.1:8095) con el token `CRM_INTERNO_TOKEN`
(`.env.meta` y `crm/.env.local`). El receptor rechaza esa ruta si la petición llegó por el túnel. Responde los
filtros entendidos, de dónde salieron (código, reglas o IA) y los códigos de los equipos; la app los lee de
`productos` y los muestra como tarjetas con foto, precio y stock.

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

**RI-03 · Una foto principal por equipo** (JPG o PNG, hasta 5 MB; *WEBP retirado por F4·65*), en el bucket privado `productos`. Al
cambiarla, el identificador de Meta se borra para que el bot suba la nueva. Sin foto subida, el bot usa el
enlace de `foto`. F4·65 suma dos fotos más y un enlace de Drive (ver [Fotos del equipo](#fotos-del-equipo-f465)).

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

**Construida el 6 nov 2026 (migración 0045, 8 pruebas SQL y `prueba_atributos.py`).** Piezas:

- `producto_atributos` (tipos: texto, número, sí/no y lista; la clave y el tipo no cambian, como en los del lead) y `productos.atributos`
  (jsonb validado por el disparador `productos_validar_atributos`). Vienen sugeridos Tarjeta gráfica `{grafica}`, Pantalla `{pantalla}`,
  Teclado `{teclado}`, Batería `{bateria}` y Estado estético `{estado_estetico}`, todos de texto.
- Pantalla **Inventario → Atributos** (pestaña nueva, pide `administrar_inventario`): crear, emoji, nombre, opciones, categorías, ordenar,
  archivar y restaurar, con cuántos equipos tienen dato.
- Ficha del equipo: sección **Atributos** al crear o editar (solo los que aplican a su categoría; vacío borra) y en la ficha de solo lectura.
  La búsqueda del inventario también encuentra por atributo.
- Excel: el lector manda las columnas que no son campos fijos y `cargar_inventario` las busca por nombre o clave (sin tildes ni
  mayúsculas), convierte por tipo («Sí», «15,6», una opción en cualquier mayúscula) y devuelve `columnas_ignoradas`. «Descargar formato»
  (`/inventario/formato`) arma la hoja con una columna por atributo activo.
- Bot: `flujo.inventario()` trae `atributos`; la plantilla de Avi (Agente → Avi → «Cómo muestra los equipos») ofrece cada atributo en
  «+ dato» con su emoji; `buscar_productos` le pasa a Avi las `caracteristicas` con su nombre.

**Para probarlo (dueño):** recargar la página; Inventario → Atributos; editar un equipo y llenar Tarjeta gráfica y Estado estético; en
Agente → Avi agregar el renglón 🚀 Tarjeta gráfica y ver la vista previa; descargar el formato y cargar una hoja con esas columnas.

## Fotos del equipo (F4·65)

**Pedido del dueño el 11 nov 2026**, tras ver por WhatsApp la ficha del T490 con su ficha técnica como foto: poder subir **tres fotos**
por equipo y un **enlace de Drive** con todas las fotos del producto. Hoy hay una sola foto (RI-03).

**RI-11 · Hasta tres fotos, solo JPG o PNG.** La **Foto 1** es la principal (la de siempre, `foto_ruta`): va en la ficha con sus botones.
Las **Fotos 2 y 3** son opcionales (`fotos_extra`, máximo 2). Cada una hasta 5 MB. **WEBP ya no se acepta**: WhatsApp solo manda
imágenes JPG o PNG (WEBP es de stickers) y una ficha en WEBP no le llegaría al cliente. La base lo exige (tipos del bucket y nombres).

**RI-12 · Subir, cambiar y quitar cada foto por separado.** En la ficha del equipo (crear y editar) hay tres casillas con vista previa,
«Subir», «Cambiar» y «Quitar». Quitar la Foto 1 deja la 2 como principal solo si el dueño la sube en la casilla 1 (no se reordena sola).

**RI-13 · Enlace de Drive con más fotos (opcional).** Campo «Carpeta de fotos en Drive» (`fotos_drive`): un enlace que empieza por
`https://drive.google.com/` o `https://docs.google.com/`. La carpeta debe estar compartida como «Cualquier persona con el enlace»; la app
no lo puede comprobar.

**RI-14 · Qué envía el bot.** La ficha sale igual que hoy, con la Foto 1 (botones *Lo quiero · Ver otro código · Menú* o la ficha de
Avi). Si hay enlace de Drive, la ficha suma al final el renglón «📷 Más fotos: enlace». **Después** de la ficha salen las Fotos 2 y 3,
sin texto. Aplica a la ficha del menú (`r11`), a la de Avi (`ficha_producto`) y a la acción «Pregunta por un equipo» (F4·42).
Sin Foto 1, las fotos 2 y 3 no salen solas.

**RI-15 · Fuera de alcance por ahora.** Cargar fotos por Excel, más de tres fotos, reordenar arrastrando y que el bot lea la carpeta de Drive
(el cliente abre el enlace).

**Modelo (migración 0070):** `productos.fotos_extra text[]` (máximo 2, rutas `.jpg`, `.jpeg` o `.png`) y `productos.fotos_drive text`
(vacío o enlace de Google). El bucket `productos` pasa a aceptar solo `image/jpeg` e `image/png`.

**Criterios de aceptación**

| # | Dado / cuando | Entonces |
|---|---|---|
| RFE-01 | Edito un equipo y subo Foto 1, 2 y 3 en JPG o PNG | Se guardan y se ven en la ficha de Inventario |
| RFE-02 | Intento subir un WEBP o un archivo de más de 5 MB | La app lo rechaza con un mensaje claro y no guarda esa foto |
| RFE-03 | Quito la Foto 2 y guardo | Desaparece de la ficha y del bucket; la 1 y la 3 siguen |
| RFE-04 | Pongo un enlace que no es de Google Drive | La app lo rechaza con un mensaje claro |
| RFE-05 | El cliente pide la ficha del equipo con 3 fotos y enlace | Recibe la ficha con la Foto 1 y «📷 Más fotos», y luego las Fotos 2 y 3 |
| RFE-06 | El equipo solo tiene Foto 1 | La ficha sale como hoy, sin mensajes de más |

**Construida el 11 nov 2026 🔵 (falta la prueba del dueño):** migración 0070 con 7 pruebas SQL; ficha del equipo con tres casillas
(`CasillaFoto` en `FormProducto.tsx`) y el campo «Carpeta de fotos en Drive»; `guardarProducto` revisa las tres fotos antes de guardar y
sube o quita cada una; la ficha de solo lectura muestra las Fotos 2 y 3 y el botón «📷 Más fotos en Drive». Bot: `flujo.con_drive` y
`flujo.fotos_extra` en `r11` (menú y Avi) y en la acción «Pregunta por un equipo»; el receptor sube cada foto extra a Meta y reutiliza el
id 25 días (`receptor.subir_extra`). `prueba_fotos_equipo.py` 11/11; fichas, ficha del equipo y agente siguen en verde. App y receptor
compilados y reiniciados.

**Para probarlo (dueño):** recargar la página; Inventario → un equipo → Editar → subir Foto 1, 2 y 3 (JPG o PNG) y pegar el enlace de la
carpeta de Drive → Guardar cambios. Probar un WEBP (debe rechazarlo). Por WhatsApp pedir ese código: ficha con la Foto 1 y «📷 Más fotos»,
y luego las otras dos. **Nota:** antes de este cambio el botón «Guardar cambios» con foto no guardaba (sin error en la app). Tras compilar y reiniciar, el
dueño guardó las 3 fotos del T490 el 11 nov. No se encontró la causa; si vuelve, anotar por dónde se entró (dominio o Tailscale).

## Chat InventarIA

La app llama a `POST /interno/buscar` del receptor (127.0.0.1:8095) con el token `CRM_INTERNO_TOKEN`
(`.env.meta` y `crm/.env.local`). El receptor rechaza esa ruta si la petición llegó por el túnel. Responde los
filtros entendidos, de dónde salieron (código, reglas o IA) y los códigos de los equipos; la app los lee de
`productos` y los muestra como tarjetas con foto, precio y stock.

## Filtro dinámico de equipos (F4·74)

Construida el 13 nov 2026 (migración 0084, atributo Táctil), falta la prueba del dueño: filtros por tipo, marca, modelo, generación, procesador, RAM, disco y táctil en Inventario → Equipos. Detalle, criterios RFI-01 a RFI-15 y decisiones pendientes en [FILTRO-DINAMICO-INVENTARIO.md](FILTRO-DINAMICO-INVENTARIO.md).

## Enlace a la tienda web (F4·75)

Construida el 13 nov 2026 (migración 0085): la ficha del equipo y la ficha del bot llevan el enlace a ventasvirtualcolombia.com/producto/{código} si está publicado, o el catálogo web. Detalle en [TIENDA-WEB-EN-FICHAS.md](TIENDA-WEB-EN-FICHAS.md).

# 0014 · Supabase manda en el inventario y la lista se sube por Excel

**Estado:** Aceptada · 30 sep 2026 · Modifica la 0013

## Contexto

La 0013 dejó el inventario editándose en Baserow y copiándose a Supabase cada 5 minutos. El dueño quiere
la base **en el servidor**: subir allí la lista actualizada, que el bot consulte los productos de esa base
y que los clientes, las etapas y los productos queden guardados ahí.

## Decisión

- **Supabase es la única fuente del inventario.** Baserow deja de usarse para productos; el timer
  `crm-sync-inventario` se apaga en cuanto se cargue la primera lista por Excel.
- **La lista se sube como hoja de Excel** que organiza el dueño. La carga:
  - empareja por **código**: crea los nuevos y actualiza precio, stock y datos de los existentes;
  - un producto que **no viene** en la hoja queda con **stock 0** (no se borra: puede tener clientes
    que preguntaron por él);
  - primero muestra qué va a cambiar y solo escribe al confirmar;
  - rechaza la hoja entera si hay códigos repetidos o vacíos, o precios que no son números.
- El bot de prueba **lee `productos` y escribe `leads` y `mensajes` en Supabase** desde antes de la demo
  del 1 oct 2026. El kanban de la v0 (Baserow) deja de reflejar a esos clientes; los muestra la Bandeja.

## Consecuencias

- La v0 del puerto 3000 sigue leyendo el Baserow viejo hasta que se apague (decisión 0008).
- El formato de columnas se ajusta a la hoja real del dueño cuando la entregue.

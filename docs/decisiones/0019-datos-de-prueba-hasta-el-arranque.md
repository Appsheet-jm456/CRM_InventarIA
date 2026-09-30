# 0019 · Los datos actuales son de prueba y se borran antes de cargar los reales

**Estado:** Aceptada · 30 sep 2026 · Cierra F3·2 · Aplica la 0013 y la 0014

## Contexto

F3·2 debía traer los datos de Baserow y el historial de Evolution a Supabase. Al revisarlo:

- **Evolution está vacío**: 0 chats y 0 mensajes, y la instancia `ventas` está desconectada.
- **Los leads de Baserow ya eran pruebas** y no se copiaron (0013).
- El inventario de Supabase (17 portátiles) es la copia de Baserow, y el cliente y los mensajes que hay
  salieron de la demo con el número de prueba de Meta.

El dueño pide usar esa base **como prueba** mientras se construye, y borrarla después para cargar lo
real.

## Decisión

- **No se migra nada de Evolution.** No hay historial que traer.
- **Supabase manda desde ya** (0014): el inventario se carga con la hoja de Excel
  (`docs/plantillas/inventario.xlsx`, con los 17 equipos de prueba como ejemplo) y se **apaga la copia
  desde Baserow** (`crm-sync-inventario`). La v0 del puerto 3000 sigue leyendo el Baserow viejo.
- **Todo lo que hay en `productos`, `leads`, `mensajes` y `catalogos` es de prueba.** Antes de arrancar
  con clientes reales se borra con `herramientas/datos-prueba/borrar_datos_prueba.py`, que primero guarda
  un respaldo, y se carga la hoja real con `cargar_inventario.py`.
- **No se borran** las etapas, los usuarios, los roles ni los permisos: son configuración.

## Consecuencias

- Mientras tanto, cambiar el inventario de prueba se hace con la hoja de Excel, no en Baserow.
- El borrado va antes del corte (F5·1), o antes si el dueño entrega la hoja real.
- La etapa *Distribuidores*, que venía de Baserow, se revisa en F3·5 con el módulo Etapas.

# 0013 · Migración de Baserow a Supabase: modelo espejo e inventario copiado

**Estado:** Aceptada · 30 sep 2026

## Contexto

El dueño pide pasar ya de Baserow a Supabase local (decisión 0003), empezando por el mismo modelo de
datos de Baserow para mejorarlo después. La demo con el número de prueba de Meta sigue leyendo Baserow,
y el inventario se sigue editando allí.

## Decisión

- **Instancia propia `crminventaria-supabase`** en este servidor, copiada del montaje de Futur Green con
  claves nuevas: API y Studio en `:8020`, base en `:5434` (sesión) y `:6545` (transacción).
- **Migración 0001 = las tres tablas de Baserow** en Postgres: `productos` (Inventario), `etapas`
  (CRM_Etapas) y `leads` (CRM_Leads). Se corrige solo lo que Baserow no permitía: precio y stock como
  números, código y teléfono únicos, la etapa amarrada a su tabla (renombrar arrastra, borrar con leads
  se impide), tildes en los nombres de las etapas y RLS encendido sin políticas (solo el servidor entra).
- **El inventario se sigue editando en Baserow** y se copia a Supabase cada 5 minutos
  (`herramientas/sync-baserow/sincronizar_inventario.py`, timer `crm-sync-inventario`). Solo escribe lo
  que cambió, borra lo que se eliminó y avisa si los totales no cuadran. Se voltea cuando la app nueva
  tenga el módulo Inventario (F3·9).
- **Los leads de Baserow no se copian ni se respaldan:** eran pruebas (dueño, 30 sep 2026). Solo pasan
  las 8 etapas, que son configuración.

## Consecuencias

- El modelo completo del diseño (contactos, conversaciones, mensajes, historial de etapas…) entra en
  migraciones siguientes sobre esta base (F2·2).
- Hasta mover el bot de prueba a Supabase, el kanban de la v0 sigue siendo el de Baserow.

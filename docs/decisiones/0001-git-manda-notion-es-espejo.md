# 0001 · Git manda, Notion es el espejo

**Estado:** Aceptada · 29 sep 2026

## Contexto

InventarIA se documentaba solo en `docs/BRIEF.md`, sin fases ni tablero. Se adopta el esquema que
ya funciona en Futur Green y ClaudePyme.

## Decisión

- **Git es la fuente de verdad** del código, el brief, las decisiones y las fases
  (`Appsheet-jm456/inventaria`).
- **Notion es el espejo** para leer y comentar, y es donde vive el **estado** de las tareas.
- `docs/notion/sincronizar.py` copia de git a Notion. Nunca al revés.

## Consecuencias

- Cambiar el brief: editar `docs/00-BRIEF.md`, commit y `sincronizar.py --paginas`.
- Cerrar una tarea es un `PATCH` a su fila en Notion, no una sincronización completa.

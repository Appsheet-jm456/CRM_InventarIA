# InventarIA

Inventario, chat con IA y CRM de WhatsApp para **Ventas Virtuales Colombia** (portátiles usados).
Next.js 14 + Baserow + Evolution API.

## Antes de empezar

El proyecto se está **reconstruyendo por fases (SDLC)**, con el mismo método de Futur Green.
Leer en este orden:

1. **[docs/00-BRIEF.md](docs/00-BRIEF.md)**: alcance del CRM nuevo, fase actual y riesgos.
2. `docs/sdlc/N-*.md` de la fase en curso: criterio de cierre y avance.
3. [docs/decisiones/](docs/decisiones/): decisiones tomadas (Supabase, canal, bot de menú fijo…).
4. [docs/BRIEF.md](docs/BRIEF.md): la **v0** que sigue viva en el puerto 3000 hasta el corte.

**Notion** (espejo; git manda): página "CRM InventarIA". Token en `.env.notion` (no se commitea).
Tareas y fases en `docs/notion/tareas.csv` y `fases.csv`, generados con el módulo `csv` de Python.
Sincronizar con `python3 docs/notion/sincronizar.py --tareas` o `--paginas`, solo con cambios
estructurales. Cerrar una tarea se hace con un `PATCH` a su fila, no con el script.

## Reglas del proyecto

- Commit por bloque de trabajo terminado; push solo con autorización.

- El bot de WhatsApp responde por **menú fijo, nunca con IA libre** — para que no improvise precios.
- El embudo del CRM **solo avanza**: nunca mover un lead a una etapa anterior automáticamente.
- Dos claves distintas: `ACCESS_PASSWORD` para leer, `ACTION_PASSWORD` para escribir. No mezclarlas.
- Nunca commitear `.env.local`, `.env.local.bak` ni `uploads/` (fotos de clientes).

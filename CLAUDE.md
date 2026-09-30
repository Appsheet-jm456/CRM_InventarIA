# InventarIA

Inventario, chat con IA y CRM de WhatsApp para **Ventas Virtuales Colombia** (portátiles usados).
v0: Next.js 14 + Baserow + Evolution API. App nueva: Next.js 14 (TypeScript, panel lateral de
Futur Green) + Supabase propio + WhatsApp Cloud API de Meta. La app nueva vive en `crm/` y corre en el
puerto 8096 (servicio `crm-inventaria-app`, decisión 0017).

## Antes de empezar

El proyecto se está **reconstruyendo por fases (SDLC)**, con el mismo método de Futur Green.
Leer en este orden:

0. **[docs/PENDIENTES.md](docs/PENDIENTES.md)**: dónde retomar, tareas abiertas y estado del repo. **Empezar aquí.**
1. **[docs/00-BRIEF.md](docs/00-BRIEF.md)**: alcance del CRM nuevo, fase actual y riesgos.
2. `docs/sdlc/N-*.md` de la fase en curso: criterio de cierre y avance.
3. [docs/decisiones/](docs/decisiones/): decisiones tomadas (Supabase, canal, bot de menú fijo…).
4. [docs/BRIEF.md](docs/BRIEF.md): la **v0** que sigue viva en el puerto 3000 hasta el corte.

**Notion** (espejo; git manda): página "CRM InventarIA". Token en `.env.notion` (no se commitea).
Tareas y fases en `docs/notion/tareas.csv` y `fases.csv`, generados con el módulo `csv` de Python.
Sincronizar con `python3 docs/notion/sincronizar.py --tareas` o `--paginas`, solo con cambios
estructurales. Cerrar una tarea se hace con un `PATCH` a su fila, no con el script.
En Notion **no se reescribe nada**: el script modifica solo los bloques que cambiaron. La única copia completa
es la versión del brief (`--version`), y solo con autorización del dueño.

## Reglas del proyecto

- Commit por bloque de trabajo terminado; push solo con autorización.
- El bot de WhatsApp responde por **menú fijo, nunca con IA libre** — para que no improvise precios. Está en revisión (P-11, F1·9): no cambiarlo sin decisión del dueño.
- El embudo del CRM **solo avanza**: nunca mover un lead a una etapa anterior automáticamente.
- Dos claves distintas: `ACCESS_PASSWORD` para leer, `ACTION_PASSWORD` para escribir. No mezclarlas.
- Nunca commitear `.env.local`, `.env.local.bak` ni `uploads/` (fotos de clientes).

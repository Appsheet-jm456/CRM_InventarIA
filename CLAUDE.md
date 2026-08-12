# InventarIA

Inventario, chat con IA y CRM de WhatsApp para **Ventas Virtuales Colombia** (portátiles usados).
Next.js 14 + Baserow + Evolution API.

## Antes de empezar

Lee **[docs/BRIEF.md](docs/BRIEF.md)** — arquitectura, módulos, embudo de ventas, estado actual
y por dónde seguir. Es el punto de retomada del proyecto.
Versión visual con demo interactiva del bot: `docs/brief.html`.

**Mantén el brief al día:** cuando cambie la arquitectura, se agregue un módulo o se avance en
los pendientes, actualiza `docs/BRIEF.md` (sección 5 «Estado» y 6 «Por dónde seguir») y la fecha
de última revisión al inicio del archivo.

## Reglas del proyecto

- El bot de WhatsApp responde por **menú fijo, nunca con IA libre** — para que no improvise precios.
- El embudo del CRM **solo avanza**: nunca mover un lead a una etapa anterior automáticamente.
- Dos claves distintas: `ACCESS_PASSWORD` para leer, `ACTION_PASSWORD` para escribir. No mezclarlas.
- Nunca commitear `.env.local`, `.env.local.bak` ni `uploads/` (fotos de clientes).

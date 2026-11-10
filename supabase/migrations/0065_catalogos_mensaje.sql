-- 0065 · Catálogos: mensaje propio al enviarlo desde el chat (F4·61, docs/MEJORAS-CHAT-Y-PAGOS.md, RB-07b).
-- El dueño escribe en Inventario → Catálogos → Modificar el texto que acompaña a cada catálogo cuando el asesor lo envía con «/» o ⚡.
-- Acepta {nombre} (primer nombre del cliente) y {enlace} (dónde va el enlace de Drive; sin la marca, va al final). Vacío = texto por defecto.
-- Los cuadros del bot y las Acciones siguen usando su propio texto.

alter table public.catalogos add column mensaje text not null default '' check (length(mensaje) <= 1500);
comment on column public.catalogos.mensaje is 'F4·61 (RB-07b): texto que acompaña al catálogo cuando el asesor lo envía desde el chat. Vacío = el texto por defecto.';

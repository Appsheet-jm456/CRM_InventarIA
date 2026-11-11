-- 0070 · Fotos del equipo: hasta tres fotos JPG o PNG y un enlace de Drive (F4·65, docs/INVENTARIO.md#fotos-del-equipo-f465).
--
-- Pedido del dueño (11 nov 2026): además de la foto principal (foto_ruta, RI-03), dos fotos más y la carpeta de Drive con todas las
-- fotos del producto. El bot manda la ficha con la Foto 1, el renglón «📷 Más fotos» si hay enlace y después las Fotos 2 y 3.
-- WEBP se retira: WhatsApp solo manda imágenes JPG o PNG (WEBP es de stickers) y una ficha en WEBP no le llegaba al cliente.

alter table public.productos
  add column fotos_extra text[] not null default '{}',
  add column fotos_drive text not null default '';

comment on column public.productos.fotos_extra is 'Fotos 2 y 3 del equipo en el bucket productos (<id>/<archivo>.jpg|png), en orden. F4·65.';
comment on column public.productos.fotos_drive is 'Enlace de Google Drive con más fotos del equipo (vacío = sin enlace). F4·65.';

alter table public.productos
  add constraint productos_fotos_extra_maximo check (cardinality(fotos_extra) <= 2),
  add constraint productos_fotos_extra_tipo check (
    array_to_string(fotos_extra, '|') = ''
    or array_to_string(fotos_extra, '|') ~* '^[^|]+\.(jpe?g|png)(\|[^|]+\.(jpe?g|png))?$'),
  add constraint productos_foto_ruta_tipo check (foto_ruta = '' or foto_ruta ~* '\.(jpe?g|png)$'),
  add constraint productos_fotos_drive_enlace check (
    fotos_drive = '' or fotos_drive ~* '^https://(drive|docs)\.google\.com/\S+$');

-- RI-11: el bucket solo acepta lo que WhatsApp puede mandar como imagen.
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png'] where id = 'productos';

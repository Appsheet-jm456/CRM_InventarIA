-- 0023 · Apariencia: logo, tres colores, fuente y modo oscuro por usuario (F4·19, decisión 0031)
--
-- Diseño: docs/APARIENCIA.md (RA-01 a RA-16). La 0022 queda reservada para F4·14 (arranques del bot).
-- Null en un campo = el valor de la marca (paleta de globals.css, monograma «VV», Figtree): así «Restaurar» es
-- volver a null y la base no copia los colores de la marca.

-- --------------------------------------------------------------------------- --
-- Permiso: solo el Administrador (RA-01)
-- --------------------------------------------------------------------------- --
insert into public.permisos (codigo, descripcion) values
  ('administrar_apariencia', 'Apariencia de la app: logo, colores de la marca y fuente');

insert into public.rol_permisos (rol_id, permiso)
select id, 'administrar_apariencia' from public.roles where nombre = 'administrador';

-- --------------------------------------------------------------------------- --
-- Apariencia de toda la app: una sola fila
-- --------------------------------------------------------------------------- --
create table public.apariencia (
  id              smallint primary key default 1 check (id = 1),
  color_panel     text check (color_panel ~ '^#[0-9A-F]{6}$'),       -- RA-05
  color_principal text check (color_principal ~ '^#[0-9A-F]{6}$'),
  color_acento    text check (color_acento ~ '^#[0-9A-F]{6}$'),
  fuente          text check (fuente in ('figtree', 'nunito', 'atkinson')),
  logo            text check (logo is null or logo ~ '^logo/[0-9]+\.(png|jpg|webp)$'),  -- ruta en el bucket marca (RA-15)
  actualizado_por uuid references public.usuarios (id),
  actualizado_en  timestamptz not null default now()
);
insert into public.apariencia (id) values (1);

create or replace function public.apariencia_sello() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  return new;
end $$;
create trigger apariencia_sello before update on public.apariencia
  for each row execute function public.apariencia_sello();

alter table public.apariencia enable row level security;
revoke all on public.apariencia from anon, authenticated;
grant select on public.apariencia to authenticated;
grant update (color_panel, color_principal, color_acento, fuente, logo) on public.apariencia to authenticated;

-- La ve cualquier usuario activo (la app entera se pinta con ella); el login la lee con la llave de servicio.
create policy apariencia_lectura on public.apariencia for select to authenticated
  using ((select public.es_usuario_activo()));
create policy apariencia_edicion on public.apariencia for update to authenticated
  using ((select public.tiene_permiso('administrar_apariencia')))
  with check ((select public.tiene_permiso('administrar_apariencia')));

-- --------------------------------------------------------------------------- --
-- Logo (RA-12 a RA-15): bucket privado, sin SVG
-- --------------------------------------------------------------------------- --
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marca', 'marca', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy marca_lectura on storage.objects for select to authenticated
  using (bucket_id = 'marca' and (select public.es_usuario_activo()));
create policy marca_alta on storage.objects for insert to authenticated
  with check (bucket_id = 'marca' and (select public.tiene_permiso('administrar_apariencia')));
create policy marca_edicion on storage.objects for update to authenticated
  using (bucket_id = 'marca' and (select public.tiene_permiso('administrar_apariencia')));
create policy marca_baja on storage.objects for delete to authenticated
  using (bucket_id = 'marca' and (select public.tiene_permiso('administrar_apariencia')));

-- --------------------------------------------------------------------------- --
-- Modo oscuro por usuario (RA-06 a RA-09). Null = sigue al equipo.
-- --------------------------------------------------------------------------- --
alter table public.usuarios add column modo_oscuro boolean;

-- Editar usuarios pide administrar_usuarios; el modo propio lo cambia cada quien con esta función.
create or replace function public.guardar_modo_oscuro(p_oscuro boolean) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not es_usuario_activo() then
    raise exception 'Sin sesión activa' using errcode = '42501';
  end if;
  update usuarios set modo_oscuro = p_oscuro where id = auth.uid();
end $$;
revoke all on function public.guardar_modo_oscuro(boolean) from public, anon;
grant execute on function public.guardar_modo_oscuro(boolean) to authenticated;

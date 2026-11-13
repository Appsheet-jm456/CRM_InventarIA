-- 0087 · Código editable y borrar equipos (F4·76, RI-02 cambiada por el dueño el 13 nov 2026).
-- Antes: «el código no cambia y un equipo no se borra». Ahora quien tiene `administrar_inventario` puede cambiar el código,
-- eliminar el equipo o desactivarlo (stock 0). El código sigue siendo único sin importar mayúsculas (productos_codigo_mayus)
-- y no puede quedar vacío (check de 0001).

-- --------------------------------------------------------------------------- --
-- El trigger ya no bloquea el cambio de código; conserva lo demás de 0009.
-- --------------------------------------------------------------------------- --
create or replace function public.productos_antes() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.codigo := btrim(new.codigo);
  if tg_op = 'UPDATE' then
    if new.foto_ruta is distinct from old.foto_ruta or new.foto is distinct from old.foto then
      new.foto_meta_id := '';
      new.foto_meta_en := null;
    end if;
  end if;
  if new.stock < 0 then
    raise exception 'El stock no puede ser negativo';
  end if;
  new.actualizado_en := now();
  return new;
end $$;

-- --------------------------------------------------------------------------- --
-- Al cambiar el código, las referencias guardadas como texto se llevan el nuevo:
-- videos del alistamiento (0056) y carritos del asesor (0078). Los pedidos y eventos ya
-- cerrados guardan una foto del momento y no se tocan.
-- --------------------------------------------------------------------------- --
create or replace function public.productos_codigo_cambiado() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update alistamiento_videos set equipo_codigo = new.codigo where upper(equipo_codigo) = upper(old.codigo);
  update carritos c
     set items = (select coalesce(jsonb_agg(case when upper(i ->> 'codigo') = upper(old.codigo)
                                                 then jsonb_set(i, '{codigo}', to_jsonb(new.codigo)) else i end order by n), '[]'::jsonb)
                    from jsonb_array_elements(c.items) with ordinality as e(i, n))
   where exists (select 1 from jsonb_array_elements(c.items) i where upper(i ->> 'codigo') = upper(old.codigo));
  return null;
end $$;

create trigger productos_codigo_cambiado after update of codigo on public.productos
  for each row when (old.codigo is distinct from new.codigo)
  execute function public.productos_codigo_cambiado();

revoke execute on function public.productos_codigo_cambiado() from public, anon, authenticated;

-- --------------------------------------------------------------------------- --
-- Borrar con permiso (RI-01). Las fotos del bucket las quita la app.
-- --------------------------------------------------------------------------- --
grant delete on public.productos to authenticated;
create policy productos_borrar on public.productos for delete to authenticated
  using ((select public.tiene_permiso('administrar_inventario')));

comment on table public.productos is
  'Inventario. RI-02 (0087): el código es único; quien administra el inventario puede cambiarlo, borrar el equipo o dejarlo en stock 0.';

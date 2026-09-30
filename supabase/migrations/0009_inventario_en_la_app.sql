-- 0009 · Inventario en la app: fotos, escritura con permiso, catálogos y carga del Excel (F3·9, decisión 0025)
--
-- Diseño: docs/INVENTARIO.md. Escribir inventario y catálogos pide administrar_inventario (RI-01); la carga
-- del Excel vive en la base para que la app y el script de consola usen las mismas reglas (RI-04).

-- --------------------------------------------------------------------------- --
-- Productos: foto subida (RI-03) y código único sin importar mayúsculas (RI-02)
-- --------------------------------------------------------------------------- --
alter table public.productos
  add column foto_ruta    text not null default '',
  add column foto_meta_id text not null default '',
  add column foto_meta_en timestamptz;
comment on column public.productos.foto_ruta is 'Foto principal en el bucket privado productos (<id>/<archivo>). Manda sobre foto.';
comment on column public.productos.foto is 'Enlace de la foto (Drive u otro). Se usa solo si no hay foto_ruta.';
comment on column public.productos.foto_meta_id is 'Id de la foto subida a Meta; el bot lo reutiliza 25 días.';

create unique index productos_codigo_mayus on public.productos (upper(btrim(codigo)));

-- Al cambiar precio, stock o datos queda la hora; al cambiar la foto, Meta tiene que recibir la nueva.
create or replace function public.productos_antes() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.codigo := btrim(new.codigo);
  if tg_op = 'UPDATE' then
    if new.codigo is distinct from old.codigo then
      raise exception 'El código de un equipo no cambia (RI-02)';
    end if;
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

create trigger productos_antes before insert or update on public.productos
  for each row execute function public.productos_antes();

-- --------------------------------------------------------------------------- --
-- Escritura con permiso (RI-01)
-- --------------------------------------------------------------------------- --
grant insert, update on public.productos to authenticated;
grant insert, update, delete on public.catalogos to authenticated;

create policy productos_alta on public.productos for insert to authenticated
  with check ((select public.tiene_permiso('administrar_inventario')));
create policy productos_edicion on public.productos for update to authenticated
  using ((select public.tiene_permiso('administrar_inventario')))
  with check ((select public.tiene_permiso('administrar_inventario')));

create policy catalogos_alta on public.catalogos for insert to authenticated
  with check ((select public.tiene_permiso('administrar_inventario')));
create policy catalogos_edicion on public.catalogos for update to authenticated
  using ((select public.tiene_permiso('administrar_inventario')))
  with check ((select public.tiene_permiso('administrar_inventario')));
create policy catalogos_baja on public.catalogos for delete to authenticated
  using ((select public.tiene_permiso('administrar_inventario')));

-- Un solo catálogo "Todos" activo (RI-05).
create unique index catalogos_un_todos on public.catalogos (todos) where todos and activo;

-- --------------------------------------------------------------------------- --
-- Archivos: buckets privados productos y catalogos
-- --------------------------------------------------------------------------- --
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
update storage.buckets set file_size_limit = 20971520, allowed_mime_types = array['application/pdf']
where id = 'catalogos';

create policy inventario_archivos_lectura on storage.objects for select to authenticated
  using (bucket_id in ('productos', 'catalogos') and (select public.es_usuario_activo()));
create policy inventario_archivos_alta on storage.objects for insert to authenticated
  with check (bucket_id in ('productos', 'catalogos') and (select public.tiene_permiso('administrar_inventario')));
create policy inventario_archivos_edicion on storage.objects for update to authenticated
  using (bucket_id in ('productos', 'catalogos') and (select public.tiene_permiso('administrar_inventario')));
create policy inventario_archivos_baja on storage.objects for delete to authenticated
  using (bucket_id in ('productos', 'catalogos') and (select public.tiene_permiso('administrar_inventario')));

-- --------------------------------------------------------------------------- --
-- Carga del Excel (RI-04)
-- --------------------------------------------------------------------------- --
-- p_productos: [{codigo, precio, stock?, categoria?, marca?, ...}] tal como los leyó la hoja (textos sin
-- espacios de sobra, precio y stock ya números). Devuelve lo que cambiaría; con p_aplicar, además lo escribe.
create or replace function public.cargar_inventario(p_productos jsonb, p_aplicar boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  campos constant text[] := array['categoria', 'descripcion', 'marca', 'modelo', 'procesador', 'generacion',
                                  'ram', 'almacenamiento', 'estado', 'foto', 'video', 'precio', 'stock'];
  errores jsonb := '[]';
  nuevos jsonb := '[]';
  cambian jsonb := '[]';
  sin_stock jsonb;
  p jsonb;
  a productos;
  c text;
  difs jsonb;
  vistos text[] := '{}';
  cod text;
  n int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    perform exigir_permiso('administrar_inventario');
  end if;
  if jsonb_typeof(p_productos) is distinct from 'array' then
    raise exception 'La carga espera una lista de productos';
  end if;
  -- Se valida toda la hoja antes de escribir: con un error no se carga nada.
  if p_aplicar then
    difs := cargar_inventario(p_productos, false);
    if jsonb_array_length(difs->'errores') > 0 then
      return difs;
    end if;
  end if;

  for p in select value from jsonb_array_elements(p_productos) loop
    n := n + 1;
    cod := btrim(coalesce(p->>'codigo', ''));
    if cod = '' then
      errores := errores || jsonb_build_object('fila', coalesce(p->>'fila', n::text), 'error', 'sin código');
      continue;
    end if;
    if upper(cod) = any (vistos) then
      errores := errores || jsonb_build_object('fila', coalesce(p->>'fila', n::text), 'codigo', cod, 'error', 'código repetido');
      continue;
    end if;
    vistos := vistos || upper(cod);
    if jsonb_typeof(p->'precio') is distinct from 'number' or (p->>'precio')::numeric < 0 then
      errores := errores || jsonb_build_object('fila', coalesce(p->>'fila', n::text), 'codigo', cod,
                                               'error', 'el precio no es un número válido');
      continue;
    end if;
    if p ? 'stock' and (jsonb_typeof(p->'stock') is distinct from 'number' or (p->>'stock')::numeric < 0
                        or (p->>'stock')::numeric <> trunc((p->>'stock')::numeric)) then
      errores := errores || jsonb_build_object('fila', coalesce(p->>'fila', n::text), 'codigo', cod,
                                               'error', 'el stock no es un número entero válido');
      continue;
    end if;

    select * into a from productos where upper(codigo) = upper(cod);
    if not found then
      nuevos := nuevos || jsonb_build_object('codigo', cod, 'marca', coalesce(p->>'marca', ''),
                                             'modelo', coalesce(p->>'modelo', ''), 'precio', (p->>'precio')::numeric,
                                             'stock', coalesce((p->>'stock')::int, 0));
      if p_aplicar then
        insert into productos (codigo, categoria, descripcion, marca, modelo, procesador, generacion, ram,
                               almacenamiento, estado, foto, video, precio, stock)
        values (cod, coalesce(p->>'categoria', ''), coalesce(p->>'descripcion', ''), coalesce(p->>'marca', ''),
                coalesce(p->>'modelo', ''), coalesce(p->>'procesador', ''), coalesce(p->>'generacion', ''),
                coalesce(p->>'ram', ''), coalesce(p->>'almacenamiento', ''), coalesce(p->>'estado', ''),
                coalesce(p->>'foto', ''), coalesce(p->>'video', ''), (p->>'precio')::numeric,
                coalesce((p->>'stock')::int, 0));
      end if;
      continue;
    end if;

    difs := '{}';
    foreach c in array campos loop
      if p ? c then
        if c in ('precio', 'stock') then
          if (to_jsonb(a)->>c)::numeric is distinct from (p->>c)::numeric then
            difs := difs || jsonb_build_object(c, jsonb_build_array((to_jsonb(a)->>c)::numeric, (p->>c)::numeric));
          end if;
        elsif coalesce(to_jsonb(a)->>c, '') is distinct from coalesce(p->>c, '') then
          difs := difs || jsonb_build_object(c, jsonb_build_array(to_jsonb(a)->>c, p->>c));
        end if;
      end if;
    end loop;
    if difs <> '{}' then
      cambian := cambian || jsonb_build_object('codigo', a.codigo, 'cambios', difs);
      if p_aplicar then
        update productos set
          categoria = coalesce(p->>'categoria', categoria), descripcion = coalesce(p->>'descripcion', descripcion),
          marca = coalesce(p->>'marca', marca), modelo = coalesce(p->>'modelo', modelo),
          procesador = coalesce(p->>'procesador', procesador), generacion = coalesce(p->>'generacion', generacion),
          ram = coalesce(p->>'ram', ram), almacenamiento = coalesce(p->>'almacenamiento', almacenamiento),
          estado = coalesce(p->>'estado', estado), foto = coalesce(p->>'foto', foto), video = coalesce(p->>'video', video),
          precio = (p->>'precio')::numeric, stock = coalesce((p->>'stock')::int, stock)
        where id = a.id;
      end if;
    end if;
  end loop;

  -- Lo que no viene en la hoja queda en stock 0 (no se borra).
  select coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'marca', marca, 'modelo', modelo, 'stock', stock)
                            order by codigo), '[]')
  into sin_stock
  from productos where stock <> 0 and not (upper(codigo) = any (vistos));

  if jsonb_array_length(errores) > 0 then
    return jsonb_build_object('aplicado', false, 'errores', errores, 'total', n,
                              'nuevos', '[]'::jsonb, 'cambian', '[]'::jsonb, 'sin_stock', '[]'::jsonb);
  end if;
  if n = 0 then
    raise exception 'La hoja no trae productos';
  end if;
  if p_aplicar then
    update productos set stock = 0 where stock <> 0 and not (upper(codigo) = any (vistos));
  end if;
  return jsonb_build_object('aplicado', p_aplicar, 'errores', errores, 'total', n,
                            'nuevos', nuevos, 'cambian', cambian, 'sin_stock', sin_stock);
end $$;

revoke execute on function public.cargar_inventario(jsonb, boolean), public.productos_antes() from public, anon;
revoke execute on function public.productos_antes() from authenticated;
grant execute on function public.cargar_inventario(jsonb, boolean) to authenticated, service_role;

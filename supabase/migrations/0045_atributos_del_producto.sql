-- 0045 · Atributos del producto (F4·41, docs/INVENTARIO.md RI-07 a RI-10). Pedido del cliente Ventas Tech (6 nov 2026) para la ficha
-- de F4·42: tarjeta gráfica, pantalla, teclado, batería, estado estético… Definiciones en producto_atributos y valores en productos.atributos
-- (como los atributos del lead, 0032). La carga del Excel reconoce una columna por atributo (RI-09).

-- --------------------------------------------------------------------------- --
-- Definición de atributos (RI-07)
-- --------------------------------------------------------------------------- --
create table public.producto_atributos (
  id           bigint generated always as identity primary key,
  clave        text not null unique check (clave ~ '^[a-z][a-z0-9_]{1,39}$'
                 -- las marcas que ya usa la plantilla de Avi (agente.datos_equipo) no se pueden repetir
                 and clave not in ('equipo', 'codigo', 'marca', 'modelo', 'procesador', 'generacion', 'ram', 'disco', 'estado',
                                   'precio', 'stock', 'categoria', 'descripcion', 'almacenamiento', 'foto', 'video', 'nombre')),
  nombre       text not null check (btrim(nombre) <> '' and length(nombre) <= 60),
  tipo         text not null check (tipo in ('texto', 'numero', 'si_no', 'lista')),
  emoji        text not null default '' check (length(emoji) <= 16),
  orden        integer not null default 0,
  opciones     jsonb not null default '[]' check (jsonb_typeof(opciones) = 'array'),
  categorias   text[] not null default '{}',          -- vacío = todas las categorías
  archivado_en timestamptz,                           -- archivar no borra lo que tienen los equipos
  creado_por   uuid references public.usuarios (id),
  creado_en    timestamptz not null default now(),
  check (tipo <> 'lista' or jsonb_array_length(opciones) > 0)
);
create index producto_atributos_orden_idx on public.producto_atributos (orden, id);

-- Sugeridos por el pedido de Ventas Tech (todos de texto: «RTX 3080», «15,6" FHD 144 Hz», «RGB», «10/10»).
insert into public.producto_atributos (clave, nombre, tipo, emoji, orden) values
  ('grafica',         'Tarjeta gráfica', 'texto', '🚀', 1),
  ('pantalla',        'Pantalla',        'texto', '🖥️', 2),
  ('teclado',         'Teclado',         'texto', '⌨️', 3),
  ('bateria',         'Batería',         'texto', '🔋', 4),
  ('estado_estetico', 'Estado estético', 'texto', '✨', 5);

-- --------------------------------------------------------------------------- --
-- Valores por equipo (RI-08)
-- --------------------------------------------------------------------------- --
alter table public.productos
  add column atributos jsonb not null default '{}' check (jsonb_typeof(atributos) = 'object');
create index productos_atributos_idx on public.productos using gin (atributos jsonb_path_ops);
comment on column public.productos.atributos is 'Valores de los atributos del producto (F4·41): {clave: valor}. Lo valida productos_validar_atributos.';

create or replace function public.producto_atributo_error(p_def producto_atributos, p_valor jsonb) returns text
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare t text := jsonb_typeof(p_valor);
begin
  if p_valor is null or t = 'null' then return null; end if;
  case p_def.tipo
    when 'texto' then
      if t <> 'string' or length(p_valor #>> '{}') > 300 then return 'debe ser un texto de máximo 300 caracteres'; end if;
    when 'numero' then
      if t <> 'number' then return 'debe ser un número'; end if;
    when 'si_no' then
      if t <> 'boolean' then return 'debe ser sí o no'; end if;
    when 'lista' then
      if t <> 'string' or not (p_def.opciones ? (p_valor #>> '{}')) then return 'debe ser una de las opciones de la lista'; end if;
  end case;
  return null;
end $$;

create or replace function public.productos_validar_atributos() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare k text; v jsonb; d producto_atributos; e text;
begin
  if tg_op = 'UPDATE' and new.atributos is not distinct from old.atributos then return new; end if;
  for k, v in select * from jsonb_each(new.atributos) loop
    select * into d from producto_atributos where clave = k;                -- también los archivados: conservan sus datos
    if not found then raise exception 'El atributo «%» no existe', k using errcode = '22023'; end if;
    e := producto_atributo_error(d, v);
    if e is not null then raise exception 'El atributo «%» %', d.nombre, e using errcode = '22023'; end if;
  end loop;
  return new;
end $$;
create trigger productos_validar_atributos before insert or update of atributos on public.productos
  for each row execute function public.productos_validar_atributos();

-- Convierte el texto de una celda del Excel al valor del atributo. Devuelve {"v": valor} o {"e": error}; vacío = {"v": null} (borra).
create or replace function public.producto_atributo_desde_texto(p_def producto_atributos, p_texto text) returns jsonb
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare s text := btrim(coalesce(p_texto, '')); n text; op jsonb;
begin
  if s = '' then return jsonb_build_object('v', null); end if;
  case p_def.tipo
    when 'texto' then
      if length(s) > 300 then return jsonb_build_object('e', 'pasa de 300 caracteres'); end if;
      return jsonb_build_object('v', s);
    when 'numero' then
      n := replace(s, ' ', '');
      if n ~ '^-?\d{1,3}([.,]\d{3})+$' then n := regexp_replace(n, '[.,]', '', 'g');   -- 1.450.000
      elsif n ~ '^-?\d+,\d+$' then n := replace(n, ',', '.');                         -- 15,6
      end if;
      if n !~ '^-?\d+(\.\d+)?$' then return jsonb_build_object('e', format('«%s» no es un número', s)); end if;
      return jsonb_build_object('v', n::numeric);
    when 'si_no' then
      n := normalizar_condicion(s);
      if n in ('si', 's', 'x', '1', 'true', 'verdadero') then return jsonb_build_object('v', true); end if;
      if n in ('no', 'n', '0', 'false', 'falso') then return jsonb_build_object('v', false); end if;
      return jsonb_build_object('e', format('«%s» no es sí o no', s));
    when 'lista' then
      select o into op from jsonb_array_elements(p_def.opciones) o where normalizar_condicion(o #>> '{}') = normalizar_condicion(s) limit 1;
      if op is null then return jsonb_build_object('e', format('«%s» no está en las opciones (%s)', s,
        (select string_agg(o #>> '{}', ', ') from jsonb_array_elements(p_def.opciones) o))); end if;
      return jsonb_build_object('v', op);
  end case;
  return jsonb_build_object('e', 'tipo desconocido');
end $$;

-- --------------------------------------------------------------------------- --
-- Carga del Excel con atributos (RI-09). Igual que la de 0009 más p->'atributos' = {encabezado: texto}: cada encabezado se busca
-- entre los atributos activos por nombre o por clave (sin tildes ni mayúsculas). Los que no coinciden salen en columnas_ignoradas.
-- --------------------------------------------------------------------------- --
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
  ignoradas text[] := '{}';
  p jsonb;
  a productos;
  d producto_atributos;
  c text;
  difs jsonb;
  vistos text[] := '{}';
  cod text;
  n int := 0;
  enc text;
  celda text;
  conv jsonb;
  attrs jsonb;          -- {clave: valor o null} de la fila
  error_attr text;
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

    -- Atributos de la fila (RI-09)
    attrs := '{}';
    error_attr := null;
    if jsonb_typeof(p->'atributos') = 'object' then
      for enc, celda in select key, value #>> '{}' from jsonb_each(p->'atributos') loop
        select * into d from producto_atributos
         where archivado_en is null
           and (normalizar_condicion(nombre) = normalizar_condicion(enc) or clave = replace(normalizar_condicion(enc), ' ', '_'))
         order by orden, id limit 1;
        if not found then
          if not (enc = any (ignoradas)) then ignoradas := ignoradas || enc; end if;
          continue;
        end if;
        conv := producto_atributo_desde_texto(d, celda);
        if conv ? 'e' then
          error_attr := coalesce(error_attr || '; ', '') || format('%s: %s', d.nombre, conv->>'e');
        else
          attrs := attrs || jsonb_build_object(d.clave, conv->'v');
        end if;
      end loop;
    end if;
    if error_attr is not null then
      errores := errores || jsonb_build_object('fila', coalesce(p->>'fila', n::text), 'codigo', cod, 'error', error_attr);
      continue;
    end if;

    select * into a from productos where upper(codigo) = upper(cod);
    if not found then
      nuevos := nuevos || jsonb_build_object('codigo', cod, 'marca', coalesce(p->>'marca', ''),
                                             'modelo', coalesce(p->>'modelo', ''), 'precio', (p->>'precio')::numeric,
                                             'stock', coalesce((p->>'stock')::int, 0));
      if p_aplicar then
        insert into productos (codigo, categoria, descripcion, marca, modelo, procesador, generacion, ram,
                               almacenamiento, estado, foto, video, precio, stock, atributos)
        values (cod, coalesce(p->>'categoria', ''), coalesce(p->>'descripcion', ''), coalesce(p->>'marca', ''),
                coalesce(p->>'modelo', ''), coalesce(p->>'procesador', ''), coalesce(p->>'generacion', ''),
                coalesce(p->>'ram', ''), coalesce(p->>'almacenamiento', ''), coalesce(p->>'estado', ''),
                coalesce(p->>'foto', ''), coalesce(p->>'video', ''), (p->>'precio')::numeric,
                coalesce((p->>'stock')::int, 0), jsonb_strip_nulls(attrs));
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
    -- Un atributo cambia si el valor es otro (null = vacío). En la vista previa sale con su nombre.
    for c in select key from jsonb_object_keys(attrs) key loop
      if coalesce(a.atributos->c, 'null') is distinct from coalesce(attrs->c, 'null') then
        select nombre into enc from producto_atributos where clave = c;
        difs := difs || jsonb_build_object(enc, jsonb_build_array(a.atributos->c, attrs->c));
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
          precio = (p->>'precio')::numeric, stock = coalesce((p->>'stock')::int, stock),
          atributos = jsonb_strip_nulls(atributos || attrs)
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
    return jsonb_build_object('aplicado', false, 'errores', errores, 'total', n, 'columnas_ignoradas', to_jsonb(ignoradas),
                              'nuevos', '[]'::jsonb, 'cambian', '[]'::jsonb, 'sin_stock', '[]'::jsonb);
  end if;
  if n = 0 then
    raise exception 'La hoja no trae productos';
  end if;
  if p_aplicar then
    update productos set stock = 0 where stock <> 0 and not (upper(codigo) = any (vistos));
  end if;
  return jsonb_build_object('aplicado', p_aplicar, 'errores', errores, 'total', n, 'columnas_ignoradas', to_jsonb(ignoradas),
                            'nuevos', nuevos, 'cambian', cambian, 'sin_stock', sin_stock);
end $$;

-- --------------------------------------------------------------------------- --
-- Permisos: todos los usuarios activos leen; administrar_inventario crea y edita (RI-01)
-- --------------------------------------------------------------------------- --
alter table public.producto_atributos enable row level security;
revoke all on public.producto_atributos from anon, authenticated;
grant select, insert on public.producto_atributos to authenticated;
-- La clave y el tipo no cambian una vez creado (como los del lead: si hace falta otro tipo, se crea otro atributo).
grant update (nombre, emoji, orden, opciones, categorias, archivado_en) on public.producto_atributos to authenticated;
create policy producto_atributos_lectura on public.producto_atributos for select to authenticated
  using ((select public.es_usuario_activo()));
create policy producto_atributos_alta on public.producto_atributos for insert to authenticated
  with check ((select public.tiene_permiso('administrar_inventario')));
create policy producto_atributos_edicion on public.producto_atributos for update to authenticated
  using ((select public.tiene_permiso('administrar_inventario'))) with check ((select public.tiene_permiso('administrar_inventario')));

revoke execute on function public.producto_atributo_error(producto_atributos, jsonb), public.productos_validar_atributos(),
  public.producto_atributo_desde_texto(producto_atributos, text) from public, anon;
revoke execute on function public.productos_validar_atributos() from authenticated;
revoke execute on function public.cargar_inventario(jsonb, boolean) from public, anon;
grant execute on function public.cargar_inventario(jsonb, boolean) to authenticated, service_role;

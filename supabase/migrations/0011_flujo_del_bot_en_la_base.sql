-- 0011 · El flujo del bot pasa a la base, por versiones (F4·5, decisión 0026)
--
-- Diseño: docs/FLUJO-DEL-BOT.md. Cada versión tiene sus cuadros; cada opción dice a dónde lleva, qué palabras la
-- reconocen y qué anota. flujo.py recorre la versión publicada. La versión 1 es el árbol de F3·4 tal cual: el bot
-- se comporta igual antes y después (se comprobó con el motor viejo, conversación por conversación).

-- --------------------------------------------------------------------------- --
-- Versiones
-- --------------------------------------------------------------------------- --
create table public.bot_flujos (
  id            bigint generated always as identity primary key,
  version       integer not null unique,
  estado        text not null check (estado in ('borrador', 'publicada', 'archivada')),
  nota          text not null default '',
  creado_por    uuid references public.usuarios on delete set null,
  creado_en     timestamptz not null default now(),
  publicado_por uuid references public.usuarios on delete set null,
  publicado_en  timestamptz
);
comment on table public.bot_flujos is 'Versiones del flujo del bot (RF-06). El bot usa solo la publicada.';
create unique index bot_flujos_una_publicada on public.bot_flujos (estado) where estado = 'publicada';
create unique index bot_flujos_un_borrador on public.bot_flujos (estado) where estado = 'borrador';

-- --------------------------------------------------------------------------- --
-- Cuadros
-- --------------------------------------------------------------------------- --
create table public.bot_cuadros (
  id                bigint generated always as identity primary key,
  flujo_id          bigint not null references public.bot_flujos on delete cascade,
  clave             text not null check (clave ~ '^[A-Za-z0-9_-]+$'),
  tipo              text not null check (tipo in ('mensaje', 'presupuesto', 'marca', 'equipos', 'ficha', 'asesor', 'aviso')),
  nombre            text not null,
  orden             smallint not null,
  inicio            boolean not null default false,
  texto             text not null check (length(btrim(texto)) > 0),
  texto_original    text not null,
  opciones          jsonb,
  opciones_original jsonb,
  opciones_codigo   jsonb,
  max_titulo        smallint,
  marcas            text[] not null default '{}',
  formato           text not null default 'texto' check (formato in ('menu', 'texto', 'ficha', 'motivo', 'sistema')),
  salidas           jsonb not null default '{}',
  al_entrar         jsonb not null default '{}',
  x                 integer not null default 0,
  y                 integer not null default 0,
  actualizado_en    timestamptz not null default now(),
  actualizado_por   uuid references public.usuarios on delete set null,
  unique (flujo_id, clave)
);
comment on table public.bot_cuadros is
  'Cuadro de una versión del flujo. mensaje: texto y opciones; los demás tipos son del sistema (su lógica está en flujo.py, RF-03).';
comment on column public.bot_cuadros.opciones is
  '[{id, titulo, destino, palabras?, reconocer?, efectos?}]. destino: clave de otro cuadro o @pedir_codigo. '
  'palabras: exacta, "*x" contiene x, "re:x" expresión al inicio. reconocer: uso o quiere_comprar. '
  'efectos: {campos, etiqueta, etapa, motivo} que se anotan al elegirla.';
comment on column public.bot_cuadros.salidas is 'Salidas de un cuadro del sistema: {"siguiente": clave} o {"cambiar_presupuesto": clave}.';
comment on column public.bot_cuadros.al_entrar is 'Efectos al llegar al cuadro: {etapa, etiqueta, campos}.';
create unique index bot_cuadros_un_inicio on public.bot_cuadros (flujo_id) where inicio;

-- Límites de WhatsApp y marcas (los de bot_nodos_limites, 0010).
create or replace function public.bot_cuadros_limites() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  desconocida text;
  medida jsonb;
  op jsonb;
begin
  new.texto := btrim(new.texto);
  if tg_op = 'UPDATE' and new.formato = 'ficha' and new.texto is distinct from old.texto then
    raise exception 'El texto de la ficha sale del inventario; aquí solo se editan los botones.';
  end if;
  select string_agg(distinct '{' || x[1] || '}', ', ') into desconocida
  from regexp_matches(new.texto, '\{([^{}]*)\}', 'g') as x
  where not (x[1] = any (new.marcas));
  if desconocida is not null then
    raise exception 'El bot no reemplaza %: el cliente lo vería tal cual. %', desconocida,
      case when cardinality(new.marcas) = 0 then 'Este mensaje no usa marcas.'
           else 'Marcas de este mensaje: ' || (select string_agg('{' || m || '}', ', ') from unnest(new.marcas) m) || '.' end;
  end if;
  for op in select * from jsonb_array_elements(coalesce(new.opciones, '[]')) loop
    if length(btrim(coalesce(op->>'titulo', ''))) = 0 then
      raise exception 'Cada opción necesita un título.';
    end if;
    if length(op->>'titulo') > coalesce(new.max_titulo, 24) then
      raise exception 'El título "%" pasa de % caracteres (límite de WhatsApp).', op->>'titulo', coalesce(new.max_titulo, 24);
    end if;
  end loop;
  medida := bot_medir(new.texto, new.formato, coalesce(new.opciones, new.opciones_codigo), new.marcas);
  if (medida->>'largo')::int > (medida->>'limite')::int then
    raise exception 'El mensaje queda de % caracteres y WhatsApp permite % %: acórtalo.',
      medida->>'largo', medida->>'limite',
      case medida->>'forma' when 'botones' then 'con botones' when 'lista' then 'con lista' else '' end;
  end if;
  new.actualizado_en := now();
  return new;
end $$;

create trigger bot_cuadros_limites before insert or update on public.bot_cuadros
  for each row execute function public.bot_cuadros_limites();

-- --------------------------------------------------------------------------- --
-- Versión 1: el árbol de F3·4 con los textos que hoy tiene bot_nodos
-- --------------------------------------------------------------------------- --
insert into public.bot_flujos (version, estado, nota, publicado_en)
values (1, 'publicada', 'Versión 1: el árbol de F3·4 pasado a la base (F4·5).', now());

create temporary table estructura (clave text, id text, destino text, palabras jsonb, reconocer text, efectos jsonb) on commit drop;
insert into estructura values
  ('B00', '1', 'B001A', '["producto","productos","portatil","portatiles","torre","torres"]', null, null),
  ('B00', '2', 'B-ASESOR', '["distribuidor","distribuidores","mayorista","al por mayor"]', null,
   '{"etiqueta":"Interes-Distribuidor","motivo":"Esta opción aún no está en el bot (F1·7)."}'),
  ('B00', '3', 'B-ASESOR', '["servicio","servicio al cliente","garantia","soporte","soporte tecnico"]', null,
   '{"etiqueta":"Interes-Soporte","motivo":"Esta opción aún no está en el bot (F1·7)."}'),
  ('B001A', '1', 'B001A1', '["portatil","portatiles","portatil corporativos","portatiles corporativos","laptop","laptops"]', null,
   '{"campos":{"Categoría interés":"Portátiles"},"etiqueta":"Interes-Productos"}'),
  ('B001A', '2', 'B-ASESOR', '[]', null, '{"motivo":"Esa categoría aún no está en el bot (F1·7)."}'),
  ('B001A', '3', 'B-ASESOR', '[]', null, '{"motivo":"Esa categoría aún no está en el bot (F1·7)."}'),
  ('B001A', '4', 'B-ASESOR', '[]', null, '{"motivo":"Esa categoría aún no está en el bot (F1·7)."}'),
  ('B001A', '0', 'B00', '["volver"]', null, null),
  ('B001A1', '1', 'B001A2', '[]', 'uso', '{"campos":{"Uso equipo":"Hogar"},"etiqueta":"Interes-Portatil"}'),
  ('B001A1', '2', 'B001A2', '[]', 'uso', '{"campos":{"Uso equipo":"Ejecutivo"},"etiqueta":"Interes-Portatil"}'),
  ('B001A1', '3', 'B001A2', '[]', 'uso', '{"campos":{"Uso equipo":"Diseño"},"etiqueta":"Interes-Portatil"}'),
  ('B001A1', '0', 'B001A', '[]', null, null),
  ('B001A3', '1', 'B001A4', '["re:si\\b|catalogo"]', null, null),
  ('B001A3', '2', 'B-ASESOR', '["*cotizacion"]', null, '{"etiqueta":"Cotizacion-Personalizada"}'),
  ('B001A3', '3', 'B001A', '["volver"]', null, null),
  ('R11', '1', 'B-ASESOR', '[]', 'quiere_comprar', null),
  ('R11', '2', '@pedir_codigo', '["ver otro codigo"]', null, null),
  ('R11', '0', 'B00', '["menu principal"]', null, null);

-- Une el título de bot_nodos con la estructura, en el orden de las opciones.
create function pg_temp.armar(p_clave text, p_opciones jsonb) returns jsonb language sql as $$
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', o->>'id', 'titulo', o->>'titulo', 'destino', e.destino,
           'palabras', nullif(e.palabras, '[]'::jsonb), 'reconocer', e.reconocer, 'efectos', e.efectos)) order by n)
  from jsonb_array_elements(p_opciones) with ordinality as t(o, n)
  join estructura e on e.clave = p_clave and e.id = o->>'id'
$$;

insert into public.bot_cuadros (flujo_id, clave, tipo, nombre, orden, inicio, texto, texto_original, opciones, opciones_original,
                                opciones_codigo, max_titulo, marcas, formato, salidas, al_entrar, x, y)
select f.id, n.clave, t.tipo, n.nombre, n.orden * 10, n.clave = 'B00', n.texto, n.texto_original,
       pg_temp.armar(n.clave, n.opciones), pg_temp.armar(n.clave, n.opciones_original),
       n.opciones_codigo, n.max_titulo, n.marcas, n.formato, t.salidas::jsonb, t.al_entrar::jsonb, t.x, t.y
from public.bot_nodos n
cross join public.bot_flujos f
join (values
  ('B00', 'mensaje', '{}', '{"etapa":"Nuevo","etiqueta":"WhatsApp-Bot"}', 0, 0),
  ('B001A', 'mensaje', '{}', '{}', 340, 0),
  ('B001A1', 'mensaje', '{}', '{}', 680, 0),
  ('B001A2', 'presupuesto', '{"siguiente":"B001A3"}', '{}', 1020, 0),
  ('B001A3', 'mensaje', '{}', '{}', 1360, 0),
  ('B001A4', 'marca', '{"siguiente":"B001A5"}', '{}', 1700, 0),
  ('R11', 'ficha', '{}', '{}', 2380, 0),
  ('B-ASESOR', 'asesor', '{}', '{}', 1020, 420),
  ('B-CERRADO', 'aviso', '{}', '{}', 0, 700),
  ('ERROR', 'aviso', '{}', '{}', 340, 700),
  ('ERROR-3', 'aviso', '{}', '{}', 680, 700)
) as t (clave, tipo, salidas, al_entrar, x, y) on t.clave = n.clave
where f.version = 1;

-- La lista de equipos no tenía nodo en bot_nodos: su texto sale del inventario.
insert into public.bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, salidas, al_entrar, x, y)
select id, 'B001A5', 'equipos', 'Equipos con stock en el rango', 65,
       'Lista de equipos con stock en el rango y la marca elegidos (sale del inventario).',
       'Lista de equipos con stock en el rango y la marca elegidos (sale del inventario).',
       'sistema', '{"cambiar_presupuesto":"B001A2"}', '{"etiqueta":"Catalogo-Enviado"}', 2040, 0
from public.bot_flujos where version = 1;

-- --------------------------------------------------------------------------- --
-- Editar la versión publicada: solo textos y títulos (la estructura cambia en el borrador, F4·6 y F4·7)
-- --------------------------------------------------------------------------- --
create or replace function public.editar_cuadro(p_clave text, p_texto text, p_titulos jsonb default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros;
begin
  perform exigir_permiso('administrar_bot');
  select k.* into c from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
  where f.estado = 'publicada' and k.clave = p_clave for update of k;
  if not found then
    raise exception 'Ese mensaje no existe' using errcode = 'P0002';
  end if;
  if p_titulos is not null then
    if c.opciones is null
       or (select array_agg(o->>'id' order by o->>'id') from jsonb_array_elements(p_titulos) o)
          is distinct from (select array_agg(o->>'id' order by o->>'id') from jsonb_array_elements(c.opciones) o) then
      raise exception 'Aquí solo se cambian los títulos: las opciones y a dónde llevan se cambian en el lienzo.';
    end if;
    c.opciones := (select jsonb_agg(o || jsonb_build_object('titulo', btrim(t->>'titulo')) order by n)
                   from jsonb_array_elements(c.opciones) with ordinality as x(o, n)
                   join jsonb_array_elements(p_titulos) t on t->>'id' = o->>'id');
  end if;
  update bot_cuadros set texto = coalesce(p_texto, texto), opciones = c.opciones, actualizado_por = auth.uid()
  where id = c.id;
end $$;

create or replace function public.restaurar_cuadro(p_clave text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('administrar_bot');
  update bot_cuadros k set texto = texto_original, opciones = opciones_original, actualizado_por = auth.uid()
  from bot_flujos f
  where f.id = k.flujo_id and f.estado = 'publicada' and k.clave = p_clave;
  if not found then
    raise exception 'Ese mensaje no existe' using errcode = 'P0002';
  end if;
end $$;

-- --------------------------------------------------------------------------- --
-- bot_nodos queda reemplazada por los cuadros de la versión publicada
-- --------------------------------------------------------------------------- --
drop table public.bot_nodos;
drop function public.bot_nodos_validar(), public.bot_nodos_limites();

revoke all on public.bot_flujos, public.bot_cuadros from anon;
revoke insert, update, delete, truncate on public.bot_flujos, public.bot_cuadros from authenticated;
revoke execute on function public.bot_cuadros_limites() from public, anon, authenticated;
revoke execute on function public.editar_cuadro(text, text, jsonb), public.restaurar_cuadro(text) from public, anon;
grant execute on function public.editar_cuadro(text, text, jsonb), public.restaurar_cuadro(text) to authenticated;

alter table public.bot_flujos  enable row level security;
alter table public.bot_cuadros enable row level security;
create policy bot_flujos_lectura on public.bot_flujos for select to authenticated
  using ((select public.tiene_permiso('administrar_bot')));
create policy bot_cuadros_lectura on public.bot_cuadros for select to authenticated
  using ((select public.tiene_permiso('administrar_bot')));

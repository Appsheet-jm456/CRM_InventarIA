-- 0029 · Documentos de conocimiento para el agente (F4·32, docs/AGENTE.md RAG-29 a RAG-33)
--
-- El dueño sube texto, PDF, Excel o CSV; la app extrae el texto, lo parte en trozos y los guarda con un índice de búsqueda en
-- español que no depende de las tildes. buscar_conocimiento() busca en fichas activas (F4·23) y en trozos de documentos activos.

-- --------------------------------------------------------------------------- --
-- Búsqueda en español sin tildes: «garantia» encuentra «garantía»
-- --------------------------------------------------------------------------- --
create extension if not exists unaccent with schema extensions;

create text search configuration public.es_sin_tildes (copy = pg_catalog.spanish);
alter text search configuration public.es_sin_tildes
  alter mapping for hword, hword_part, word with extensions.unaccent, spanish_stem;

-- --------------------------------------------------------------------------- --
-- Documentos y sus trozos
-- --------------------------------------------------------------------------- --
create table public.conocimiento_documentos (
  id            bigint generated always as identity primary key,
  nombre        text not null check (btrim(nombre) <> ''),
  tipo          text not null check (tipo in ('txt', 'md', 'pdf', 'xlsx', 'csv')),
  archivo       text not null check (archivo ~ '^documentos/[0-9]+\.(txt|md|pdf|xlsx|csv)$'),
  tamano        integer not null check (tamano > 0 and tamano <= 10485760),
  estado        text not null default 'procesando' check (estado in ('procesando', 'listo', 'error')),
  error         text,
  fragmentos    integer not null default 0,
  activo        boolean not null default true,
  subido_por    uuid references public.usuarios (id),
  subido_en     timestamptz not null default now(),
  procesado_en  timestamptz
);

create table public.conocimiento_fragmentos (
  id            bigint generated always as identity primary key,
  documento_id  bigint not null references public.conocimiento_documentos (id) on delete cascade,
  orden         integer not null,
  texto         text not null check (btrim(texto) <> '' and length(texto) <= 4000),
  tsv           tsvector generated always as (to_tsvector('public.es_sin_tildes'::regconfig, texto)) stored,
  unique (documento_id, orden)
);
create index conocimiento_fragmentos_tsv_idx on public.conocimiento_fragmentos using gin (tsv);

-- Las fichas también se buscan (título pesa más que la respuesta).
alter table public.conocimiento add column tsv tsvector generated always as (
  setweight(to_tsvector('public.es_sin_tildes'::regconfig, coalesce(titulo, '')), 'A') ||
  setweight(to_tsvector('public.es_sin_tildes'::regconfig, coalesce(categoria, '') || ' ' || coalesce(respuesta, '')), 'B')) stored;
create index conocimiento_tsv_idx on public.conocimiento using gin (tsv);

-- --------------------------------------------------------------------------- --
-- Búsqueda (RAG-29 y RAG-31): fichas y trozos activos, los más parecidos primero; ante empate, la ficha y lo más reciente.
-- --------------------------------------------------------------------------- --
create or replace function public.buscar_conocimiento(p_texto text, p_limite integer default 5)
returns table (fuente text, id bigint, titulo text, texto text, puntaje real)
language sql stable
set search_path = public, extensions, pg_temp
as $$
  with q as (
    -- Las palabras se unen con «o»: una pregunta natural rara vez trae todas las palabras del documento.
    select to_tsquery('public.es_sin_tildes',
             nullif(array_to_string(array(select quote_literal(l) || ':*' from unnest(tsvector_to_array(
               to_tsvector('public.es_sin_tildes', coalesce(p_texto, '')))) l), ' | '), '')) as consulta
  ),
  fichas as (
    select 'ficha'::text, c.id, c.categoria || ' · ' || c.titulo, c.respuesta,
           (ts_rank(c.tsv, q.consulta) * 1.2)::real, c.actualizado_en
      from conocimiento c, q
     where c.activa and q.consulta is not null and c.tsv @@ q.consulta
  ),
  trozos as (
    select 'documento'::text, f.id, d.nombre, f.texto, ts_rank(f.tsv, q.consulta)::real, d.subido_en
      from conocimiento_fragmentos f join conocimiento_documentos d on d.id = f.documento_id, q
     where d.activo and d.estado = 'listo' and q.consulta is not null and f.tsv @@ q.consulta
  )
  select fuente, id, titulo, texto, puntaje from (
    select * from fichas union all select * from trozos
  ) r(fuente, id, titulo, texto, puntaje, fecha)
  order by puntaje desc, (fuente = 'ficha') desc, fecha desc
  limit least(greatest(coalesce(p_limite, 5), 1), 20)
$$;

revoke execute on function public.buscar_conocimiento(text, integer) from public, anon;
grant execute on function public.buscar_conocimiento(text, integer) to authenticated, service_role;

-- --------------------------------------------------------------------------- --
-- Archivos: el bucket conocimiento recibe también texto, Excel y CSV, hasta 10 MB
-- --------------------------------------------------------------------------- --
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown',
                                  'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
 where id = 'conocimiento';

-- --------------------------------------------------------------------------- --
-- Privilegios y RLS: como el conocimiento (0024)
-- --------------------------------------------------------------------------- --
alter table public.conocimiento_documentos enable row level security;
alter table public.conocimiento_fragmentos enable row level security;
revoke all on public.conocimiento_documentos, public.conocimiento_fragmentos from anon, authenticated;
grant select, insert, update, delete on public.conocimiento_documentos, public.conocimiento_fragmentos to authenticated;

create policy documentos_lectura on public.conocimiento_documentos for select to authenticated using ((select public.es_usuario_activo()));
create policy documentos_alta on public.conocimiento_documentos for insert to authenticated
  with check ((select public.tiene_permiso('administrar_agente')));
create policy documentos_edicion on public.conocimiento_documentos for update to authenticated
  using ((select public.tiene_permiso('administrar_agente'))) with check ((select public.tiene_permiso('administrar_agente')));
create policy documentos_baja on public.conocimiento_documentos for delete to authenticated
  using ((select public.tiene_permiso('administrar_agente')));

create policy fragmentos_lectura on public.conocimiento_fragmentos for select to authenticated using ((select public.es_usuario_activo()));
create policy fragmentos_alta on public.conocimiento_fragmentos for insert to authenticated
  with check ((select public.tiene_permiso('administrar_agente')));
create policy fragmentos_baja on public.conocimiento_fragmentos for delete to authenticated
  using ((select public.tiene_permiso('administrar_agente')));

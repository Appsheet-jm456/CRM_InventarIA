-- 0032 · Base del módulo Leads (F4·30 A, decisión 0033, docs/LEADS.md)
--
-- Atributos personalizados (definiciones + valores en leads.atributos), historial de cada lead, archivar y papelera, tipos de tarea,
-- permisos nuevos e índices de búsqueda. No cambia cómo responde el bot ni lo que ven hoy la Bandeja y el Embudo.

-- --------------------------------------------------------------------------- --
-- Permisos (RL-10): los tiene el administrador; el asesor, no
-- --------------------------------------------------------------------------- --
insert into public.permisos (codigo, descripcion) values
  ('administrar_atributos', 'Crear, editar, ordenar y archivar los atributos personalizados del lead'),
  ('eliminar_leads', 'Mandar leads a la papelera y restaurarlos'),
  ('exportar_leads', 'Exportar la lista de leads (datos personales) a Excel o CSV');
insert into public.rol_permisos (rol_id, permiso)
select r.id, p.codigo from public.roles r, public.permisos p
 where r.nombre = 'administrador' and p.codigo in ('administrar_atributos', 'eliminar_leads', 'exportar_leads');

-- --------------------------------------------------------------------------- --
-- Índices de búsqueda (F4·31, punto 7): nombre, teléfono y texto de los mensajes
-- --------------------------------------------------------------------------- --
create extension if not exists pg_trgm with schema extensions;
create index leads_nombre_trgm on public.leads using gin (lower(nombre) extensions.gin_trgm_ops);
create index leads_telefono_trgm on public.leads using gin (telefono extensions.gin_trgm_ops);
create index mensajes_texto_trgm on public.mensajes using gin (lower(texto) extensions.gin_trgm_ops);

-- --------------------------------------------------------------------------- --
-- Columnas nuevas de leads
-- --------------------------------------------------------------------------- --
alter table public.leads
  add column atributos    jsonb not null default '{}' check (jsonb_typeof(atributos) = 'object'),
  add column archivado_en timestamptz,                                    -- RL: sale de las listas; se deshace si el cliente escribe
  add column eliminado_en timestamptz,                                    -- papelera de 30 días
  add column origen       text not null default 'bot' check (origen in ('bot', 'agente', 'asesor', 'importado'));
create index leads_atributos_idx on public.leads using gin (atributos jsonb_path_ops);
create index leads_activos_idx on public.leads (fecha_ultimo_contacto desc nulls last) where archivado_en is null and eliminado_en is null;
create index leads_papelera_idx on public.leads (eliminado_en) where eliminado_en is not null;

-- --------------------------------------------------------------------------- --
-- Definición de atributos (RL-07 a RL-10)
-- --------------------------------------------------------------------------- --
create table public.lead_atributos (
  id               bigint generated always as identity primary key,
  clave            text not null unique check (clave ~ '^[a-z][a-z0-9_]{1,39}$'),          -- no cambia: es la llave dentro de leads.atributos
  nombre           text not null check (btrim(nombre) <> '' and length(nombre) <= 60),
  tipo             text not null check (tipo in ('texto', 'texto_largo', 'numero', 'moneda', 'fecha', 'lista', 'multiseleccion',
                                                  'si_no', 'telefono', 'correo', 'direccion', 'enlace')),
  seccion          text not null default 'Datos del cliente' check (btrim(seccion) <> '' and length(seccion) <= 40),
  orden            integer not null default 0,
  opciones         jsonb not null default '[]' check (jsonb_typeof(opciones) = 'array'),
  obligatorio      text not null default 'no' check (obligatorio in ('no', 'etapa')),   -- 'etapa': obligatorio para pasar a las etapas de abajo
  etapas_obligatorio text[] not null default '{}',
  visible_lista    boolean not null default false,
  llenable_bot     boolean not null default false,                                       -- lo puede llenar el bot o el agente
  archivado_en     timestamptz,                                                          -- RL-08: eliminar = archivar; los datos se conservan
  creado_por       uuid references public.usuarios (id),
  creado_en        timestamptz not null default now(),
  check (tipo not in ('lista', 'multiseleccion') or jsonb_array_length(opciones) > 0),
  check (obligatorio = 'no' or cardinality(etapas_obligatorio) > 0)
);
create index lead_atributos_orden_idx on public.lead_atributos (seccion, orden);

-- Los de Kommo que pidió el dueño (docs/LEADS.md §4)
insert into public.lead_atributos (clave, nombre, tipo, seccion, orden, opciones, llenable_bot, visible_lista) values
  ('tipo_cliente',        'Tipo de cliente',      'lista',  'Datos del cliente', 1, '["Distribuidor", "Cliente final"]', true,  true),
  ('cedula',              'Cédula',               'texto',  'Datos del cliente', 2, '[]', true,  false),
  ('ciudad',              'Ciudad',               'texto',  'Datos del cliente', 3, '[]', true,  true),
  ('metodo_pago',         'Método de pago',       'lista',  'Compra',            1, '["Transferencia", "Tarjeta", "Efectivo", "Contra entrega"]', false, false),
  ('descuento',           'Descuento',            'lista',  'Compra',            2, '["Ninguno", "5 %", "10 %", "Otro"]', false, false),
  ('numero_serie',        'Número de serie',      'texto',  'Compra',            3, '[]', false, false),
  ('numero_contrato',     'Número de contrato',   'texto',  'Compra',            4, '[]', false, false),
  ('fecha_contrato',      'Fecha de contrato',    'fecha',  'Compra',            5, '[]', false, false),
  ('direccion_entrega',   'Dirección de entrega', 'direccion', 'Envío',          1, '[]', true,  false);

-- --------------------------------------------------------------------------- --
-- Validación de leads.atributos: llaves conocidas y valor del tipo correcto
-- --------------------------------------------------------------------------- --
create or replace function public.lead_atributo_error(p_def lead_atributos, p_valor jsonb) returns text
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare t text := jsonb_typeof(p_valor); texto text;
begin
  if p_valor is null or t = 'null' then return null; end if;                              -- vaciar un atributo siempre se puede
  texto := case when t = 'string' then p_valor #>> '{}' end;
  case p_def.tipo
    when 'texto', 'direccion' then
      if t <> 'string' or length(texto) > 300 then return 'debe ser un texto de máximo 300 caracteres'; end if;
    when 'texto_largo' then
      if t <> 'string' or length(texto) > 4000 then return 'debe ser un texto de máximo 4.000 caracteres'; end if;
    when 'numero', 'moneda' then
      if t <> 'number' then return 'debe ser un número'; end if;
    when 'fecha' then
      begin
        if t <> 'string' or texto !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'x'; end if;
        perform texto::date;
      exception when others then return 'debe ser una fecha AAAA-MM-DD';
      end;
    when 'lista' then
      if t <> 'string' or not (p_def.opciones ? texto) then return 'debe ser una de las opciones de la lista'; end if;
    when 'multiseleccion' then
      if t <> 'array' or exists (select 1 from jsonb_array_elements(p_valor) e
                                  where jsonb_typeof(e) <> 'string' or not (p_def.opciones ? (e #>> '{}'))) then
        return 'debe ser una o varias opciones de la lista';
      end if;
    when 'si_no' then
      if t <> 'boolean' then return 'debe ser sí o no'; end if;
    when 'telefono' then
      if t <> 'string' or texto !~ '^\+?[0-9 ()-]{7,20}$' then return 'debe ser un teléfono'; end if;
    when 'correo' then
      if t <> 'string' or texto !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(texto) > 200 then return 'debe ser un correo'; end if;
    when 'enlace' then
      if t <> 'string' or texto !~ '^https?://\S+$' or length(texto) > 500 then return 'debe ser un enlace http o https'; end if;
  end case;
  return null;
end $$;

create or replace function public.leads_validar_atributos() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare k text; v jsonb; d lead_atributos; e text;
begin
  if tg_op = 'UPDATE' and new.atributos is not distinct from old.atributos then return new; end if;
  for k, v in select * from jsonb_each(new.atributos) loop
    select * into d from lead_atributos where clave = k;                                  -- también los archivados: conservan sus datos
    if not found then raise exception 'El atributo «%» no existe', k using errcode = '22023'; end if;
    e := lead_atributo_error(d, v);
    if e is not null then raise exception 'El atributo «%» %', d.nombre, e using errcode = '22023'; end if;
  end loop;
  return new;
end $$;
create trigger leads_validar_atributos before insert or update of atributos on public.leads
  for each row execute function public.leads_validar_atributos();

-- Atributos que faltan para pasar a una etapa (RL-03, docs/LEADS.md §4). La ficha lo consulta antes de mover; el bot nunca se bloquea.
create or replace function public.lead_atributos_faltantes(p_lead bigint, p_etapa text) returns text[]
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(a.nombre order by a.seccion, a.orden), '{}')
    from lead_atributos a, leads l
   where l.id = p_lead and a.archivado_en is null and a.obligatorio = 'etapa' and p_etapa = any (a.etapas_obligatorio)
     and coalesce(nullif(btrim(l.atributos ->> a.clave), ''), nullif(l.atributos ->> a.clave, 'null')) is null
$$;

-- --------------------------------------------------------------------------- --
-- Historial de cada lead (RL-12): quién, cuándo, antes → después
-- --------------------------------------------------------------------------- --
create table public.lead_eventos (
  id         bigint generated always as identity primary key,
  lead_id    bigint not null references public.leads (id) on delete cascade,
  en         timestamptz not null default now(),
  usuario_id uuid references public.usuarios (id) on delete set null,                    -- null: lo hizo el sistema (bot, agente, reloj)
  tipo       text not null check (tipo in ('etapa', 'oportunidad', 'responsable', 'nombre', 'valor', 'etiquetas', 'atributo',
                                           'archivado', 'desarchivado', 'eliminado', 'restaurado', 'tarea', 'tarea_cumplida', 'nota')),
  antes      jsonb,
  despues    jsonb,
  detalle    text not null default ''
);
create index lead_eventos_lead_idx on public.lead_eventos (lead_id, en desc);

create or replace function public.lead_evento(p_lead bigint, p_tipo text, p_antes jsonb, p_despues jsonb, p_detalle text default '') returns void
language sql security definer
set search_path = public, pg_temp
as $$ insert into lead_eventos (lead_id, usuario_id, tipo, antes, despues, detalle)
      select p_lead, (select id from usuarios where id = auth.uid()), p_tipo, p_antes, p_despues, p_detalle $$;

create or replace function public.leads_registrar_cambios() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare k text;
begin
  if new.etapa is distinct from old.etapa then perform lead_evento(new.id, 'etapa', to_jsonb(old.etapa), to_jsonb(new.etapa)); end if;
  if new.asignado_a is distinct from old.asignado_a then perform lead_evento(new.id, 'responsable', to_jsonb(old.asignado_a), to_jsonb(new.asignado_a)); end if;
  if new.nombre is distinct from old.nombre then perform lead_evento(new.id, 'nombre', to_jsonb(old.nombre), to_jsonb(new.nombre)); end if;
  if new.valor_estimado is distinct from old.valor_estimado then perform lead_evento(new.id, 'valor', to_jsonb(old.valor_estimado), to_jsonb(new.valor_estimado)); end if;
  if new.etiquetas is distinct from old.etiquetas then perform lead_evento(new.id, 'etiquetas', to_jsonb(old.etiquetas), to_jsonb(new.etiquetas)); end if;
  if new.atributos is distinct from old.atributos then
    for k in select distinct key from (select key from jsonb_object_keys(old.atributos) key union all select key from jsonb_object_keys(new.atributos) key) t loop
      if old.atributos -> k is distinct from new.atributos -> k then
        perform lead_evento(new.id, 'atributo', old.atributos -> k, new.atributos -> k, k);
      end if;
    end loop;
  end if;
  if new.archivado_en is distinct from old.archivado_en then
    perform lead_evento(new.id, case when new.archivado_en is null then 'desarchivado' else 'archivado' end, null, null);
  end if;
  if new.eliminado_en is distinct from old.eliminado_en then
    perform lead_evento(new.id, case when new.eliminado_en is null then 'restaurado' else 'eliminado' end, null, null);
  end if;
  return new;
end $$;
-- Solo cuando cambia algo que importa: el bot actualiza el lead en cada mensaje y eso no deja rastro.
create trigger leads_registrar_cambios after update of etapa, asignado_a, nombre, valor_estimado, etiquetas, atributos, archivado_en, eliminado_en
  on public.leads for each row execute function public.leads_registrar_cambios();

-- La etapa de cada oportunidad (el embudo que el usuario mueve a mano) y las tareas también entran al historial.
create or replace function public.oportunidades_registrar_cambios() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.etapa_id is distinct from old.etapa_id then
    perform lead_evento(new.lead_id, 'oportunidad',
      (select to_jsonb(e.nombre) from etapas e where e.id = old.etapa_id), (select to_jsonb(e.nombre) from etapas e where e.id = new.etapa_id),
      (select em.nombre from embudos em where em.id = new.embudo_id));
  end if;
  return new;
end $$;
create trigger oportunidades_registrar_cambios after update of etapa_id on public.oportunidades
  for each row execute function public.oportunidades_registrar_cambios();

-- Tipo y resultado de las tareas (RL-06): se construyen sobre seguimientos (F3·6)
alter table public.seguimientos
  add column tipo      text not null default 'Seguimiento' check (btrim(tipo) <> '' and length(tipo) <= 40),
  add column resultado text not null default '' check (length(resultado) <= 500);

create table public.lead_tarea_tipos (
  nombre text primary key check (btrim(nombre) <> '' and length(nombre) <= 40),
  orden  integer not null default 0,
  activo boolean not null default true
);
insert into public.lead_tarea_tipos (nombre, orden) values
  ('Llamar', 1), ('Seguimiento', 2), ('Enviar cotización', 3), ('Verificar pago', 4), ('Despachar', 5);

create or replace function public.seguimientos_registrar() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform lead_evento(new.lead_id, 'tarea', null, to_jsonb(new.que), new.tipo);
  elsif new.estado = 'hecho' and old.estado is distinct from 'hecho' then
    perform lead_evento(new.lead_id, 'tarea_cumplida', to_jsonb(old.que), null, new.resultado);
  end if;
  return new;
end $$;
create trigger seguimientos_registrar after insert or update of estado on public.seguimientos
  for each row execute function public.seguimientos_registrar();

-- --------------------------------------------------------------------------- --
-- Archivar, eliminar (papelera) y restaurar (docs/LEADS.md §5). Nadie escribe leads directo con la sesión: todo pasa por aquí.
-- --------------------------------------------------------------------------- --
create or replace function public.leads_archivar(p_ids bigint[], p_archivar boolean default true) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  perform exigir_permiso('atender_bandeja');
  update leads set archivado_en = case when p_archivar then now() end
   where id = any (p_ids) and eliminado_en is null and puede_atender(asignado_a)
     and (archivado_en is null) = p_archivar;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.leads_eliminar(p_ids bigint[], p_restaurar boolean default false) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  perform exigir_permiso('eliminar_leads');
  update leads set eliminado_en = case when p_restaurar then null else now() end
   where id = any (p_ids) and (eliminado_en is null) = not p_restaurar;
  get diagnostics n = row_count;
  return n;
end $$;

-- --------------------------------------------------------------------------- --
-- Privilegios y RLS
-- --------------------------------------------------------------------------- --
alter table public.lead_atributos  enable row level security;
alter table public.lead_eventos    enable row level security;
alter table public.lead_tarea_tipos enable row level security;
revoke all on public.lead_atributos, public.lead_eventos, public.lead_tarea_tipos from anon, authenticated;
grant select on public.lead_atributos, public.lead_eventos, public.lead_tarea_tipos to authenticated;
grant insert, update on public.lead_atributos to authenticated;
grant insert, update, delete on public.lead_tarea_tipos to authenticated;
grant usage on all sequences in schema public to authenticated;

create policy lead_atributos_lectura on public.lead_atributos for select to authenticated using ((select public.es_usuario_activo()));
create policy lead_atributos_alta on public.lead_atributos for insert to authenticated with check ((select public.tiene_permiso('administrar_atributos')));
create policy lead_atributos_edicion on public.lead_atributos for update to authenticated
  using ((select public.tiene_permiso('administrar_atributos'))) with check ((select public.tiene_permiso('administrar_atributos')));
create policy tarea_tipos_lectura on public.lead_tarea_tipos for select to authenticated using ((select public.es_usuario_activo()));
create policy tarea_tipos_edicion on public.lead_tarea_tipos for all to authenticated
  using ((select public.tiene_permiso('administrar_atributos'))) with check ((select public.tiene_permiso('administrar_atributos')));
create policy lead_eventos_lectura on public.lead_eventos for select to authenticated using ((select public.puede_ver_lead(lead_id)));

-- La clave y el tipo de un atributo no cambian una vez creado (RL-09: si hace falta otro tipo, se crea otro atributo).
revoke update on public.lead_atributos from authenticated;
grant update (nombre, seccion, orden, opciones, obligatorio, etapas_obligatorio, visible_lista, llenable_bot, archivado_en) on public.lead_atributos to authenticated;

revoke execute on function public.leads_archivar(bigint[], boolean), public.leads_eliminar(bigint[], boolean),
  public.lead_atributos_faltantes(bigint, text), public.lead_evento(bigint, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.leads_archivar(bigint[], boolean), public.leads_eliminar(bigint[], boolean),
  public.lead_atributos_faltantes(bigint, text) to authenticated;
revoke execute on function public.lead_evento(bigint, text, jsonb, jsonb, text) from authenticated;

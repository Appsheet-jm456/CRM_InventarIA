-- 0003 · Usuarios, roles y permisos (decisión 0018) y RLS base
--
-- Diseño: docs/USUARIOS-Y-PERMISOS.md. Mismo modelo de Futur Green: la base pregunta por el permiso
-- (tiene_permiso), nunca por el nombre del rol. El bot y los procesos del servidor usan la llave de
-- servicio y no pasan por aquí (RU-09).

-- --------------------------------------------------------------------------- --
-- Tablas
-- --------------------------------------------------------------------------- --
create table public.permisos (
  codigo      text primary key,
  descripcion text not null
);

create table public.roles (
  id      bigint generated always as identity primary key,
  nombre  text not null unique check (btrim(nombre) <> ''),
  sistema boolean not null default false
);

create table public.rol_permisos (
  rol_id  bigint not null references public.roles on delete cascade,
  permiso text   not null references public.permisos,
  primary key (rol_id, permiso)
);
create index on public.rol_permisos (permiso);

-- Perfil de cada cuenta de Supabase Auth. No se borra: se desactiva (RU-06).
create table public.usuarios (
  id        uuid primary key references auth.users,
  nombre    text not null check (btrim(nombre) <> ''),
  rol_id    bigint not null references public.roles,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);
create index on public.usuarios (rol_id);

insert into public.permisos (codigo, descripcion) values
  ('atender_bandeja',          'Ver la cola, tomar conversaciones, responder y pausar el bot'),
  ('ver_todas_conversaciones', 'Ver y reasignar las conversaciones de todos los asesores'),
  ('gestionar_oportunidades',  'Mover oportunidades en el embudo y agendar seguimientos'),
  ('administrar_inventario',   'Productos, precios, stock, fotos, catálogos y carga por Excel'),
  ('administrar_bot',          'Árbol del bot, horario de atención y respuestas rápidas'),
  ('administrar_embudo',       'Etapas del embudo y motivos de pérdida'),
  ('administrar_canal',        'Conexión con WhatsApp, plantillas y consumo de Meta'),
  ('ver_metricas',             'Métricas de todo el equipo'),
  ('administrar_usuarios',     'Usuarios, roles y permisos');

insert into public.roles (nombre, sistema) values ('administrador', true), ('asesor', false);

insert into public.rol_permisos (rol_id, permiso)
select r.id, p.codigo from public.roles r cross join public.permisos p where r.nombre = 'administrador'
union all
select r.id, p from public.roles r cross join unnest(array['atender_bandeja', 'gestionar_oportunidades']) p
where r.nombre = 'asesor';

-- --------------------------------------------------------------------------- --
-- Quién es y qué puede
-- --------------------------------------------------------------------------- --
create or replace function public.es_usuario_activo() returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from usuarios where id = auth.uid() and activo) $$;

create or replace function public.tiene_permiso(p_permiso text) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios u join rol_permisos rp on rp.rol_id = u.rol_id
    where u.id = auth.uid() and u.activo and rp.permiso = p_permiso)
$$;

create or replace function public.exigir_permiso(p_permiso text) returns uuid
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not tiene_permiso(p_permiso) then
    raise exception 'Sin permiso para esta operación: %', p_permiso using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- --------------------------------------------------------------------------- --
-- Siempre queda quien administre (RU-05)
-- --------------------------------------------------------------------------- --
create or replace function public.proteger_rol_sistema() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'El rol % es del sistema y no se borra', old.nombre;
  end if;
  if not new.sistema then
    raise exception 'El rol % no deja de ser del sistema', old.nombre;
  end if;
  return new;
end $$;

create trigger roles_sistema before update or delete on public.roles
  for each row when (old.sistema) execute function public.proteger_rol_sistema();

create or replace function public.proteger_permiso_administrador() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.permiso = 'administrar_usuarios'
     and exists (select 1 from roles where id = old.rol_id and sistema) then
    raise exception 'El rol administrador no pierde el permiso administrar_usuarios';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;

create trigger rol_permisos_administrador before update or delete on public.rol_permisos
  for each row execute function public.proteger_permiso_administrador();

create or replace function public.verificar_hay_administrador() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from usuarios) and not exists (
       select 1 from usuarios u join rol_permisos rp on rp.rol_id = u.rol_id
       where u.activo and rp.permiso = 'administrar_usuarios') then
    raise exception 'Tiene que quedar al menos un usuario activo que administre usuarios';
  end if;
  return null;
end $$;

create trigger usuarios_hay_administrador after insert or update or delete on public.usuarios
  for each statement execute function public.verificar_hay_administrador();
create trigger rol_permisos_hay_administrador after update or delete on public.rol_permisos
  for each statement execute function public.verificar_hay_administrador();

-- --------------------------------------------------------------------------- --
-- Privilegios
-- --------------------------------------------------------------------------- --
-- anon no ve nada; los objetos que creen las migraciones siguientes tampoco.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
revoke execute on function public.es_usuario_activo(), public.tiene_permiso(text), public.exigir_permiso(text)
  from public, anon;

-- El catálogo de permisos lo cambia solo una migración. Un usuario no se borra: se desactiva.
revoke insert, update, delete, truncate on public.permisos from authenticated;
revoke delete, truncate on public.usuarios from authenticated;
revoke truncate on public.roles, public.rol_permisos from authenticated;
-- El id y la fecha de un usuario no cambian.
revoke update on public.usuarios from authenticated;
grant update (nombre, rol_id, activo) on public.usuarios to authenticated;

-- Las tablas del bot y el inventario: por ahora solo lectura desde la app. Cada paso de la Fase 3
-- abre la escritura con su permiso (F3·5 embudo y bandeja, F3·9 inventario).
revoke insert, update, delete, truncate on
  public.productos, public.etapas, public.catalogos, public.leads, public.mensajes
from authenticated;

-- --------------------------------------------------------------------------- --
-- RLS
-- --------------------------------------------------------------------------- --
alter table public.permisos     enable row level security;
alter table public.roles        enable row level security;
alter table public.rol_permisos enable row level security;
alter table public.usuarios     enable row level security;

do $$
declare t text;
begin
  -- Lo lee cualquier usuario activo.
  foreach t in array array['permisos', 'roles', 'rol_permisos', 'usuarios', 'productos', 'etapas', 'catalogos'] loop
    execute format('create policy %1$s_lectura on public.%1$I for select to authenticated
                    using ((select public.es_usuario_activo()))', t);
  end loop;

  foreach t in array array['roles', 'rol_permisos', 'usuarios'] loop
    execute format('create policy %1$s_alta on public.%1$I for insert to authenticated
                    with check ((select public.tiene_permiso(''administrar_usuarios'')))', t);
    execute format('create policy %1$s_edicion on public.%1$I for update to authenticated
                    using ((select public.tiene_permiso(''administrar_usuarios'')))
                    with check ((select public.tiene_permiso(''administrar_usuarios'')))', t);
  end loop;
  foreach t in array array['roles', 'rol_permisos'] loop
    execute format('create policy %1$s_baja on public.%1$I for delete to authenticated
                    using ((select public.tiene_permiso(''administrar_usuarios'')))', t);
  end loop;
end $$;

-- Cada quien lee su propio perfil aunque esté inactivo: así el login le dice por qué no entra.
create policy usuarios_propio on public.usuarios for select to authenticated using (id = (select auth.uid()));

-- leads y mensajes siguen sin políticas: solo el servidor, hasta F3·5 (RU-08).

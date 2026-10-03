-- 0020 · Configuración Meta: conexión y secretos desde la app (F4·16 bloque A, decisión 0029)
--
-- Diseño: docs/CONFIGURACION-META.md (RC-01 a RC-07).
-- Los identificadores (App ID, WABA, número) viven en `meta_conexion`. Los tres secretos (token, App Secret y token
-- de verificación) viven cifrados en Supabase Vault; la tabla solo guarda el id del secreto. Nadie con sesión de
-- usuario puede leerlos (RC-01): se escriben con `meta_guardar` y solo el servidor (`service_role`) los lee con
-- `meta_config`. Cada cambio queda en `meta_conexion_historial`, sin valores.

-- --------------------------------------------------------------------------- --
-- Permiso: solo el Administrador (RC-05)
-- --------------------------------------------------------------------------- --
insert into public.permisos (codigo, descripcion) values
  ('administrar_meta', 'Conexión con Meta: App ID, WABA, número, token y claves (los secretos nunca se ven)');

insert into public.rol_permisos (rol_id, permiso)
select id, 'administrar_meta' from public.roles where nombre = 'administrador';

-- --------------------------------------------------------------------------- --
-- Tablas
-- --------------------------------------------------------------------------- --
-- RC-02: una sola conexión activa. La fila existe siempre; «sin_conexion» es su estado vacío.
create table public.meta_conexion (
  id                      smallint primary key default 1 check (id = 1),
  estado                  text not null default 'sin_conexion' check (estado in ('sin_conexion', 'conectada')),
  app_id                  text check (app_id ~ '^[0-9]{5,25}$'),
  waba_id                 text check (waba_id ~ '^[0-9]{5,25}$'),
  phone_number_id         text check (phone_number_id ~ '^[0-9]{5,25}$'),
  numero_visible          text,            -- lo que devuelve Meta al probar, para mostrarlo
  nombre_verificado       text,
  calidad                 text,
  token_id                uuid,            -- id del secreto en vault.secrets (nunca el valor)
  app_secret_id           uuid,
  verify_token_id         uuid,
  token_guardado_en       timestamptz,
  app_secret_guardado_en  timestamptz,
  verify_token_guardado_en timestamptz,
  ultima_prueba_en        timestamptz,
  ultima_prueba           jsonb,           -- lista de comprobaciones y su resultado; nunca secretos
  actualizado_por         uuid references public.usuarios on delete set null,
  actualizado_en          timestamptz not null default now(),
  check (estado = 'sin_conexion'
         or (app_id is not null and waba_id is not null and phone_number_id is not null
             and token_id is not null and app_secret_id is not null and verify_token_id is not null))
);
comment on table public.meta_conexion is 'Conexión con Meta (RC-02). Los secretos están en Vault; aquí solo sus ids y fechas.';
insert into public.meta_conexion (id) values (1);

create table public.meta_conexion_historial (
  id         bigint generated always as identity primary key,
  en         timestamptz not null default now(),
  usuario_id uuid references public.usuarios on delete set null,
  accion     text not null check (accion in ('conectó', 'cambió', 'desconectó', 'nuevo token de verificación', 'probó')),
  campos     text[] not null default '{}',  -- nombres de lo que cambió, nunca valores
  detalle    text
);
create index on public.meta_conexion_historial (en desc);
comment on table public.meta_conexion_historial is 'Quién cambió la conexión con Meta y qué campos; jamás guarda valores ni fragmentos (RC-05).';

-- --------------------------------------------------------------------------- --
-- Privilegios y RLS: solo se lee con permiso, y nadie escribe directo
-- --------------------------------------------------------------------------- --
alter table public.meta_conexion           enable row level security;
alter table public.meta_conexion_historial enable row level security;

revoke all on public.meta_conexion, public.meta_conexion_historial from anon, authenticated;
-- Las columnas con ids de secretos no se exponen ni al administrador.
grant select (id, estado, app_id, waba_id, phone_number_id, numero_visible, nombre_verificado, calidad,
              token_guardado_en, app_secret_guardado_en, verify_token_guardado_en,
              ultima_prueba_en, ultima_prueba, actualizado_por, actualizado_en)
  on public.meta_conexion to authenticated;
grant select on public.meta_conexion_historial to authenticated;

create policy meta_conexion_ver on public.meta_conexion for select to authenticated
  using (public.tiene_permiso('administrar_meta'));
create policy meta_historial_ver on public.meta_conexion_historial for select to authenticated
  using (public.tiene_permiso('administrar_meta'));

-- --------------------------------------------------------------------------- --
-- Funciones
-- --------------------------------------------------------------------------- --
-- Guarda o actualiza un secreto en Vault y devuelve su id. Un valor vacío conserva el actual (RC-01).
create function public.meta_poner_secreto(p_id uuid, p_nombre text, p_valor text) returns uuid
language plpgsql security definer
set search_path = public, vault, extensions, pg_temp
as $$
begin
  if p_id is null then
    return vault.create_secret(p_valor, p_nombre, 'Conexión con Meta (F4·16)');
  end if;
  perform vault.update_secret(p_id, p_valor);
  return p_id;
end $$;

-- Conecta o cambia la conexión. Los secretos en null o vacíos conservan el que ya hay; la primera vez hacen falta
-- el token y el App Secret. Si todavía no hay token de verificación, lo genera y lo devuelve (es la única vez que
-- sale; para verlo otra vez hay que pedir uno nuevo). RC-03: exige que la prueba contra Meta haya salido bien.
create function public.meta_guardar(
  p_app_id text, p_waba_id text, p_phone_number_id text,
  p_token text default null, p_app_secret text default null,
  p_numero_visible text default null, p_nombre_verificado text default null, p_calidad text default null,
  p_prueba jsonb default null
) returns text
language plpgsql security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  yo uuid := exigir_permiso('administrar_meta');
  c meta_conexion;
  cambios text[] := '{}';
  verify_nuevo text;
  tk uuid; sc uuid; vf uuid;
begin
  select * into c from meta_conexion where id = 1 for update;

  if coalesce(p_prueba ->> 'ok', 'false') <> 'true' then
    raise exception 'Primero hay que probar la conexión con Meta y que salga bien';
  end if;
  if p_app_id !~ '^[0-9]{5,25}$' or p_waba_id !~ '^[0-9]{5,25}$' or p_phone_number_id !~ '^[0-9]{5,25}$' then
    raise exception 'App ID, WABA ID y Phone Number ID son números de 5 a 25 dígitos';
  end if;
  p_token      := nullif(btrim(coalesce(p_token, '')), '');
  p_app_secret := nullif(btrim(coalesce(p_app_secret, '')), '');
  if (p_token is not null and length(p_token) < 20) or (p_app_secret is not null and length(p_app_secret) < 16) then
    raise exception 'El token o el App Secret son demasiado cortos';
  end if;
  if c.token_id is null and p_token is null then
    raise exception 'Falta el token de acceso';
  end if;
  if c.app_secret_id is null and p_app_secret is null then
    raise exception 'Falta el App Secret';
  end if;

  if c.app_id is distinct from p_app_id then cambios := array_append(cambios, 'app_id'); end if;
  if c.waba_id is distinct from p_waba_id then cambios := array_append(cambios, 'waba_id'); end if;
  if c.phone_number_id is distinct from p_phone_number_id then cambios := array_append(cambios, 'phone_number_id'); end if;

  tk := c.token_id; sc := c.app_secret_id; vf := c.verify_token_id;
  if p_token is not null then
    tk := meta_poner_secreto(c.token_id, 'meta_token', p_token);
    cambios := array_append(cambios, 'token');
  end if;
  if p_app_secret is not null then
    sc := meta_poner_secreto(c.app_secret_id, 'meta_app_secret', p_app_secret);
    cambios := array_append(cambios, 'app_secret');
  end if;
  if vf is null then
    verify_nuevo := encode(gen_random_bytes(24), 'hex');
    vf := meta_poner_secreto(null, 'meta_verify_token', verify_nuevo);
    cambios := array_append(cambios, 'verify_token');
  end if;

  update meta_conexion set
    estado = 'conectada', app_id = p_app_id, waba_id = p_waba_id, phone_number_id = p_phone_number_id,
    numero_visible = p_numero_visible, nombre_verificado = p_nombre_verificado, calidad = p_calidad,
    token_id = tk, app_secret_id = sc, verify_token_id = vf,
    token_guardado_en = case when p_token is not null then now() else token_guardado_en end,
    app_secret_guardado_en = case when p_app_secret is not null then now() else app_secret_guardado_en end,
    verify_token_guardado_en = case when verify_nuevo is not null then now() else verify_token_guardado_en end,
    ultima_prueba_en = now(), ultima_prueba = p_prueba - 'secretos',
    actualizado_por = yo, actualizado_en = now()
  where id = 1;

  insert into meta_conexion_historial (usuario_id, accion, campos)
  values (yo, case when c.estado = 'conectada' then 'cambió' else 'conectó' end, cambios);

  return verify_nuevo;  -- solo la primera vez; si no, null
end $$;

-- Genera otro token de verificación (por ejemplo, al registrar el webhook en una app nueva). Se devuelve una sola vez.
create function public.meta_nuevo_verify_token() returns text
language plpgsql security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  yo uuid := exigir_permiso('administrar_meta');
  c meta_conexion;
  nuevo text := encode(gen_random_bytes(24), 'hex');
  vf uuid;
begin
  select * into c from meta_conexion where id = 1 for update;
  if c.estado <> 'conectada' then
    raise exception 'Primero hay que conectar con Meta';
  end if;
  vf := meta_poner_secreto(c.verify_token_id, 'meta_verify_token', nuevo);
  update meta_conexion set verify_token_guardado_en = now(), actualizado_por = yo, actualizado_en = now() where id = 1;
  insert into meta_conexion_historial (usuario_id, accion, campos) values (yo, 'nuevo token de verificación', array['verify_token']);
  return nuevo;
end $$;

-- Anota una prueba contra Meta que no se guardó (qué comprobaciones salieron mal, sin secretos).
create function public.meta_anotar_prueba(p_prueba jsonb) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare yo uuid := exigir_permiso('administrar_meta');
begin
  update meta_conexion set ultima_prueba_en = now(), ultima_prueba = p_prueba - 'secretos' where id = 1;
  insert into meta_conexion_historial (usuario_id, accion, detalle)
  values (yo, 'probó', case when coalesce(p_prueba ->> 'ok', 'false') = 'true' then 'salió bien' else 'con fallas' end);
end $$;

-- «Desconectar»: borra los tres secretos y deja la conexión vacía (RC-01, RC-05).
create function public.meta_desconectar() returns void
language plpgsql security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  yo uuid := exigir_permiso('administrar_meta');
  c meta_conexion;
begin
  select * into c from meta_conexion where id = 1 for update;
  if c.estado <> 'conectada' then
    raise exception 'No hay una conexión con Meta';
  end if;
  delete from vault.secrets where id in (c.token_id, c.app_secret_id, c.verify_token_id);
  update meta_conexion set
    estado = 'sin_conexion', app_id = null, waba_id = null, phone_number_id = null,
    numero_visible = null, nombre_verificado = null, calidad = null,
    token_id = null, app_secret_id = null, verify_token_id = null,
    token_guardado_en = null, app_secret_guardado_en = null, verify_token_guardado_en = null,
    ultima_prueba_en = null, ultima_prueba = null, actualizado_por = yo, actualizado_en = now()
  where id = 1;
  insert into meta_conexion_historial (usuario_id, accion, campos)
  values (yo, 'desconectó', array['app_id', 'waba_id', 'phone_number_id', 'token', 'app_secret', 'verify_token']);
end $$;

-- ¿Hay conexión? Para avisar en Inicio y en la Bandeja. No da ningún dato de ella.
create function public.meta_conectada() returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select es_usuario_activo() and exists (select 1 from meta_conexion where id = 1 and estado = 'conectada') $$;

-- Lo único que devuelve los secretos: solo el servidor (app Next.js y receptor). null si no hay conexión (RC-07).
create function public.meta_config() returns jsonb
language plpgsql stable security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare c meta_conexion;
begin
  select * into c from meta_conexion where id = 1;
  if c.estado <> 'conectada' then
    return null;
  end if;
  return jsonb_build_object(
    'app_id', c.app_id, 'waba_id', c.waba_id, 'phone_number_id', c.phone_number_id,
    'token', (select decrypted_secret from vault.decrypted_secrets where id = c.token_id),
    'app_secret', (select decrypted_secret from vault.decrypted_secrets where id = c.app_secret_id),
    'verify_token', (select decrypted_secret from vault.decrypted_secrets where id = c.verify_token_id),
    'actualizado_en', c.actualizado_en);
end $$;

-- --------------------------------------------------------------------------- --
-- Quién puede llamar qué
-- --------------------------------------------------------------------------- --
revoke execute on function
  public.meta_poner_secreto(uuid, text, text), public.meta_guardar(text, text, text, text, text, text, text, text, jsonb),
  public.meta_nuevo_verify_token(), public.meta_anotar_prueba(jsonb), public.meta_desconectar(),
  public.meta_conectada(), public.meta_config()
  from public, anon, authenticated, service_role;

grant execute on function
  public.meta_guardar(text, text, text, text, text, text, text, text, jsonb),
  public.meta_nuevo_verify_token(), public.meta_anotar_prueba(jsonb), public.meta_desconectar(),
  public.meta_conectada()
  to authenticated;
-- Solo el servidor lee los secretos (RC-01).
grant execute on function public.meta_config() to service_role;

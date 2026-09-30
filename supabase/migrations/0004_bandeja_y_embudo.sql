-- 0004 · Bandeja multiasesor, embudo y etapas (F3·5, decisión 0020)
--
-- Diseño: docs/BANDEJA-Y-EMBUDO.md. Se amplía leads (una fila por cliente) sin cambiar el bot: la base
-- deriva el estado de la conversación de lo que el bot ya escribe (pausar_bot). Las acciones de los
-- asesores son funciones que verifican el permiso; nadie escribe directo en leads ni en mensajes.

-- --------------------------------------------------------------------------- --
-- Columnas nuevas
-- --------------------------------------------------------------------------- --
alter table public.leads
  add column estado_chat          text not null default 'bot'
                                  check (estado_chat in ('bot', 'cola', 'asignada', 'cerrada')),
  add column asignado_a           uuid references public.usuarios,
  add column en_cola_desde        timestamptz,
  add column primera_respuesta_en timestamptz;
comment on column public.leads.estado_chat is
  'bot · cola (pidió asesor) · asignada (la atiende asignado_a) · cerrada. Lo deriva la base de pausar_bot.';
create index leads_bandeja_idx on public.leads (estado_chat, asignado_a);
create index leads_reciente_idx on public.leads (fecha_ultimo_contacto desc nulls last);

update public.leads set estado_chat = 'cola', en_cola_desde = coalesce(fecha_ultimo_contacto, now())
where pausar_bot;

alter table public.mensajes
  add column usuario_id   uuid references public.usuarios,
  add column media_ruta   text not null default '',
  add column media_mime   text not null default '',
  add column media_nombre text not null default '';
comment on column public.mensajes.media_ruta is 'Ruta en el bucket privado media (<lead>/<wamid>.<ext>).';

-- Vendido y Perdido cierran la oportunidad; la regla de motivo (RB-04) no depende del nombre.
alter table public.etapas
  add column cierre text not null default '' check (cierre in ('', 'ganada', 'perdida'));
update public.etapas set cierre = 'ganada' where nombre = 'Vendido';
update public.etapas set cierre = 'perdida' where nombre = 'Perdido';

create table public.historial_etapas (
  id         bigint generated always as identity primary key,
  lead_id    bigint not null references public.leads on delete cascade,
  de         text,
  a          text not null,
  usuario_id uuid references public.usuarios,   -- null: lo movió el bot
  creado_en  timestamptz not null default now()
);
comment on table public.historial_etapas is 'Cada cambio de etapa, del bot o de una persona. Base de las métricas.';
create index on public.historial_etapas (lead_id, creado_en);

insert into public.historial_etapas (lead_id, de, a, creado_en)
select id, null, etapa, creado_en from public.leads;

insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict (id) do nothing;

-- --------------------------------------------------------------------------- --
-- La base deriva el estado y lleva el historial
-- --------------------------------------------------------------------------- --
create or replace function public.leads_derivar_estado() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.pausar_bot then
      new.estado_chat := 'cola';
      new.en_cola_desde := now();
    end if;
    return new;
  end if;
  -- Si quien actualiza fijó el estado (una función de la Bandeja), se respeta.
  if new.estado_chat is not distinct from old.estado_chat then
    if new.pausar_bot and not old.pausar_bot and new.estado_chat = 'bot' then
      new.estado_chat := 'cola';
      new.en_cola_desde := now();
      new.primera_respuesta_en := null;
    elsif not new.pausar_bot and old.pausar_bot and new.estado_chat in ('cola', 'asignada') then
      new.estado_chat := 'bot';
      new.asignado_a := null;
    end if;
  end if;
  return new;
end $$;

create trigger leads_estado before insert or update on public.leads
  for each row execute function public.leads_derivar_estado();

create or replace function public.leads_historial_etapa() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.etapa is distinct from old.etapa then
    insert into historial_etapas (lead_id, de, a, usuario_id)
    values (new.id, case when tg_op = 'UPDATE' then old.etapa end, new.etapa, auth.uid());
  end if;
  return null;
end $$;

create trigger leads_historial after insert or update of etapa on public.leads
  for each row execute function public.leads_historial_etapa();

-- Un cliente que vuelve a escribir en una conversación cerrada la reabre con el bot.
create or replace function public.mensajes_reabrir() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.lado = 'cliente' then
    update leads set estado_chat = 'bot', asignado_a = null
    where id = new.lead_id and estado_chat = 'cerrada';
  end if;
  return null;
end $$;

create trigger mensajes_reabrir after insert on public.mensajes
  for each row execute function public.mensajes_reabrir();

-- --------------------------------------------------------------------------- --
-- Quién ve qué (RU-08)
-- --------------------------------------------------------------------------- --
-- Ver una conversación es lo mismo que poder atenderla: la suya, la de nadie, o todas con permiso.
create or replace function public.puede_atender(p_asignado uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select tiene_permiso('ver_todas_conversaciones')
      or (tiene_permiso('atender_bandeja') and (p_asignado is null or p_asignado = auth.uid()))
$$;

create or replace function public.puede_ver_lead(p_lead bigint) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from leads where id = p_lead and puede_atender(asignado_a)) $$;

-- Toma la fila con candado y verifica que quien pide la pueda atender.
create or replace function public.lead_a_cargo(p_lead bigint) returns leads
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads;
begin
  select * into l from leads where id = p_lead for update;
  if not found then
    raise exception 'La conversación no existe' using errcode = 'P0002';
  end if;
  if not puede_atender(l.asignado_a) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  return l;
end $$;

-- --------------------------------------------------------------------------- --
-- Acciones de la Bandeja
-- --------------------------------------------------------------------------- --
create or replace function public.tomar_conversacion(p_lead bigint) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads;
begin
  perform exigir_permiso('atender_bandeja');
  l := lead_a_cargo(p_lead);
  update leads set asignado_a = auth.uid(), estado_chat = 'asignada', pausar_bot = true,
                   en_cola_desde = coalesce(l.en_cola_desde, now())
  where id = p_lead;
end $$;

create or replace function public.liberar_conversacion(p_lead bigint) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform lead_a_cargo(p_lead);
  update leads set asignado_a = null, estado_chat = 'cola', pausar_bot = true where id = p_lead;
end $$;

create or replace function public.asignar_conversacion(p_lead bigint, p_usuario uuid) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads;
begin
  perform exigir_permiso('ver_todas_conversaciones');
  l := lead_a_cargo(p_lead);
  if not exists (select 1 from usuarios u join rol_permisos rp on rp.rol_id = u.rol_id
                 where u.id = p_usuario and u.activo and rp.permiso = 'atender_bandeja') then
    raise exception 'Ese usuario no está activo o no atiende la bandeja';
  end if;
  update leads set asignado_a = p_usuario, estado_chat = 'asignada', pausar_bot = true,
                   en_cola_desde = coalesce(l.en_cola_desde, now())
  where id = p_lead;
end $$;

create or replace function public.cerrar_conversacion(p_lead bigint) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform lead_a_cargo(p_lead);
  update leads set estado_chat = 'cerrada', pausar_bot = false, paso_menu = '', errores_bot = 0
  where id = p_lead;
end $$;

create or replace function public.reanudar_bot(p_lead bigint) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform lead_a_cargo(p_lead);
  update leads set estado_chat = 'bot', asignado_a = null, pausar_bot = false, paso_menu = '', errores_bot = 0
  where id = p_lead;
end $$;

-- RB-01 y RB-03: se llama después de que Meta aceptó el mensaje, con su wamid.
create or replace function public.registrar_mensaje_asesor(p_lead bigint, p_texto text, p_wamid text)
returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; nuevo bigint;
begin
  perform exigir_permiso('atender_bandeja');
  l := lead_a_cargo(p_lead);
  insert into mensajes (lead_id, lado, tipo, texto, meta_id, usuario_id)
  values (p_lead, 'asesor', 'text', p_texto, nullif(p_wamid, ''), auth.uid())
  returning id into nuevo;
  update leads set asignado_a = coalesce(l.asignado_a, auth.uid()), estado_chat = 'asignada', pausar_bot = true,
                   en_cola_desde = coalesce(l.en_cola_desde, now()),
                   primera_respuesta_en = coalesce(l.primera_respuesta_en, now()),
                   ultimo_mensaje = left(p_texto, 500), fecha_ultimo_contacto = now()
  where id = p_lead;
  return nuevo;
end $$;

-- RB-04 y RB-05: una persona mueve a cualquier etapa; la de cierre perdida pide motivo.
create or replace function public.mover_etapa(p_lead bigint, p_etapa text, p_motivo text default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare e etapas;
begin
  perform exigir_permiso('gestionar_oportunidades');
  perform lead_a_cargo(p_lead);
  select * into e from etapas where nombre = p_etapa;
  if not found then
    raise exception 'La etapa % no existe', p_etapa;
  end if;
  if e.cierre = 'perdida' and coalesce(p_motivo, '') = '' then
    raise exception 'Para marcarlo como perdido hace falta el motivo';
  end if;
  update leads set etapa = p_etapa,
                   motivo_perdido = case when e.cierre = 'perdida' then p_motivo end
  where id = p_lead;
end $$;

-- --------------------------------------------------------------------------- --
-- Privilegios y RLS
-- --------------------------------------------------------------------------- --
revoke all on public.historial_etapas from anon;
revoke insert, update, delete, truncate on public.historial_etapas from authenticated;
grant insert, update, delete on public.etapas to authenticated;

revoke execute on function
  public.leads_derivar_estado(), public.leads_historial_etapa(), public.mensajes_reabrir(),
  public.puede_atender(uuid), public.puede_ver_lead(bigint), public.lead_a_cargo(bigint),
  public.tomar_conversacion(bigint), public.liberar_conversacion(bigint), public.asignar_conversacion(bigint, uuid),
  public.cerrar_conversacion(bigint), public.reanudar_bot(bigint),
  public.registrar_mensaje_asesor(bigint, text, text), public.mover_etapa(bigint, text, text)
from public, anon;
revoke execute on function public.lead_a_cargo(bigint) from authenticated;
grant execute on function
  public.puede_atender(uuid), public.puede_ver_lead(bigint),
  public.tomar_conversacion(bigint), public.liberar_conversacion(bigint), public.asignar_conversacion(bigint, uuid),
  public.cerrar_conversacion(bigint), public.reanudar_bot(bigint),
  public.registrar_mensaje_asesor(bigint, text, text), public.mover_etapa(bigint, text, text)
to authenticated;

alter table public.historial_etapas enable row level security;

create policy leads_lectura on public.leads for select to authenticated
  using (public.puede_atender(asignado_a));

create policy mensajes_lectura on public.mensajes for select to authenticated
  using (public.puede_ver_lead(lead_id));

create policy historial_etapas_lectura on public.historial_etapas for select to authenticated
  using ((select public.tiene_permiso('ver_metricas')) or public.puede_ver_lead(lead_id));

create policy etapas_alta on public.etapas for insert to authenticated
  with check ((select public.tiene_permiso('administrar_embudo')));
create policy etapas_edicion on public.etapas for update to authenticated
  using ((select public.tiene_permiso('administrar_embudo')))
  with check ((select public.tiene_permiso('administrar_embudo')));
create policy etapas_baja on public.etapas for delete to authenticated
  using ((select public.tiene_permiso('administrar_embudo')));

-- --------------------------------------------------------------------------- --
-- Tiempo real (decisión 0020)
-- --------------------------------------------------------------------------- --
alter publication supabase_realtime add table public.leads, public.mensajes, public.etapas;

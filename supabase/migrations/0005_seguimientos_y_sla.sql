-- 0005 · Seguimientos, SLA en minutos hábiles y plantillas (F3·6, decisión 0021)
--
-- Diseño: docs/SEGUIMIENTOS-Y-SLA.md. Un seguimiento solo le recuerda al asesor (RS-01); el SLA corre solo
-- dentro del horario de atención y no en festivos (RS-04).

-- --------------------------------------------------------------------------- --
-- Horario y festivos (el editor llega en F3·7)
-- --------------------------------------------------------------------------- --
create table public.horario_atencion (
  id     bigint generated always as identity primary key,
  dia    smallint not null check (dia between 0 and 6),   -- 0 = domingo, como extract(dow)
  abre   time not null,
  cierra time not null,
  check (cierra > abre)
);
comment on table public.horario_atencion is 'Franjas de atención por día (decisión 0012). Base del SLA hábil.';

insert into public.horario_atencion (dia, abre, cierra)
select d, time '08:00', time '18:00' from generate_series(1, 5) d
union all select 6, time '09:00', time '14:00';

create table public.festivos (
  fecha  date primary key,
  nombre text not null
);
comment on table public.festivos is 'Días sin atención. Se siembran cada año.';

insert into public.festivos (fecha, nombre) values
  ('2026-01-01', 'Año Nuevo'), ('2026-01-12', 'Reyes Magos'), ('2026-03-23', 'San José'),
  ('2026-04-02', 'Jueves Santo'), ('2026-04-03', 'Viernes Santo'), ('2026-05-01', 'Día del Trabajo'),
  ('2026-05-18', 'Ascensión'), ('2026-06-08', 'Corpus Christi'), ('2026-06-15', 'Sagrado Corazón'),
  ('2026-06-29', 'San Pedro y San Pablo'), ('2026-07-20', 'Independencia'), ('2026-08-07', 'Batalla de Boyacá'),
  ('2026-08-17', 'Asunción'), ('2026-10-12', 'Día de la Raza'), ('2026-11-02', 'Todos los Santos'),
  ('2026-11-16', 'Independencia de Cartagena'), ('2026-12-08', 'Inmaculada Concepción'), ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'), ('2027-01-11', 'Reyes Magos'), ('2027-03-22', 'San José'),
  ('2027-03-25', 'Jueves Santo'), ('2027-03-26', 'Viernes Santo'), ('2027-05-01', 'Día del Trabajo'),
  ('2027-05-10', 'Ascensión'), ('2027-05-31', 'Corpus Christi'), ('2027-06-07', 'Sagrado Corazón'),
  ('2027-07-05', 'San Pedro y San Pablo'), ('2027-07-20', 'Independencia'), ('2027-08-07', 'Batalla de Boyacá'),
  ('2027-08-16', 'Asunción'), ('2027-10-18', 'Día de la Raza'), ('2027-11-01', 'Todos los Santos'),
  ('2027-11-15', 'Independencia de Cartagena'), ('2027-12-08', 'Inmaculada Concepción'), ('2027-12-25', 'Navidad');

-- --------------------------------------------------------------------------- --
-- SLA en minutos hábiles (RS-04)
-- --------------------------------------------------------------------------- --
create or replace function public.minutos_habiles(p_desde timestamptz, p_hasta timestamptz default now())
returns integer
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  desde timestamp := p_desde at time zone 'America/Bogota';
  hasta timestamp := p_hasta at time zone 'America/Bogota';
  fecha_dia date;
  total numeric := 0;
  franja record;
  a timestamp;
  b timestamp;
begin
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    return 0;
  end if;
  fecha_dia := greatest(desde::date, hasta::date - 90);   -- más de 90 días en cola ya no cambia nada
  while fecha_dia <= hasta::date loop
    if not exists (select 1 from festivos where fecha = fecha_dia) then
      for franja in select abre, cierra from horario_atencion where dia = extract(dow from fecha_dia) loop
        a := greatest(fecha_dia + franja.abre, desde);
        b := least(fecha_dia + franja.cierra, hasta);
        if b > a then
          total := total + extract(epoch from b - a) / 60;
        end if;
      end loop;
    end if;
    fecha_dia := fecha_dia + 1;
  end loop;
  return floor(total);
end $$;

-- Campo calculado de PostgREST (select=...,minutos_espera): minutos hábiles sin respuesta de un asesor.
create or replace function public.minutos_espera(l public.leads) returns integer
language sql stable
set search_path = public, pg_temp
as $$
  select case when l.en_cola_desde is not null and l.primera_respuesta_en is null
                   and l.estado_chat in ('cola', 'asignada')
              then minutos_habiles(l.en_cola_desde, now()) end
$$;

-- --------------------------------------------------------------------------- --
-- Seguimientos (RS-01 a RS-03)
-- --------------------------------------------------------------------------- --
create table public.seguimientos (
  id         bigint generated always as identity primary key,
  lead_id    bigint not null references public.leads on delete cascade,
  asignado_a uuid not null references public.usuarios,
  que        text not null check (btrim(que) <> ''),
  vence_en   timestamptz not null,
  estado     text not null default 'pendiente' check (estado in ('pendiente', 'hecho', 'cancelado')),
  nota       text not null default '',
  creado_por uuid not null references public.usuarios,
  creado_en  timestamptz not null default now(),
  cerrado_en timestamptz
);
comment on table public.seguimientos is 'Recordatorios para el asesor. No envían nada al cliente (RS-01).';
create index on public.seguimientos (asignado_a, estado, vence_en);
create index on public.seguimientos (lead_id);

create or replace function public.crear_seguimiento(p_lead bigint, p_que text, p_vence timestamptz, p_asignado uuid default null)
returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare responsable uuid := coalesce(p_asignado, auth.uid()); nuevo bigint;
begin
  perform exigir_permiso('gestionar_oportunidades');
  if not puede_ver_lead(p_lead) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if coalesce(btrim(p_que), '') = '' then
    raise exception 'Escribe qué hay que hacer';
  end if;
  if p_vence is null then
    raise exception 'Falta la fecha del seguimiento';
  end if;
  if responsable <> auth.uid() then
    perform exigir_permiso('ver_todas_conversaciones');
    if not exists (select 1 from usuarios where id = responsable and activo) then
      raise exception 'Ese usuario no está activo';
    end if;
  end if;
  insert into seguimientos (lead_id, asignado_a, que, vence_en, creado_por)
  values (p_lead, responsable, btrim(p_que), p_vence, auth.uid())
  returning id into nuevo;
  return nuevo;
end $$;

-- Toma el seguimiento pendiente con candado si es de quien pide (o si puede ver todos).
create or replace function public.seguimiento_a_cargo(p_id bigint) returns public.seguimientos
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare s seguimientos;
begin
  select * into s from seguimientos where id = p_id for update;
  if not found then
    raise exception 'El seguimiento no existe' using errcode = 'P0002';
  end if;
  if s.asignado_a <> auth.uid() and not tiene_permiso('ver_todas_conversaciones') then
    raise exception 'Ese seguimiento es de otro asesor' using errcode = '42501';
  end if;
  if s.estado <> 'pendiente' then
    raise exception 'Ese seguimiento ya está cerrado';
  end if;
  return s;
end $$;

create or replace function public.cerrar_seguimiento(p_id bigint, p_estado text, p_nota text default '')
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_estado not in ('hecho', 'cancelado') then
    raise exception 'Un seguimiento se cierra como hecho o cancelado';
  end if;
  perform seguimiento_a_cargo(p_id);
  update seguimientos set estado = p_estado, nota = coalesce(p_nota, ''), cerrado_en = now() where id = p_id;
end $$;

create or replace function public.reprogramar_seguimiento(p_id bigint, p_vence timestamptz)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_vence is null then
    raise exception 'Falta la nueva fecha';
  end if;
  perform seguimiento_a_cargo(p_id);
  update seguimientos set vence_en = p_vence where id = p_id;
end $$;

-- --------------------------------------------------------------------------- --
-- Mensaje del asesor con tipo (RS-06: las plantillas cuentan como respuesta)
-- --------------------------------------------------------------------------- --
drop function public.registrar_mensaje_asesor(bigint, text, text);

create or replace function public.registrar_mensaje_asesor(p_lead bigint, p_texto text, p_wamid text, p_tipo text default 'text')
returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; nuevo bigint;
begin
  perform exigir_permiso('atender_bandeja');
  if p_tipo not in ('text', 'template') then
    raise exception 'Tipo de mensaje no válido: %', p_tipo;
  end if;
  l := lead_a_cargo(p_lead);
  insert into mensajes (lead_id, lado, tipo, texto, meta_id, usuario_id)
  values (p_lead, 'asesor', p_tipo, p_texto, nullif(p_wamid, ''), auth.uid())
  returning id into nuevo;
  update leads set asignado_a = coalesce(l.asignado_a, auth.uid()), estado_chat = 'asignada', pausar_bot = true,
                   en_cola_desde = coalesce(l.en_cola_desde, now()),
                   primera_respuesta_en = coalesce(l.primera_respuesta_en, now()),
                   ultimo_mensaje = left(p_texto, 500), fecha_ultimo_contacto = now()
  where id = p_lead;
  return nuevo;
end $$;

-- --------------------------------------------------------------------------- --
-- Privilegios y RLS
-- --------------------------------------------------------------------------- --
revoke all on public.horario_atencion, public.festivos, public.seguimientos from anon;
revoke insert, update, delete, truncate on public.seguimientos from authenticated;
revoke truncate on public.horario_atencion, public.festivos from authenticated;

revoke execute on function
  public.minutos_habiles(timestamptz, timestamptz), public.minutos_espera(public.leads),
  public.crear_seguimiento(bigint, text, timestamptz, uuid), public.seguimiento_a_cargo(bigint),
  public.cerrar_seguimiento(bigint, text, text), public.reprogramar_seguimiento(bigint, timestamptz),
  public.registrar_mensaje_asesor(bigint, text, text, text)
from public, anon;
revoke execute on function public.seguimiento_a_cargo(bigint) from authenticated;
grant execute on function
  public.minutos_habiles(timestamptz, timestamptz), public.minutos_espera(public.leads),
  public.crear_seguimiento(bigint, text, timestamptz, uuid),
  public.cerrar_seguimiento(bigint, text, text), public.reprogramar_seguimiento(bigint, timestamptz),
  public.registrar_mensaje_asesor(bigint, text, text, text)
to authenticated;

alter table public.horario_atencion enable row level security;
alter table public.festivos         enable row level security;
alter table public.seguimientos     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['horario_atencion', 'festivos'] loop
    execute format('create policy %1$s_lectura on public.%1$I for select to authenticated
                    using ((select public.es_usuario_activo()))', t);
    execute format('create policy %1$s_alta on public.%1$I for insert to authenticated
                    with check ((select public.tiene_permiso(''administrar_bot'')))', t);
    execute format('create policy %1$s_edicion on public.%1$I for update to authenticated
                    using ((select public.tiene_permiso(''administrar_bot'')))
                    with check ((select public.tiene_permiso(''administrar_bot'')))', t);
    execute format('create policy %1$s_baja on public.%1$I for delete to authenticated
                    using ((select public.tiene_permiso(''administrar_bot'')))', t);
  end loop;
end $$;

create policy seguimientos_lectura on public.seguimientos for select to authenticated
  using (asignado_a = (select auth.uid()) or (select public.tiene_permiso('ver_todas_conversaciones')));

alter publication supabase_realtime add table public.seguimientos;

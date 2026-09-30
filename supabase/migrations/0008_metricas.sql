-- 0008 · Métricas del embudo, atenciones con su SLA y estados de entrega de Meta (F3·8, decisión 0024)
--
-- Diseño: docs/METRICAS.md. Cada paso a la cola queda como una atención (RM-03); cada estado de Meta se
-- guarda y se aplica al mensaje (RM-07). metricas() y consumo_meta() arman el tablero en la base (RM-02).

-- --------------------------------------------------------------------------- --
-- Atenciones (RM-03)
-- --------------------------------------------------------------------------- --
create table public.atenciones (
  id                   bigint generated always as identity primary key,
  lead_id              bigint not null references public.leads on delete cascade,
  en_cola_desde        timestamptz not null,
  asesor_id            uuid references public.usuarios,
  primera_respuesta_en timestamptz,
  minutos_espera       integer,
  unique (lead_id, en_cola_desde)
);
comment on table public.atenciones is
  'Cada paso de un cliente a la cola y su primera respuesta (RM-03). La llena la base desde leads.';
create index on public.atenciones (en_cola_desde);
create index on public.atenciones (asesor_id, en_cola_desde);

create or replace function public.leads_atenciones() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.en_cola_desde is not null and (tg_op = 'INSERT' or new.en_cola_desde is distinct from old.en_cola_desde) then
    insert into atenciones (lead_id, en_cola_desde, asesor_id)
    values (new.id, new.en_cola_desde, new.asignado_a)
    on conflict (lead_id, en_cola_desde) do nothing;
  end if;
  if new.primera_respuesta_en is not null and (tg_op = 'INSERT' or old.primera_respuesta_en is null) then
    update atenciones set primera_respuesta_en = new.primera_respuesta_en,
                          asesor_id = coalesce(auth.uid(), new.asignado_a, asesor_id),
                          minutos_espera = minutos_habiles(en_cola_desde, new.primera_respuesta_en)
    where lead_id = new.id and en_cola_desde = new.en_cola_desde;
  elsif tg_op = 'UPDATE' and new.asignado_a is not null and new.asignado_a is distinct from old.asignado_a then
    update atenciones set asesor_id = new.asignado_a
    where lead_id = new.id and en_cola_desde = new.en_cola_desde and primera_respuesta_en is null;
  end if;
  return null;
end $$;

-- Sin lista de columnas: en_cola_desde y primera_respuesta_en las cambia a veces otro trigger (leads_estado),
-- y un "update of" solo mira las columnas del SET.
create trigger leads_atenciones after insert or update on public.leads
  for each row execute function public.leads_atenciones();

-- Lo que ya había: una atención por cliente que pasó por la cola.
insert into public.atenciones (lead_id, en_cola_desde, asesor_id, primera_respuesta_en, minutos_espera)
select id, en_cola_desde, asignado_a, primera_respuesta_en,
       case when primera_respuesta_en is not null then public.minutos_habiles(en_cola_desde, primera_respuesta_en) end
from public.leads where en_cola_desde is not null;

-- --------------------------------------------------------------------------- --
-- Estados de entrega de Meta (RM-07)
-- --------------------------------------------------------------------------- --
alter table public.mensajes
  add column estado_entrega text not null default ''
                             check (estado_entrega in ('', 'enviado', 'entregado', 'leido', 'fallido')),
  add column categoria_meta text not null default '',
  add column cobrable       boolean,
  add column error_meta     text not null default '',
  add column entregado_en   timestamptz,
  add column leido_en       timestamptz;
comment on column public.mensajes.categoria_meta is 'Categoría de precio de Meta: service, utility, marketing, authentication.';
comment on column public.mensajes.cobrable is 'Si Meta lo cobra (pricing.billable). Null: Meta no lo ha informado.';
create index mensajes_salientes_idx on public.mensajes (creado_en) where lado <> 'cliente';

create table public.estados_meta (
  id          bigint generated always as identity primary key,
  wamid       text not null,
  estado      text not null check (estado in ('enviado', 'entregado', 'leido', 'fallido')),
  categoria   text not null default '',
  cobrable    boolean,
  tipo_precio text not null default '',
  error       text not null default '',
  ocurrido_en timestamptz not null,
  recibido_en timestamptz not null default now()
);
comment on table public.estados_meta is 'Cada estado que Meta envía al webhook. Solo el servidor (RM-07).';
create index on public.estados_meta (wamid);

-- Recalcula el mensaje desde todos sus estados: así un estado tardío no retrocede y el orden de llegada no importa.
create or replace function public.aplicar_estados_meta(p_wamid text) returns void
language sql security definer
set search_path = public, pg_temp
as $$
  update mensajes m set
    estado_entrega = coalesce((select estado from estados_meta where wamid = p_wamid
                               order by case estado when 'fallido' then 4 when 'leido' then 3
                                                    when 'entregado' then 2 else 1 end desc limit 1), ''),
    categoria_meta = coalesce((select categoria from estados_meta where wamid = p_wamid and categoria <> ''
                               order by ocurrido_en desc, id desc limit 1), m.categoria_meta),
    cobrable       = coalesce((select cobrable from estados_meta where wamid = p_wamid and cobrable is not null
                               order by ocurrido_en desc, id desc limit 1), m.cobrable),
    error_meta     = coalesce((select error from estados_meta where wamid = p_wamid and error <> ''
                               order by ocurrido_en desc, id desc limit 1), ''),
    entregado_en   = (select min(ocurrido_en) from estados_meta where wamid = p_wamid and estado in ('entregado', 'leido')),
    leido_en       = (select min(ocurrido_en) from estados_meta where wamid = p_wamid and estado = 'leido')
  where m.meta_id = p_wamid and m.lado <> 'cliente'
$$;

-- La llama el receptor por cada estado del webhook.
create or replace function public.registrar_estado_meta(p_wamid text, p_estado text, p_ocurrido_en timestamptz,
                                                        p_categoria text default '', p_cobrable boolean default null,
                                                        p_tipo_precio text default '', p_error text default '')
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare estado text := case p_estado when 'sent' then 'enviado' when 'delivered' then 'entregado'
                                     when 'read' then 'leido' when 'failed' then 'fallido' end;
begin
  if estado is null or coalesce(p_wamid, '') = '' then
    return;   -- otros estados de Meta (deleted, warning) no cambian la entrega
  end if;
  insert into estados_meta (wamid, estado, categoria, cobrable, tipo_precio, error, ocurrido_en)
  values (p_wamid, estado, coalesce(p_categoria, ''), p_cobrable, coalesce(p_tipo_precio, ''),
          coalesce(p_error, ''), coalesce(p_ocurrido_en, now()));
  perform aplicar_estados_meta(p_wamid);
end $$;

-- Si el estado llegó antes de que se registrara el mensaje (el asesor envía y luego registra), se aplica al entrar.
create or replace function public.mensajes_estados_pendientes() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from estados_meta where wamid = new.meta_id) then
    perform aplicar_estados_meta(new.meta_id);
  end if;
  return null;
end $$;

create trigger mensajes_estados_pendientes after insert on public.mensajes
  for each row when (new.meta_id is not null and new.lado <> 'cliente')
  execute function public.mensajes_estados_pendientes();

-- --------------------------------------------------------------------------- --
-- Métricas (RM-01 a RM-06)
-- --------------------------------------------------------------------------- --
-- Oportunidades al alcance de quien mira: todas, o las del asesor (las tiene, las abrió o las movió).
create or replace function public.oportunidades_alcance(p_embudo bigint, p_yo uuid) returns setof public.oportunidades
language sql stable security definer
set search_path = public, pg_temp
as $$
  select o.* from oportunidades o
  where (p_embudo is null or o.embudo_id = p_embudo)
    and (p_yo is null
         or o.creado_por = p_yo
         or exists (select 1 from leads l where l.id = o.lead_id and l.asignado_a = p_yo)
         or exists (select 1 from historial_etapas h where h.oportunidad_id = o.id and h.usuario_id = p_yo))
$$;

-- Hasta qué etapa llegó (orden), sin contar la de perdida (RM-04).
create or replace function public.orden_alcanzado(o public.oportunidades) returns integer
language sql stable security definer
set search_path = public, pg_temp
as $$
  select max(et.orden)
  from (select a as nombre from historial_etapas where oportunidad_id = o.id
        union all select nombre from etapas where id = o.etapa_id) x
  join etapas et on et.embudo_id = o.embudo_id and et.nombre = x.nombre
  where et.cierre <> 'perdida'
$$;

-- Quién la cerró: el último que la movió a su etapa de cierre (null: el bot).
create or replace function public.cerrada_por(o public.oportunidades) returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select h.usuario_id from historial_etapas h
  where h.oportunidad_id = o.id and h.a = (select nombre from etapas where id = o.etapa_id)
  order by h.creado_en desc, h.id desc limit 1
$$;

create or replace function public.metricas(p_desde date, p_hasta date, p_embudo bigint default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  todo  boolean := tiene_permiso('ver_metricas');
  yo    uuid := case when tiene_permiso('ver_metricas') then null else auth.uid() end;
  desde timestamptz := p_desde::timestamp at time zone 'America/Bogota';
  hasta timestamptz := (p_hasta + 1)::timestamp at time zone 'America/Bogota';
  r jsonb := '{}';
begin
  if not todo and not tiene_permiso('atender_bandeja') then
    raise exception 'No tienes permiso para ver métricas' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El período no es válido';
  end if;

  r := r || jsonb_build_object('alcance', case when todo then 'todo' else 'mio' end);

  -- Clientes nuevos (solo con ver_metricas: al asesor no le toca ver quién llegó al bot)
  if todo then
    r := r || jsonb_build_object('clientes_nuevos',
      (select count(*) from leads where creado_en >= desde and creado_en < hasta));
  end if;

  -- Atenciones y SLA (RM-03)
  r := r || jsonb_build_object('atenciones', (
    select jsonb_build_object(
      'total', count(*),
      'respondidas', count(primera_respuesta_en),
      'en_sla', count(*) filter (where minutos_espera <= 10),
      'promedio_min', round(avg(minutos_espera)),
      'mediana_min', percentile_cont(0.5) within group (order by minutos_espera))
    from atenciones
    where en_cola_desde >= desde and en_cola_desde < hasta and (yo is null or asesor_id = yo)));

  -- Oportunidades: abiertas en el período y cerradas en el período (RM-05)
  r := r || jsonb_build_object('oportunidades', (
    select jsonb_build_object(
      'nuevas', count(*) filter (where creado_en >= desde and creado_en < hasta),
      'ganadas', count(*) filter (where estado = 'ganada' and cerrado_en >= desde and cerrado_en < hasta),
      'valor_ganado', coalesce(sum(valor_estimado) filter (where estado = 'ganada' and cerrado_en >= desde and cerrado_en < hasta), 0),
      'perdidas', count(*) filter (where estado = 'perdida' and cerrado_en >= desde and cerrado_en < hasta),
      'perdidas_sin_motivo', count(*) filter (where estado = 'perdida' and cerrado_en >= desde and cerrado_en < hasta
                                                and coalesce(btrim(motivo_perdido), '') = ''))
    from oportunidades_alcance(p_embudo, yo)));

  -- Conversión por etapa (RM-04), por embudo
  r := r || jsonb_build_object('embudos', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nombre', e.nombre,
      'nuevas', (select count(*) from oportunidades_alcance(e.id, yo) o where o.creado_en >= desde and o.creado_en < hasta),
      'etapas', (select jsonb_agg(jsonb_build_object(
                   'nombre', et.nombre, 'color', et.color, 'cierre', et.cierre,
                   'llegaron', (select count(*) from oportunidades_alcance(e.id, yo) o
                                where o.creado_en >= desde and o.creado_en < hasta
                                  and case when et.cierre = 'ganada' then o.estado = 'ganada'
                                           else orden_alcanzado(o) >= et.orden end))
                 order by et.orden)
                 from etapas et where et.embudo_id = e.id and et.cierre <> 'perdida'))
      order by e.orden)
    from embudos e where e.activo and (p_embudo is null or e.id = p_embudo)), '[]'));

  -- Motivos de pérdida (RM-05)
  r := r || jsonb_build_object('motivos', coalesce((
    select jsonb_agg(jsonb_build_object('motivo', motivo, 'cantidad', n) order by n desc, motivo)
    from (select coalesce(nullif(btrim(motivo_perdido), ''), 'Sin motivo') as motivo, count(*) as n
          from oportunidades_alcance(p_embudo, yo)
          where estado = 'perdida' and cerrado_en >= desde and cerrado_en < hasta
          group by 1) m), '[]'));

  -- Sin respuesta ahora (RM-06): lo que ve quien mira
  r := r || jsonb_build_object('sin_respuesta', coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'nombre', l.nombre, 'telefono', l.telefono,
                                        'desde', u.creado_en, 'asesor', us.nombre) order by u.creado_en)
    from leads l
    cross join lateral (select lado, creado_en from mensajes where lead_id = l.id order by creado_en desc, id desc limit 1) u
    left join usuarios us on us.id = l.asignado_a
    where l.estado_chat in ('cola', 'asignada') and u.lado = 'cliente'
      and (todo or l.asignado_a = auth.uid() or l.asignado_a is null)), '[]'));

  -- Entrega de lo que salió en el período (RM-07)
  r := r || jsonb_build_object('entrega', (
    select jsonb_build_object(
      'salientes', count(*),
      'enviados', count(*) filter (where estado_entrega = 'enviado'),
      'entregados', count(*) filter (where estado_entrega = 'entregado'),
      'leidos', count(*) filter (where estado_entrega = 'leido'),
      'fallidos', count(*) filter (where estado_entrega = 'fallido'),
      'sin_estado', count(*) filter (where estado_entrega = ''))
    from mensajes
    where lado <> 'cliente' and creado_en >= desde and creado_en < hasta
      and (yo is null or usuario_id = yo)));

  -- Por asesor (solo con ver_metricas)
  if todo then
    r := r || jsonb_build_object('asesores', coalesce((
      select jsonb_agg(x order by x->>'nombre') from (
        select jsonb_build_object(
          'id', u.id, 'nombre', u.nombre,
          'atenciones', (select count(*) from atenciones a where a.asesor_id = u.id and a.en_cola_desde >= desde and a.en_cola_desde < hasta),
          'respondidas', (select count(*) from atenciones a where a.asesor_id = u.id and a.en_cola_desde >= desde and a.en_cola_desde < hasta and a.primera_respuesta_en is not null),
          'en_sla', (select count(*) from atenciones a where a.asesor_id = u.id and a.en_cola_desde >= desde and a.en_cola_desde < hasta and a.minutos_espera <= 10),
          'promedio_min', (select round(avg(a.minutos_espera)) from atenciones a where a.asesor_id = u.id and a.en_cola_desde >= desde and a.en_cola_desde < hasta),
          'mensajes', (select count(*) from mensajes m where m.usuario_id = u.id and m.creado_en >= desde and m.creado_en < hasta),
          'ganadas', count(o.id) filter (where o.estado = 'ganada'),
          'valor_ganado', coalesce(sum(o.valor_estimado) filter (where o.estado = 'ganada'), 0),
          'perdidas', count(o.id) filter (where o.estado = 'perdida')) as x
        from usuarios u
        left join oportunidades_alcance(p_embudo, null) o
          on o.estado <> 'abierta' and o.cerrado_en >= desde and o.cerrado_en < hasta and cerrada_por(o) = u.id
        where u.activo and exists (select 1 from rol_permisos rp where rp.rol_id = u.rol_id and rp.permiso = 'atender_bandeja')
        group by u.id, u.nombre) t), '[]'));
  end if;

  return r;
end $$;

-- Consumo de Meta del mes calendario de Colombia (RM-08).
create or replace function public.consumo_meta(p_mes date default null) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  mes   date := date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Bogota')::date))::date;
  desde timestamptz := mes::timestamp at time zone 'America/Bogota';
  hasta timestamptz := (mes + interval '1 month')::timestamp at time zone 'America/Bogota';
begin
  perform exigir_permiso('ver_metricas');
  return (
    select jsonb_build_object(
      'mes', mes,
      'limite_gratis', 1000,
      'salientes', count(*),
      'servicio', count(*) filter (where categoria_meta = 'service'),
      'cobrables', count(*) filter (where cobrable),
      'sin_categoria', count(*) filter (where categoria_meta = ''),
      'por_categoria', coalesce((select jsonb_object_agg(c, n) from (
                         select categoria_meta c, count(*) n from mensajes
                         where lado <> 'cliente' and categoria_meta <> '' and creado_en >= desde and creado_en < hasta
                         group by 1) t), '{}'))
    from mensajes
    where lado <> 'cliente' and creado_en >= desde and creado_en < hasta);
end $$;

-- --------------------------------------------------------------------------- --
-- Privilegios y RLS
-- --------------------------------------------------------------------------- --
revoke all on public.atenciones, public.estados_meta from anon;
revoke all on public.estados_meta from authenticated;
revoke insert, update, delete, truncate on public.atenciones from authenticated;

revoke execute on function
  public.leads_atenciones(), public.aplicar_estados_meta(text),
  public.registrar_estado_meta(text, text, timestamptz, text, boolean, text, text),
  public.mensajes_estados_pendientes(), public.oportunidades_alcance(bigint, uuid),
  public.orden_alcanzado(public.oportunidades), public.cerrada_por(public.oportunidades),
  public.metricas(date, date, bigint), public.consumo_meta(date)
from public, anon;
revoke execute on function
  public.leads_atenciones(), public.aplicar_estados_meta(text),
  public.registrar_estado_meta(text, text, timestamptz, text, boolean, text, text),
  public.mensajes_estados_pendientes(), public.oportunidades_alcance(bigint, uuid),
  public.orden_alcanzado(public.oportunidades), public.cerrada_por(public.oportunidades)
from authenticated;
grant execute on function public.registrar_estado_meta(text, text, timestamptz, text, boolean, text, text) to service_role;
grant execute on function public.metricas(date, date, bigint), public.consumo_meta(date) to authenticated;

alter table public.atenciones   enable row level security;
alter table public.estados_meta enable row level security;

create policy atenciones_lectura on public.atenciones for select to authenticated
  using ((select public.tiene_permiso('ver_metricas')) or asesor_id = (select auth.uid()));

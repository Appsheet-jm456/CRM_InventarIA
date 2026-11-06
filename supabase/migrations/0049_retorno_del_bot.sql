-- 0049 · Retorno del bot tras el asesor y «¿Sigues necesitando ayuda?» (F4·45, decisión 0035)
--
-- Diseño: docs/SEGUIMIENTOS-Y-SLA.md (RT-01 a RT-10). Regla A: el cliente quedó callado N horas después de nuestro último
-- mensaje → un mensaje con botones. Regla B: el chat está con asesor y nadie le contesta al cliente en M horas hábiles → un
-- mensaje de demora. Una sola vez por silencio y dentro de las 24 h de Meta. Un chat con asesor vuelve al bot cuando el cliente
-- acepta, cuando el asesor pulsa «Devolver al bot», cuando se cierra o tras P horas sin actividad. Todo se configura en
-- Configuración → Bot → Retorno y seguimiento y nace apagado. El receptor lo revisa cada minuto con retorno_candidatos().

-- --------------------------------------------------------------------------- --
-- Ajustes (RT-10)
-- --------------------------------------------------------------------------- --
create table public.retorno_config (
  id                 smallint primary key default 1 check (id = 1),
  activo             boolean not null default false,
  -- Regla A: el cliente quedó callado
  a_activa           boolean not null default true,
  a_horas            numeric(4, 1) not null default 5 check (a_horas between 1 and 23),
  a_texto            text not null default '¡Hola {nombre}! 👋 ¿Sigues necesitando ayuda? Aquí estamos para lo que necesites 🙌'
                     check (length(a_texto) between 1 and 1024),
  a_boton_si         text not null default 'Sí, continuar' check (length(a_boton_si) between 1 and 20),
  a_boton_asesor     text not null default 'Hablar con asesor' check (length(a_boton_asesor) between 1 and 20),
  a_boton_no         text not null default 'Ya no, gracias' check (length(a_boton_no) between 1 and 20),
  -- Regla B: el asesor no respondió
  b_activa           boolean not null default true,
  b_horas            numeric(4, 1) not null default 2 check (b_horas between 0.5 and 23),
  b_texto            text not null default 'Disculpa la demora 🙏 ¿Te sigo ayudando yo mientras un asesor se desocupa?'
                     check (length(b_texto) between 1 and 1024),
  b_boton_si         text not null default 'Sí, sigue tú' check (length(b_boton_si) between 1 and 20),
  b_boton_espera     text not null default 'Espero al asesor' check (length(b_boton_espera) between 1 and 20),
  -- Respuestas a los botones
  texto_espera       text not null default '👍 Listo, un asesor te escribe pronto.' check (length(texto_espera) between 1 and 1024),
  texto_no           text not null default '¡Gracias por escribirnos! 🙌 Si nos necesitas, aquí estamos.' check (length(texto_no) between 1 and 1024),
  -- Volver al bot (RT-05) y a dónde (RT-06)
  volver_respuesta   boolean not null default true,
  palabra            text not null default 'continuar' check (length(palabra) <= 40),
  volver_inactividad boolean not null default true,
  inactividad_horas  integer not null default 24 check (inactividad_horas between 1 and 720),
  destino_bot        bigint references public.bots (id) on delete set null,
  vendido_vuelve     boolean not null default false,
  vendido_bot        bigint references public.bots (id) on delete set null,
  -- Cuándo (RT-07 y RT-08)
  solo_horario       boolean not null default true,
  etiquetas_excluidas text[] not null default '{No-Molestar}',
  actualizado_por    uuid references public.usuarios (id) on delete set null,
  actualizado_en     timestamptz not null default now()
);
insert into public.retorno_config default values;
comment on table public.retorno_config is 'Retorno del bot y seguimiento automático (F4·45, decisión 0035). Una sola fila; nace apagado.';

alter table public.retorno_config enable row level security;
create policy retorno_config_lectura on public.retorno_config for select to authenticated using ((select es_usuario_activo()));
revoke all on public.retorno_config from anon, authenticated;
grant select on public.retorno_config to authenticated;

-- RT-03: cuándo se envió cada mensaje automático y cuál espera respuesta del cliente.
alter table public.leads
  add column seguimiento_enviado_en timestamptz,
  add column demora_enviada_en      timestamptz,
  add column retorno_pendiente      text check (retorno_pendiente in ('A', 'B'));
comment on column public.leads.retorno_pendiente is 'F4·45: el último mensaje automático (A seguimiento, B demora) espera la respuesta del cliente.';

-- RT-09: el historial del cliente admite el tipo «retorno».
alter table public.lead_eventos drop constraint lead_eventos_tipo_check;
alter table public.lead_eventos add constraint lead_eventos_tipo_check check (tipo = any (array['etapa', 'oportunidad', 'responsable',
  'nombre', 'valor', 'etiquetas', 'atributo', 'archivado', 'desarchivado', 'eliminado', 'restaurado', 'tarea', 'tarea_cumplida', 'nota',
  'ficha', 'retorno']));

-- RT-09: el mensaje automático se marca en el chat y no cuenta como respuesta de una persona.
alter table public.mensajes add column automatico boolean not null default false;

-- --------------------------------------------------------------------------- --
-- Guardar los ajustes (RT-10): exige administrar_bot
-- --------------------------------------------------------------------------- --
create function public.retorno_config_cambiar(p jsonb) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare etiquetas text[];
begin
  perform exigir_permiso('administrar_bot');
  if p is null then
    raise exception 'Faltan los ajustes.';
  end if;
  if coalesce((p ->> 'destino_bot')::bigint, 0) <> 0
     and not exists (select 1 from bots where id = (p ->> 'destino_bot')::bigint and not archivado) then
    raise exception 'El bot de destino no existe o está archivado.';
  end if;
  if coalesce((p ->> 'vendido_bot')::bigint, 0) <> 0
     and not exists (select 1 from bots where id = (p ->> 'vendido_bot')::bigint and not archivado) then
    raise exception 'El bot para clientes vendidos no existe o está archivado.';
  end if;
  if jsonb_typeof(coalesce(p -> 'etiquetas_excluidas', '[]'::jsonb)) <> 'array' then
    raise exception 'Las etiquetas excluidas van en una lista.';
  end if;
  select coalesce(array_agg(distinct btrim(e)) filter (where btrim(e) <> ''), '{}')
    into etiquetas from jsonb_array_elements_text(coalesce(p -> 'etiquetas_excluidas', '[]'::jsonb)) e;
  update retorno_config set
    activo = (p ->> 'activo')::boolean,
    a_activa = (p ->> 'a_activa')::boolean, a_horas = (p ->> 'a_horas')::numeric,
    a_texto = btrim(p ->> 'a_texto'), a_boton_si = btrim(p ->> 'a_boton_si'),
    a_boton_asesor = btrim(p ->> 'a_boton_asesor'), a_boton_no = btrim(p ->> 'a_boton_no'),
    b_activa = (p ->> 'b_activa')::boolean, b_horas = (p ->> 'b_horas')::numeric,
    b_texto = btrim(p ->> 'b_texto'), b_boton_si = btrim(p ->> 'b_boton_si'), b_boton_espera = btrim(p ->> 'b_boton_espera'),
    texto_espera = btrim(p ->> 'texto_espera'), texto_no = btrim(p ->> 'texto_no'),
    volver_respuesta = (p ->> 'volver_respuesta')::boolean, palabra = lower(btrim(coalesce(p ->> 'palabra', ''))),
    volver_inactividad = (p ->> 'volver_inactividad')::boolean, inactividad_horas = (p ->> 'inactividad_horas')::integer,
    destino_bot = nullif((p ->> 'destino_bot')::bigint, 0),
    vendido_vuelve = (p ->> 'vendido_vuelve')::boolean, vendido_bot = nullif((p ->> 'vendido_bot')::bigint, 0),
    solo_horario = (p ->> 'solo_horario')::boolean, etiquetas_excluidas = etiquetas,
    actualizado_por = auth.uid(), actualizado_en = now()
  where id = 1;
end $$;
revoke execute on function public.retorno_config_cambiar(jsonb) from public, anon;
grant execute on function public.retorno_config_cambiar(jsonb) to authenticated;

-- --------------------------------------------------------------------------- --
-- A dónde vuelve el cliente (RT-06): el bot de destino, o el de postventa si ya compró. null = el principal.
-- --------------------------------------------------------------------------- --
create function public.retorno_destino(p_etapa text) returns bigint
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when exists (select 1 from etapas where nombre = p_etapa and cierre = 'ganada') and c.vendido_bot is not null
              then c.vendido_bot else c.destino_bot end
  from retorno_config c where c.id = 1
$$;
revoke execute on function public.retorno_destino(text) from public, anon, authenticated;
grant execute on function public.retorno_destino(text) to service_role;

-- Pasa el chat al bot con el destino y deja el historial. Lo usan el receptor, la inactividad y «Devolver al bot».
create function public.retorno_devolver(p_lead bigint, p_motivo text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads;
begin
  select * into l from leads where id = p_lead for update;
  if not found then
    return;
  end if;
  update leads set estado_chat = 'bot', asignado_a = null, pausar_bot = false, paso_menu = '', errores_bot = 0,
                   retorno_pendiente = null,
                   bot_id = case when (select activo from retorno_config where id = 1) then retorno_destino(l.etapa) else l.bot_id end
  where id = p_lead;
  perform lead_evento(p_lead, 'retorno', jsonb_build_object('estado_chat', l.estado_chat),
                      jsonb_build_object('estado_chat', 'bot'), 'Volvió al bot: ' || p_motivo);
end $$;
revoke execute on function public.retorno_devolver(bigint, text) from public, anon, authenticated;
grant execute on function public.retorno_devolver(bigint, text) to service_role;

-- «Devolver al bot» de la Bandeja: mismo permiso de antes (lead_a_cargo) y ahora con destino e historial.
create or replace function public.reanudar_bot(p_lead bigint) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform lead_a_cargo(p_lead);
  perform retorno_devolver(p_lead, 'el asesor pulsó «Devolver al bot»');
end $$;

-- --------------------------------------------------------------------------- --
-- Quién recibe el mensaje automático (RT-01 a RT-08). p_lead: revisar solo ese cliente (justo antes de enviar).
-- --------------------------------------------------------------------------- --
create function public.retorno_candidatos(p_lead bigint default null)
returns table (lead_id bigint, telefono text, nombre text, regla text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with c as (select * from retorno_config where id = 1),
  ult as (
    select m.lead_id,
           max(m.creado_en) filter (where m.lado = 'cliente') as cli,
           max(m.creado_en) filter (where m.lado <> 'cliente') as nos,
           max(m.creado_en) filter (where m.lado = 'asesor') as ase
    from mensajes m
    where m.creado_en > now() - interval '24 hours' and (p_lead is null or m.lead_id = p_lead)
    group by m.lead_id
  ),
  base as (
    select l.id, l.telefono, l.nombre, l.estado_chat, u.cli, u.nos, u.ase
    from leads l join ult u on u.lead_id = l.id, c
    where c.activo
      and u.cli is not null
      and u.cli > now() - interval '23 hours 30 minutes'                       -- RT-04: siempre dentro de las 24 h
      and l.estado_chat <> 'cerrada' and l.archivado_en is null and l.eliminado_en is null
      and not exists (select 1 from etapas e where e.nombre = l.etapa and e.cierre in ('ganada', 'perdida'))
      and l.etapa <> 'Pago por confirmar'
      and coalesce(l.estado_bot -> 'compra' ->> 'paso', '') not in ('esperando_pago', 'pago_por_confirmar')
      and l.espera_vence_en is null                                            -- una Pausa ya tiene su recordatorio
      and not (coalesce(l.etiquetas, '{}') && (c.etiquetas_excluidas || '{No-Interesado}'::text[]))
      and coalesce(greatest(l.seguimiento_enviado_en, l.demora_enviada_en), '-infinity') < u.cli  -- RT-03: una vez por silencio
  )
  select b.id, b.telefono, b.nombre,
         case when b.estado_chat in ('cola', 'asignada') and (b.ase is null or b.ase < b.cli) then 'B' else 'A' end
  from base b, c
  where (not c.solo_horario or minutos_habiles(now() - interval '2 minutes', now()) > 0)  -- RT-08
    and (
      -- B: con asesor, el cliente escribió y ninguna persona le contestó en M horas hábiles
      (c.b_activa and b.estado_chat in ('cola', 'asignada') and (b.ase is null or b.ase < b.cli)
         and minutos_habiles(b.cli, now()) >= c.b_horas * 60)
      or
      -- A: le contestamos (con asesor: una persona) y el cliente no responde en N horas
      (c.a_activa and b.nos > b.cli and now() - b.nos >= make_interval(secs => c.a_horas * 3600)
         and (b.estado_chat = 'bot' or b.ase >= b.cli))
    )
  limit 50
$$;
revoke execute on function public.retorno_candidatos(bigint) from public, anon, authenticated;
grant execute on function public.retorno_candidatos(bigint) to service_role;

-- Después de enviar: RT-03 (una vez), la etiqueta y el historial (RT-09).
create function public.retorno_marcar(p_lead bigint, p_regla text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare etiqueta text := case p_regla when 'A' then 'Seguimiento-Enviado' else 'Demora-Enviado' end;
begin
  if p_regla not in ('A', 'B') then
    raise exception 'Regla no válida: %', p_regla;
  end if;
  update leads set
    seguimiento_enviado_en = case when p_regla = 'A' then now() else seguimiento_enviado_en end,
    demora_enviada_en = case when p_regla = 'B' then now() else demora_enviada_en end,
    retorno_pendiente = p_regla,
    etiquetas = case when etiqueta = any(coalesce(etiquetas, '{}')) then etiquetas else coalesce(etiquetas, '{}') || etiqueta end
  where id = p_lead;
  perform lead_evento(p_lead, 'retorno', null, jsonb_build_object('regla', p_regla),
                      case p_regla when 'A' then 'Mensaje automático: «¿Sigues necesitando ayuda?»'
                                   else 'Mensaje automático de demora: el asesor no había respondido' end);
end $$;
revoke execute on function public.retorno_marcar(bigint, text) from public, anon, authenticated;
grant execute on function public.retorno_marcar(bigint, text) to service_role;

-- Historial de lo que el cliente respondió al mensaje automático (lo llama el receptor).
create function public.retorno_evento(p_lead bigint, p_detalle text) returns void
language sql security definer
set search_path = public, pg_temp
as $$ select lead_evento(p_lead, 'retorno', null, null, p_detalle) $$;
revoke execute on function public.retorno_evento(bigint, text) from public, anon, authenticated;
grant execute on function public.retorno_evento(bigint, text) to service_role;

-- RT-05.4: P horas sin que nadie escriba → vuelve al bot en silencio. Devuelve cuántos volvieron.
create function public.retorno_inactivos() returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c retorno_config; l record; n integer := 0;
begin
  select * into c from retorno_config where id = 1;
  if not c.activo or not c.volver_inactividad then
    return 0;
  end if;
  for l in
    select le.id from leads le
    where le.pausar_bot and le.estado_chat in ('cola', 'asignada') and le.eliminado_en is null and le.archivado_en is null
      and coalesce(le.en_cola_desde, le.creado_en) < now() - make_interval(hours => c.inactividad_horas)
      and not exists (select 1 from mensajes m where m.lead_id = le.id
                      and m.creado_en > now() - make_interval(hours => c.inactividad_horas))
      and (c.vendido_vuelve or not exists (select 1 from etapas e where e.nombre = le.etapa and e.cierre = 'ganada'))
    limit 50
  loop
    perform retorno_devolver(l.id, format('%s h sin actividad', c.inactividad_horas));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.retorno_inactivos() from public, anon, authenticated;
grant execute on function public.retorno_inactivos() to service_role;

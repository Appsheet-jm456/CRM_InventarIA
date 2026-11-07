-- 0056 · Alistamiento con servicio técnico: bloque B, video de soporte por equipo (F4·50, docs/ALISTAMIENTO-Y-VIDEO-TECNICO.md, RAL-05,
-- RAL-06, RAL-10)
--
-- El técnico sube desde el celular un video por cada equipo del pedido al bucket privado `videos-tecnicos` (hasta 100 MB; el
-- almacenamiento subió su límite a 100 MB en supabase/docker-compose.yml). La app registra el video aquí; el receptor lo comprime con
-- ffmpeg a 720p (≈ 15 MB por minuto, para WhatsApp), borra el original y lo deja «listo». A los 6 meses se borra solo.
-- «Revisado, listo para despachar» exige ahora, además del documento, un video por cada equipo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos-tecnicos', 'videos-tecnicos', false, 104857600,
        '{video/mp4,video/quicktime,video/3gpp,video/webm,video/x-matroska}');

create table public.alistamiento_videos (
  id                    bigint generated always as identity primary key,
  alistamiento_id       bigint not null references public.alistamientos (id) on delete cascade,
  equipo_codigo         text   not null,
  original              text,                 -- lo que subió el técnico; se borra al comprimir
  ruta                  text,                 -- la copia comprimida (mp4)
  peso_original         bigint check (peso_original between 1 and 104857600),
  peso                  bigint,
  duracion_s            numeric(7, 1),
  tecnico               text   not null,
  subido_en             timestamptz not null default now(),
  estado                text   not null default 'procesando' check (estado in ('procesando', 'listo', 'error', 'vencido')),
  error                 text,
  vence_en              timestamptz not null default now() + interval '6 months',
  enviado_al_cliente_en timestamptz
);
create index alistamiento_videos_pedido on public.alistamiento_videos (alistamiento_id);
create index alistamiento_videos_pendientes on public.alistamiento_videos (estado) where estado = 'procesando';
comment on table public.alistamiento_videos is 'F4·50 bloque B: video de soporte técnico por equipo; se comprime en el receptor y vence a los 6 meses.';
alter table public.alistamiento_videos enable row level security;
create policy alistamiento_videos_lectura on public.alistamiento_videos for select to authenticated
  using (tiene_permiso('gestionar_alistamiento')
         or exists (select 1 from alistamientos a where a.id = alistamiento_id and puede_ver_lead(a.lead_id)));
revoke all on public.alistamiento_videos from anon, authenticated;
grant select on public.alistamiento_videos to authenticated;

-- El técnico sube al bucket; ve los videos el técnico o el asesor que ve al cliente. Nadie los cambia ni los borra desde la app.
create function public.alistamiento_de_ruta(p_ruta text) returns bigint
language sql immutable
as $$ select case when split_part(p_ruta, '/', 1) ~ '^[0-9]{1,18}$' then split_part(p_ruta, '/', 1)::bigint end $$;

create policy videos_tecnicos_alta on storage.objects for insert to authenticated
  with check (bucket_id = 'videos-tecnicos' and (select tiene_permiso('gestionar_alistamiento')));
create policy videos_tecnicos_lectura on storage.objects for select to authenticated
  using (bucket_id = 'videos-tecnicos' and ((select tiene_permiso('gestionar_alistamiento'))
         or exists (select 1 from public.alistamientos a where a.id = public.alistamiento_de_ruta(name) and public.puede_ver_lead(a.lead_id))));

-- --------------------------------------------------------------------------- --
-- Registrar el video subido (RAL-05)
-- --------------------------------------------------------------------------- --
create function public.alistamiento_video_registrar(p_id bigint, p_codigo text, p_ruta text, p_peso bigint, p_tecnico text) returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; t text; equipo text; nuevo bigint;
begin
  perform exigir_permiso('gestionar_alistamiento');
  t := alistamiento_validar_tecnico(p_tecnico);
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if a.estado <> 'en_revision' or a.tecnico <> t then
    raise exception 'Solo quien tiene el pedido en revisión sube sus videos.';
  end if;
  select e ->> 'nombre' into equipo from jsonb_array_elements(a.equipos) e where e ->> 'codigo' = p_codigo;
  if equipo is null and not (jsonb_array_length(a.equipos) = 0 and p_codigo = 'pedido') then
    raise exception 'Ese equipo no es de este pedido.';
  end if;
  if split_part(p_ruta, '/', 1) <> p_id::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'videos-tecnicos' and o.name = p_ruta) then
    raise exception 'El video no llegó al servidor: súbelo de nuevo.';
  end if;
  insert into alistamiento_videos (alistamiento_id, equipo_codigo, original, peso_original, tecnico)
  values (p_id, p_codigo, p_ruta, p_peso, t) returning id into nuevo;
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('video', nuevo, 'equipo', p_codigo, 'tecnico', t),
                      format('🎥 %s subió el video de %s', t, coalesce(equipo, 'el pedido')));
  return nuevo;
end $$;
revoke execute on function public.alistamiento_video_registrar(bigint, text, text, bigint, text) from public, anon;
grant execute on function public.alistamiento_video_registrar(bigint, text, text, bigint, text) to authenticated;

-- --------------------------------------------------------------------------- --
-- «Revisado, listo para despachar» exige un video por equipo (RAL-06)
-- --------------------------------------------------------------------------- --
create or replace function public.alistamiento_listo(p_id bigint, p_tecnico text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; t text; faltan text;
begin
  perform exigir_permiso('gestionar_alistamiento');
  t := alistamiento_validar_tecnico(p_tecnico);
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if a.estado <> 'en_revision' then
    raise exception 'Toma el pedido antes de marcarlo como revisado.';
  end if;
  if a.doc_numero is null then
    raise exception 'Falta el documento (OP o FVE): lo pone el asesor.';
  end if;
  select string_agg(e ->> 'nombre', ', ') into faltan
    from jsonb_array_elements(a.equipos) e
   where not exists (select 1 from alistamiento_videos v where v.alistamiento_id = p_id and v.equipo_codigo = e ->> 'codigo'
                       and v.estado in ('procesando', 'listo'));
  if faltan is not null then
    raise exception 'Falta el video de: %.', faltan;
  end if;
  if jsonb_array_length(a.equipos) = 0
     and not exists (select 1 from alistamiento_videos v where v.alistamiento_id = p_id and v.estado in ('procesando', 'listo')) then
    raise exception 'Falta el video del pedido.';
  end if;
  update alistamientos set estado = 'listo', listo_en = now(), listo_por = t where id = p_id;
  update leads set etiquetas = array_append(coalesce(etiquetas, '{}'), 'Listo-Para-Despachar')
   where id = a.lead_id and not 'Listo-Para-Despachar' = any(coalesce(etiquetas, '{}'));
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('estado', 'listo', 'tecnico', t),
                      format('Revisado, listo para despachar (%s)', t));
end $$;

-- Lo que ve el servicio técnico, ahora con los videos de cada equipo.
create or replace function public.servicio_tecnico_pedidos() returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('gestionar_alistamiento');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'cliente', coalesce(nullif(split_part(btrim(l.nombre), ' ', 1), ''), 'Cliente'),
        'entrega', case l.atributos ->> 'venta_online' when 'true' then 'envio' when 'false' then 'tienda' else null end,
        'equipos', a.equipos, 'doc_tipo', a.doc_tipo, 'doc_numero', a.doc_numero, 'estado', a.estado, 'tecnico', a.tecnico,
        'tomado_en', a.tomado_en, 'listo_en', a.listo_en, 'listo_por', a.listo_por, 'checklist', a.checklist, 'entro_en', a.creado_en,
        'videos', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'equipo_codigo', v.equipo_codigo, 'estado', v.estado,
                                   'tecnico', v.tecnico, 'subido_en', v.subido_en, 'ruta', v.ruta, 'peso', v.peso, 'error', v.error)
                                   order by v.subido_en)
                            from alistamiento_videos v where v.alistamiento_id = a.id and v.estado <> 'vencido'), '[]'))
      order by case a.estado when 'por_revisar' then 0 when 'en_revision' then 1 else 2 end, a.creado_en)
    from alistamientos a
    join oportunidades o on o.id = a.oportunidad_id and o.estado = 'abierta'
    join etapas e on e.id = o.etapa_id and e.nombre = 'Alistamiento'
    join leads l on l.id = a.lead_id and l.eliminado_en is null), '[]');
end $$;

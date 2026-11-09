-- 0059 · Pedidos (F4·54, docs/PEDIDOS.md, RPD-27 a RPD-31): se cambia con el pedido abierto, la ficha se bloquea al cerrar y «Corregir» con motivo.
--
-- · RPD-27: con el pedido abierto el asesor cambia el FVE/OP en la ficha y el técnico reemplaza el video sin «Volver a revisión».
-- · RPD-28: con el pedido cerrado (oportunidad ganada o perdida) o cancelado, el documento y el video ya no se cambian por la vía normal.
-- · RPD-29 y RPD-30: quien tiene el permiso nuevo `corregir_pedidos` corrige el documento o autoriza un video nuevo, con motivo; el video lo
--   sube el técnico en Servicio técnico → Cerrados. Todo queda en la línea de tiempo y el embudo no se mueve.
-- · RPD-31: la corrección habilita un envío más al cliente («Te enviamos tu FVE corregida»). Un pedido cancelado queda congelado.

insert into public.permisos (codigo, descripcion)
values ('corregir_pedidos', 'Pedidos cerrados: corregir el FVE/OP y autorizar un video nuevo del servicio técnico, con motivo');
insert into public.rol_permisos (rol_id, permiso)
select r.id, 'corregir_pedidos' from roles r where r.nombre = 'administrador';

alter table public.alistamientos
  add column correccion_documento_en        timestamptz,
  add column correccion_video_autorizada_en timestamptz,
  add column correccion_video_motivo        text check (length(correccion_video_motivo) <= 120),
  add column correccion_video_id            bigint references public.alistamiento_videos (id) on delete set null,
  add column correccion_video_en            timestamptz;

-- Cerrado = cancelado, o la oportunidad ya no está abierta (Vendido, Perdido…).
create function public.alistamiento_cerrado(a public.alistamientos) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select a.cancelado_en is not null or coalesce((select o.estado <> 'abierta' from oportunidades o where o.id = a.oportunidad_id), true)
$$;
revoke execute on function public.alistamiento_cerrado(public.alistamientos) from public, anon;
grant execute on function public.alistamiento_cerrado(public.alistamientos) to authenticated;

-- --------------------------------------------------------------------------- --
-- RPD-28 · El documento solo se cambia por la vía normal con el pedido abierto
-- --------------------------------------------------------------------------- --
create or replace function public.alistamiento_documento(p_id bigint, p_tipo text, p_numero text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; quien text; v_doc text := btrim(coalesce(p_numero, ''));
begin
  perform exigir_permiso('gestionar_oportunidades');
  if p_tipo not in ('OP', 'FVE') then
    raise exception 'El documento es OP de garantía (POS) o FVE (factura electrónica).';
  end if;
  if v_doc !~ '^[A-Za-z0-9./ -]{1,40}$' then
    raise exception 'Escribe el número del documento (letras, números, guion, punto o barra; máximo 40).';
  end if;
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if not puede_ver_lead(a.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if alistamiento_cerrado(a) then
    raise exception 'El pedido está cerrado: el documento se cambia con «Corregir» (pide motivo).';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  update alistamientos set doc_tipo = p_tipo, doc_numero = v_doc, doc_por = auth.uid(), doc_en = now() where id = p_id;
  perform lead_evento(a.lead_id, 'alistamiento', jsonb_build_object('doc', a.doc_tipo || ' ' || coalesce(a.doc_numero, '')),
                      jsonb_build_object('doc', p_tipo || ' ' || v_doc),
                      format('Documento del pedido: %s %s (lo puso %s)', p_tipo, v_doc, coalesce(quien, 'un asesor')));
end $$;

-- --------------------------------------------------------------------------- --
-- RPD-27 y RPD-29 · Videos: en revisión (quien lo tiene), listo (reemplazar) o cerrado con corrección autorizada
-- --------------------------------------------------------------------------- --
create or replace function public.alistamiento_video_registrar(p_id bigint, p_codigo text, p_ruta text, p_peso bigint, p_tecnico text) returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; t text; equipo text; nuevo bigint; cerrado boolean;
begin
  perform exigir_permiso('gestionar_alistamiento');
  t := alistamiento_validar_tecnico(p_tecnico);
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if a.cancelado_en is not null then
    raise exception 'El pedido está cancelado: queda congelado.';
  end if;
  cerrado := alistamiento_cerrado(a);
  if cerrado then
    if a.correccion_video_autorizada_en is null then
      raise exception 'El pedido está cerrado: para subir otro video, alguien con permiso debe autorizar «Corregir video».';
    end if;
  elsif a.estado = 'en_revision' then
    if a.tecnico <> t then
      raise exception 'Solo quien tiene el pedido en revisión sube sus videos.';
    end if;
  elsif a.estado <> 'listo' then
    raise exception 'Primero toma el pedido.';
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
  if cerrado then
    update alistamientos set correccion_video_autorizada_en = null, correccion_video_id = nuevo, correccion_video_en = now() where id = p_id;
  end if;
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('video', nuevo, 'equipo', p_codigo, 'tecnico', t, 'correccion', cerrado),
                      format(case when cerrado then '🎥 %s subió el video corregido de %s'
                                  when a.estado = 'listo' then '🎥 %s reemplazó el video de %s' else '🎥 %s subió el video de %s' end,
                             t, coalesce(equipo, 'el pedido')));
  return nuevo;
end $$;

-- --------------------------------------------------------------------------- --
-- RPD-29 · «Corregir documento» y «Corregir video» en un pedido cerrado (no cancelado), con motivo
-- --------------------------------------------------------------------------- --
create function public.alistamiento_corregir_documento(p_id bigint, p_tipo text, p_numero text, p_motivo text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; quien text; v_doc text := btrim(coalesce(p_numero, '')); m text := btrim(coalesce(p_motivo, ''));
begin
  perform exigir_permiso('corregir_pedidos');
  if p_tipo not in ('OP', 'FVE') then
    raise exception 'El documento es OP de garantía (POS) o FVE (factura electrónica).';
  end if;
  if v_doc !~ '^[A-Za-z0-9./ -]{1,40}$' then
    raise exception 'Escribe el número del documento (letras, números, guion, punto o barra; máximo 40).';
  end if;
  if m = '' or length(m) > 120 then
    raise exception 'Escribe el motivo de la corrección.';
  end if;
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no existe.' using errcode = 'P0002';
  end if;
  if not puede_ver_lead(a.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if a.cancelado_en is not null then
    raise exception 'Un pedido cancelado queda congelado: no se corrige.';
  end if;
  if not alistamiento_cerrado(a) then
    raise exception 'El pedido sigue abierto: cambia el documento en la ficha del cliente.';
  end if;
  if a.doc_tipo = p_tipo and a.doc_numero = v_doc then
    raise exception 'Es el mismo documento que ya tiene el pedido.';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  update alistamientos set doc_tipo = p_tipo, doc_numero = v_doc, doc_por = auth.uid(), doc_en = now(), correccion_documento_en = now()
   where id = p_id;
  perform lead_evento(a.lead_id, 'alistamiento', jsonb_build_object('doc', a.doc_tipo || ' ' || coalesce(a.doc_numero, '')),
                      jsonb_build_object('doc', p_tipo || ' ' || v_doc, 'motivo', m),
                      format('✏️ Documento corregido por %s: %s %s → %s %s (%s)', coalesce(quien, 'un usuario'),
                             coalesce(a.doc_tipo, ''), coalesce(a.doc_numero, 'sin número'), p_tipo, v_doc, m));
end $$;
revoke execute on function public.alistamiento_corregir_documento(bigint, text, text, text) from public, anon;
grant execute on function public.alistamiento_corregir_documento(bigint, text, text, text) to authenticated;

create function public.alistamiento_corregir_video(p_id bigint, p_motivo text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; quien text; m text := btrim(coalesce(p_motivo, ''));
begin
  perform exigir_permiso('corregir_pedidos');
  if m = '' or length(m) > 120 then
    raise exception 'Escribe el motivo de la corrección.';
  end if;
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no existe.' using errcode = 'P0002';
  end if;
  if not puede_ver_lead(a.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if a.cancelado_en is not null then
    raise exception 'Un pedido cancelado queda congelado: no se corrige.';
  end if;
  if not alistamiento_cerrado(a) then
    raise exception 'El pedido sigue abierto: el técnico reemplaza el video en Servicio técnico.';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  update alistamientos set correccion_video_autorizada_en = now(), correccion_video_motivo = m where id = p_id;
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('autoriza_video', m),
                      format('✏️ %s autorizó un video corregido: %s', coalesce(quien, 'un usuario'), m));
end $$;
revoke execute on function public.alistamiento_corregir_video(bigint, text) from public, anon;
grant execute on function public.alistamiento_corregir_video(bigint, text) to authenticated;

-- --------------------------------------------------------------------------- --
-- RPD-31 · Envíos: la corrección habilita uno más
-- --------------------------------------------------------------------------- --
create or replace function public.alistamiento_para_enviar(p_id bigint, p_que text) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; entrega text; cerrada boolean; primer timestamptz; reservado timestamptz; corregido boolean;
begin
  perform exigir_permiso('gestionar_oportunidades');
  if p_que not in ('video', 'documento', 'listo_tienda', 'guia') then
    raise exception 'Ese envío no existe.';
  end if;
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if not puede_ver_lead(a.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if a.cancelado_en is not null then
    raise exception 'El pedido está cancelado: no se le envía nada al cliente.';
  end if;
  select case atributos ->> 'venta_online' when 'true' then 'envio' when 'false' then 'tienda' end into entrega from leads where id = a.lead_id;
  select estado <> 'abierta' into cerrada from oportunidades where id = a.oportunidad_id;
  if p_que = 'video' and not exists (select 1 from alistamiento_videos where alistamiento_id = p_id and estado = 'listo') then
    raise exception 'Todavía no hay videos listos para enviar.';
  elsif p_que = 'documento' and a.doc_numero is null then
    raise exception 'Primero guarda el OP o la FVE.';
  elsif p_que = 'listo_tienda' and (entrega is distinct from 'tienda' or a.estado <> 'listo') then
    raise exception 'El aviso de «listo para recoger» es para ventas en tienda con el equipo ya revisado.';
  elsif p_que = 'guia' and a.guia_ruta is null then
    raise exception 'Primero registra la guía.';
  end if;
  -- RPD-16: una sola vez
  if p_que = 'guia' and a.guia_enviada_en is not null then
    raise exception 'La guía ya se le envió al cliente: se envía una sola vez.';
  elsif p_que = 'listo_tienda' and a.aviso_tienda_en is not null then
    raise exception 'Ya se le avisó al cliente que puede recoger su equipo: se avisa una sola vez.';
  end if;
  -- RPD-31: una corrección (documento o video) habilita un envío más, aunque el pedido esté cerrado o hayan pasado las 24 h
  corregido := (p_que = 'documento' and a.correccion_documento_en is not null
                and (a.documento_enviado_en is null or a.documento_enviado_en < a.correccion_documento_en))
            or (p_que = 'video' and a.correccion_video_en is not null
                and (a.video_enviado_en is null or a.video_enviado_en < a.correccion_video_en));
  if corregido and p_que = 'video' and not exists (select 1 from alistamiento_videos where id = a.correccion_video_id and estado = 'listo') then
    raise exception 'El video corregido todavía se está preparando: espera unos minutos.';
  end if;
  -- RPD-17: video y documento, 24 h desde el primer envío y solo con el pedido abierto
  primer := case p_que when 'video' then a.primer_video_en when 'documento' then a.primer_documento_en end;
  if primer is not null and not corregido and (clock_timestamp() - primer > interval '24 hours' or cerrada) then
    raise exception 'El % ya se le envió al cliente y solo se puede reenviar durante las 24 horas siguientes, con el pedido abierto.',
      case p_que when 'video' then 'video' else 'documento' end;
  end if;
  -- RPD-18: dos clics (o dos asesores) a la vez no mandan el mismo envío dos veces
  reservado := (a.envios_en_curso ->> p_que)::timestamptz;
  if reservado is not null and clock_timestamp() - reservado < interval '90 seconds' then
    raise exception 'Ese envío ya está en curso: espera unos segundos.';
  end if;
  update alistamientos set envios_en_curso = envios_en_curso || jsonb_build_object(p_que, clock_timestamp()) where id = p_id;
  return jsonb_build_object('lead', a.lead_id, 'alistamiento', a.id, 'que', p_que, 'corregido', corregido);
end $$;


-- --------------------------------------------------------------------------- --
-- Servicio técnico: el número del pedido en la lista y la pestaña «Cerrados» (últimos 6 meses, sin cancelados)
-- --------------------------------------------------------------------------- --
create or replace function public.servicio_tecnico_pedidos() returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('gestionar_alistamiento');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', a.id, 'numero', a.numero,
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
    join leads l on l.id = a.lead_id and l.eliminado_en is null
    where a.cancelado_en is null), '[]');
end $$;

create function public.servicio_tecnico_cerrados() returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('gestionar_alistamiento');
  return coalesce((
    select jsonb_agg(x.fila order by x.cierre desc)
    from (
      select coalesce(a.guia_en, a.entregado_en, o.cerrado_en, a.creado_en) as cierre, jsonb_build_object(
        'id', a.id, 'numero', a.numero,
        'cliente', coalesce(nullif(split_part(btrim(l.nombre), ' ', 1), ''), 'Cliente'),
        'entrega', case l.atributos ->> 'venta_online' when 'true' then 'envio' when 'false' then 'tienda' else null end,
        'equipos', a.equipos, 'doc_tipo', a.doc_tipo, 'doc_numero', a.doc_numero, 'estado', a.estado, 'tecnico', a.tecnico,
        'tomado_en', a.tomado_en, 'listo_en', a.listo_en, 'listo_por', a.listo_por, 'checklist', a.checklist, 'entro_en', a.creado_en,
        'cerrado_en', coalesce(a.guia_en, a.entregado_en, o.cerrado_en), 'cierre', e.nombre,
        'correccion_video_autorizada_en', a.correccion_video_autorizada_en, 'correccion_video_motivo', a.correccion_video_motivo,
        'videos', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'equipo_codigo', v.equipo_codigo, 'estado', v.estado,
                                   'tecnico', v.tecnico, 'subido_en', v.subido_en, 'ruta', v.ruta, 'peso', v.peso, 'error', v.error)
                                   order by v.subido_en)
                            from alistamiento_videos v where v.alistamiento_id = a.id and v.estado <> 'vencido'), '[]')) as fila
      from alistamientos a
      join oportunidades o on o.id = a.oportunidad_id and o.estado <> 'abierta'
      join etapas e on e.id = o.etapa_id
      join leads l on l.id = a.lead_id and l.eliminado_en is null
      where a.cancelado_en is null and a.creado_en > now() - interval '6 months'
      order by cierre desc
      limit 100) x), '[]');
end $$;
revoke execute on function public.servicio_tecnico_cerrados() from public, anon;
grant execute on function public.servicio_tecnico_cerrados() to authenticated;

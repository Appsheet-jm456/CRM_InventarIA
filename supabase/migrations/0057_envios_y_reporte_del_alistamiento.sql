-- 0057 · Alistamiento: bloques C (envíos al cliente y cierre) y D (reporte) de F4·50 (docs/ALISTAMIENTO-Y-VIDEO-TECNICO.md, RAL-07, RAL-09)
--
-- C. El asesor, desde la ficha del cliente, manda con un clic el video de cada equipo, el OP o la FVE y, según la entrega:
--    · envío: la foto de la guía que da la transportadora (más transportadora y número, que la etapa Despachado ya exige). Al enviarla la
--      oportunidad pasa sola a Despachado y Vendido (sin botón de Despachado);
--    · tienda: el aviso «listo para recoger» y, al entregarlo, «Entregado» → Vendido.
--    La base registra y mueve; el receptor le escribe al cliente (ruta /interno/alistamiento) y anota la hora de cada envío.
-- D. Reporte: pedidos por técnico y tiempos.

alter table public.alistamientos
  add column guia_ruta            text,
  add column transportadora       text check (length(transportadora) <= 60),
  add column numero_guia          text check (numero_guia ~ '^[A-Za-z0-9./ -]{1,40}$'),
  add column guia_en              timestamptz,
  add column guia_por             uuid references public.usuarios (id) on delete set null,
  add column guia_enviada_en      timestamptz,
  add column documento_enviado_en timestamptz,
  add column video_enviado_en     timestamptz,
  add column aviso_tienda_en      timestamptz,
  add column entregado_en         timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guias', 'guias', false, 5242880, '{image/jpeg,image/png}');  -- WhatsApp manda imágenes JPG o PNG de hasta 5 MB
create policy guias_alta on storage.objects for insert to authenticated
  with check (bucket_id = 'guias' and (select tiene_permiso('gestionar_oportunidades')));
create policy guias_lectura on storage.objects for select to authenticated
  using (bucket_id = 'guias' and exists (select 1 from public.alistamientos a where a.id = public.alistamiento_de_ruta(name) and public.puede_ver_lead(a.lead_id)));

-- --------------------------------------------------------------------------- --
-- Antes de cada envío: permiso del asesor y que el pedido sea suyo (el receptor manda el mensaje)
-- --------------------------------------------------------------------------- --
create function public.alistamiento_para_enviar(p_id bigint, p_que text) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; entrega text;
begin
  perform exigir_permiso('gestionar_oportunidades');
  select * into a from alistamientos where id = p_id;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if not puede_ver_lead(a.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  select case atributos ->> 'venta_online' when 'true' then 'envio' when 'false' then 'tienda' end into entrega from leads where id = a.lead_id;
  if p_que = 'video' and not exists (select 1 from alistamiento_videos where alistamiento_id = p_id and estado = 'listo') then
    raise exception 'Todavía no hay videos listos para enviar.';
  elsif p_que = 'documento' and a.doc_numero is null then
    raise exception 'Primero guarda el OP o la FVE.';
  elsif p_que = 'listo_tienda' and (entrega is distinct from 'tienda' or a.estado <> 'listo') then
    raise exception 'El aviso de «listo para recoger» es para ventas en tienda con el equipo ya revisado.';
  elsif p_que = 'guia' and a.guia_ruta is null then
    raise exception 'Primero registra la guía.';
  elsif p_que not in ('video', 'documento', 'listo_tienda', 'guia') then
    raise exception 'Ese envío no existe.';
  end if;
  return jsonb_build_object('lead', a.lead_id, 'alistamiento', a.id, 'que', p_que);
end $$;
revoke execute on function public.alistamiento_para_enviar(bigint, text) from public, anon;
grant execute on function public.alistamiento_para_enviar(bigint, text) to authenticated;

-- --------------------------------------------------------------------------- --
-- «📦 Enviar guía» (envío): guarda la guía y pasa la oportunidad a Despachado y Vendido
-- --------------------------------------------------------------------------- --
create function public.alistamiento_guia(p_id bigint, p_ruta text, p_transportadora text, p_numero text) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; l leads; despachado bigint; vendido bigint; t text := btrim(coalesce(p_transportadora, ''));
        n text := btrim(coalesce(p_numero, '')); quien text;
begin
  perform exigir_permiso('gestionar_oportunidades');
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  select * into l from leads where id = a.lead_id;
  if not puede_ver_lead(a.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if l.atributos ->> 'venta_online' is distinct from 'true' then
    raise exception 'La guía es para ventas con envío: marca la venta como online o usa «Entregado» si la recogen en tienda.';
  end if;
  if a.estado <> 'listo' then
    raise exception 'El servicio técnico aún no marca el pedido como revisado y listo para despachar.';
  end if;
  if t = '' or length(t) > 60 then
    raise exception 'Elige la transportadora.';
  end if;
  if n !~ '^[A-Za-z0-9./ -]{1,40}$' then
    raise exception 'Escribe el número de guía.';
  end if;
  if split_part(p_ruta, '/', 1) <> p_id::text or not exists (select 1 from storage.objects o where o.bucket_id = 'guias' and o.name = p_ruta) then
    raise exception 'La foto de la guía no llegó al servidor: súbela de nuevo.';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  update alistamientos set guia_ruta = p_ruta, transportadora = t, numero_guia = n, guia_en = now(), guia_por = auth.uid(),
                           guia_enviada_en = null
   where id = p_id;
  -- La etapa Despachado exige transportadora y número de guía en la ficha (F4·33).
  update leads set atributos = coalesce(atributos, '{}') || jsonb_build_object('transportadora', t, 'numero_guia', n),
                   etiquetas = array_remove(coalesce(etiquetas, '{}'), 'Listo-Para-Despachar')
   where id = a.lead_id;
  select e.id into despachado from etapas e join oportunidades o on o.embudo_id = e.embudo_id where o.id = a.oportunidad_id and e.nombre = 'Despachado';
  select e.id into vendido from etapas e join oportunidades o on o.embudo_id = e.embudo_id where o.id = a.oportunidad_id and e.cierre = 'ganada';
  if exists (select 1 from oportunidades where id = a.oportunidad_id and estado = 'abierta') then
    if despachado is not null then
      perform mover_oportunidad(a.oportunidad_id, despachado);
    end if;
    perform mover_oportunidad(a.oportunidad_id, vendido);
  end if;
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('guia', n, 'transportadora', t),
                      format('📦 Guía %s de %s registrada por %s: Despachado y Vendido', n, t, coalesce(quien, 'un asesor')));
  return jsonb_build_object('lead', a.lead_id, 'alistamiento', a.id, 'que', 'guia');
end $$;
revoke execute on function public.alistamiento_guia(bigint, text, text, text) from public, anon;
grant execute on function public.alistamiento_guia(bigint, text, text, text) to authenticated;

-- «✅ Entregado» (tienda): el cliente recogió el equipo → Vendido.
create function public.alistamiento_entregado(p_id bigint) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; vendido bigint; quien text;
begin
  perform exigir_permiso('gestionar_oportunidades');
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if not puede_ver_lead(a.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if (select atributos ->> 'venta_online' from leads where id = a.lead_id) is distinct from 'false' then
    raise exception '«Entregado» es para ventas en tienda; en una venta con envío, registra la guía.';
  end if;
  if a.estado <> 'listo' then
    raise exception 'El servicio técnico aún no marca el pedido como revisado.';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  update alistamientos set entregado_en = now() where id = p_id;
  update leads set etiquetas = array_remove(coalesce(etiquetas, '{}'), 'Listo-Para-Despachar') where id = a.lead_id;
  select e.id into vendido from etapas e join oportunidades o on o.embudo_id = e.embudo_id where o.id = a.oportunidad_id and e.cierre = 'ganada';
  if exists (select 1 from oportunidades where id = a.oportunidad_id and estado = 'abierta') then
    perform mover_oportunidad(a.oportunidad_id, vendido);
  end if;
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('entregado', true),
                      format('✅ Entregado en tienda (%s): Vendido', coalesce(quien, 'un asesor')));
end $$;
revoke execute on function public.alistamiento_entregado(bigint) from public, anon;
grant execute on function public.alistamiento_entregado(bigint) to authenticated;

-- --------------------------------------------------------------------------- --
-- D. Reporte: pedidos por técnico y tiempos (RAL-09)
-- --------------------------------------------------------------------------- --
create function public.alistamiento_reporte(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare desde timestamptz := (p_desde::timestamp at time zone 'America/Bogota');
        hasta timestamptz := ((p_hasta + 1)::timestamp at time zone 'America/Bogota');
begin
  if not (tiene_permiso('gestionar_alistamiento') or tiene_permiso('ver_metricas')) then
    raise exception 'Sin permiso para esta operación: ver el reporte del servicio técnico' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'totales', (select jsonb_build_object(
        'pedidos', count(*),
        'listos', count(*) filter (where listo_en is not null),
        'despachados', count(*) filter (where guia_en is not null),
        'entregados_tienda', count(*) filter (where entregado_en is not null),
        'horas_entrada_a_listo', round((avg(extract(epoch from listo_en - creado_en)) filter (where listo_en is not null) / 3600)::numeric, 1),
        'horas_listo_a_guia', round((avg(extract(epoch from guia_en - listo_en)) filter (where guia_en is not null and listo_en is not null) / 3600)::numeric, 1))
      from alistamientos where creado_en >= desde and creado_en < hasta),
    'por_tecnico', coalesce((select jsonb_agg(x order by x ->> 'tecnico') from (
        select jsonb_build_object(
          'tecnico', a.tecnico,
          'tomados', count(*),
          'listos', count(*) filter (where a.listo_en is not null),
          'videos', (select count(*) from alistamiento_videos v join alistamientos b on b.id = v.alistamiento_id
                      where v.tecnico = a.tecnico and v.subido_en >= desde and v.subido_en < hasta),
          'horas_revision', round((avg(extract(epoch from a.listo_en - a.tomado_en)) filter (where a.listo_en is not null) / 3600)::numeric, 1)) as x
        from alistamientos a where a.tecnico is not null and a.tomado_en >= desde and a.tomado_en < hasta group by a.tecnico) t), '[]'));
end $$;
revoke execute on function public.alistamiento_reporte(date, date) from public, anon;
grant execute on function public.alistamiento_reporte(date, date) to authenticated;

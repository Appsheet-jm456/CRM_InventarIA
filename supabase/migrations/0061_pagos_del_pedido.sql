-- 0061 · Pagos del pedido (F4·54, docs/PEDIDOS.md, RPD-32 a RPD-37): los comprobantes del WhatsApp y los que se suben a mano, con su soporte.
--
-- · Tabla `pagos` por oportunidad (el pedido): valor, medio, fecha, referencia, soporte (bucket `media` si vino por WhatsApp, `pagos` si se subió),
--   origen, quién y anulación con motivo (un pago equivocado no se borra).
-- · `validar_comprobante` registra solo el pago del WhatsApp (RPD-33). Los pedidos que ya existían se completan con su validación.
-- · `pago_registrar` y `pago_anular` con el permiso `validar_pagos` (RPD-37). Nada de esto mueve el embudo ni confirma pagos solo (RAG-21).
-- · `pedidos_lista` suma lo pagado y avisa «Saldo pendiente» (RPD-35).

create table public.pagos (
  id              bigint generated always as identity primary key,
  lead_id         bigint not null references public.leads (id) on delete cascade,
  oportunidad_id  bigint not null references public.oportunidades (id) on delete cascade,
  valor           numeric(14, 2) not null check (valor > 0 and valor < 1000000000),
  medio           text not null check (medio in ('Transferencia', 'Efectivo en tienda', 'Tarjeta', 'Otro')),
  fecha_pago      date not null,
  referencia      text check (length(referencia) <= 60),
  nota            text check (length(nota) <= 200),
  origen          text not null check (origen in ('whatsapp', 'manual')),
  soporte_bucket  text check (soporte_bucket in ('media', 'pagos')),
  soporte_ruta    text,
  soporte_mime    text,
  registrado_por  uuid references public.usuarios (id) on delete set null,
  creado_en       timestamptz not null default now(),
  anulado_en      timestamptz,
  anulado_por     uuid references public.usuarios (id) on delete set null,
  anulado_motivo  text check (length(anulado_motivo) <= 120),
  check ((anulado_en is null) = (anulado_motivo is null)),
  check ((soporte_bucket is null) = (soporte_ruta is null))
);
create index pagos_oportunidad on public.pagos (oportunidad_id);
create index pagos_lead on public.pagos (lead_id);
comment on table public.pagos is 'F4·54 (RPD-32): pagos de cada pedido, del WhatsApp o subidos a mano. Registrar un pago no mueve el embudo.';
alter table public.pagos enable row level security;
create policy pagos_lectura on public.pagos for select to authenticated using (puede_ver_lead(lead_id));
revoke all on public.pagos from anon, authenticated;
grant select on public.pagos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pagos', 'pagos', false, 10485760, '{image/jpeg,image/png,image/webp,application/pdf}');
create policy pagos_alta on storage.objects for insert to authenticated
  with check (bucket_id = 'pagos' and (select tiene_permiso('validar_pagos')));
create policy pagos_soporte_lectura on storage.objects for select to authenticated
  using (bucket_id = 'pagos' and exists (select 1 from public.oportunidades o
          where split_part(name, '/', 1) ~ '^[0-9]+$' and o.id = split_part(name, '/', 1)::bigint and public.puede_ver_lead(o.lead_id)));

-- Pedidos que ya existían: el pago validado de su línea de tiempo, con el último archivo que mandó el cliente antes de validar.
insert into public.pagos (lead_id, oportunidad_id, valor, medio, fecha_pago, origen, soporte_bucket, soporte_ruta, soporte_mime, registrado_por, creado_en)
select a.lead_id, a.oportunidad_id, (ev.despues ->> 'total')::numeric, 'Transferencia', (ev.en at time zone 'America/Bogota')::date, 'whatsapp',
       case when m.media_ruta is not null then 'media' end, m.media_ruta, m.media_mime, ev.usuario_id, ev.en
  from public.alistamientos a
  cross join lateral (select e.* from public.lead_eventos e
                       where e.lead_id = a.lead_id and e.tipo = 'pago' and e.despues ->> 'validacion' = 'validado'
                         and coalesce((e.despues ->> 'total')::numeric, 0) > 0 and e.en <= a.creado_en + interval '1 day'
                       order by e.en desc limit 1) ev
  left join lateral (select x.media_ruta, x.media_mime from public.mensajes x
                      where x.lead_id = a.lead_id and x.lado = 'cliente' and coalesce(x.media_ruta, '') <> '' and x.creado_en <= ev.en
                      order by x.creado_en desc limit 1) m on true
 where not exists (select 1 from public.pagos p where p.oportunidad_id = a.oportunidad_id);

-- --------------------------------------------------------------------------- --
-- RPD-33 · «Validar» registra el pago del WhatsApp
-- --------------------------------------------------------------------------- --
create or replace function public.validar_comprobante(p_lead bigint) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; c jsonb; quien text; op_id bigint; soporte mensajes;
begin
  perform exigir_permiso('validar_pagos');
  l := lead_a_cargo(p_lead);
  c := l.estado_bot -> 'compra';
  if coalesce(c ->> 'paso', '') <> 'pago_por_confirmar' then
    raise exception 'Este cliente no tiene un comprobante por validar.';
  end if;
  if c ->> 'validacion' = 'rechazado' then
    raise exception 'El comprobante ya se marcó como no válido; espera a que el cliente mande otro.';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  update leads set
    estado_bot = jsonb_set(estado_bot, '{compra}', c || jsonb_build_object('validacion', 'validado', 'validado_por', quien,
                                                                             'validado_en', now())),
    etiquetas = compra_quitar_etiquetas(etiquetas, '{Comprobante-Por-Validar,Comprobante-Rechazado}')
                || case when 'Pago-Validado' = any(coalesce(etiquetas, '{}')) then '{}'::text[] else '{Pago-Validado}' end
  where id = p_lead;
  -- F4·54 (RPD-33): el comprobante validado queda como un pago del pedido, con la foto o PDF que mandó el cliente de soporte.
  select o.id into op_id from oportunidades o join embudos e on e.id = o.embudo_id join compra_etapas ce on ce.embudo_id = o.embudo_id
   where o.lead_id = p_lead and o.estado = 'abierta' order by e.predeterminado, o.creado_en desc limit 1;
  select * into soporte from mensajes where lead_id = p_lead and lado = 'cliente' and coalesce(media_ruta, '') <> '' order by creado_en desc limit 1;
  if op_id is not null and coalesce((c ->> 'total')::numeric, 0) > 0 then
    insert into pagos (lead_id, oportunidad_id, valor, medio, fecha_pago, origen, soporte_bucket, soporte_ruta, soporte_mime, registrado_por)
    values (p_lead, op_id, (c ->> 'total')::numeric, 'Transferencia', (now() at time zone 'America/Bogota')::date, 'whatsapp',
            case when soporte.media_ruta is not null then 'media' end, soporte.media_ruta, soporte.media_mime, auth.uid());
  end if;
  perform compra_ir_a(p_lead, 'pago_validado');
  perform lead_evento(p_lead, 'pago', null, jsonb_build_object('validacion', 'validado', 'total', c -> 'total'),
                      format('Comprobante validado por %s (total %s)', coalesce(quien, 'un usuario'), coalesce(c ->> 'total', '?')));
  return jsonb_build_object('total', c -> 'total');
end $$;

-- --------------------------------------------------------------------------- --
-- RPD-34 · Registrar un pago a mano (con soporte) y RPD-36 · anularlo con motivo
-- --------------------------------------------------------------------------- --
create function public.pesos_texto(v numeric) returns text
language sql immutable
as $$ select '$' || replace(to_char(round(v), 'FM999,999,999,999'), ',', '.') $$;

create function public.pago_registrar(p_oportunidad bigint, p_valor numeric, p_medio text, p_fecha date, p_referencia text,
                                      p_ruta text, p_mime text, p_nota text) returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare op oportunidades; nuevo bigint; quien text; ref text := nullif(btrim(coalesce(p_referencia, '')), '');
        nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  perform exigir_permiso('validar_pagos');
  select * into op from oportunidades where id = p_oportunidad;
  if not found then
    raise exception 'Ese pedido no existe.' using errcode = 'P0002';
  end if;
  if not puede_ver_lead(op.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if exists (select 1 from alistamientos where oportunidad_id = p_oportunidad and cancelado_en is not null) then
    raise exception 'El pedido está cancelado: no recibe pagos nuevos.';
  end if;
  if p_valor is null or p_valor <= 0 or p_valor >= 1000000000 then
    raise exception 'Escribe el valor del pago.';
  end if;
  if p_medio not in ('Transferencia', 'Efectivo en tienda', 'Tarjeta', 'Otro') then
    raise exception 'Elige el medio de pago.';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Bogota')::date + 1 or p_fecha < (now() at time zone 'America/Bogota')::date - 365 then
    raise exception 'La fecha del pago no es válida.';
  end if;
  if length(ref) > 60 or length(nota) > 200 then
    raise exception 'La referencia o la nota son muy largas.';
  end if;
  if coalesce(p_mime, '') not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'El soporte debe ser una foto (JPG, PNG o WEBP) o un PDF.';
  end if;
  if split_part(coalesce(p_ruta, ''), '/', 1) <> p_oportunidad::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'pagos' and o.name = p_ruta) then
    raise exception 'El soporte no llegó al servidor: súbelo de nuevo.';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  insert into pagos (lead_id, oportunidad_id, valor, medio, fecha_pago, referencia, nota, origen, soporte_bucket, soporte_ruta, soporte_mime, registrado_por)
  values (op.lead_id, p_oportunidad, round(p_valor, 2), p_medio, p_fecha, ref, nota, 'manual', 'pagos', p_ruta, p_mime, auth.uid())
  returning id into nuevo;
  perform lead_evento(op.lead_id, 'pago', null, jsonb_build_object('pago', nuevo, 'valor', p_valor, 'medio', p_medio, 'origen', 'manual'),
                      format('💵 Pago de %s (%s, %s) registrado por %s', pesos_texto(p_valor), p_medio, to_char(p_fecha, 'DD/MM/YYYY'),
                             coalesce(quien, 'un usuario')));
  return nuevo;
end $$;
revoke execute on function public.pago_registrar(bigint, numeric, text, date, text, text, text, text) from public, anon;
grant execute on function public.pago_registrar(bigint, numeric, text, date, text, text, text, text) to authenticated;

create function public.pago_anular(p_id bigint, p_motivo text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare p pagos; quien text; m text := btrim(coalesce(p_motivo, ''));
begin
  perform exigir_permiso('validar_pagos');
  select * into p from pagos where id = p_id for update;
  if not found then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;
  if not puede_ver_lead(p.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if p.anulado_en is not null then
    raise exception 'Ese pago ya está anulado.';
  end if;
  if m = '' or length(m) > 120 then
    raise exception 'Escribe el motivo para anular el pago.';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  update pagos set anulado_en = now(), anulado_por = auth.uid(), anulado_motivo = m where id = p_id;
  perform lead_evento(p.lead_id, 'pago', null, jsonb_build_object('pago', p_id, 'anulado', m),
                      format('🚫 Pago de %s anulado por %s: %s', pesos_texto(p.valor), coalesce(quien, 'un usuario'), m));
end $$;
revoke execute on function public.pago_anular(bigint, text) from public, anon;
grant execute on function public.pago_anular(bigint, text) to authenticated;

-- --------------------------------------------------------------------------- --
-- RPD-35 · Pedidos: lo pagado y «Saldo pendiente»
-- --------------------------------------------------------------------------- --
create or replace function public.pedidos_lista() returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('ver_pedidos');
  return coalesce((
    select jsonb_agg(x.fila order by x.creado desc)
    from (
      select a.creado_en as creado, jsonb_build_object(
        'id', a.id, 'numero', a.numero, 'lead_id', a.lead_id,
        'cliente', coalesce(nullif(btrim(l.nombre), ''), 'Cliente'), 'telefono', l.telefono,
        'equipos', a.equipos, 'producto', o.producto,
        'total', m.total, 'pagado', m.pagado, 'pagos', m.pagos,
        'entrega', case l.atributos ->> 'venta_online' when 'true' then 'envio' when 'false' then 'tienda' end,
        'etapa', e.nombre, 'op_estado', o.estado,
        'estado', a.estado, 'tecnico', a.tecnico,
        'videos', (select count(distinct v.equipo_codigo) from alistamiento_videos v where v.alistamiento_id = a.id and v.estado = 'listo'),
        'doc_tipo', a.doc_tipo, 'doc_numero', a.doc_numero, 'transportadora', a.transportadora, 'numero_guia', a.numero_guia,
        'creado_en', a.creado_en, 'tomado_en', a.tomado_en, 'listo_en', a.listo_en, 'guia_en', a.guia_en, 'guia_enviada_en', a.guia_enviada_en,
        'video_enviado_en', a.video_enviado_en, 'documento_enviado_en', a.documento_enviado_en,
        'primer_video_en', a.primer_video_en, 'primer_documento_en', a.primer_documento_en,
        'aviso_tienda_en', a.aviso_tienda_en, 'entregado_en', a.entregado_en,
        'cancelado_en', a.cancelado_en, 'cancelado_motivo', a.cancelado_motivo,
        'correccion_documento_en', a.correccion_documento_en, 'correccion_video_en', a.correccion_video_en,
        'fase', case when a.cancelado_en is not null then 'cancelado'
                     when a.entregado_en is not null then 'entregado'
                     when a.guia_enviada_en is not null or a.aviso_tienda_en is not null then 'enviado'
                     when a.estado = 'listo' then 'listo'
                     when a.estado = 'en_revision' then 'en_revision'
                     else 'por_revisar' end,
        'alertas', to_jsonb(array_remove(array[
          case when a.cancelado_en is null and a.doc_numero is null and a.creado_en < now() - interval '24 hours'
               then 'Sin documento hace más de 24 h' end,
          case when a.cancelado_en is null and a.estado = 'listo' and a.guia_en is null and a.aviso_tienda_en is null and a.entregado_en is null
                    and a.listo_en < now() - interval '24 hours'
               then 'Listo hace más de 24 h sin despachar' end,
          case when a.cancelado_en is null and a.guia_en is not null and a.guia_enviada_en is null
               then 'Guía registrada sin enviar al cliente' end,
          case when a.cancelado_en is null and a.aviso_tienda_en is not null and a.entregado_en is null and a.aviso_tienda_en < now() - interval '7 days'
               then 'Avisado hace más de 7 días y sin recoger' end,
          case when a.cancelado_en is null and (a.guia_enviada_en is not null or a.entregado_en is not null) and a.video_enviado_en is null
               then 'Despachado sin enviar el video' end,
          case when a.cancelado_en is null and m.total is not null and m.pagado < m.total
               then 'Saldo pendiente' end
        ]::text[], null))
      ) as fila
      from alistamientos a
      join oportunidades o on o.id = a.oportunidad_id
      join etapas e on e.id = o.etapa_id
      join leads l on l.id = a.lead_id and l.eliminado_en is null
      cross join lateral (
        select coalesce(o.valor_estimado, (select c.total from cotizaciones c where c.lead_id = a.lead_id order by c.creado_en desc limit 1)) as total,
               coalesce((select sum(p.valor) from pagos p where p.oportunidad_id = a.oportunidad_id and p.anulado_en is null), 0) as pagado,
               (select count(*) from pagos p where p.oportunidad_id = a.oportunidad_id and p.anulado_en is null) as pagos) m
      where puede_ver_lead(a.lead_id)
      order by a.creado_en desc
      limit 1000) x), '[]');
end $$;

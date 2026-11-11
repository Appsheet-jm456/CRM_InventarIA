-- 0082 · Los aumentos de RAM y disco llegan al pedido (F4·73c, docs/AMPLIACIONES-RAM-DISCO.md, RAM-10 a RAM-12).
-- La oportunidad y el alistamiento guardan los aumentos que el cliente pagó, para el resumen al cliente, Pedidos y el Servicio técnico.
-- Forma: [{de, tipo, desde, hasta, texto, precio}] — de = código del equipo; texto = «Aumento RAM 8GB → 16GB».

alter table public.oportunidades
  add column aumentos jsonb not null default '[]' check (jsonb_typeof(aumentos) = 'array');
alter table public.alistamientos
  add column aumentos jsonb not null default '[]' check (jsonb_typeof(aumentos) = 'array');
comment on column public.oportunidades.aumentos is 'F4·73c: aumentos de RAM o disco del pedido [{de, tipo, desde, hasta, texto, precio}].';
comment on column public.alistamientos.aumentos is 'F4·73c: copia de oportunidades.aumentos para el Servicio técnico (qué instalar).';

-- El alistamiento nace con los aumentos de su oportunidad…
create or replace function public.alistamiento_crear() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.estado = 'abierta' and new.etapa_id = (select e.id from etapas e where e.embudo_id = new.embudo_id and e.nombre = 'Alistamiento') then
    insert into alistamientos (oportunidad_id, lead_id, equipos, aumentos)
    values (new.id, new.lead_id, alistamiento_equipos_de(new.producto), coalesce(new.aumentos, '[]'))
    on conflict (oportunidad_id) do nothing;
  end if;
  return new;
end $$;

-- …y los sigue si cambian después.
create or replace function public.alistamiento_aumentos() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update alistamientos set aumentos = new.aumentos where oportunidad_id = new.id and aumentos is distinct from new.aumentos;
  return new;
end $$;
create trigger oportunidades_aumentos after update of aumentos on public.oportunidades
  for each row execute function public.alistamiento_aumentos();

-- El bot (service_role) anota los aumentos al enviar las cuentas: en la misma oportunidad que mueve compra_mover.
create or replace function public.compra_aumentos(p_lead bigint, p_aumentos jsonb) returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare op bigint;
begin
  if jsonb_typeof(coalesce(p_aumentos, '[]')) <> 'array' then
    raise exception 'Los aumentos van en una lista.';
  end if;
  select o.id into op from oportunidades o join embudos e on e.id = o.embudo_id join compra_etapas c on c.embudo_id = o.embudo_id
   where o.lead_id = p_lead and o.estado = 'abierta' order by e.predeterminado, o.creado_en desc limit 1;
  if op is not null then
    update oportunidades set aumentos = coalesce(p_aumentos, '[]') where id = op;
  end if;
  return op;
end $$;
revoke all on function public.compra_aumentos(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.compra_aumentos(bigint, jsonb) to service_role;

-- Reenviar el resumen (RAM-12): la base revisa permiso, conversación y 24 h; el receptor arma y envía el mismo resumen.
create or replace function public.pedido_reenviar_resumen(p_alistamiento bigint) returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; ultimo timestamptz; quien text;
begin
  perform exigir_permiso('atender_bandeja');
  select * into a from alistamientos where id = p_alistamiento;
  if not found or a.cancelado_en is not null then
    raise exception 'Ese pedido no existe o está cancelado.';
  end if;
  if not puede_ver_lead(a.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  select max(creado_en) into ultimo from mensajes where lead_id = a.lead_id and lado = 'cliente';
  if ultimo is null or ultimo < now() - interval '24 hours' then
    raise exception 'Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo deja escribirle con una plantilla.';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('alistamiento', a.id),
                      format('🧾 Resumen del pedido PED-%s reenviado por %s', lpad(a.numero::text, 4, '0'), coalesce(quien, 'un usuario')));
  return a.lead_id;
end $$;
revoke all on function public.pedido_reenviar_resumen(bigint) from public, anon;
grant execute on function public.pedido_reenviar_resumen(bigint) to authenticated;

-- El pedido de prueba PED-0222 (11 nov 2026) llevó «Aumento RAM 8GB → 16GB» antes de esta migración.
update public.oportunidades o set aumentos = '[{"de": "100-101-1121-2", "tipo": "ram", "desde": 8, "hasta": 16, "texto": "Aumento RAM 8GB → 16GB", "precio": 140000}]'
  from alistamientos a where a.oportunidad_id = o.id and a.numero = 222 and o.aumentos = '[]'
   and exists (select 1 from leads l where l.id = o.lead_id and l.telefono like '%3002103979');

-- RAM-11: Pedidos y el Servicio técnico reciben los aumentos (las mismas funciones de 0059/0061, con 'aumentos' al lado de 'equipos').
CREATE OR REPLACE FUNCTION public.servicio_tecnico_pedidos()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform exigir_permiso('gestionar_alistamiento');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', a.id, 'numero', a.numero,
        'cliente', coalesce(nullif(split_part(btrim(l.nombre), ' ', 1), ''), 'Cliente'),
        'entrega', case l.atributos ->> 'venta_online' when 'true' then 'envio' when 'false' then 'tienda' else null end,
        'equipos', a.equipos, 'aumentos', a.aumentos, 'doc_tipo', a.doc_tipo, 'doc_numero', a.doc_numero, 'estado', a.estado, 'tecnico', a.tecnico,
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
end $function$

;
CREATE OR REPLACE FUNCTION public.servicio_tecnico_cerrados()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform exigir_permiso('gestionar_alistamiento');
  return coalesce((
    select jsonb_agg(x.fila order by x.cierre desc)
    from (
      select coalesce(a.guia_en, a.entregado_en, o.cerrado_en, a.creado_en) as cierre, jsonb_build_object(
        'id', a.id, 'numero', a.numero,
        'cliente', coalesce(nullif(split_part(btrim(l.nombre), ' ', 1), ''), 'Cliente'),
        'entrega', case l.atributos ->> 'venta_online' when 'true' then 'envio' when 'false' then 'tienda' else null end,
        'equipos', a.equipos, 'aumentos', a.aumentos, 'doc_tipo', a.doc_tipo, 'doc_numero', a.doc_numero, 'estado', a.estado, 'tecnico', a.tecnico,
        'tomado_en', a.tomado_en, 'listo_en', a.listo_en, 'listo_por', a.listo_por, 'checklist', a.checklist, 'entro_en', a.creado_en,
        'cerrado_en', coalesce(a.guia_en, a.entregado_en, o.cerrado_en), 'cierre', e.nombre,
        'correccion_video_autorizada_en', a.correccion_video_autorizada_en, 'correccion_video_motivo', a.correccion_video_motivo,
        'lead_id', a.lead_id, 'video_enviado_en', a.video_enviado_en, 'correccion_video_en', a.correccion_video_en,
        'correccion_video_id', a.correccion_video_id,
        'ventana_meta_hasta', (select max(m.creado_en) + interval '24 hours' - interval '1 minute' from mensajes m
                                where m.lead_id = a.lead_id and m.lado = 'cliente'),
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
end $function$

;
CREATE OR REPLACE FUNCTION public.pedidos_lista()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform exigir_permiso('ver_pedidos');
  return coalesce((
    select jsonb_agg(x.fila order by x.creado desc)
    from (
      select a.creado_en as creado, jsonb_build_object(
        'id', a.id, 'numero', a.numero, 'lead_id', a.lead_id,
        'cliente', coalesce(nullif(btrim(l.nombre), ''), 'Cliente'), 'telefono', l.telefono,
        'equipos', a.equipos, 'aumentos', a.aumentos, 'producto', o.producto,
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
end $function$

;

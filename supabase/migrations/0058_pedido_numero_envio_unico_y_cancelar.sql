-- 0058 · Pedidos, bloque A (F4·54, docs/PEDIDOS.md): número interno del pedido, envío único y cancelar el pedido.
--
-- · RPD-08: cada pedido (fila de alistamientos) tiene un número interno consecutivo (PED-0001…). Los que ya existen se numeran por fecha.
-- · RPD-16: la guía y el aviso de «listo para recoger» se envían una sola vez (solo se reintenta si el envío falló).
-- · RPD-17: el video y el documento se pueden reenviar durante 24 h desde el primer envío y mientras el pedido siga abierto.
-- · RPD-18: lo hace cumplir la base, también contra el doble clic: cada envío reserva su lugar 90 s hasta que el receptor termina.
-- · RPD-19: el asesor cancela el pedido con motivo antes de que salga la guía; la oportunidad pasa a Perdida.

create sequence public.pedido_numero_seq;

alter table public.alistamientos
  add column numero               bigint,
  add column primer_video_en      timestamptz,
  add column primer_documento_en  timestamptz,
  add column envios_en_curso      jsonb not null default '{}',
  add column cancelado_en         timestamptz,
  add column cancelado_por        uuid references public.usuarios (id) on delete set null,
  add column cancelado_motivo     text check (length(cancelado_motivo) <= 120),
  add check ((cancelado_en is null) = (cancelado_motivo is null));

with n as (select id, row_number() over (order by creado_en, id) as pos from public.alistamientos)
update public.alistamientos a set numero = n.pos from n where n.id = a.id;
select setval('public.pedido_numero_seq', coalesce((select max(numero) from public.alistamientos), 0) + 1, false);
alter table public.alistamientos
  alter column numero set default nextval('public.pedido_numero_seq'),
  alter column numero set not null,
  add constraint alistamientos_numero_unico unique (numero);

update public.alistamientos set primer_video_en = video_enviado_en, primer_documento_en = documento_enviado_en;

-- La hora del primer envío no se pisa con los reenvíos: de ahí se cuentan las 24 h.
create function public.alistamiento_primeros_envios() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.video_enviado_en is not null and new.video_enviado_en is distinct from old.video_enviado_en then
    new.primer_video_en := coalesce(old.primer_video_en, new.video_enviado_en);
  end if;
  if new.documento_enviado_en is not null and new.documento_enviado_en is distinct from old.documento_enviado_en then
    new.primer_documento_en := coalesce(old.primer_documento_en, new.documento_enviado_en);
  end if;
  return new;
end $$;
create trigger alistamientos_primeros_envios before update on public.alistamientos
  for each row execute function public.alistamiento_primeros_envios();

-- --------------------------------------------------------------------------- --
-- Antes de cada envío: permiso, pedido propio, pedido vivo, envío único (RPD-16), 24 h (RPD-17) y reserva (RPD-18)
-- --------------------------------------------------------------------------- --
create or replace function public.alistamiento_para_enviar(p_id bigint, p_que text) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; entrega text; cerrada boolean; primer timestamptz; reservado timestamptz;
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
  -- RPD-17: video y documento, 24 h desde el primer envío y solo con el pedido abierto
  primer := case p_que when 'video' then a.primer_video_en when 'documento' then a.primer_documento_en end;
  if primer is not null and (clock_timestamp() - primer > interval '24 hours' or cerrada) then
    raise exception 'El % ya se le envió al cliente y solo se puede reenviar durante las 24 horas siguientes, con el pedido abierto.',
      case p_que when 'video' then 'video' else 'documento' end;
  end if;
  -- RPD-18: dos clics (o dos asesores) a la vez no mandan el mismo envío dos veces
  reservado := (a.envios_en_curso ->> p_que)::timestamptz;
  if reservado is not null and clock_timestamp() - reservado < interval '90 seconds' then
    raise exception 'Ese envío ya está en curso: espera unos segundos.';
  end if;
  update alistamientos set envios_en_curso = envios_en_curso || jsonb_build_object(p_que, clock_timestamp()) where id = p_id;
  return jsonb_build_object('lead', a.lead_id, 'alistamiento', a.id, 'que', p_que);
end $$;

-- --------------------------------------------------------------------------- --
-- «📦 Enviar guía»: solo mientras la guía no se haya enviado, y no en un pedido cancelado
-- --------------------------------------------------------------------------- --
create or replace function public.alistamiento_guia(p_id bigint, p_ruta text, p_transportadora text, p_numero text) returns jsonb
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
  if a.cancelado_en is not null then
    raise exception 'El pedido está cancelado.';
  end if;
  if a.guia_enviada_en is not null then
    raise exception 'La guía ya se le envió al cliente: se envía una sola vez.';
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

-- «✅ Entregado» (tienda): una sola vez y no en un pedido cancelado
create or replace function public.alistamiento_entregado(p_id bigint) returns void
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
  if a.cancelado_en is not null then
    raise exception 'El pedido está cancelado.';
  end if;
  if a.entregado_en is not null then
    raise exception 'Este pedido ya se marcó como entregado.';
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

-- --------------------------------------------------------------------------- --
-- RPD-19 · «Cancelar pedido»: el cliente dice «ya no compro» o hay una novedad
-- --------------------------------------------------------------------------- --
create function public.alistamiento_cancelar(p_id bigint, p_motivo text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; perdida bigint; quien text; m text := btrim(coalesce(p_motivo, ''));
begin
  perform exigir_permiso('gestionar_oportunidades');
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if not puede_ver_lead(a.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if a.cancelado_en is not null then
    raise exception 'Este pedido ya está cancelado.';
  end if;
  if a.guia_en is not null or a.entregado_en is not null then
    raise exception 'El pedido ya salió: no se cancela. Atiéndelo como una devolución en Pos Venta.';
  end if;
  if m = '' or length(m) > 120 then
    raise exception 'Escribe el motivo de la cancelación.';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  update alistamientos set cancelado_en = now(), cancelado_por = auth.uid(), cancelado_motivo = m, envios_en_curso = '{}' where id = p_id;
  update leads set etiquetas = array_remove(coalesce(etiquetas, '{}'), 'Listo-Para-Despachar') where id = a.lead_id;
  select e.id into perdida from etapas e join oportunidades o on o.embudo_id = e.embudo_id
   where o.id = a.oportunidad_id and e.cierre = 'perdida' order by e.orden limit 1;
  if perdida is not null and exists (select 1 from oportunidades where id = a.oportunidad_id and estado = 'abierta') then
    perform mover_oportunidad(a.oportunidad_id, perdida, m);
  end if;
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('cancelado', m),
                      format('🚫 Pedido PED-%s cancelado por %s: %s', lpad(a.numero::text, 4, '0'), coalesce(quien, 'un asesor'), m));
end $$;
revoke execute on function public.alistamiento_cancelar(bigint, text) from public, anon;
grant execute on function public.alistamiento_cancelar(bigint, text) to authenticated;

-- La columna nueva `numero` chocaba con la variable `numero` de esta función (0054): se renombra la variable. Todo lo demás igual.
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
  select nombre into quien from usuarios where id = auth.uid();
  update alistamientos set doc_tipo = p_tipo, doc_numero = v_doc, doc_por = auth.uid(), doc_en = now() where id = p_id;
  perform lead_evento(a.lead_id, 'alistamiento', jsonb_build_object('doc', a.doc_tipo || ' ' || coalesce(a.doc_numero, '')),
                      jsonb_build_object('doc', p_tipo || ' ' || v_doc),
                      format('Documento del pedido: %s %s (lo puso %s)', p_tipo, v_doc, coalesce(quien, 'un asesor')));
end $$;

-- 0076 · F4·71 (RB-23 a RB-29): el asesor envía la ficha técnica de un equipo del inventario desde el chat (botón «+» o «/»).
-- herramientas_chat suma la lista 'equipos' (con stock) y herramienta_chat acepta el tipo 'equipo' (ref = código del producto).
-- El resto de las dos funciones queda igual que en la 0064; el receptor arma y envía la ficha (/interno/herramienta).

create or replace function public.herramientas_chat() returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('atender_bandeja');
  return jsonb_build_object(
    'catalogos', coalesce((select jsonb_agg(jsonb_build_object('ref', c.id::text, 'nombre', c.nombre,
                                                             'detalle', case when c.tipo = 'pdf' then 'PDF' else 'Enlace de Drive' end)
                                            order by c.todos desc, c.nombre)
                             from catalogos c where c.activo), '[]'::jsonb),
    'acciones', coalesce((select jsonb_agg(jsonb_build_object('ref', a.id::text, 'nombre', a.nombre,
                                                            'detalle', (select string_agg(distinct case x ->> 'tipo'
                                                                          when 'texto' then 'texto' when 'conocimiento' then 'ficha de conocimiento'
                                                                          when 'cuentas' then 'cuentas para pagar' when 'archivo' then 'archivo'
                                                                          when 'catalogo' then 'catálogo' end, ' + ')
                                                                          from jsonb_array_elements(a.hacer) x))
                                           order by a.prioridad, a.nombre)
                            from acciones a where a.activa and accion_solo_envia(a.hacer)), '[]'::jsonb),
    'flujos', jsonb_build_array(
                jsonb_build_object('ref', 'compra', 'nombre', 'Iniciar compra', 'detalle', 'cuentas, comprobante y despacho'),
                jsonb_build_object('ref', 'cotizacion', 'nombre', 'Cotización', 'detalle', 'el bot arma la cotización en PDF'))
              || coalesce((select jsonb_agg(jsonb_build_object('ref', 'bot:' || b.id, 'nombre', 'Bot «' || b.nombre || '»',
                                                             'detalle', 'desde su inicio') order by b.nombre)
                             from bots b where not b.archivado
                               and exists (select 1 from bot_flujos f where f.bot_id = b.id and f.estado = 'publicada')), '[]'::jsonb),
    -- F4·71 (RB-23): equipos con stock para enviar su ficha técnica. Nunca uno agotado (RAG-46).
    'equipos', coalesce((select jsonb_agg(jsonb_build_object(
                  'ref', p.codigo,
                  'nombre', p.codigo || ' · ' || trim(coalesce(p.marca, '') || ' ' || coalesce(p.modelo, '')),
                  'detalle', concat_ws(' · ', nullif(trim(p.procesador), ''), nullif(trim(p.ram), ''), nullif(trim(p.almacenamiento), ''),
                                       '$' || replace(to_char(p.precio, 'FM999,999,999'), ',', '.'),
                                       case when coalesce(p.foto_ruta, '') <> '' or coalesce(p.foto, '') <> ''
                                            then '📷 ' || (1 + coalesce(cardinality(p.fotos_extra), 0)) end))
                  order by p.marca, p.modelo, p.codigo)
                  from productos p where p.stock > 0 and coalesce(p.codigo, '') <> ''), '[]'::jsonb)
  );
end $$;

create or replace function public.herramienta_chat(p_lead bigint, p_tipo text, p_ref text, p_al_terminar text default 'asesor')
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; nombre_ref text; ultimo timestamptz; detalle text;
begin
  perform exigir_permiso('atender_bandeja');
  l := lead_a_cargo(p_lead);
  if p_al_terminar not in ('asesor', 'bot') then
    raise exception 'Al terminar: «asesor» o «bot».';
  end if;

  if p_tipo = 'catalogo' then
    select c.nombre into nombre_ref from catalogos c where c.id::text = p_ref and c.activo;
    if nombre_ref is null then raise exception 'Ese catálogo no existe o está desactivado.'; end if;
    detalle := '📚 Catálogo «' || nombre_ref || '»';
  elsif p_tipo = 'accion' then
    select a.nombre into nombre_ref from acciones a where a.id::text = p_ref and a.activa and accion_solo_envia(a.hacer);
    if nombre_ref is null then raise exception 'Esa acción no existe, está apagada o no se puede enviar desde el chat.'; end if;
    detalle := '⚡ Acción «' || nombre_ref || '»';
  elsif p_tipo = 'equipo' then
    -- F4·71 (RB-23): solo equipos con stock.
    select trim(coalesce(p.marca, '') || ' ' || coalesce(p.modelo, '')) || ' (' || p.codigo || ')' into nombre_ref
      from productos p where p.codigo = p_ref and p.stock > 0;
    if nombre_ref is null then raise exception 'Ese equipo no existe o ya no tiene stock.'; end if;
    detalle := '📋 Ficha técnica «' || nombre_ref || '»';
  elsif p_tipo = 'flujo' then
    if p_ref = 'compra' then nombre_ref := 'Iniciar compra';
    elsif p_ref = 'cotizacion' then nombre_ref := 'Cotización';
    elsif p_ref ~ '^bot:[0-9]+$' then
      select 'Bot «' || b.nombre || '»' into nombre_ref from bots b
       where b.id = substr(p_ref, 5)::bigint and not b.archivado
         and exists (select 1 from bot_flujos f where f.bot_id = b.id and f.estado = 'publicada');
    end if;
    if nombre_ref is null then raise exception 'Ese flujo no existe o el bot no está publicado.'; end if;
    detalle := '🧭 Flujo «' || nombre_ref || '» · al terminar: ' || case p_al_terminar when 'asesor' then 'vuelve al asesor' else 'sigue el bot' end;
  else
    raise exception 'Tipo no válido: %', p_tipo;
  end if;

  -- RB-12 (RB-02): sin las 24 h de WhatsApp no se puede escribir libre.
  select max(creado_en) into ultimo from mensajes where lead_id = p_lead and lado = 'cliente';
  if ultimo is null or ultimo < now() - interval '24 hours' then
    raise exception 'Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo deja escribirle con una plantilla.';
  end if;

  if p_tipo = 'flujo' then
    -- RB-09: el bot hace el tramo. RB-09b: con «Vuelve a mí», al pasar a asesor el chat vuelve a quien lo disparó (24 h).
    update leads set estado_chat = 'bot', pausar_bot = false, asignado_a = null, errores_bot = 0, retorno_pendiente = null,
                     estado_bot = case when p_al_terminar = 'asesor'
                                       then coalesce(estado_bot, '{}'::jsonb) || jsonb_build_object('volver_a',
                                              jsonb_build_object('usuario', auth.uid(), 'hasta', now() + interval '24 hours'))
                                       else coalesce(estado_bot, '{}'::jsonb) - 'volver_a' end
     where id = p_lead;
  else
    -- RB-01: como al responder, el asesor toma la conversación y el bot no contesta.
    update leads set asignado_a = coalesce(l.asignado_a, auth.uid()), estado_chat = 'asignada', pausar_bot = true,
                     en_cola_desde = coalesce(l.en_cola_desde, now()), primera_respuesta_en = coalesce(l.primera_respuesta_en, now())
     where id = p_lead;
  end if;

  perform lead_evento(p_lead, 'herramienta', null,
                      jsonb_build_object('tipo', p_tipo, 'ref', p_ref, 'nombre', nombre_ref, 'al_terminar', p_al_terminar), detalle);
  return jsonb_build_object('usuario', auth.uid(), 'nombre', nombre_ref, 'detalle', detalle);
end $$;

comment on function public.herramienta_chat(bigint, text, text, text) is
  'F4·61 y F4·71: el asesor envía un catálogo, una acción, la ficha de un equipo o dispara un flujo desde el chat; el receptor hace el envío.';

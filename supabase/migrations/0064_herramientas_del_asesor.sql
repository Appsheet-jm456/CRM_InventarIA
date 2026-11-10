-- 0064 · El asesor envía catálogos y dispara acciones y flujos desde el chat (F4·61, docs/MEJORAS-CHAT-Y-PAGOS.md, RB-07 a RB-12).
--
-- · `herramientas_chat()` lista lo que el asesor puede usar con «/» o el botón ⚡: catálogos activos, Acciones activas que solo
--   envían cosas (texto, fichas de conocimiento, cuentas, archivo, catálogo, etiqueta) y flujos (compra, cotización y los bots
--   publicados). Security definer: el asesor no tiene permiso para leer `acciones` ni `bots`.
-- · `herramienta_chat(lead, tipo, ref, al_terminar)` revisa permiso, que la conversación sea suya (RB-12) y la ventana de 24 h, y
--   deja el chat como corresponde: catálogo o acción → la toma el asesor, como al responder (RB-01); flujo → el bot hace ese tramo
--   (RB-09) y, con «Vuelve a mí», guarda `estado_bot.volver_a` para que al pasar a asesor el chat vuelva a él (RB-09b). Lo anota en
--   la línea de tiempo (tipo de evento nuevo «herramienta»). El envío lo hace el receptor (/interno/herramienta).

alter table public.lead_eventos drop constraint lead_eventos_tipo_check;
alter table public.lead_eventos add constraint lead_eventos_tipo_check check (tipo = any (array[
  'etapa', 'oportunidad', 'responsable', 'nombre', 'valor', 'etiquetas', 'atributo', 'archivado', 'desarchivado', 'eliminado',
  'restaurado', 'tarea', 'tarea_cumplida', 'nota', 'ficha', 'retorno', 'pago', 'alistamiento', 'herramienta']));

-- Pasos de una Acción que el asesor puede disparar: solo envían algo o ponen una etiqueta (RB-08).
create or replace function public.accion_solo_envia(p_hacer jsonb) returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(p_hacer) = 'array'
     and exists (select 1 from jsonb_array_elements(p_hacer) x where x ->> 'tipo' in ('texto', 'conocimiento', 'cuentas', 'archivo', 'catalogo'))
     and not exists (select 1 from jsonb_array_elements(p_hacer) x
                      where coalesce(x ->> 'tipo', '') not in ('texto', 'conocimiento', 'cuentas', 'archivo', 'catalogo', 'etiqueta'))
$$;

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
                               and exists (select 1 from bot_flujos f where f.bot_id = b.id and f.estado = 'publicada')), '[]'::jsonb)
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

revoke all on function public.herramientas_chat() from public, anon;
revoke all on function public.herramienta_chat(bigint, text, text, text) from public, anon;
grant execute on function public.herramientas_chat() to authenticated;
grant execute on function public.herramienta_chat(bigint, text, text, text) to authenticated;
comment on function public.herramienta_chat(bigint, text, text, text) is
  'F4·61 (RB-07 a RB-12): el asesor envía un catálogo, una acción o dispara un flujo desde el chat; el receptor hace el envío.';

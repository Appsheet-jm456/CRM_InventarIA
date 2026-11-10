-- 0067 · Pago completo o pago parcial al validar el comprobante (F4·59, docs/MEJORAS-CHAT-Y-PAGOS.md, RPD-41 a RPD-49).
--
-- · `validar_comprobante(lead, valor)`: sin valor (o igual al saldo) es **pago completo** por lo que falta; con un valor menor que el
--   saldo es un **abono** (RPD-42/43): queda en `pagos`, la compra guarda pagado y saldo, etiqueta Saldo-Pendiente y la oportunidad
--   sigue en Esperando pago (RPD-45). El receptor le escribe al cliente con el saldo y espera el siguiente soporte (RPD-44, RPD-46).
-- · `despachar_con_saldo(lead, motivo)`: la excepción del dueño (RPD-45b): arranca el despacho sin el saldo completo, con motivo.
-- · `agente_config.texto_abono`: el mensaje al cliente, editable en Agente → Compra ({abono}, {pagado}, {saldo}, {total}).
-- Lo pagado sale de la tabla `pagos` del pedido (cuenta también los pagos a mano) o, sin oportunidad, de la compra.

alter table public.agente_config add column texto_abono text not null
  default '✅ Recibimos tu abono de *{abono}*. Queda pendiente un saldo de *{saldo}* (total {total}). Quedamos atentos al soporte faltante. 🙌'
  check (length(texto_abono) <= 1000);
grant select (texto_abono), update (texto_abono) on public.agente_config to authenticated;

-- La oportunidad abierta del embudo con compra (la misma que usan validar_comprobante y compra_ir_a).
create or replace function public.compra_oportunidad(p_lead bigint) returns bigint
language sql stable security definer
set search_path = public, pg_temp
as $$
  select o.id from oportunidades o join embudos e on e.id = o.embudo_id join compra_etapas ce on ce.embudo_id = o.embudo_id
   where o.lead_id = p_lead and o.estado = 'abierta' order by e.predeterminado, o.creado_en desc limit 1
$$;
revoke all on function public.compra_oportunidad(bigint) from public, anon, authenticated;

create or replace function public.compra_pagado(p_lead bigint, p_compra jsonb) returns numeric
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when compra_oportunidad(p_lead) is null then coalesce((p_compra ->> 'pagado')::numeric, 0)
              else coalesce((select sum(valor) from pagos where oportunidad_id = compra_oportunidad(p_lead) and anulado_en is null), 0) end
$$;
revoke all on function public.compra_pagado(bigint, jsonb) from public, anon, authenticated;

drop function public.validar_comprobante(bigint);
create function public.validar_comprobante(p_lead bigint, p_valor numeric default null) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; c jsonb; quien text; op_id bigint; soporte mensajes; total numeric; pagado numeric; saldo numeric; valor numeric;
        abono boolean;
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
  if c ->> 'validacion' in ('validado', 'abono') then
    raise exception 'Este comprobante ya se validó.';
  end if;
  total := coalesce((c ->> 'total')::numeric, 0);
  pagado := compra_pagado(p_lead, c);
  saldo := greatest(total - pagado, 0);
  abono := p_valor is not null;
  if abono then
    valor := round(p_valor, 2);
    if valor <= 0 then
      raise exception 'Escribe cuánto pagó.';
    end if;
    if valor >= saldo then
      raise exception 'Ese valor cubre todo el saldo (%): usa «Pago completo».', pesos_texto(saldo);
    end if;
  else
    valor := saldo;
  end if;

  select nombre into quien from usuarios where id = auth.uid();
  op_id := compra_oportunidad(p_lead);
  -- RPD-33 y RPD-43: el soporte que mandó el cliente queda como pago del pedido.
  select * into soporte from mensajes where lead_id = p_lead and lado = 'cliente' and coalesce(media_ruta, '') <> '' order by creado_en desc limit 1;
  if op_id is not null and valor > 0 then
    insert into pagos (lead_id, oportunidad_id, valor, medio, fecha_pago, origen, soporte_bucket, soporte_ruta, soporte_mime, registrado_por, nota)
    values (p_lead, op_id, valor, 'Transferencia', (now() at time zone 'America/Bogota')::date, 'whatsapp',
            case when soporte.media_ruta is not null then 'media' end, soporte.media_ruta, soporte.media_mime, auth.uid(),
            case when abono then 'Abono validado en el chat' end);
  end if;

  if abono then
    update leads set
      estado_bot = jsonb_set(estado_bot, '{compra}', c || jsonb_build_object('validacion', 'abono', 'abono', valor, 'pagado', pagado + valor,
                                                                               'saldo', saldo - valor, 'validado_por', quien, 'validado_en', now())),
      etiquetas = compra_quitar_etiquetas(etiquetas, '{Comprobante-Por-Validar,Comprobante-Rechazado,Saldo-Pendiente}') || '{Saldo-Pendiente}'::text[]
    where id = p_lead;
    perform compra_ir_a(p_lead, 'esperando_pago');
    perform lead_evento(p_lead, 'pago', null, jsonb_build_object('validacion', 'abono', 'abono', valor, 'pagado', pagado + valor, 'saldo', saldo - valor),
                        format('◐ Abono de %s validado por %s · pagado %s · saldo %s', pesos_texto(valor), coalesce(quien, 'un usuario'),
                               pesos_texto(pagado + valor), pesos_texto(saldo - valor)));
    return jsonb_build_object('total', total, 'abono', valor, 'pagado', pagado + valor, 'saldo', saldo - valor);
  end if;

  update leads set
    estado_bot = jsonb_set(estado_bot, '{compra}', c || jsonb_build_object('validacion', 'validado', 'validado_por', quien, 'validado_en', now(),
                                                                             'pagado', pagado + valor, 'saldo', 0)),
    etiquetas = compra_quitar_etiquetas(etiquetas, '{Comprobante-Por-Validar,Comprobante-Rechazado,Saldo-Pendiente}')
                || case when 'Pago-Validado' = any(coalesce(etiquetas, '{}')) then '{}'::text[] else '{Pago-Validado}' end
  where id = p_lead;
  perform compra_ir_a(p_lead, 'pago_validado');
  perform lead_evento(p_lead, 'pago', null, jsonb_build_object('validacion', 'validado', 'total', total, 'valor', valor),
                      format('Comprobante validado por %s (total %s%s)', coalesce(quien, 'un usuario'), pesos_texto(total),
                             case when pagado > 0 then ', saldo final ' || pesos_texto(valor) else '' end));
  return jsonb_build_object('total', total, 'valor', valor);
end $$;
revoke all on function public.validar_comprobante(bigint, numeric) from public, anon;
grant execute on function public.validar_comprobante(bigint, numeric) to authenticated;

-- RPD-45b: cliente excepcional, se despacha sin el saldo completo. Con motivo; la alerta de saldo sigue en Pedidos.
create or replace function public.despachar_con_saldo(p_lead bigint, p_motivo text) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; c jsonb; quien text; saldo numeric; motivo text := btrim(coalesce(p_motivo, ''));
begin
  perform exigir_permiso('validar_pagos');
  if motivo = '' or length(motivo) > 200 then
    raise exception 'Escribe el motivo (máximo 200 caracteres).';
  end if;
  l := lead_a_cargo(p_lead);
  c := l.estado_bot -> 'compra';
  if coalesce(c ->> 'paso', '') not in ('esperando_pago', 'pago_por_confirmar') or coalesce((c ->> 'pagado')::numeric, 0) <= 0 then
    raise exception 'Este cliente no tiene un abono con saldo pendiente.';
  end if;
  if c ->> 'validacion' in ('validado', 'abono') then
    raise exception 'Espera a que el bot le avise al cliente del abono y vuelve a intentarlo.';
  end if;
  saldo := greatest(coalesce((c ->> 'total')::numeric, 0) - compra_pagado(p_lead, c), 0);
  if saldo <= 0 then
    raise exception 'No hay saldo pendiente: valida el comprobante como pago completo.';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  update leads set
    estado_bot = jsonb_set(estado_bot, '{compra}', c || jsonb_build_object('paso', 'pago_por_confirmar', 'validacion', 'validado', 'con_saldo', true,
                                                                             'saldo', saldo, 'motivo_saldo', motivo, 'validado_por', quien, 'validado_en', now())),
    etiquetas = compra_quitar_etiquetas(etiquetas, '{Comprobante-Por-Validar,Comprobante-Rechazado}')
                || case when 'Pago-Validado' = any(coalesce(etiquetas, '{}')) then '{}'::text[] else '{Pago-Validado}' end
                || case when 'Saldo-Pendiente' = any(coalesce(etiquetas, '{}')) then '{}'::text[] else '{Saldo-Pendiente}' end
  where id = p_lead;
  perform compra_ir_a(p_lead, 'pago_validado');
  perform lead_evento(p_lead, 'pago', null, jsonb_build_object('validacion', 'con_saldo', 'saldo', saldo, 'motivo', motivo),
                      format('🚚 Despacho con saldo pendiente de %s autorizado por %s: %s', pesos_texto(saldo), coalesce(quien, 'un usuario'), motivo));
  return jsonb_build_object('saldo', saldo);
end $$;
revoke all on function public.despachar_con_saldo(bigint, text) from public, anon;
grant execute on function public.despachar_con_saldo(bigint, text) to authenticated;

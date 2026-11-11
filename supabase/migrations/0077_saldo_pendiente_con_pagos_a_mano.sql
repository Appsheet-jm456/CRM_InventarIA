-- 0077 · F4·59 (RPD-47b y RPD-47c): la etiqueta Saldo-Pendiente sigue al saldo del pedido también con los pagos a mano.
-- Antes, tras «Despachar con saldo pendiente» (RPD-45b), el saldo se pagaba con «Registrar pago» y la etiqueta se quedaba aunque el
-- saldo llegara a $0. Ahora, al registrar o anular un pago, la base compara lo pagado con el total del pedido (el mismo cálculo de
-- Pedidos: valor de la oportunidad o, si no tiene, la última cotización):
--   · pagado ≥ total y tenía Saldo-Pendiente → se quita y queda «✅ Saldo pagado» en el historial (RPD-47b).
--   · pagado < total, algo pagado y Pago-Validado sin Saldo-Pendiente (se anuló un pago de un pedido ya validado) → vuelve (RPD-47c).
-- No le escribe al cliente ni toca el bot. pago_registrar y pago_anular quedan iguales que en la 0061 más esa llamada al final.

create or replace function public.pago_conciliar_saldo(p_oportunidad bigint) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare op oportunidades; total numeric; pagado numeric; etiq text[];
begin
  select * into op from oportunidades where id = p_oportunidad;
  if not found or op.lead_id is null then return; end if;
  total := coalesce(op.valor_estimado, (select c.total from cotizaciones c where c.lead_id = op.lead_id order by c.creado_en desc limit 1));
  if total is null or total <= 0 then return; end if;
  pagado := coalesce((select sum(valor) from pagos where oportunidad_id = p_oportunidad and anulado_en is null), 0);
  select coalesce(etiquetas, '{}') into etiq from leads where id = op.lead_id;
  if pagado >= total and 'Saldo-Pendiente' = any(etiq) then
    update leads set etiquetas = compra_quitar_etiquetas(etiquetas, '{Saldo-Pendiente}') where id = op.lead_id;
    perform lead_evento(op.lead_id, 'pago', null, jsonb_build_object('saldo', 0, 'pagado', pagado, 'total', total),
                        format('✅ Saldo pagado: %s de %s · el pedido quedó al día', pesos_texto(pagado), pesos_texto(total)));
  elsif pagado > 0 and pagado < total and 'Pago-Validado' = any(etiq) and not 'Saldo-Pendiente' = any(etiq) then
    update leads set etiquetas = coalesce(etiquetas, '{}') || '{Saldo-Pendiente}' where id = op.lead_id;
    perform lead_evento(op.lead_id, 'pago', null, jsonb_build_object('saldo', total - pagado, 'pagado', pagado, 'total', total),
                        format('◐ Vuelve a quedar saldo pendiente: %s', pesos_texto(total - pagado)));
  end if;
end $$;
revoke all on function public.pago_conciliar_saldo(bigint) from public, anon, authenticated;

create or replace function public.pago_registrar(p_oportunidad bigint, p_valor numeric, p_medio text, p_fecha date, p_referencia text,
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
  perform pago_conciliar_saldo(p_oportunidad);  -- 0077 (RPD-47b): al quedar al día se quita Saldo-Pendiente
  return nuevo;
end $$;

create or replace function public.pago_anular(p_id bigint, p_motivo text) returns void
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
  if p.oportunidad_id is not null then
    perform pago_conciliar_saldo(p.oportunidad_id);  -- 0077 (RPD-47c): si vuelve a faltar saldo, vuelve Saldo-Pendiente
  end if;
end $$;

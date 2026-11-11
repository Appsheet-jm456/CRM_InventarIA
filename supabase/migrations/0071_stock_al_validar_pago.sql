-- 0071 · Equipo vendido: el stock baja con el primer pago validado (F4·66, docs/MEJORAS-CHAT-Y-PAGOS.md RPD-50 a RPD-52).
--
-- Problema del dueño (11 nov 2026): dos clientes compran el mismo LENOVO T490 (stock 1) y los dos pagan: se vendía doble, porque validar
-- el pago no tocaba el stock. Ahora, cuando validar_comprobante deja la compra en «validado» (pago completo) o «abono» (pago parcial),
-- cada equipo del pedido baja una unidad, una sola vez por pedido (la marca `stock_descontado` queda en la compra). Nunca baja de 0: si
-- ya estaba en 0 (otro cliente pagó primero), queda el aviso en la línea de tiempo para el asesor (RPD-51).
-- Se hace con un disparador sobre leads para no copiar validar_comprobante: corre en la misma transacción que registra el pago.

create or replace function public.compra_descontar_stock() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c jsonb; codigos text[]; cod text; nombre text; quedaba integer; sin_stock text[] := '{}';
begin
  c := new.estado_bot -> 'compra';
  if c is null or coalesce(c ->> 'validacion', '') not in ('validado', 'abono')
     or coalesce((c ->> 'stock_descontado')::boolean, false)
     or (old.estado_bot -> 'compra' ->> 'validacion') is not distinct from (c ->> 'validacion') then
    return new;
  end if;
  -- Los equipos del pedido: la lista del carrito o el equipo único. Cada renglón es una unidad.
  select coalesce(array_agg(e ->> 'codigo'), '{}') into codigos
    from jsonb_array_elements(case when jsonb_typeof(c -> 'equipos') = 'array' and jsonb_array_length(c -> 'equipos') > 0
                                   then c -> 'equipos' else jsonb_build_array(jsonb_build_object('codigo', c ->> 'codigo')) end) e
   where coalesce(e ->> 'codigo', '') <> '';
  foreach cod in array codigos loop
    select stock, btrim(marca || ' ' || modelo) into quedaba, nombre from productos where upper(btrim(codigo)) = upper(btrim(cod)) for update;
    if not found then
      continue;
    end if;
    if quedaba <= 0 then
      sin_stock := sin_stock || format('%s (%s)', nombre, cod);
    else
      update productos set stock = stock - 1 where upper(btrim(codigo)) = upper(btrim(cod));
    end if;
  end loop;
  new.estado_bot := jsonb_set(new.estado_bot, '{compra,stock_descontado}', 'true');
  if cardinality(codigos) > 0 then
    perform lead_evento(new.id, 'pago', null, jsonb_build_object('codigos', codigos, 'sin_stock', sin_stock),
      case when cardinality(sin_stock) > 0
           then '⚠ Se validó un pago de un equipo sin stock: ' || array_to_string(sin_stock, ', ') || '. Resuélvelo con el cliente.'
           else '📦 Stock descontado por el pago validado: ' || array_to_string(codigos, ', ') end);
  end if;
  return new;
end $$;
revoke all on function public.compra_descontar_stock() from public, anon, authenticated;

create trigger leads_descontar_stock before update of estado_bot on public.leads
  for each row execute function public.compra_descontar_stock();

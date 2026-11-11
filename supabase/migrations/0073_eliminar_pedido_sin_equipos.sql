-- 0073 · Eliminar pedido: pedido sin equipos y sin devolver dos veces el mismo descuento (F4·67, docs/PEDIDOS.md RPD-59).
--
-- Visto el 11 nov 2026 con el T490 de Jhonatan: al cancelar PED-0096 se abrió otra oportunidad (PED-0101) sin el código del equipo
-- (`oportunidades.producto` vacío), y el pago validado de esa compra sí descontó el T490. Con 0072, eliminar PED-0101 no devolvía nada,
-- y eliminar PED-0096 lo devolvía aunque su pago no fue el que descontó. Ahora:
-- · lo descontado del cliente desde que se abrió la oportunidad **menos lo que ya devolvió** otro «🗑 Pedido eliminado»;
-- · si el pedido tiene equipos, devuelve solo esos; si no tiene (el caso de PED-0101), devuelve todo lo descontado que quede.

create or replace function public.pedido_eliminar(p_id bigint, p_motivo text) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; o oportunidades; quien text; m text := btrim(coalesce(p_motivo, '')); descontados text[]; repuestos text[] := '{}';
        cod text; archivos jsonb; pedido_cods text[];
begin
  if not exists (select 1 from usuarios u join roles r on r.id = u.rol_id where u.id = auth.uid() and u.activo and r.nombre = 'administrador') then
    raise exception 'Solo un administrador puede eliminar pedidos.' using errcode = '42501';
  end if;
  if m = '' or length(m) > 120 then
    raise exception 'Escribe el motivo para eliminar el pedido.';
  end if;
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no existe o ya se eliminó.' using errcode = 'P0002';
  end if;
  select * into o from oportunidades where id = a.oportunidad_id for update;
  select nombre into quien from usuarios where id = auth.uid();

  -- RPD-59: lo que descontó F4·66 para este cliente desde que se abrió la oportunidad, menos lo que ya devolvió otro pedido eliminado.
  select coalesce(array_agg(upper(btrim(c))), '{}') into descontados
    from lead_eventos ev cross join lateral jsonb_array_elements_text(coalesce(ev.despues -> 'codigos', '[]')) c
   where ev.lead_id = a.lead_id and ev.tipo = 'pago' and ev.detalle like '📦 Stock descontado%' and ev.en >= o.creado_en - interval '1 hour';
  for cod in select upper(btrim(c)) from lead_eventos ev cross join lateral jsonb_array_elements_text(coalesce(ev.despues -> 'repuestos', '[]')) c
              where ev.lead_id = a.lead_id and ev.tipo = 'alistamiento' and ev.detalle like '🗑 Pedido %' and ev.en >= o.creado_en - interval '1 hour' loop
    if cod = any (descontados) then
      descontados := descontados[:array_position(descontados, cod) - 1] || descontados[array_position(descontados, cod) + 1:];
    end if;
  end loop;
  -- Con equipos, solo esos; sin equipos (oportunidad abierta sin el código), todo lo descontado que queda.
  select coalesce(array_agg(upper(btrim(x ->> 'codigo'))), '{}') into pedido_cods
    from jsonb_array_elements(a.equipos) x where coalesce(x ->> 'codigo', '') <> '';
  if cardinality(pedido_cods) = 0 then
    pedido_cods := descontados;
  end if;
  foreach cod in array pedido_cods loop
    if cod = any (descontados) then
      update productos set stock = stock + 1 where upper(btrim(codigo)) = cod;
      if found then
        repuestos := repuestos || cod;
        descontados := descontados[:array_position(descontados, cod) - 1] || descontados[array_position(descontados, cod) + 1:];
      end if;
    end if;
  end loop;

  -- Archivos que la app borra del almacenamiento (la base solo guarda la ruta).
  archivos := jsonb_strip_nulls(jsonb_build_object(
    'guias', case when a.guia_ruta is not null then jsonb_build_array(a.guia_ruta) end,
    'documentos', case when a.doc_ruta is not null then jsonb_build_array(a.doc_ruta) end,
    'videos-tecnicos', (select jsonb_agg(v.ruta) from alistamiento_videos v where v.alistamiento_id = a.id and coalesce(v.ruta, '') <> ''),
    'pagos', (select jsonb_agg(p.soporte_ruta) from pagos p where p.oportunidad_id = o.id and p.soporte_bucket = 'pagos' and coalesce(p.soporte_ruta, '') <> '')));

  delete from oportunidades where id = o.id;  -- en cascada: el pedido, sus videos, pagos e historial de etapas
  update leads set
    estado_bot = coalesce(estado_bot, '{}') - 'compra',
    etiquetas = array(select x from unnest(coalesce(etiquetas, '{}')) x
                      where x not in ('Pago-Validado', 'Saldo-Pendiente', 'Listo-Para-Despachar', 'Comprobante-Por-Validar',
                                      'Comprobante-Rechazado', 'Pago-Por-Confirmar', 'Compra-Iniciada'))
  where id = a.lead_id;
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('eliminado', m, 'repuestos', repuestos),
                      format('🗑 Pedido PED-%s eliminado por %s: %s · %s', lpad(a.numero::text, 4, '0'), coalesce(quien, 'un administrador'), m,
                             case when cardinality(repuestos) > 0 then 'stock devuelto: ' || array_to_string(repuestos, ', ')
                                  else 'sin stock que devolver' end));
  return jsonb_build_object('numero', a.numero, 'repuestos', repuestos, 'archivos', archivos);
end $$;
revoke all on function public.pedido_eliminar(bigint, text) from public, anon;
grant execute on function public.pedido_eliminar(bigint, text) to authenticated;

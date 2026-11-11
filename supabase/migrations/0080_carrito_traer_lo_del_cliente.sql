-- F4·72b: «Traer lo que eligió el cliente» en el carrito del asesor (docs/CARRITO-DEL-ASESOR.md, RCA-11 a RCA-13).
-- Solo LEE: junta lo que el cliente eligió con el bot (compra en curso, pedido abierto, último equipo cotizado) y lo devuelve
-- con el mismo formato del carrito; el asesor lo edita y lo guarda o envía como cualquier carrito.
create or replace function public.carrito_traer(p_lead bigint) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare l leads; c jsonb; o oportunidades; i jsonb; p productos; items jsonb := '[]'; origen text := null; vistos text[] := '{}';
        puede boolean := tiene_permiso('modificar_precios'); cod text; precio numeric; tipo text;
begin
  perform exigir_permiso('atender_bandeja');
  if not puede_ver_lead(p_lead) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  select * into l from leads where id = p_lead;
  -- 1) compra en curso con el bot (uno o varios equipos)
  c := l.estado_bot -> 'compra';
  if c is not null and jsonb_typeof(c) = 'object' then
    for i in select * from jsonb_array_elements(case when jsonb_typeof(c -> 'equipos') = 'array' and jsonb_array_length(c -> 'equipos') > 0
                                                  then c -> 'equipos'
                                                  else jsonb_build_array(jsonb_build_object('codigo', c ->> 'codigo', 'equipo', c ->> 'equipo', 'precio', c ->> 'precio')) end) loop
      if coalesce((i ->> 'libre')::boolean, false) then
        items := items || jsonb_build_array(jsonb_build_object('libre', true, 'codigo', i ->> 'codigo', 'equipo', i ->> 'equipo',
                                                               'precio', round(coalesce((i ->> 'precio')::numeric, 0))));
      elsif coalesce(i ->> 'codigo', '') <> '' then
        select * into p from productos where upper(codigo) = upper(i ->> 'codigo');
        if found and not (upper(p.codigo) = any(vistos)) then
          vistos := vistos || upper(p.codigo);
          precio := case when puede then round(coalesce((i ->> 'precio')::numeric, p.precio)) else round(p.precio) end;
          items := items || jsonb_build_array(jsonb_build_object('codigo', p.codigo, 'equipo', btrim(coalesce(p.marca, '') || ' ' || coalesce(p.modelo, '')),
            'precio', precio, 'precio_base', p.precio, 'estado', p.estado, 'stock', p.stock, 'usado', carrito_lleva_configuracion(p.estado)));
        end if;
      end if;
    end loop;
    if jsonb_array_length(items) > 0 then origen := 'la compra en curso con el bot'; end if;
    tipo := case c ->> 'tipo' when 'cliente_final' then 'Cliente final' when 'distribuidor' then 'Distribuidor' end;
  end if;
  -- 2) pedido abierto (el campo producto trae los códigos) y 3) último equipo cotizado
  if jsonb_array_length(items) = 0 then
    select * into o from oportunidades where lead_id = p_lead and estado = 'abierta' order by creado_en desc limit 1;
    for cod in select distinct upper(btrim(x)) from unnest(
        regexp_split_to_array(coalesce(nullif(o.producto, ''), l.cotiz_producto, ''), '[,;/\s]+')) x where btrim(x) <> '' loop
      select * into p from productos where upper(codigo) = cod;
      if found and not (upper(p.codigo) = any(vistos)) then
        vistos := vistos || upper(p.codigo);
        items := items || jsonb_build_array(jsonb_build_object('codigo', p.codigo, 'equipo', btrim(coalesce(p.marca, '') || ' ' || coalesce(p.modelo, '')),
          'precio', round(p.precio), 'precio_base', p.precio, 'estado', p.estado, 'stock', p.stock, 'usado', carrito_lleva_configuracion(p.estado)));
      end if;
    end loop;
    if jsonb_array_length(items) > 0 then
      origen := case when o.id is not null and coalesce(o.producto, '') <> '' then 'su pedido abierto' else 'el último equipo que cotizó' end;
    end if;
  end if;
  return jsonb_build_object('items', items, 'origen', origen, 'tipo', tipo);
end $$;
revoke all on function public.carrito_traer(bigint) from public, anon;
grant execute on function public.carrito_traer(bigint) to authenticated;

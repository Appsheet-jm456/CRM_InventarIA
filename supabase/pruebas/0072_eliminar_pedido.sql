-- Pruebas de la migración 0072 (F4·67, REP-01 a REP-06): eliminar un pedido (solo administrador) y devolver el stock. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into productos (codigo, marca, modelo, precio, stock) values
  ('PRUEBA-0072-A', 'LENOVO', 'T490', 950000, 1), ('PRUEBA-0072-B', 'DELL', '5420', 1400000, 1), ('PRUEBA-0072-C', 'HP', '840', 900000, 0);

insert into leads (telefono, nombre, etapa, atributos, etiquetas, estado_bot) values
  ('570000072001', 'Ana Prueba', 'Nuevo', '{"venta_online": true}', '{Pago-Validado,Cliente-Fiel}',
   '{"compra": {"paso": "pago_por_confirmar", "total": 2350000, "equipos": [{"codigo": "PRUEBA-0072-A"}, {"codigo": "PRUEBA-0072-B"}]}}'),
  ('570000072002', 'Beto Viejo', 'Nuevo', '{"venta_online": true}', '{}', '{}');
select id as ana from leads where telefono = '570000072001' \gset
select id as beto from leads where telefono = '570000072002' \gset
select abrir_oportunidad_interna(:ana, 1) as o1 \gset
select abrir_oportunidad_interna(:beto, 1) as o2 \gset
insert into alistamientos (oportunidad_id, lead_id, equipos) values
  (:o1, :ana, '[{"codigo": "PRUEBA-0072-A", "nombre": "LENOVO T490"}, {"codigo": "PRUEBA-0072-B", "nombre": "DELL 5420"}]')
  on conflict (oportunidad_id) do update set equipos = excluded.equipos returning id as p1 \gset
insert into alistamientos (oportunidad_id, lead_id, equipos) values (:o2, :beto, '[{"codigo": "PRUEBA-0072-C", "nombre": "HP 840"}]')
  on conflict (oportunidad_id) do update set equipos = excluded.equipos returning id as p2 \gset

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select validar_comprobante(:ana);  -- F4·66: A y B quedan en stock 0
reset role;
insert into pagos (lead_id, oportunidad_id, valor, medio, fecha_pago, origen) values (:beto, :o2, 900000, 'Efectivo en tienda', current_date, 'manual');
select case when (select array_agg(stock order by codigo) = '{0,0}' from productos where codigo in ('PRUEBA-0072-A', 'PRUEBA-0072-B'))
            then 'ok' else 'not ok' end || ' 1 - el pago de prueba dejó los dos equipos en stock 0 (F4·66)';

-- REP-01: un asesor no puede
-- (un usuario que no es administrador: un id que no tiene ese rol)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
select case when pg_temp.falla(format('select pedido_eliminar(%s, %L)', :p1, 'Prueba')) then 'ok' else 'not ok' end
       || ' 2 - REP-01: sin rol administrador no se elimina';

select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select case when pg_temp.falla(format('select pedido_eliminar(%s, %L)', :p1, '  ')) then 'ok' else 'not ok' end
       || ' 3 - REP-05: sin motivo no se elimina';

select pedido_eliminar(:p1, 'Prueba') as r1 \gset
reset role;
select case when not exists (select 1 from alistamientos where id = :p1) and not exists (select 1 from oportunidades where id = :o1)
              and not exists (select 1 from pagos where oportunidad_id = :o1) then 'ok' else 'not ok' end
       || ' 4 - REP-02: el pedido, la oportunidad y sus pagos desaparecen';
select case when (select array_agg(stock order by codigo) = '{1,1}' from productos where codigo in ('PRUEBA-0072-A', 'PRUEBA-0072-B'))
              and (:'r1'::jsonb -> 'repuestos') = '["PRUEBA-0072-A", "PRUEBA-0072-B"]' then 'ok' else 'not ok' end
       || ' 5 - REP-02 y REP-04: cada equipo vuelve a stock (una unidad) y el resultado dice cuáles';
select case when (select not (estado_bot ? 'compra') and etiquetas = '{Cliente-Fiel}' from leads where id = :ana)
              and exists (select 1 from lead_eventos where lead_id = :ana and detalle like '🗑 Pedido PED-% eliminado por %: Prueba · stock devuelto: PRUEBA-0072-A, PRUEBA-0072-B')
            then 'ok' else 'not ok' end || ' 6 - REP-06: el cliente queda sin la compra ni sus etiquetas, y la línea de tiempo lo cuenta';

-- REP-03: un pedido sin «📦 Stock descontado» no suma
set local role authenticated;
select pedido_eliminar(:p2, 'Duplicado');
reset role;
select case when (select stock = 0 from productos where codigo = 'PRUEBA-0072-C')
              and exists (select 1 from lead_eventos where lead_id = :beto and detalle like '%Duplicado · sin stock que devolver') then 'ok' else 'not ok' end
       || ' 7 - REP-03: sin descuento previo, el stock no cambia';
set local role authenticated;
select case when pg_temp.falla(format('select pedido_eliminar(%s, %L)', :p1, 'Otra vez')) then 'ok' else 'not ok' end
       || ' 8 - un pedido ya eliminado no se elimina dos veces (ni devuelve stock de nuevo)';

rollback;

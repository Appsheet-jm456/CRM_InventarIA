-- Pruebas de la migración 0073 (F4·67, RPD-59): pedido sin equipos y sin devolver dos veces el mismo descuento. Con ROLLBACK.
-- El caso real del 11 nov: PED-0096 (con el T490, cancelado, su oportunidad no descontó) y PED-0101 (sin equipos, su pago descontó el T490).
begin;

insert into productos (codigo, marca, modelo, precio, stock) values ('PRUEBA-0073-A', 'LENOVO', 'T490', 950000, 1);
insert into leads (telefono, nombre, etapa, atributos, estado_bot) values ('570000073001', 'Jhon Prueba', 'Nuevo', '{"venta_online": false}', '{}');
select id as l from leads where telefono = '570000073001' \gset
select abrir_oportunidad_interna(:l, 1) as o1 \gset
insert into alistamientos (oportunidad_id, lead_id, equipos) values (:o1, :l, '[{"codigo": "PRUEBA-0073-A", "nombre": "LENOVO T490"}]')
  on conflict (oportunidad_id) do update set equipos = excluded.equipos returning id as p1 \gset
-- El primer pedido se cancela (la oportunidad queda Perdida) y se abre otra sin el código del equipo
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select alistamiento_cancelar(:p1, 'No compró');
reset role;
select abrir_oportunidad_interna(:l, 1) as o2 \gset
insert into alistamientos (oportunidad_id, lead_id, equipos) values (:o2, :l, '[]')
  on conflict (oportunidad_id) do update set equipos = excluded.equipos returning id as p2 \gset
update leads set estado_bot = '{"compra": {"paso": "pago_por_confirmar", "total": 950000, "codigo": "PRUEBA-0073-A"}}' where id = :l;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select validar_comprobante(:l);
reset role;
select case when (select stock = 0 from productos where codigo = 'PRUEBA-0073-A') then 'ok' else 'not ok' end || ' 1 - el pago dejó el T490 en stock 0';

set local role authenticated;
select pedido_eliminar(:p2, 'Prueba') as r2 \gset
reset role;
select case when (select stock = 1 from productos where codigo = 'PRUEBA-0073-A') and (:'r2'::jsonb -> 'repuestos') = '["PRUEBA-0073-A"]'
            then 'ok' else 'not ok' end || ' 2 - un pedido sin equipos devuelve lo que descontó el pago del cliente';
set local role authenticated;
select pedido_eliminar(:p1, 'Prueba') as r1 \gset
reset role;
select case when (select stock = 1 from productos where codigo = 'PRUEBA-0073-A') and (:'r1'::jsonb -> 'repuestos') = '[]'
            then 'ok' else 'not ok' end || ' 3 - eliminar el otro pedido del mismo cliente no devuelve dos veces el mismo descuento';

rollback;

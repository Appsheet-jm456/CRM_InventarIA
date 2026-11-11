-- Pruebas de la migración 0071 (F4·66, RVD-01 a RVD-05): el stock baja con el primer pago validado. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

insert into productos (codigo, marca, modelo, precio, stock) values
  ('PRUEBA-0071-A', 'LENOVO', 'T490', 950000, 1), ('PRUEBA-0071-B', 'DELL', '5420', 1400000, 2), ('PRUEBA-0071-C', 'HP', '840', 900000, 1);

insert into leads (telefono, nombre, etapa, atributos, estado_bot) values
  ('570000071001', 'Ana Completo', 'Nuevo', '{"venta_online": true}',
   '{"compra": {"paso": "pago_por_confirmar", "total": 950000, "codigo": "PRUEBA-0071-A", "equipo": "LENOVO T490"}}'),
  ('570000071002', 'Bea Abono', 'Nuevo', '{"venta_online": true}',
   '{"compra": {"paso": "pago_por_confirmar", "total": 2300000, "equipos": [{"codigo": "PRUEBA-0071-B"}, {"codigo": "PRUEBA-0071-C"}]}}'),
  ('570000071003', 'Luis Tarde', 'Nuevo', '{"venta_online": true}',
   '{"compra": {"paso": "pago_por_confirmar", "total": 950000, "codigo": "PRUEBA-0071-A", "equipo": "LENOVO T490"}}');
select id as ana from leads where telefono = '570000071001' \gset
select id as bea from leads where telefono = '570000071002' \gset
select id as luis from leads where telefono = '570000071003' \gset

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select validar_comprobante(:ana);
select case when (select stock = 0 from productos where codigo = 'PRUEBA-0071-A') then 'ok' else 'not ok' end
       || ' 1 - RVD-01: el pago completo deja el T490 en stock 0';
select case when (select (estado_bot -> 'compra' ->> 'stock_descontado')::boolean from leads where id = :ana) then 'ok' else 'not ok' end
       || ' 2 - la compra queda marcada con el stock descontado';

select validar_comprobante(:bea, 1000000);
select case when (select array_agg(stock order by codigo) = '{1,0}' from productos where codigo in ('PRUEBA-0071-B', 'PRUEBA-0071-C'))
            then 'ok' else 'not ok' end || ' 3 - RVD-02 y RVD-04: el abono baja una unidad de cada equipo del carrito';

-- Bea manda el segundo soporte y el asesor valida el saldo: no vuelve a bajar (RVD-03)
reset role;
update leads set estado_bot = jsonb_set(estado_bot, '{compra}', (estado_bot -> 'compra') - 'validacion' || '{"paso": "pago_por_confirmar"}') where id = :bea;
set local role authenticated;
select validar_comprobante(:bea);
select case when (select array_agg(stock order by codigo) = '{1,0}' from productos where codigo in ('PRUEBA-0071-B', 'PRUEBA-0071-C'))
            then 'ok' else 'not ok' end || ' 4 - RVD-03: el pago del saldo no vuelve a descontar';

-- Luis pagó el mismo T490 que ya se vendió (RVD-05)
select validar_comprobante(:luis);
select case when (select stock = 0 from productos where codigo = 'PRUEBA-0071-A') then 'ok' else 'not ok' end
       || ' 5 - RVD-05: el stock no queda negativo';
reset role;
select case when exists (select 1 from lead_eventos where lead_id = :luis and detalle like '⚠ Se validó un pago de un equipo sin stock: LENOVO T490%')
            then 'ok' else 'not ok' end || ' 6 - RVD-05: queda el aviso del equipo sin stock en la línea de tiempo';
select case when exists (select 1 from lead_eventos where lead_id = :ana and detalle like '📦 Stock descontado%PRUEBA-0071-A%')
            then 'ok' else 'not ok' end || ' 7 - el descuento queda en la línea de tiempo del cliente';

-- Un cambio del estado del bot que no es una validación no toca el stock
update leads set estado_bot = jsonb_set(estado_bot, '{compra,paso}', '"esperando_pago"') where id = :ana;
select case when (select stock = 0 from productos where codigo = 'PRUEBA-0071-A')
              and (select count(*) = 1 from lead_eventos where lead_id = :ana and detalle like '📦%') then 'ok' else 'not ok' end
       || ' 8 - otros cambios del estado del bot no descuentan de nuevo';

rollback;

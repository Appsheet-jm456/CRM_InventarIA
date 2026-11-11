-- Pruebas de la migración 0077 (F4·59, RPD-47b y RPD-47c): Saldo-Pendiente sigue al saldo con los pagos a mano. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

insert into leads (telefono, nombre, etapa, etiquetas) values ('570000077001', 'Saúl Saldo', 'Nuevo', '{Pago-Validado,Saldo-Pendiente}');
select id as l1 from leads where telefono = '570000077001' and eliminado_en is null \gset
select abrir_oportunidad_interna(:l1, 1) as o1 \gset
update oportunidades set valor_estimado = 5480000 where id = :o1;
insert into pagos (lead_id, oportunidad_id, valor, medio, fecha_pago, origen) values (:l1, :o1, 5000000, 'Transferencia', current_date, 'whatsapp');
insert into storage.objects (bucket_id, name) values ('pagos', :'o1' || '/s-1.jpg'), ('pagos', :'o1' || '/s-2.jpg');

insert into leads (telefono, nombre, etapa, etiquetas) values ('570000077002', 'Nora Normal', 'Nuevo', '{}');
select id as l2 from leads where telefono = '570000077002' and eliminado_en is null \gset
select abrir_oportunidad_interna(:l2, 1) as o2 \gset
update oportunidades set valor_estimado = 1000000 where id = :o2;
insert into storage.objects (bucket_id, name) values ('pagos', :'o2' || '/s-1.jpg');

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

-- Un pago a mano que no completa: la etiqueta sigue
select pago_registrar(:o1, 200000, 'Transferencia', current_date, null, :'o1' || '/s-1.jpg', 'image/jpeg', null) as p1 \gset
select case when (select 'Saldo-Pendiente' = any(etiquetas) from leads where id = :l1) then 'ok' else 'not ok' end
       || ' 1 - un pago que no completa el saldo deja Saldo-Pendiente';

-- El que completa: se quita y queda en el historial (RPD-47b)
select pago_registrar(:o1, 280000, 'Transferencia', current_date, 'REF9', :'o1' || '/s-2.jpg', 'image/jpeg', null) as p2 \gset
select case when (select not 'Saldo-Pendiente' = any(etiquetas) and 'Pago-Validado' = any(etiquetas) from leads where id = :l1)
              and exists (select 1 from lead_eventos where lead_id = :l1 and detalle = '✅ Saldo pagado: $5.480.000 de $5.480.000 · el pedido quedó al día')
            then 'ok' else 'not ok' end || ' 2 - al llegar a $0 se quita Saldo-Pendiente, sigue Pago-Validado y queda «✅ Saldo pagado»';

-- Se anula el último: vuelve a faltar y vuelve la etiqueta (RPD-47c)
select pago_anular(:p2, 'valor equivocado');
select case when (select 'Saldo-Pendiente' = any(etiquetas) from leads where id = :l1)
              and exists (select 1 from lead_eventos where lead_id = :l1 and detalle = '◐ Vuelve a quedar saldo pendiente: $280.000')
            then 'ok' else 'not ok' end || ' 3 - al anular un pago y volver a faltar saldo, vuelve Saldo-Pendiente';
select pago_anular(:p1, 'prueba');
select case when (select count(*) from unnest((select etiquetas from leads where id = :l1)) x where x = 'Saldo-Pendiente') = 1
            then 'ok' else 'not ok' end || ' 4 - no se repite la etiqueta';

-- Un pedido sin Pago-Validado (abono a mano normal): no se le pone la etiqueta
select pago_registrar(:o2, 400000, 'Efectivo en tienda', current_date, null, :'o2' || '/s-1.jpg', 'image/jpeg', null);
select case when (select not 'Saldo-Pendiente' = any(coalesce(etiquetas, '{}')) from leads where id = :l2) then 'ok' else 'not ok' end
       || ' 5 - un pedido sin validar no recibe Saldo-Pendiente por un pago a mano';

reset role;
select set_config('request.jwt.claims', '', true);
select case when not has_function_privilege('authenticated', 'public.pago_conciliar_saldo(bigint)', 'execute')
              and has_function_privilege('authenticated', 'public.pago_registrar(bigint, numeric, text, date, text, text, text, text)', 'execute')
            then 'ok' else 'not ok' end || ' 6 - la conciliación no se llama desde la app; registrar pago sigue permitido';

rollback;

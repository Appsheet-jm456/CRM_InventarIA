-- Pruebas de la migración 0061 (F4·54, RPD-32 a RPD-37): pagos del WhatsApp y manuales, saldo y anulación. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into leads (telefono, nombre, etapa, atributos, estado_bot) values ('570000061001', 'Pía Pagos', 'Nuevo', '{"venta_online": true}',
  '{"compra": {"paso": "pago_por_confirmar", "total": 2000000}}');
select id as l1 from leads where telefono = '570000061001' and eliminado_en is null \gset
select abrir_oportunidad_interna(:l1, 1) as o1 \gset
update oportunidades set valor_estimado = 2000000 where id = :o1;
insert into mensajes (lead_id, lado, tipo, texto, media_ruta, media_mime) values (:l1, 'cliente', 'image', '📷 Imagen', 'x/comprobante.jpg', 'image/jpeg');
insert into storage.objects (bucket_id, name) values ('pagos', :'o1' || '/soporte-1.jpg'), ('pagos', :'o1' || '/soporte-2.pdf');

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

-- RPD-33: el comprobante del WhatsApp queda como pago al validarlo
select validar_comprobante(:l1);
select case when (select count(*) = 1 and min(valor) = 2000000 and min(origen) = 'whatsapp' and min(soporte_ruta) = 'x/comprobante.jpg'
                    from pagos where oportunidad_id = :o1) then 'ok' else 'not ok' end
       || ' 1 - al validar el comprobante queda un pago del WhatsApp por el total, con la foto de soporte';

-- RPD-36: anular el pago equivocado (el cliente en realidad pagó en dos partes)
select id as p1 from pagos where oportunidad_id = :o1 \gset
select case when pg_temp.falla(format('select pago_anular(%s, %L)', :p1, ' ')) then 'ok' else 'not ok' end || ' 2 - anular pide motivo';
select pago_anular(:p1, 'Pagó en dos partes');
select case when (select anulado_en is not null from pagos where id = :p1) then 'ok' else 'not ok' end || ' 3 - el pago anulado queda, pero anulado';

-- RPD-34: dos pagos a mano de $1.000.000 con su soporte
select case when pg_temp.falla(format('select pago_registrar(%s, 0, %L, current_date, null, %L, %L, null)', :o1, 'Transferencia', :'o1' || '/soporte-1.jpg', 'image/jpeg'))
            then 'ok' else 'not ok' end || ' 4 - el valor debe ser mayor que cero';
select case when pg_temp.falla(format('select pago_registrar(%s, 1000000, %L, current_date, null, %L, %L, null)', :o1, 'Transferencia', :'o1' || '/no-existe.jpg', 'image/jpeg'))
            then 'ok' else 'not ok' end || ' 5 - sin el soporte en el servidor no se registra';
select pago_registrar(:o1, 1000000, 'Transferencia', current_date - 1, 'Bancolombia 123', :'o1' || '/soporte-1.jpg', 'image/jpeg', null);
select case when exists (select 1 from lead_eventos where lead_id = :l1 and tipo = 'pago' and detalle like '💵 Pago de $1.000.000 (Transferencia%')
            then 'ok' else 'not ok' end || ' 6 - el pago manual queda en la línea de tiempo';

-- RPD-35: saldo en Pedidos
reset role;
update oportunidades set etapa_id = (select id from etapas where embudo_id = 1 and nombre = 'Alistamiento') where id = :o1;
set local role authenticated;
select case when exists (select 1 from jsonb_array_elements(pedidos_lista()) x where (x ->> 'lead_id')::bigint = :l1
                          and (x ->> 'pagado')::numeric = 1000000 and x -> 'alertas' ? 'Saldo pendiente')
            then 'ok' else 'not ok' end || ' 7 - con $1.000.000 de $2.000.000, Pedidos suma lo pagado (sin el anulado) y avisa saldo pendiente';
select pago_registrar(:o1, 1000000, 'Transferencia', current_date, null, :'o1' || '/soporte-2.pdf', 'application/pdf', 'segundo abono');
select case when exists (select 1 from jsonb_array_elements(pedidos_lista()) x where (x ->> 'lead_id')::bigint = :l1
                          and (x ->> 'pagado')::numeric = 2000000 and (x ->> 'pagos')::int = 2 and not (x -> 'alertas' ? 'Saldo pendiente'))
            then 'ok' else 'not ok' end || ' 8 - con los dos soportes queda pagado completo y sin alerta';

-- RPD-37: cancelado no recibe pagos; sin permiso no se registra
select id as a1 from alistamientos where oportunidad_id = :o1 \gset
select alistamiento_cancelar(:a1, 'Novedad del cliente');
select case when pg_temp.falla(format('select pago_registrar(%s, 5000, %L, current_date, null, %L, %L, null)', :o1, 'Otro', :'o1' || '/soporte-2.pdf', 'application/pdf'))
            then 'ok' else 'not ok' end || ' 9 - un pedido cancelado no recibe pagos nuevos';
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
select case when pg_temp.falla(format('select pago_anular(%s, %L)', :p1, 'x')) then 'ok' else 'not ok' end || ' 10 - sin validar_pagos no se toca un pago';

rollback;

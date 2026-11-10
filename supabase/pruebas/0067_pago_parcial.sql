-- Pruebas de la migración 0067 (F4·59, RPD-41 a RPD-49): pago completo o parcial al validar el comprobante. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into leads (telefono, nombre, etapa, atributos, estado_bot) values ('570000067001', 'Pablo Parcial', 'Nuevo', '{"venta_online": true}',
  '{"compra": {"paso": "pago_por_confirmar", "total": 2000000}}') returning id as l1 \gset
select abrir_oportunidad_interna(:l1, 1) as o1 \gset
insert into mensajes (lead_id, lado, tipo, texto, media_ruta, media_mime) values (:l1, 'cliente', 'image', '📷 Imagen', 'x/soporte-1.jpg', 'image/jpeg');

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

-- RPD-42: el abono tiene que ser menor que el saldo
select case when pg_temp.falla(format('select validar_comprobante(%s, 2000000)', :l1)) then 'ok' else 'not ok' end
       || ' 1 - un abono igual al saldo no se acepta (es pago completo)';
select case when pg_temp.falla(format('select validar_comprobante(%s, 0)', :l1)) then 'ok' else 'not ok' end
       || ' 2 - un abono de 0 no se acepta';

-- RPD-43 y RPD-45: abono de $1.000.000
select validar_comprobante(:l1, 1000000);
select case when (select count(*) = 1 and sum(valor) = 1000000 and min(soporte_ruta) = 'x/soporte-1.jpg' from pagos where oportunidad_id = :o1)
            then 'ok' else 'not ok' end || ' 3 - el abono queda como pago del pedido con su soporte';
select case when (select estado_bot -> 'compra' ->> 'validacion' = 'abono' and (estado_bot -> 'compra' ->> 'saldo')::numeric = 1000000
                         and (estado_bot -> 'compra' ->> 'pagado')::numeric = 1000000 and 'Saldo-Pendiente' = any(etiquetas)
                         and not ('Pago-Validado' = any(etiquetas)) from leads where id = :l1)
            then 'ok' else 'not ok' end || ' 4 - la compra guarda pagado y saldo, con la etiqueta Saldo-Pendiente y sin Pago-Validado';
select case when pg_temp.falla(format('select validar_comprobante(%s)', :l1)) then 'ok' else 'not ok' end
       || ' 5 - el mismo comprobante no se valida dos veces';

-- El receptor avisa y vuelve a esperar el pago; llega el segundo soporte (RPD-46)
reset role;
update leads set estado_bot = jsonb_set(estado_bot, '{compra}', (estado_bot -> 'compra') - 'validacion' || '{"paso": "esperando_pago"}') where id = :l1;
set local role authenticated;
select case when not pg_temp.falla(format('select despachar_con_saldo(%s, %L)', :l1, 'cliente frecuente')) then 'ok' else 'not ok' end
       || ' 6 - con saldo pendiente se puede despachar como excepción (RPD-45b)';
select case when (select estado_bot -> 'compra' ->> 'validacion' = 'validado' and (estado_bot -> 'compra' ->> 'con_saldo')::boolean
                         and 'Saldo-Pendiente' = any(etiquetas) and 'Pago-Validado' = any(etiquetas) from leads where id = :l1)
              and exists (select 1 from lead_eventos where lead_id = :l1 and detalle like '🚚 Despacho con saldo pendiente%cliente frecuente')
            then 'ok' else 'not ok' end || ' 7 - la excepción arranca el despacho, deja Saldo-Pendiente y queda con su motivo';

-- Otra compra: abono y luego pago completo por el saldo
reset role;
update leads set estado_bot = '{"compra": {"paso": "pago_por_confirmar", "total": 2000000}}', etiquetas = '{}' where id = :l1;
delete from pagos where oportunidad_id = :o1;
set local role authenticated;
select validar_comprobante(:l1, 1500000);
reset role;
update leads set estado_bot = jsonb_set(estado_bot, '{compra}', (estado_bot -> 'compra') - 'validacion' || '{"paso": "pago_por_confirmar"}') where id = :l1;
insert into mensajes (lead_id, lado, tipo, texto, media_ruta, media_mime) values (:l1, 'cliente', 'image', '📷 Imagen', 'x/soporte-2.jpg', 'image/jpeg');
set local role authenticated;
select validar_comprobante(:l1);
select case when (select count(*) = 2 and sum(valor) = 2000000 and max(valor) = 1500000 and min(valor) = 500000 from pagos where oportunidad_id = :o1)
            then 'ok' else 'not ok' end || ' 8 - el pago completo registra solo el saldo que faltaba ($500.000)';
select case when (select estado_bot -> 'compra' ->> 'validacion' = 'validado' and not ('Saldo-Pendiente' = any(etiquetas))
                         and 'Pago-Validado' = any(etiquetas) from leads where id = :l1)
            then 'ok' else 'not ok' end || ' 9 - con el saldo en cero queda validado y se quita Saldo-Pendiente (RPD-47)';

select case when has_column_privilege('authenticated', 'agente_config', 'texto_abono', 'update') then 'ok' else 'not ok' end
       || ' 10 - el texto del abono se puede editar desde la pantalla';

rollback;

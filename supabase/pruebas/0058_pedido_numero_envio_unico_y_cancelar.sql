-- Pruebas de la migración 0058 (F4·54 bloque A): número del pedido, envío único, 24 h para video y documento, reserva y cancelar. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into productos (codigo, categoria, marca, modelo, procesador, ram, almacenamiento, estado, precio, stock)
values ('999-058-0001', 'Portatil', 'DELL', 'PEDIDO', 'i5', '16GB', '512GB', 'Usado', 1500000, 1);
insert into leads (telefono, nombre, etapa, atributos) values ('570000058001', 'Marta Pedido', 'Nuevo',
  '{"venta_online": true, "nombre_completo": "Marta Pedido", "cedula": "123456", "celular": "3001234567", "correo_para_la_factura": "m@x.co",
    "ciudad": "Cali", "direccion_entrega": "Calle 1"}');
insert into leads (telefono, nombre, etapa, atributos) values ('570000058002', 'Pablo Tienda', 'Nuevo', '{"venta_online": false}');
insert into leads (telefono, nombre, etapa, atributos) values ('570000058003', 'Sara Cancela', 'Nuevo', '{"venta_online": true}');
select id as l1 from leads where telefono = '570000058001' and eliminado_en is null \gset
select id as l2 from leads where telefono = '570000058002' and eliminado_en is null \gset
select id as l3 from leads where telefono = '570000058003' and eliminado_en is null \gset
select abrir_oportunidad_interna(:l1, 1) as o1 \gset
select abrir_oportunidad_interna(:l2, 1) as o2 \gset
select abrir_oportunidad_interna(:l3, 1) as o3 \gset
update oportunidades set producto = '999-058-0001', etapa_id = (select id from etapas where embudo_id = 1 and nombre = 'Alistamiento') where id in (:o1, :o2, :o3);
select id as a1, numero as n1 from alistamientos where oportunidad_id = :o1 \gset
select id as a2, numero as n2 from alistamientos where oportunidad_id = :o2 \gset
select id as a3 from alistamientos where oportunidad_id = :o3 \gset
insert into storage.objects (bucket_id, name) values ('guias', :'a1' || '/guia.jpg');
insert into alistamiento_videos (alistamiento_id, equipo_codigo, ruta, estado, peso, tecnico)
  values (:a1, '999-058-0001', :'a1' || '/v.mp4', 'listo', 1000, 'Josep');

select case when :n2 = :n1 + 1 and (select count(*) = count(distinct numero) from alistamientos) then 'ok' else 'not ok' end
       || ' 1 - cada pedido tiene su número interno consecutivo y único';

update alistamientos set estado = 'listo', tecnico = 'Josep', tomado_en = now() - interval '3 hours', listo_en = now(), doc_tipo = 'FVE', doc_numero = '99'
 where id in (:a1, :a2, :a3);

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

-- RPD-18: reserva
select alistamiento_para_enviar(:a1, 'video');
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :a1, 'video')) then 'ok' else 'not ok' end
       || ' 2 - un segundo clic al mismo envío, en curso, se rechaza';
select case when (alistamiento_para_enviar(:a1, 'documento') ->> 'que') = 'documento' then 'ok' else 'not ok' end
       || ' 3 - otro tipo de envío no se bloquea';

-- RPD-17: el receptor termina el envío (limpia la reserva y anota la hora); el trigger guarda el primero
reset role;
update alistamientos set envios_en_curso = '{}', video_enviado_en = now() - interval '2 hours', documento_enviado_en = now() - interval '2 hours' where id = :a1;
update alistamientos set video_enviado_en = now() where id = :a1;
select case when (select primer_video_en < now() - interval '1 hour' from alistamientos where id = :a1) then 'ok' else 'not ok' end
       || ' 4 - un reenvío no pisa la hora del primer envío';
set local role authenticated;
select case when (alistamiento_para_enviar(:a1, 'video') ->> 'que') = 'video' then 'ok' else 'not ok' end
       || ' 5 - dentro de las 24 h, con el pedido abierto, el video se puede reenviar';

reset role;
update alistamientos set envios_en_curso = '{}', primer_video_en = now() - interval '30 hours', primer_documento_en = now() - interval '30 hours' where id = :a1;
set local role authenticated;
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :a1, 'video')) then 'ok' else 'not ok' end
       || ' 6 - pasadas 24 h del primer envío, el video no se reenvía';
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :a1, 'documento')) then 'ok' else 'not ok' end
       || ' 7 - pasadas 24 h del primer envío, el documento no se reenvía';

reset role;
update alistamientos set envios_en_curso = '{}', primer_video_en = now() - interval '1 hour' where id = :a1;
update oportunidades set etapa_id = (select id from etapas where embudo_id = 1 and cierre = 'ganada') where id = :o1;
set local role authenticated;
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :a1, 'video')) then 'ok' else 'not ok' end
       || ' 8 - con el pedido cerrado, el video ya enviado no se reenvía aunque no hayan pasado 24 h';
reset role;
update oportunidades set etapa_id = (select id from etapas where embudo_id = 1 and nombre = 'Alistamiento') where id = :o1;
set local role authenticated;

-- RPD-16: guía una sola vez
select alistamiento_guia(:a1, :'a1' || '/guia.jpg', 'Servientrega', 'SV-1');
select case when (alistamiento_para_enviar(:a1, 'guia') ->> 'que') = 'guia' then 'ok' else 'not ok' end
       || ' 9 - registrada pero no enviada (el envío falló), se puede reintentar';
reset role;
update alistamientos set envios_en_curso = '{}', guia_enviada_en = now() where id = :a1;
set local role authenticated;
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :a1, 'guia')) then 'ok' else 'not ok' end
       || ' 10 - con la guía ya enviada, no se envía otra vez';
select case when pg_temp.falla(format('select alistamiento_guia(%s, %L, %L, %L)', :a1, :'a1' || '/guia.jpg', 'Envía', 'SV-2')) then 'ok' else 'not ok' end
       || ' 11 - con la guía ya enviada, no se registra otra';

-- Tienda: aviso y entrega una sola vez
select alistamiento_para_enviar(:a2, 'listo_tienda');
reset role;
update alistamientos set envios_en_curso = '{}', aviso_tienda_en = now() where id = :a2;
set local role authenticated;
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :a2, 'listo_tienda')) then 'ok' else 'not ok' end
       || ' 12 - el aviso de recoger se manda una sola vez';
select alistamiento_entregado(:a2);
select case when pg_temp.falla(format('select alistamiento_entregado(%s)', :a2)) then 'ok' else 'not ok' end
       || ' 13 - «Entregado» se marca una sola vez';

-- RPD-19: cancelar
select case when pg_temp.falla(format('select alistamiento_cancelar(%s, %L)', :a3, '  ')) then 'ok' else 'not ok' end
       || ' 14 - cancelar pide el motivo';
select case when pg_temp.falla(format('select alistamiento_cancelar(%s, %L)', :a1, 'No compró')) then 'ok' else 'not ok' end
       || ' 15 - un pedido que ya salió no se cancela';
select alistamiento_cancelar(:a3, 'No compró');
select case when (select o.estado = 'perdida' and o.motivo_perdido = 'No compró' from oportunidades o where o.id = :o3)
             and (select cancelado_en is not null and cancelado_motivo = 'No compró' from alistamientos where id = :a3)
            then 'ok' else 'not ok' end || ' 16 - al cancelar, la oportunidad queda Perdida con el motivo';
select case when exists (select 1 from lead_eventos where lead_id = :l3 and tipo = 'alistamiento' and detalle like '🚫 Pedido PED-%No compró')
            then 'ok' else 'not ok' end || ' 17 - la cancelación queda en la línea de tiempo';
select case when pg_temp.falla(format('select alistamiento_cancelar(%s, %L)', :a3, 'Otra vez')) then 'ok' else 'not ok' end
       || ' 18 - no se cancela dos veces';
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :a3, 'documento')) then 'ok' else 'not ok' end
       || ' 19 - a un pedido cancelado no se le envía nada';

rollback;

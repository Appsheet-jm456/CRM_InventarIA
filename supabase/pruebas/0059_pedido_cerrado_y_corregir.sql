-- Pruebas de la migración 0059 (F4·54, RPD-27 a RPD-31): editable abierto, bloqueado al cerrar, «Corregir» con motivo y su envío. Con ROLLBACK.
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
values ('999-059-0001', 'Portatil', 'DELL', 'CORREGIR', 'i5', '16GB', '512GB', 'Usado', 1500000, 1);
insert into leads (telefono, nombre, etapa, atributos) values ('570000059001', 'Ana Corrige', 'Nuevo', '{"venta_online": true}');
insert into leads (telefono, nombre, etapa, atributos) values ('570000059002', 'Beto Cancela', 'Nuevo', '{"venta_online": true}');
select id as l1 from leads where telefono = '570000059001' and eliminado_en is null \gset
select id as l2 from leads where telefono = '570000059002' and eliminado_en is null \gset
select abrir_oportunidad_interna(:l1, 1) as o1 \gset
select abrir_oportunidad_interna(:l2, 1) as o2 \gset
update oportunidades set producto = '999-059-0001', etapa_id = (select id from etapas where embudo_id = 1 and nombre = 'Alistamiento') where id in (:o1, :o2);
select id as a1 from alistamientos where oportunidad_id = :o1 \gset
select id as a2 from alistamientos where oportunidad_id = :o2 \gset
update alistamientos set estado = 'listo', tecnico = 'Josep', tomado_en = now() - interval '3 hours', listo_en = now(), doc_tipo = 'FVE', doc_numero = '10'
 where id in (:a1, :a2);
insert into storage.objects (bucket_id, name) values ('videos-tecnicos', :'a1' || '/999-059-0001/a.mp4'), ('videos-tecnicos', :'a1' || '/999-059-0001/b.mp4'),
  ('videos-tecnicos', :'a1' || '/999-059-0001/c.mp4');

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

-- RPD-27: abierto
select alistamiento_documento(:a1, 'FVE', '11');
select case when (select doc_numero = '11' from alistamientos where id = :a1) then 'ok' else 'not ok' end
       || ' 1 - con el pedido abierto, el documento se cambia en la ficha';
select case when alistamiento_video_registrar(:a1, '999-059-0001', :'a1' || '/999-059-0001/a.mp4', 1000, 'Camilo Osorio') > 0 then 'ok' else 'not ok' end
       || ' 2 - con el pedido listo, el técnico reemplaza el video sin volver a revisión';
select case when pg_temp.falla(format('select alistamiento_corregir_documento(%s, %L, %L, %L)', :a1, 'FVE', '12', 'anulada'))
            then 'ok' else 'not ok' end || ' 3 - «Corregir» no aplica con el pedido abierto';

-- RPD-28: cerrado
reset role;
update oportunidades set etapa_id = (select id from etapas where embudo_id = 1 and cierre = 'ganada') where id = :o1;
update alistamientos set documento_enviado_en = now() - interval '30 hours', video_enviado_en = now() - interval '30 hours' where id = :a1;
set local role authenticated;
select case when pg_temp.falla(format('select alistamiento_documento(%s, %L, %L)', :a1, 'FVE', '12')) then 'ok' else 'not ok' end
       || ' 4 - con el pedido cerrado, la ficha ya no cambia el documento';
select case when pg_temp.falla(format('select alistamiento_video_registrar(%s, %L, %L, 1000, %L)', :a1, '999-059-0001', :'a1' || '/999-059-0001/b.mp4', 'Josep'))
            then 'ok' else 'not ok' end || ' 5 - con el pedido cerrado, no se sube video sin autorizar la corrección';
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :a1, 'documento')) then 'ok' else 'not ok' end
       || ' 6 - cerrado y sin corrección, el documento ya enviado no se reenvía';

-- RPD-29 y RPD-31: corregir el documento
select case when pg_temp.falla(format('select alistamiento_corregir_documento(%s, %L, %L, %L)', :a1, 'FVE', '12', ' ')) then 'ok' else 'not ok' end
       || ' 7 - corregir pide el motivo';
select alistamiento_corregir_documento(:a1, 'FVE', '12', 'Factura anulada y reemplazada');
select case when (select doc_numero = '12' and correccion_documento_en is not null from alistamientos where id = :a1)
             and exists (select 1 from lead_eventos where lead_id = :l1 and detalle like '✏️ Documento corregido%FVE 11 → FVE 12 (Factura anulada%')
            then 'ok' else 'not ok' end || ' 8 - el documento corregido queda con el anterior y el motivo en la línea de tiempo';
select case when (alistamiento_para_enviar(:a1, 'documento') ->> 'corregido')::boolean then 'ok' else 'not ok' end
       || ' 9 - la corrección habilita un envío del documento, aunque esté cerrado y pasaran las 24 h';
reset role;
update alistamientos set envios_en_curso = '{}', documento_enviado_en = now() + interval '1 second' where id = :a1;
set local role authenticated;
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :a1, 'documento')) then 'ok' else 'not ok' end
       || ' 10 - enviada la corrección, no se vuelve a enviar';

-- RPD-29 y RPD-31: corregir el video
select alistamiento_corregir_video(:a1, 'Video equivocado');
select alistamiento_video_registrar(:a1, '999-059-0001', :'a1' || '/999-059-0001/c.mp4', 1000, 'Josep') as vnuevo \gset
select case when (select correccion_video_id = :vnuevo and correccion_video_autorizada_en is null and correccion_video_en is not null from alistamientos where id = :a1)
            then 'ok' else 'not ok' end || ' 11 - autorizado, el técnico sube el video corregido y la autorización se gasta';
select case when pg_temp.falla(format('select alistamiento_video_registrar(%s, %L, %L, 1000, %L)', :a1, '999-059-0001', :'a1' || '/999-059-0001/b.mp4', 'Josep'))
            then 'ok' else 'not ok' end || ' 12 - para otro video hay que autorizar de nuevo';
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :a1, 'video')) then 'ok' else 'not ok' end
       || ' 13 - el video corregido no se envía mientras se prepara';
reset role;
update alistamiento_videos set estado = 'listo', ruta = original where id = :vnuevo;
set local role authenticated;
select case when (alistamiento_para_enviar(:a1, 'video') ->> 'corregido')::boolean then 'ok' else 'not ok' end
       || ' 14 - ya listo, el video corregido se puede enviar una vez';

-- Servicio técnico
select case when exists (select 1 from jsonb_array_elements(servicio_tecnico_cerrados()) x where (x ->> 'id')::bigint = :a1)
             and not exists (select 1 from jsonb_array_elements(servicio_tecnico_pedidos()) x where (x ->> 'id')::bigint = :a1)
            then 'ok' else 'not ok' end || ' 15 - el pedido cerrado pasa a «Cerrados» en Servicio técnico';

-- Cancelado: congelado
select alistamiento_cancelar(:a2, 'No compró');
select case when pg_temp.falla(format('select alistamiento_corregir_documento(%s, %L, %L, %L)', :a2, 'FVE', '99', 'x')) then 'ok' else 'not ok' end
       || ' 16 - un pedido cancelado no se corrige';
select case when not exists (select 1 from jsonb_array_elements(servicio_tecnico_cerrados()) x where (x ->> 'id')::bigint = :a2)
            then 'ok' else 'not ok' end || ' 17 - los cancelados no aparecen en «Cerrados»';

rollback;

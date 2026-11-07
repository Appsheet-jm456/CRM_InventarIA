-- Pruebas de la migración 0056 (F4·50 bloque B): video de soporte por equipo. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select case when (select not public and file_size_limit = 104857600 and 'video/mp4' = any(allowed_mime_types) and 'video/quicktime' = any(allowed_mime_types)
                  from storage.buckets where id = 'videos-tecnicos')
            then 'ok' else 'not ok' end || ' 1 - bucket privado de videos de hasta 100 MB (MP4 y MOV del iPhone)';

insert into productos (codigo, categoria, marca, modelo, procesador, ram, almacenamiento, estado, precio, stock)
values ('999-056-0001', 'Portatil', 'DELL', 'UNO', 'i5', '16GB', '512GB', 'Usado', 1500000, 1),
       ('999-056-0002', 'Portatil', 'HP', 'DOS', 'i5', '16GB', '512GB', 'Usado', 1500000, 1);
insert into leads (telefono, nombre, etapa) values ('570000056001', 'Luis Prueba', 'Nuevo');
select id as l from leads where telefono = '570000056001' and eliminado_en is null \gset
select abrir_oportunidad_interna(:l, 1) as op \gset
update oportunidades set producto = '999-056-0001,999-056-0002', etapa_id = (select id from etapas where embudo_id = 1 and nombre = 'Alistamiento') where id = :op;
select id as a from alistamientos where oportunidad_id = :op \gset
insert into storage.objects (bucket_id, name) values ('videos-tecnicos', :'a' || '/999-056-0001/v1.mp4'), ('videos-tecnicos', :'a' || '/999-056-0002/v2.mov');

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select case when pg_temp.falla(format('select alistamiento_video_registrar(%s, %L, %L, 1000, %L)', :a, '999-056-0001', :'a' || '/999-056-0001/v1.mp4', 'Josep'))
            then 'ok' else 'not ok' end || ' 2 - no se sube video a un pedido que nadie ha tomado';
select alistamiento_tomar(:a, 'Josep');
select alistamiento_documento(:a, 'OP', '123');
select case when pg_temp.falla(format('select alistamiento_video_registrar(%s, %L, %L, 1000, %L)', :a, '999-056-0001', :'a' || '/999-056-0001/v1.mp4', 'Camilo Osorio'))
            then 'ok' else 'not ok' end || ' 3 - solo quien tiene el pedido sube sus videos';
select case when pg_temp.falla(format('select alistamiento_video_registrar(%s, %L, %L, 1000, %L)', :a, '999-999-0000', :'a' || '/999-056-0001/v1.mp4', 'Josep'))
            then 'ok' else 'not ok' end || ' 4 - un equipo que no es del pedido se rechaza';
select case when pg_temp.falla(format('select alistamiento_video_registrar(%s, %L, %L, 1000, %L)', :a, '999-056-0001', :'a' || '/999-056-0001/no-existe.mp4', 'Josep'))
            then 'ok' else 'not ok' end || ' 5 - si el archivo no llegó al servidor, no se registra';
select alistamiento_video_registrar(:a, '999-056-0001', :'a' || '/999-056-0001/v1.mp4', 1000, 'Josep') as v1 \gset
select case when (select estado = 'procesando' and tecnico = 'Josep' and vence_en > now() + interval '179 days' from alistamiento_videos where id = :v1)
            then 'ok' else 'not ok' end || ' 6 - el video queda «procesando», con el técnico y vence en 6 meses';

select case when pg_temp.falla(format('select alistamiento_listo(%s, %L)', :a, 'Josep')) then 'ok' else 'not ok' end
       || ' 7 - sin video del segundo equipo no se puede marcar listo';
select alistamiento_video_registrar(:a, '999-056-0002', :'a' || '/999-056-0002/v2.mov', 2000, 'Josep');
select alistamiento_listo(:a, 'Josep');
select case when (select estado = 'listo' from alistamientos where id = :a) then 'ok' else 'not ok' end
       || ' 8 - con un video por equipo y el documento, queda listo para despachar';

select case when (select jsonb_array_length(p -> 'videos') = 2 from jsonb_array_elements(servicio_tecnico_pedidos()) p where (p ->> 'id')::bigint = :a)
            then 'ok' else 'not ok' end || ' 9 - el servicio técnico ve los videos de cada equipo';
select case when (select count(*) from lead_eventos where lead_id = :l and detalle like '🎥 Josep subió el video de %') = 2
            then 'ok' else 'not ok' end || ' 10 - cada video queda en la línea de tiempo con el técnico';

rollback;

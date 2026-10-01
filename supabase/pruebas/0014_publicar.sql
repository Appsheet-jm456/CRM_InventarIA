-- Pruebas de la migración 0014 (F4·7). Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
begin;

-- Pruebas de un solo flujo (antes de la 0015): los demás bots se quitan dentro de la transacción (ROLLBACK).
set local session_replication_role = replica;
delete from bot_flujos where bot_id <> (select id from bots where principal);
delete from bots where not principal;
set local session_replication_role = origin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;
create function pg_temp.error_de(sentencia text) returns text language plpgsql as $$
begin
  execute sentencia;
  return '';
exception when others then
  return sqlerrm;
end $$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000014a1', 'prueba-0014-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000014a1', 'Prueba Asesor 0014', id from roles where nombre = 'asesor';
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
select version as v_pub from bot_flujos where estado = 'publicada' \gset

select case when problemas_del_flujo((select id from bot_flujos where estado = 'publicada')) = '[]'::jsonb
            then 'ok' else 'not ok' end || ' 1 - la versión publicada no tiene problemas';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select crear_borrador() as v_bor \gset
select borrador_crear_mensaje(0, 0) as m \gset
select case when pg_temp.error_de('select publicar_borrador()') like '%por resolver%'
            then 'ok' else 'not ok' end || ' 2 - no se publica con una opción sin destino ni un mensaje suelto';

-- Se arregla: el mensaje lleva al inicio y el menú principal lleva al mensaje
select borrador_guardar_cuadro(:'m', 'Envíos', '¿A qué ciudad?', '[{"id":"1","titulo":"Cali","destino":"B-ASESOR"},{"id":"0","titulo":"Volver","destino":"B00"}]');
select borrador_conectar('B00', '3', :'m');

-- Choque: alguien cambia un texto de la publicada después de abrir el borrador. En una transacción todo tiene la
-- misma hora: el borrador se abre "un minuto antes" para que el cambio quede después.
reset role;
update bot_flujos set creado_en = creado_en - interval '1 minute' where estado = 'borrador';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select editar_cuadro('ERROR', 'No entendí. Toca una opción.');
select case when pg_temp.error_de('select publicar_borrador(''QA'')') like 'CHOQUE%'
            then 'ok' else 'not ok' end || ' 3 - avisa si la publicada cambió después de abrir el borrador';

select publicar_borrador('Agrega envíos', true) as publicada \gset
reset role;
select case when (select estado from bot_flujos where version = :v_bor) = 'publicada'
             and (select estado from bot_flujos where version = :v_pub) = 'archivada'
             and (select publicado_por from bot_flujos where version = :v_bor) = :'admin'
             and (select nota from bot_flujos where version = :v_bor) = 'Agrega envíos'
            then 'ok' else 'not ok' end || ' 4 - publicar archiva la anterior y deja quién, cuándo y la nota';

select case when pg_temp.falla(format($q$update bot_cuadros set texto = 'x' where clave = 'ERROR' and flujo_id = (select id from bot_flujos where version = %s)$q$, :v_pub))
            then 'ok' else 'not ok' end || ' 5 - una versión archivada no se cambia';

-- Volver a la anterior: queda como borrador, igual a la archivada
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select borrador_desde_version(:v_pub) as v_vuelta \gset
select case when pg_temp.falla(format('select borrador_desde_version(%s)', :v_pub))
            then 'ok' else 'not ok' end || ' 6 - no reemplaza un borrador abierto sin pedirlo';
reset role;
select case when (select count(*) from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.version = :v_vuelta)
               = (select count(*) from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.version = :v_pub)
             and not exists (select 1 from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.version = :v_vuelta and k.clave = :'m')
            then 'ok' else 'not ok' end || ' 7 - volver a una versión la copia como borrador';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000014a1","role":"authenticated"}', true);
select case when pg_temp.falla('select publicar_borrador()') and pg_temp.falla(format('select borrador_desde_version(%s, true)', :v_pub))
            then 'ok' else 'not ok' end || ' 8 - el asesor no publica ni vuelve a versiones';
reset role;
rollback;

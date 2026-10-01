-- Pruebas de la migración 0012 (F4·6). Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
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

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000012a1', 'prueba-0012-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000012a1', 'Prueba Asesor 0012', id from roles where nombre = 'asesor';
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
select md5(string_agg(k.clave || k.texto || coalesce(k.opciones::text, ''), '|' order by k.clave)) as publicada
from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.estado = 'publicada' \gset

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000012a1","role":"authenticated"}', true);
select case when pg_temp.falla('select crear_borrador()') then 'ok' else 'not ok' end || ' 1 - el asesor no crea borradores';
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select crear_borrador() as version \gset
select case when crear_borrador() = :version
             and (select count(*) from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.estado = 'borrador')
               = (select count(*) from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.estado = 'publicada')
            then 'ok' else 'not ok' end || ' 2 - el borrador copia la versión publicada y no se duplica';

select borrador_crear_mensaje(100, 200) as m \gset
select case when (select opciones->1->>'destino' from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                  where f.estado = 'borrador' and k.clave = :'m') = 'B00'
            then 'ok' else 'not ok' end || ' 3 - un mensaje nuevo trae la opción de volver al inicio';

select borrador_guardar_cuadro(:'m', 'Envíos', '¿A qué ciudad enviamos?',
  '[{"id":"1","titulo":"Cali","destino":"B001A"},{"id":"2","titulo":"Otra ciudad","destino":"B-ASESOR"},{"id":"0","titulo":"Volver","destino":"B00"}]');
select borrador_conectar('B00', '3', :'m');
select borrador_mover(:'m', 400, 500);
select case when k.nombre = 'Envíos' and jsonb_array_length(k.opciones) = 3 and k.x = 400
             and (select opciones->2->>'destino' from bot_cuadros b where b.flujo_id = k.flujo_id and b.clave = 'B00') = :'m'
             and (select opciones->2->'palabras' ? 'garantia' from bot_cuadros b where b.flujo_id = k.flujo_id and b.clave = 'B00')
            then 'ok' else 'not ok' end || ' 4 - guardar, conectar y mover; la opción conserva sus palabras'
from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.estado = 'borrador' and k.clave = :'m';

select case when pg_temp.falla(format($q$select borrador_conectar(%L, '1', 'R11')$q$, :'m'))
             and pg_temp.falla(format($q$select borrador_conectar(%L, '1', 'B001A5')$q$, :'m'))
             and pg_temp.falla(format($q$select borrador_conectar(%L, '1', 'NO-EXISTE')$q$, :'m'))
            then 'ok' else 'not ok' end || ' 5 - no se llega con flecha a la ficha, la lista ni a lo que no existe';
select case when pg_temp.falla(format($q$select borrador_guardar_cuadro(%L, null, null, '[{"id":"9","titulo":"Nueve","destino":null}]')$q$, :'m'))
             and pg_temp.falla(format($q$select borrador_guardar_cuadro(%L, null, null, '[{"id":"1","titulo":"A"},{"id":"1","titulo":"B"}]')$q$, :'m'))
            then 'ok' else 'not ok' end || ' 6 - opciones: el 9 está reservado y sin repetidos (sin opciones es válido desde 0016)';
select case when pg_temp.falla($q$select borrador_guardar_cuadro('R11', null, null, '[{"id":"1","titulo":"Uno"}]')$q$)
             and pg_temp.falla($q$select borrador_conectar('R11', '1', 'B00')$q$)
             and pg_temp.falla($q$select borrador_borrar_cuadro('B-ASESOR')$q$)
             and pg_temp.falla($q$select borrador_borrar_cuadro('B00')$q$)
            then 'ok' else 'not ok' end || ' 7 - los cuadros del sistema y el inicio no cambian de forma ni se borran';

select borrador_borrar_cuadro(:'m');
select case when (select opciones->2->>'destino' from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                  where f.estado = 'borrador' and k.clave = 'B00') is null
            then 'ok' else 'not ok' end || ' 8 - borrar un mensaje suelta las flechas que llegaban';

select case when (select md5(string_agg(k.clave || k.texto || coalesce(k.opciones::text, ''), '|' order by k.clave))
                  from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.estado = 'publicada') = :'publicada'
            then 'ok' else 'not ok' end || ' 9 - el borrador no toca la versión publicada';

select descartar_borrador();
select case when not exists (select 1 from bot_flujos where estado = 'borrador')
             and pg_temp.falla('select borrador_crear_mensaje(0, 0)')
            then 'ok' else 'not ok' end || ' 10 - descartar borra el borrador y sin borrador no se edita';
reset role;
rollback;

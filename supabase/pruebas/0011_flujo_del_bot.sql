-- Pruebas de la migración 0011 (F4·5, decisión 0026). Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

-- La versión 1 está sana: una publicada, un inicio y todo destino existe
select case when (select count(*) from bot_flujos where estado = 'publicada') = 1
             and (select count(*) from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.estado = 'publicada' and k.inicio) = 1
            then 'ok' else 'not ok' end || ' 1 - hay una versión publicada con un solo inicio';
select case when not exists (
         select 1 from bot_cuadros k join bot_flujos f on f.id = k.flujo_id, jsonb_array_elements(coalesce(k.opciones, '[]')) o
         where f.estado = 'publicada' and o->>'destino' <> '@pedir_codigo'
           and not exists (select 1 from bot_cuadros d where d.flujo_id = k.flujo_id and d.clave = o->>'destino'))
       and not exists (
         select 1 from bot_cuadros k join bot_flujos f on f.id = k.flujo_id, jsonb_each_text(k.salidas) s
         where f.estado = 'publicada' and not exists (select 1 from bot_cuadros d where d.flujo_id = k.flujo_id and d.clave = s.value))
            then 'ok' else 'not ok' end || ' 2 - toda opción y salida lleva a un cuadro que existe';
select case when (select count(*) from bot_cuadros where tipo = 'asesor') = 1 and (select count(*) from bot_cuadros where tipo = 'ficha') = 1
             and (select count(*) from bot_cuadros where tipo = 'equipos') = 1
            then 'ok' else 'not ok' end || ' 3 - los cuadros del sistema están una vez';

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000011a1', 'prueba-0011-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000011a1', 'Prueba Asesor 0011', id from roles where nombre = 'asesor';
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset

-- El asesor no ve ni cambia el flujo
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000011a1","role":"authenticated"}', true);
select case when (select count(*) from bot_cuadros) = 0 and pg_temp.falla($q$select editar_cuadro('ERROR', 'Hola')$q$)
            then 'ok' else 'not ok' end || ' 4 - el asesor no ve ni edita el flujo';
reset role;

-- El administrador cambia títulos sin tocar destinos ni palabras
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select editar_cuadro('B00', null, '[{"id":"1","titulo":"Ver productos"},{"id":"2","titulo":"Distribuidores"},{"id":"3","titulo":"Servicio al cliente"}]');
reset role;
select case when opciones->0->>'titulo' = 'Ver productos' and opciones->0->>'destino' = 'B001A'
             and opciones->0->'palabras' ? 'productos' and opciones->1->'efectos'->>'etiqueta' = 'Interes-Distribuidor'
            then 'ok' else 'not ok' end || ' 5 - cambiar un título conserva destino, palabras y efectos'
from bot_cuadros where clave = 'B00';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select case when pg_temp.falla($q$select editar_cuadro('B00', null, '[{"id":"1","titulo":"Uno"},{"id":"2","titulo":"Dos"}]')$q$)
             and pg_temp.falla($q$select editar_cuadro('B00', null, '[{"id":"1","titulo":"Uno"},{"id":"2","titulo":"Dos"},{"id":"7","titulo":"Siete"}]')$q$)
            then 'ok' else 'not ok' end || ' 6 - no se agregan ni quitan opciones desde el editor';
select case when pg_temp.falla($q$select editar_cuadro('NO-EXISTE', 'Hola')$q$)
            then 'ok' else 'not ok' end || ' 7 - un cuadro que no existe da error';
select restaurar_cuadro('B00');
reset role;
select case when opciones->0->>'titulo' = 'Productos' and opciones->0->>'destino' = 'B001A'
            then 'ok' else 'not ok' end || ' 8 - restaurar vuelve al título original con su destino'
from bot_cuadros where clave = 'B00';

-- No puede haber dos publicadas ni dos inicios
select case when pg_temp.falla($q$insert into bot_flujos (version, estado) values (99, 'publicada')$q$)
             and pg_temp.falla($q$update bot_cuadros set inicio = true where clave = 'B001A'$q$)
            then 'ok' else 'not ok' end || ' 9 - una sola versión publicada y un solo inicio';

rollback;

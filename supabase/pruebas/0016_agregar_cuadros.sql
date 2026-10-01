-- Pruebas de la migración 0016 (F4·10): mensaje sin botones e "Ir a otro bot". Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

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
-- Los problemas de un cuadro del borrador de un bot, como texto.
create function pg_temp.problemas(p_bot bigint, p_clave text) returns text language sql security definer as $$
  select coalesce(string_agg(p->>'problema', ' | '), '')
  from jsonb_array_elements(problemas_del_flujo((select id from bot_flujos where bot_id = p_bot and estado = 'borrador'))) p
  where p->>'clave' = p_clave
$$;

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
select id as b_princ from bots where principal \gset

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select crear_bot('Prueba 0016 A') as b_a \gset
select crear_bot('Prueba 0016 B') as b_b \gset

-- Mensaje sin botones (RF-09)
select borrador_crear_cuadro('mensaje', 0, 0, :b_a) as m \gset
select borrador_guardar_cuadro(:'m', 'Ciudad', '¿A qué ciudad enviamos?', '[]', :b_a);
select case when (select formato from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.bot_id = :b_a and k.clave = :'m') = 'texto'
             and (select salidas from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.bot_id = :b_a and k.clave = :'m') = '{"respuesta": null}'
             and pg_temp.problemas(:b_a, :'m') like '%Cuando el cliente responda» no lleva%'
            then 'ok' else 'not ok' end || ' 1 - un mensaje sin opciones queda de texto con la salida «respuesta» suelta';

select borrador_conectar(:'m', 'respuesta', 'B-ASESOR', :b_a);
select borrador_guardar_cuadro('B00', null, null, ('[{"id":"1","titulo":"Envíos","destino":"' || :'m' || '"}]')::jsonb, :b_a);
select case when pg_temp.problemas(:b_a, :'m') = ''
             and (select salidas->>'respuesta' from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.bot_id = :b_a and k.clave = :'m') = 'B-ASESOR'
            then 'ok' else 'not ok' end || ' 2 - la flecha «respuesta» se une y el mensaje queda sano';

select case when pg_temp.falla(format('select borrador_conectar(%L, %L, %L, %s)', :'m', 'respuesta', 'R11', :b_a))
             and pg_temp.falla(format('select borrador_conectar(%L, %L, %L, %s)', :'m', 'otra', 'B00', :b_a))
             and pg_temp.falla(format('select borrador_conectar(%L, %L, %L, %s)', 'B-ASESOR', 'siguiente', 'B00', :b_a))
            then 'ok' else 'not ok' end || ' 3 - no se une a la ficha, a una salida que no existe ni desde un cuadro del sistema';

-- Volver a ponerle opciones lo deja como menú y quita la salida «respuesta»
select borrador_guardar_cuadro(:'m', null, null, '[{"id":"1","titulo":"Cali","destino":"B-ASESOR"}]', :b_a);
select case when (select formato || ' ' || salidas::text from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.bot_id = :b_a and k.clave = :'m') = 'menu {}'
            then 'ok' else 'not ok' end || ' 4 - con opciones vuelve a ser menú, sin salida «respuesta»';
select borrador_guardar_cuadro(:'m', null, null, '[]', :b_a, '{"respuesta": "B00"}');

-- Ir a otro bot (RF-17)
select borrador_crear_cuadro('ir_bot', 300, 0, :b_a) as ir \gset
select case when pg_temp.problemas(:b_a, :'ir') like '%Elige a qué bot lleva%'
             and pg_temp.problemas(:b_a, :'ir') like '%Ningún cuadro lleva aquí%'
            then 'ok' else 'not ok' end || ' 5 - un «Ir a otro bot» nuevo pide su bot y que alguien llegue';
select case when pg_temp.falla(format('select borrador_guardar_ajustes(%L, null, %L, %s)', :'ir', json_build_object('bot_id', :b_a), :b_a))
             and pg_temp.falla(format('select borrador_guardar_ajustes(%L, null, %L, %s)', :'ir', '{"bot_id": 999999}', :b_a))
             and pg_temp.falla(format('select borrador_guardar_cuadro(%L, null, %L, null, %s)', :'ir', 'texto', :b_a))
            then 'ok' else 'not ok' end || ' 6 - no se lleva a sí mismo, ni a un bot que no existe, ni se guarda como mensaje';

select borrador_guardar_ajustes(:'ir', 'A distribuidores', json_build_object('bot_id', :b_b)::jsonb, :b_a);
select borrador_guardar_cuadro('B00', null, null, ('[{"id":"1","titulo":"Envíos","destino":"' || :'m' || '"},{"id":"2","titulo":"Otro bot","destino":"' || :'ir' || '"}]')::jsonb, :b_a);
select case when pg_temp.problemas(:b_a, :'ir') like '%aún no está publicado%'
             and pg_temp.error_de(format('select publicar_borrador(%L, false, %s)', '', :b_a)) like '%por resolver%'
            then 'ok' else 'not ok' end || ' 7 - no se publica si el bot de destino no está publicado';

select borrador_guardar_cuadro('B00', null, 'Bot B', '[{"id":"1","titulo":"Asesor","destino":"B-ASESOR"}]', :b_b);
select publicar_borrador('', false, :b_b);
select publicar_borrador('', false, :b_a) as v_a \gset
select case when :v_a = 1 and (select ajustes from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                               where f.bot_id = :b_a and f.estado = 'publicada' and k.clave = :'ir') = json_build_object('bot_id', :b_b)::jsonb
            then 'ok' else 'not ok' end || ' 8 - con el destino publicado se publica, con sus ajustes';

select crear_borrador(:b_a);
select case when (select ajustes from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                  where f.bot_id = :b_a and f.estado = 'borrador' and k.clave = :'ir') = json_build_object('bot_id', :b_b)::jsonb
            then 'ok' else 'not ok' end || ' 9 - el borrador nuevo copia los ajustes';

select case when pg_temp.error_de(format('select archivar_bot(%s)', :b_b)) like '%lleva aquí desde%'
            then 'ok' else 'not ok' end || ' 10 - un bot al que otro lleva no se archiva';

-- Borrar el «Ir a otro bot» suelta la opción que llegaba; borrar el mensaje suelta la salida que llegaba
select borrador_borrar_cuadro(:'ir', :b_a);
select case when (select o->>'destino' from bot_cuadros k join bot_flujos f on f.id = k.flujo_id, jsonb_array_elements(k.opciones) o
                  where f.bot_id = :b_a and f.estado = 'borrador' and k.clave = 'B00' and o->>'id' = '2') is null
            then 'ok' else 'not ok' end || ' 11 - borrar un cuadro del dueño suelta las flechas que llegaban';
select borrador_crear_cuadro('mensaje', 0, 300, :b_a) as m2 \gset
select borrador_guardar_cuadro(:'m2', null, 'Otro', '[]', :b_a, json_build_object('respuesta', :'m')::jsonb);
select borrador_borrar_cuadro(:'m', :b_a);
select case when (select salidas from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                  where f.bot_id = :b_a and f.estado = 'borrador' and k.clave = :'m2') = '{"respuesta": null}'
            then 'ok' else 'not ok' end || ' 12 - también se suelta una salida con nombre';

select case when pg_temp.falla(format('select borrador_crear_cuadro(%L, 0, 0, %s)', 'aviso', :b_a))
             and pg_temp.falla(format('select borrador_crear_cuadro(%L, 0, 0, %s)', 'nada', :b_a))
            then 'ok' else 'not ok' end || ' 13 - los cuadros del sistema no se crean desde el lienzo';

reset role;
rollback;

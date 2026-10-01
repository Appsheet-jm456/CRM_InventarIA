-- Pruebas de la migración 0015 (F4·9): varios bots. Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
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

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000015a1', 'prueba-0015-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000015a1', 'Prueba Asesor 0015', id from roles where nombre = 'asesor';
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
select id as b_princ from bots where principal \gset
select count(*) as n_cuadros from bot_cuadros where flujo_id = (select id from bot_flujos where bot_id = :b_princ and estado = 'publicada') \gset

select case when (select count(*) from bots where principal) = 1
             and exists (select 1 from bot_flujos where bot_id = :b_princ and estado = 'publicada')
            then 'ok' else 'not ok' end || ' 1 - hay un solo bot principal y está publicado';

-- El asesor no administra bots
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000015a1', 'role', 'authenticated')::text, true);
select case when (select count(*) from bots) = 0
             and pg_temp.falla($$select crear_bot('Intruso')$$)
             and pg_temp.falla($$select marcar_principal(1)$$)
            then 'ok' else 'not ok' end || ' 2 - el asesor no ve ni crea bots';

-- El administrador crea un bot en blanco y un duplicado
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select crear_bot('Distribuidores') as b_blanco \gset
select crear_bot('Copia del principal', :b_princ) as b_copia \gset

select case when exists (select 1 from bots where id = :b_blanco and not principal and not archivado)
             and (select count(*) from bot_flujos where bot_id = :b_blanco) = 1
             and exists (select 1 from bot_flujos where bot_id = :b_blanco and estado = 'borrador' and version = 1)
             and not exists (select 1 from bot_flujos where bot_id = :b_blanco and estado = 'publicada')
            then 'ok' else 'not ok' end || ' 3 - un bot nuevo nace como borrador, versión 1, sin publicar';

select case when (select count(*) from bot_cuadros where flujo_id = (select id from bot_flujos where bot_id = :b_blanco)
                  and (inicio or tipo in ('asesor', 'aviso', 'ficha'))) = (select count(*) from bot_cuadros where flujo_id = (select id from bot_flujos where bot_id = :b_blanco))
             and (select count(*) from bot_cuadros where flujo_id = (select id from bot_flujos where bot_id = :b_blanco) and inicio) = 1
             and exists (select 1 from bot_cuadros where flujo_id = (select id from bot_flujos where bot_id = :b_blanco) and clave = 'B00' and inicio)
            then 'ok' else 'not ok' end || ' 4 - el bot en blanco trae su saludo y solo los cuadros que el motor necesita';

select case when (select count(*) from bot_cuadros where flujo_id = (select id from bot_flujos where bot_id = :b_copia)) = :n_cuadros
             and exists (select 1 from bot_flujos where bot_id = :b_copia and estado = 'borrador' and version = 1)
            then 'ok' else 'not ok' end || ' 5 - duplicar copia todos los cuadros de la publicada como borrador';

select case when pg_temp.falla($$select crear_bot('  distribuidores ')$$)
             and pg_temp.falla($$select crear_bot('   ')$$)
             and pg_temp.falla($$select renombrar_bot((select id from bots where principal), 'DISTRIBUIDORES')$$)
            then 'ok' else 'not ok' end || ' 6 - el nombre es único sin importar mayúsculas ni espacios, y no puede ir vacío';

-- Un bot en blanco no se publica hasta resolver su saludo; después sí, sin tocar al principal
select case when pg_temp.error_de(format('select publicar_borrador(%L, false, %s)', '', :b_blanco)) like '%por resolver%'
            then 'ok' else 'not ok' end || ' 7 - el bot en blanco no se publica con su opción sin destino';
select borrador_guardar_cuadro('B00', 'Saludo', 'Hola, soy el bot de distribuidores.', '[{"id":"1","titulo":"Hablar con asesor","destino":"B-ASESOR"}]', :b_blanco);
select publicar_borrador('Primera versión', false, :b_blanco) as v_pub \gset
select case when :v_pub = 1
             and exists (select 1 from bot_flujos where bot_id = :b_blanco and estado = 'publicada' and version = 1)
             and exists (select 1 from bot_flujos where bot_id = :b_princ and estado = 'publicada')
             and (select count(*) from bot_flujos where estado = 'publicada') = 2
            then 'ok' else 'not ok' end || ' 8 - publicar un bot no archiva al otro y cada uno numera sus versiones';

-- Las versiones y borradores de un bot no se mezclan con las de otro (el principal puede tener un borrador abierto)
select count(*) as n_bor_princ from bot_cuadros where flujo_id in (select id from bot_flujos where bot_id = :b_princ and estado = 'borrador') \gset
select crear_borrador(:b_blanco) as v_bor \gset
select borrador_crear_mensaje(0, 0, :b_blanco) as m \gset
select case when :v_bor = 2
             and exists (select 1 from bot_cuadros where flujo_id = (select id from bot_flujos where bot_id = :b_blanco and estado = 'borrador') and clave = :'m')
             and (select count(*) from bot_cuadros where flujo_id in (select id from bot_flujos where bot_id = :b_princ and estado = 'borrador')) = :n_bor_princ
             and (select count(*) from bot_flujos where bot_id = :b_blanco and estado = 'borrador') = 1
            then 'ok' else 'not ok' end || ' 9 - el borrador de un bot no toca a otro';
select descartar_borrador(:b_blanco);

-- Principal y archivados
select case when pg_temp.falla(format('select marcar_principal(%s)', :b_copia))
             and pg_temp.falla(format('select archivar_bot(%s)', :b_princ))
            then 'ok' else 'not ok' end || ' 10 - no se marca principal un bot sin publicar ni se archiva el principal';

select marcar_principal(:b_blanco);
select case when (select count(*) from bots where principal) = 1
             and (select principal from bots where id = :b_blanco)
             and not (select principal from bots where id = :b_princ)
            then 'ok' else 'not ok' end || ' 11 - cambiar el principal deja uno solo';

select archivar_bot(:b_princ);
select case when (select archivado from bots where id = :b_princ)
             and pg_temp.falla(format('select crear_borrador(%s)', :b_princ))
             and pg_temp.falla(format('select publicar_borrador(%L, false, %s)', '', :b_princ))
            then 'ok' else 'not ok' end || ' 12 - un bot archivado se ve pero no se cambia';
select desarchivar_bot(:b_princ);
select renombrar_bot(:b_princ, 'Bienvenida v2');
select case when (select nombre from bots where id = :b_princ) = 'Bienvenida v2' and not (select archivado from bots where id = :b_princ)
            then 'ok' else 'not ok' end || ' 13 - desarchivar y renombrar';

-- Los cuadros siguen sin ser editables directo por la app
select case when pg_temp.falla($$update bots set nombre = 'x'$$) and pg_temp.falla($$delete from bots$$)
            then 'ok' else 'not ok' end || ' 14 - la app no escribe en bots directo';

rollback;

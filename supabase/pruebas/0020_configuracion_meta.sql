-- Pruebas de la migración 0020 (F4·16 bloque A): Configuración Meta y secretos en Vault. Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
begin;

-- Las pruebas parten de una base sin conexión: la del dueño se aparta aquí y vuelve con el ROLLBACK.
delete from vault.secrets where name in ('meta_token', 'meta_app_secret', 'meta_verify_token');
update meta_conexion set estado = 'sin_conexion', app_id = null, waba_id = null, phone_number_id = null, numero_visible = null,
  nombre_verificado = null, calidad = null, token_id = null, app_secret_id = null, verify_token_id = null, token_guardado_en = null,
  app_secret_guardado_en = null, verify_token_guardado_en = null, ultima_prueba_en = null, ultima_prueba = null where id = 1;
delete from meta_conexion_historial;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000020a1', 'prueba-0020-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000020a1', 'Prueba Asesor 0020', id from roles where nombre = 'asesor';

-- RC-05: solo el Administrador tiene el permiso
select case when exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where r.nombre = 'administrador' and rp.permiso = 'administrar_meta')
             and not exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where r.nombre = 'asesor' and rp.permiso = 'administrar_meta')
            then 'ok' else 'not ok' end || ' 1 - administrar_meta es solo del administrador';

select case when (select estado from meta_conexion where id = 1) = 'sin_conexion'
             and (select count(*) from vault.secrets where name like 'meta\_%') = 0
            then 'ok' else 'not ok' end || ' 2 - arranca sin conexión y sin secretos';

-- El asesor no ve ni escribe nada
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000020a1', 'role', 'authenticated')::text, true);
select case when (select count(*) from meta_conexion) = 0 and (select count(*) from meta_conexion_historial) = 0
             and pg_temp.falla($q$ select meta_guardar('11111', '22222', '33333', repeat('t', 30), repeat('s', 32), null, null, null, '{"ok": true}') $q$)
             and pg_temp.falla('select meta_desconectar()')
             and pg_temp.falla('select meta_nuevo_verify_token()')
             and pg_temp.falla($q$ select meta_anotar_prueba('{"ok": true}') $q$)
            then 'ok' else 'not ok' end || ' 3 - el asesor no ve la conexión ni la cambia';

-- El administrador: validaciones al guardar
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select case when pg_temp.falla($q$ select meta_guardar('11111', '22222', '33333', repeat('t', 30), repeat('s', 32)) $q$)
             and pg_temp.falla($q$ select meta_guardar('11111', '22222', '33333', repeat('t', 30), repeat('s', 32), null, null, null, '{"ok": false}') $q$)
             and pg_temp.falla($q$ select meta_guardar('abc', '22222', '33333', repeat('t', 30), repeat('s', 32), null, null, null, '{"ok": true}') $q$)
             and pg_temp.falla($q$ select meta_guardar('11111', '22222', '33333', null, repeat('s', 32), null, null, null, '{"ok": true}') $q$)
             and pg_temp.falla($q$ select meta_guardar('11111', '22222', '33333', repeat('t', 30), null, null, null, null, '{"ok": true}') $q$)
             and pg_temp.falla($q$ select meta_guardar('11111', '22222', '33333', 'corto', repeat('s', 32), null, null, null, '{"ok": true}') $q$)
            then 'ok' else 'not ok' end || ' 4 - rechaza sin prueba, ids que no son números, y token o App Secret ausentes o cortos (RC-03)';

-- Primer guardado: devuelve el token de verificación una sola vez
select meta_guardar('1111111', '2222222', '3333333', 'TOKEN-SECRETO-DE-PRUEBA-0020-aaaaaaaaaaaa', 'SECRETO-APP-0020-bbbbbbbbbbbbbbbbbbbb',
                    '+1 555 000 0000', 'Prueba', 'GREEN', '{"ok": true, "pasos": [{"paso": "token", "ok": true}]}') as v1 \gset
select case when length(:'v1') = 48 and :'v1' ~ '^[0-9a-f]+$'
             and (select estado from meta_conexion) = 'conectada'
             and (select app_id from meta_conexion) = '1111111'
            then 'ok' else 'not ok' end || ' 5 - el primer guardado conecta y entrega el token de verificación generado';

-- RC-01: ni el administrador puede leer los secretos
select case when pg_temp.falla('select * from vault.decrypted_secrets')
             and pg_temp.falla('select * from vault.secrets')
             and pg_temp.falla('select meta_config()')
             and pg_temp.falla('select token_id from meta_conexion')
             and pg_temp.falla('select app_secret_id from meta_conexion')
             and pg_temp.falla('select verify_token_id from meta_conexion')
             and pg_temp.falla($q$ update meta_conexion set app_id = '99999' $q$)
             and pg_temp.falla('delete from meta_conexion')
             and pg_temp.falla($q$ insert into meta_conexion_historial (accion) values ('conectó') $q$)
            then 'ok' else 'not ok' end || ' 6 - el administrador no lee los secretos y no escribe directo en las tablas (RC-01)';

select case when (select token_guardado_en is not null and app_secret_guardado_en is not null and verify_token_guardado_en is not null from meta_conexion)
             and (select ultima_prueba ->> 'ok' from meta_conexion) = 'true'
             and meta_conectada()
            then 'ok' else 'not ok' end || ' 7 - ve cuándo se guardó cada secreto y el resultado de la prueba, no los valores';

-- Solo el servidor lee los secretos
reset role;
select case when (select count(*) from vault.secrets where name in ('meta_token', 'meta_app_secret', 'meta_verify_token')) = 3
             and not exists (select 1 from vault.secrets where secret like '%TOKEN-SECRETO-DE-PRUEBA%')  -- cifrado, no en claro
            then 'ok' else 'not ok' end || ' 8 - los tres secretos están en Vault y cifrados';
set local role service_role;
select case when meta_config() ->> 'token' = 'TOKEN-SECRETO-DE-PRUEBA-0020-aaaaaaaaaaaa'
             and meta_config() ->> 'app_secret' = 'SECRETO-APP-0020-bbbbbbbbbbbbbbbbbbbb'
             and meta_config() ->> 'verify_token' = :'v1'
             and meta_config() ->> 'phone_number_id' = '3333333'
            then 'ok' else 'not ok' end || ' 9 - el servidor (service_role) lee la conexión completa con meta_config';
reset role;

set local role anon;
select case when pg_temp.falla('select meta_config()') and pg_temp.falla('select meta_conectada()')
             and pg_temp.falla('select * from meta_conexion')
            then 'ok' else 'not ok' end || ' 10 - sin sesión no hay acceso a nada';
reset role;

-- Cambiar un solo dato conserva los demás secretos
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select coalesce(meta_guardar('1111111', '2222222', '4444444', null, null, '+57 320 000 0000', 'Real', 'GREEN', '{"ok": true}'), '') as v2 \gset
reset role; set local role service_role;
select case when :'v2' = '' and meta_config() ->> 'phone_number_id' = '4444444'
             and meta_config() ->> 'token' = 'TOKEN-SECRETO-DE-PRUEBA-0020-aaaaaaaaaaaa'
             and meta_config() ->> 'verify_token' = :'v1'
            then 'ok' else 'not ok' end || ' 11 - cambiar el número conserva token, App Secret y token de verificación (campos vacíos mantienen)';
reset role; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

-- Rotar el token: reemplaza el valor sin duplicar secretos
select meta_guardar('1111111', '2222222', '4444444', 'TOKEN-NUEVO-DE-PRUEBA-0020-cccccccccccc', null, null, null, null, '{"ok": true}');
reset role;
select case when (select count(*) from vault.secrets where name = 'meta_token') = 1 then 'ok' else 'not ok' end || ' 12 - rotar el token no deja copias';
set local role service_role;
select case when meta_config() ->> 'token' = 'TOKEN-NUEVO-DE-PRUEBA-0020-cccccccccccc' then 'ok' else 'not ok' end || ' 13 - el servidor ve el token nuevo';
reset role; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select meta_nuevo_verify_token() as v3 \gset
select meta_anotar_prueba('{"ok": false, "pasos": [{"paso": "token", "ok": false}]}');
select case when length(:'v3') = 48 and :'v3' <> :'v1' and (select ultima_prueba ->> 'ok' from meta_conexion) = 'false'
            then 'ok' else 'not ok' end || ' 14 - pide un token de verificación nuevo y anota una prueba fallida';

-- RC-05: el historial dice quién y qué campos, nunca valores
select case when (select count(*) from meta_conexion_historial) = 5
             and (select string_agg(accion, ',' order by id) from meta_conexion_historial) = 'conectó,cambió,cambió,nuevo token de verificación,probó'
             and not exists (select 1 from meta_conexion_historial h
                             where h::text ~ ('TOKEN-|SECRETO-APP|' || :'v1' || '|' || :'v3'))
             and (select campos from meta_conexion_historial order by id limit 1) @> array['app_id', 'token', 'app_secret', 'verify_token']
             and not exists (select 1 from meta_conexion_historial where usuario_id is distinct from :'admin'::uuid)
            then 'ok' else 'not ok' end || ' 15 - el historial anota quién y qué campos, sin valores (RC-05)';

-- Desconectar borra los tres secretos
select meta_desconectar();
select case when pg_temp.falla('select meta_desconectar()') then 'ok' else 'not ok' end || ' 16 - no se desconecta dos veces';
reset role;
select case when (select count(*) from vault.secrets where name like 'meta\_%') = 0
             and (select estado from meta_conexion) = 'sin_conexion'
             and (select app_id from meta_conexion) is null and (select token_id from meta_conexion) is null
             and (select count(*) from meta_conexion_historial where accion = 'desconectó') = 1
            then 'ok' else 'not ok' end || ' 17 - desconectar borra los secretos de Vault y vacía la conexión';
set local role service_role;
select case when meta_config() is null then 'ok' else 'not ok' end || ' 18 - sin conexión meta_config devuelve null (el servidor usa .env.meta, RC-07)';
reset role;

rollback;

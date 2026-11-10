-- Pruebas de la migración 0063 (F4·60, RI-13 y RI-14): dónde se usa un catálogo y modificarlo sin cambiar su número. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

insert into catalogos (nombre, categoria, marca, tipo, url) values ('Prueba 0063', 'Portátiles', 'PRUEBA', 'drive', 'https://drive.google.com/x')
returning id as cat \gset
insert into bots (nombre) values ('Bot prueba 0063') returning id as bot \gset
insert into bot_flujos (bot_id, version, estado) values (:bot, 1, 'borrador') returning id as fl \gset
insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, ajustes)
values (:fl, 'C1', 'catalogo', 'Catálogo de prueba', 1, 'Te envío el catálogo', 'Te envío el catálogo', jsonb_build_object('catalogo_id', :cat));
insert into acciones (nombre, prioridad, hacer)
values ('Acción prueba 0063', 999, jsonb_build_array(jsonb_build_object('tipo', 'catalogo', 'modo', 'lista', 'catalogo_id', :cat)));

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select case when jsonb_array_length(catalogo_usos(:cat)) = 2 then 'ok' else 'not ok' end
       || ' 1 - catalogo_usos encuentra el cuadro del bot en borrador y la acción';
select case when catalogo_usos(:cat) -> 0 ->> 'donde' = 'Bot «Bot prueba 0063» (borrador), cuadro «Catálogo de prueba»'
              and catalogo_usos(:cat) -> 1 ->> 'donde' = 'Acción «Acción prueba 0063» (apagada)' then 'ok' else 'not ok' end
       || ' 2 - dice el bot, la versión, el cuadro y si la acción está apagada';

-- RI-13: modificar el enlace conserva el número y olvida la copia de Meta
update catalogos set url = 'https://drive.google.com/y', meta_media_id = '', meta_media_en = null where id = :cat;
select case when (select url from catalogos where id = :cat) = 'https://drive.google.com/y'
              and jsonb_array_length(catalogo_usos(:cat)) = 2 then 'ok' else 'not ok' end
       || ' 3 - el administrador modifica el enlace y el catálogo sigue con su número y sus usos';

reset role;
update bot_flujos set estado = 'archivada' where id = :fl;
set local role authenticated;
select case when jsonb_array_length(catalogo_usos(:cat)) = 1 then 'ok' else 'not ok' end
       || ' 4 - una versión archivada del bot no cuenta como uso';

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select case when not has_function_privilege('anon', 'public.catalogo_usos(bigint)', 'execute') then 'ok' else 'not ok' end
       || ' 5 - anon no puede consultar los usos';

rollback;

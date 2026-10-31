-- Pruebas de la migración 0023 (F4·19): Apariencia y modo oscuro por usuario. Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000023a1', 'prueba-0023-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000023a1', 'Prueba Asesor 0023', id from roles where nombre = 'asesor';

-- RA-01: solo el Administrador tiene el permiso
select case when exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where r.nombre = 'administrador' and rp.permiso = 'administrar_apariencia')
             and not exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where r.nombre = 'asesor' and rp.permiso = 'administrar_apariencia')
            then 'ok' else 'not ok' end || ' 1 - administrar_apariencia es solo del administrador';

-- El asesor ve la apariencia pero no la cambia
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000023a1', 'role', 'authenticated')::text, true);
with c as (update apariencia set color_principal = '#123456' where id = 1 returning 1)
select case when (select count(*) from apariencia) = 1 and (select count(*) from c) = 0
            then 'ok' else 'not ok' end || ' 2 - el asesor lee la apariencia y su cambio no toca ninguna fila';

-- RA-06: cada quien guarda su propio modo, y solo el suyo
select guardar_modo_oscuro(true);
select case when (select modo_oscuro from usuarios where id = '00000000-0000-4000-8000-0000000023a1') is true
             and (select modo_oscuro from usuarios where id = :'admin') is distinct from true
            then 'ok' else 'not ok' end || ' 3 - el modo oscuro del asesor no cambia el del administrador';

-- El administrador cambia colores, fuente y logo; la base valida los formatos (RA-05)
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
update apariencia set color_principal = '#2563C9', fuente = 'nunito', logo = 'logo/1730000000000.png' where id = 1;
select case when (select color_principal from apariencia) = '#2563C9' and (select actualizado_por from apariencia) = :'admin'::uuid
            then 'ok' else 'not ok' end || ' 4 - el administrador guarda y queda el sello de quién cambió';

select case when pg_temp.falla($q$ update apariencia set color_panel = '#12345' where id = 1 $q$)
             and pg_temp.falla($q$ update apariencia set color_panel = 'azul' where id = 1 $q$)
             and pg_temp.falla($q$ update apariencia set fuente = 'comic' where id = 1 $q$)
             and pg_temp.falla($q$ update apariencia set logo = '../otro/archivo.svg' where id = 1 $q$)
            then 'ok' else 'not ok' end || ' 5 - rechaza colores mal escritos, fuentes y rutas de logo que no son de la lista';

select case when pg_temp.falla($q$ update apariencia set actualizado_por = null where id = 1 $q$)
             and pg_temp.falla('insert into apariencia (id) values (2)')
            then 'ok' else 'not ok' end || ' 6 - el sello no se escribe a mano y no hay una segunda fila';

-- anon no ve nada
reset role;
set local role anon;
select case when pg_temp.falla('select * from apariencia') and pg_temp.falla('select guardar_modo_oscuro(true)')
            then 'ok' else 'not ok' end || ' 7 - anon no lee la apariencia ni guarda modo';

rollback;

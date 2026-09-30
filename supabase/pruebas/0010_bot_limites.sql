-- Pruebas de la migración 0010 (F4·4), sobre los cuadros de la versión publicada (0011). Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select case when pg_temp.falla($q$select editar_cuadro('B00', repeat('a', 1000))$q$)
            then 'ok' else 'not ok' end || ' 1 - un menú con botones no pasa de 1.024 contando las opciones';
select case when not pg_temp.falla($q$select editar_cuadro('B001A', repeat('a', 1500))$q$)
            then 'ok' else 'not ok' end || ' 2 - un menú con lista admite más de 1.024';
select case when pg_temp.falla($q$select editar_cuadro('B-ASESOR', 'Hola {horaro}')$q$)
            then 'ok' else 'not ok' end || ' 3 - una marca mal escrita no se guarda';
select case when pg_temp.falla($q$select editar_cuadro('B00', 'Hola {uso}')$q$)
            then 'ok' else 'not ok' end || ' 4 - una marca de otro mensaje no se guarda';
select case when not pg_temp.falla($q$select editar_cuadro('B-ASESOR', 'Te atiende un asesor. {horario}')$q$)
            then 'ok' else 'not ok' end || ' 5 - se puede quitar una marca (el aviso lo da la app)';
select case when pg_temp.falla($q$select editar_cuadro('R11', 'Otra ficha')$q$)
            then 'ok' else 'not ok' end || ' 6 - el texto de la ficha no se edita';
select case when not pg_temp.falla($q$select editar_cuadro('R11', null, '[{"id":"1","titulo":"Me gusta"},{"id":"2","titulo":"Ver otro código"},{"id":"0","titulo":"Menú principal"}]')$q$)
            then 'ok' else 'not ok' end || ' 7 - los botones de la ficha sí se editan';
select case when pg_temp.falla($q$select editar_cuadro('ERROR-3', repeat('a', 201))$q$)
            then 'ok' else 'not ok' end || ' 8 - el motivo no pasa de 200';
select case when pg_temp.falla($q$update bot_cuadros set formato = 'texto' where clave = 'B00'$q$)
            then 'ok' else 'not ok' end || ' 9 - la app no escribe los cuadros directo';
select case when (bot_medir('Hola', 'menu', '[{"id":"1","titulo":"A"},{"id":"2","titulo":"Bb"}]', '{}')->>'largo')::int = 4 + 2 + (1+3+1) + 1 + (1+3+2)
             and bot_medir('x', 'menu', '[{"id":"1","titulo":"Un título de más de veinte"}]', '{}')->>'forma' = 'lista'
            then 'ok' else 'not ok' end || ' 10 - bot_medir cuenta como flujo.menu';

reset role;
rollback;

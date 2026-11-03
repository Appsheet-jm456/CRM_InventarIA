-- Pruebas de la migración 0042 (F4·37): plantilla de equipos de Avi. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select case when (select plantilla_equipo like '💻 *{equipo}*%{precio}*' and max_equipos between 1 and 10 and not equipos_separados from agente_config where id = 1)
            then 'ok' else 'not ok' end || ' 1 - viene con la plantilla de ejemplo y un máximo de equipos válido';
select case when pg_temp.falla('update agente_config set plantilla_equipo = ''  '' where id = 1')
             and pg_temp.falla('update agente_config set max_equipos = 11 where id = 1')
             and pg_temp.falla(format('update agente_config set plantilla_equipo = %L where id = 1', repeat('x', 1001)))
            then 'ok' else 'not ok' end || ' 2 - la plantilla no queda vacía ni pasa de 1.000 caracteres; de 1 a 10 equipos';
select case when has_column_privilege('authenticated', 'public.agente_config', 'plantilla_equipo', 'UPDATE')
             and has_column_privilege('authenticated', 'public.agente_config', 'equipos_separados', 'SELECT')
             and has_column_privilege('authenticated', 'public.agente_config', 'max_equipos', 'UPDATE')
            then 'ok' else 'not ok' end || ' 3 - la pantalla puede leer y guardar las tres columnas (permiso de columna)';
rollback;

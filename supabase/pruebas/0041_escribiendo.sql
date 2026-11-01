-- Pruebas de la migración 0041 (F4·36): «escribiendo…» y pausas. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select case when (select escribiendo and espera_primera_ms = 1500 and pausa_mensajes_ms = 1000 from agente_config where id = 1)
            then 'ok' else 'not ok' end || ' 1 - viene encendido, con 1,5 s antes de responder y 1 s entre mensajes';
select case when pg_temp.falla('update agente_config set pausa_mensajes_ms = 6000 where id = 1')
             and pg_temp.falla('update agente_config set espera_primera_ms = -1 where id = 1')
            then 'ok' else 'not ok' end || ' 2 - las pausas van de 0 a 5 segundos';
select case when has_column_privilege('authenticated', 'public.agente_config', 'escribiendo', 'UPDATE')
             and has_column_privilege('authenticated', 'public.agente_config', 'pausa_mensajes_ms', 'SELECT')
             and has_column_privilege('authenticated', 'public.agente_config', 'espera_primera_ms', 'UPDATE')
            then 'ok' else 'not ok' end || ' 3 - la pantalla puede leer y guardar las tres columnas (permiso de columna)';
rollback;

-- Pruebas de la migración 0031: la sesión puede leer toda la configuración del agente salvo los ids de las llaves.
-- Uso: supabase/migrar.sh --probar
begin;

select case when not exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'agente_config' and column_name not in ('llave_id', 'llave_respaldo_id')
            and not has_column_privilege('authenticated', 'public.agente_config', column_name, 'SELECT'))
            then 'ok' else 'not ok' end || ' 1 - toda columna de agente_config (salvo las llaves) se puede leer con la sesión';
select case when not has_column_privilege('authenticated', 'public.agente_config', 'llave_id', 'SELECT')
             and not has_column_privilege('authenticated', 'public.agente_config', 'llave_respaldo_id', 'SELECT')
            then 'ok' else 'not ok' end || ' 2 - los ids de las llaves siguen ocultos';
select case when has_column_privilege('authenticated', 'public.agente_config', 'url_base', 'UPDATE')
             and has_column_privilege('authenticated', 'public.agente_config', 'espera_segundos', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.agente_config', 'llave_id', 'UPDATE')
            then 'ok' else 'not ok' end || ' 3 - el cerebro se puede editar con la sesión, pero no las llaves';
select case when has_function_privilege('authenticated', 'agente_llaves_estado()', 'execute')
             and not has_function_privilege('anon', 'agente_llaves_estado()', 'execute')
            then 'ok' else 'not ok' end || ' 4 - la sesión sabe si hay llave sin verla; sin sesión, no';

rollback;

-- Pruebas de la migración 0055: OpenRouter en el Cerebro. Todo con ROLLBACK.
begin;
create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin execute sentencia; return false; exception when others then return true; end $$;

select case when not pg_temp.falla($q$update agente_config set proveedor = 'openrouter', modelo = 'deepseek/deepseek-v4-flash',
         url_base = 'https://openrouter.ai/api/v1' where id = 1$q$) then 'ok' else 'not ok' end
       || ' 1 - OpenRouter vale como modelo principal';
select case when not pg_temp.falla($q$update agente_config set proveedor_respaldo = 'openrouter', modelo_respaldo = 'google/gemini-2.5-flash-lite',
         url_base_respaldo = 'https://openrouter.ai/api/v1', protocolo_respaldo = 'openai',
         precio_entrada_usd_respaldo = 0.1, precio_salida_usd_respaldo = 0.4 where id = 1$q$) then 'ok' else 'not ok' end
       || ' 2 - OpenRouter vale como respaldo';
select case when pg_temp.falla($q$update agente_config set proveedor = 'inventado' where id = 1$q$) then 'ok' else 'not ok' end
       || ' 3 - un proveedor desconocido sigue sin valer';
rollback;

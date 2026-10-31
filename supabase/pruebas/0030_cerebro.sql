-- Pruebas de la migración 0030 (F4·27): cerebro con cualquier proveedor y tope mensual. Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

-- Datos propios de la prueba: no depende de lo que el dueño haya configurado.
update agente_config set estado = 'apagado', proveedor = 'deepseek', modelo = 'deepseek-chat', proveedor_respaldo = null,
  modelo_respaldo = null, url_base_respaldo = null, protocolo_respaldo = null, llave_id = null, presupuesto_usd = 5 where id = 1;
delete from agente_turnos;

select case when pg_temp.falla($$update agente_config set proveedor = 'inventado' where id = 1$$)
            then 'ok' else 'not ok' end || ' 1 - un proveedor fuera de la lista no se guarda';
select case when not pg_temp.falla($$update agente_config set proveedor = 'otro', modelo = 'mi-modelo', url_base = 'https://ia.miempresa.co/v1' where id = 1$$)
            then 'ok' else 'not ok' end || ' 2 - cualquier otro proveedor se guarda con su dirección';
select case when pg_temp.falla($$update agente_config set url_base = 'javascript:alert(1)' where id = 1$$)
            and pg_temp.falla($$update agente_config set url_base = 'ftp://x.co' where id = 1$$)
            then 'ok' else 'not ok' end || ' 3 - la dirección debe ser http o https';
select case when pg_temp.falla($$update agente_config set proveedor_respaldo = 'local', modelo_respaldo = 'qwen3' where id = 1$$)
            then 'ok' else 'not ok' end || ' 4 - un respaldo sin dirección ni protocolo no se guarda';
select case when not pg_temp.falla($$update agente_config set proveedor_respaldo = 'local', modelo_respaldo = 'qwen3',
              url_base_respaldo = 'http://127.0.0.1:8080/v1', protocolo_respaldo = 'openai' where id = 1$$)
            then 'ok' else 'not ok' end || ' 5 - un respaldo local completo se guarda';
select case when pg_temp.falla($$update agente_config set estado = 'todos', proveedor = 'deepseek' where id = 1$$)
            then 'ok' else 'not ok' end || ' 6 - no se enciende para clientes con proveedor de pago sin llave';
select case when not pg_temp.falla($$update agente_config set estado = 'todos', proveedor = 'local', presupuesto_usd = 0 where id = 1$$)
            then 'ok' else 'not ok' end || ' 7 - con modelo local se puede encender sin llave ni presupuesto';

-- Tope mensual (RAG-17)
update agente_config set estado = 'apagado', proveedor = 'deepseek', presupuesto_usd = 5 where id = 1;
insert into agente_turnos (proveedor, modelo, costo_usd, resultado) values
  ('deepseek', 'deepseek-chat', 2.50, 'respondido'),
  ('deepseek', 'deepseek-chat', 9.99, 'simulador');
select case when (agente_tope()->>'gasto')::numeric = 2.5 and (agente_tope()->>'porcentaje')::numeric = 50.0
            and (agente_tope()->>'agotado')::boolean = false and (agente_tope()->>'turnos_mes')::int = 1
            then 'ok' else 'not ok' end || ' 8 - el tope cuenta el gasto real del mes y no el del simulador';
insert into agente_turnos (proveedor, modelo, costo_usd, resultado) values ('deepseek', 'deepseek-chat', 2.50, 'respondido');
select case when (agente_tope()->>'agotado')::boolean then 'ok' else 'not ok' end || ' 9 - al llegar al presupuesto queda agotado';
update agente_config set proveedor = 'local' where id = 1;
select case when not (agente_tope()->>'agotado')::boolean then 'ok' else 'not ok' end || ' 10 - un modelo local nunca agota el presupuesto';

-- Permisos: el servidor lee las llaves; la sesión de un asesor sin permiso no puede cambiar el cerebro.
select case when (select not has_function_privilege('authenticated', 'agente_llaves()', 'execute')
                     and has_function_privilege('service_role', 'agente_llaves()', 'execute')) then 'ok' else 'not ok' end
       || ' 11 - solo el servidor puede leer las llaves';
select case when not has_function_privilege('anon', 'agente_tope()', 'execute') then 'ok' else 'not ok' end
       || ' 12 - sin sesión no se ve el gasto';

rollback;

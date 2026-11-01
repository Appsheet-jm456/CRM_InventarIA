-- Pruebas de la migración 0024 (F4·22): base del agente. Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000024a1', 'prueba-0024-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000024a1', 'Prueba Asesor 0024', id from roles where nombre = 'asesor';

-- Permiso y etapas de compra
select case when exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where r.nombre = 'administrador' and rp.permiso = 'administrar_agente')
             and not exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where r.nombre = 'asesor' and rp.permiso = 'administrar_agente')
            then 'ok' else 'not ok' end || ' 1 - administrar_agente es solo del administrador';

select case when (select string_agg(e.nombre, ' > ' order by e.orden) from etapas e join embudos b on b.id = e.embudo_id where b.nombre = 'Cliente Final')
                 = 'Nuevo > En Conversación > Cotización > Negociación > Esperando pago > Pago por confirmar > Alistamiento > Despachado > Vendido > Perdido'  -- 0036 suma Alistamiento y Despachado
             and (select string_agg(e.nombre, ' > ' order by e.orden) from etapas e join embudos b on b.id = e.embudo_id where b.nombre = 'Distribuidor')
                 = 'Nuevo > Datos de la empresa > Lista de precios enviada > Negociación > Esperando pago > Pago por confirmar > Primer pedido > Perdido'
            then 'ok' else 'not ok' end || ' 2 - Esperando pago y Pago por confirmar quedan antes del cierre en Cliente Final y Distribuidor';

select case when (select count(*) from compra_etapas c join etapas a on a.id = c.esperando_pago_id join etapas b on b.id = c.pago_por_confirmar_id
                   where a.nombre = 'Esperando pago' and b.nombre = 'Pago por confirmar' and a.embudo_id = c.embudo_id and b.embudo_id = c.embudo_id) = 2
            then 'ok' else 'not ok' end || ' 3 - compra_etapas apunta a las etapas de cada embudo';

-- Lo que trae la migración (no lo que el dueño ya activó): «Pasar a asesor» es del sistema y está activa; el resto son opcionales.
select case when exists (select 1 from acciones where nombre = 'Pasar a asesor' and sistema and activa)
             and (select count(*) from acciones where not sistema) >= 7
             and (select count(*) from conocimiento where categoria in ('Ubicación', 'Garantía', 'Devoluciones', 'Envíos', 'Pagos', 'Distribuidores')) = 6
             and not exists (select 1 from bots where modo not in ('menu', 'hibrido', 'agente'))
            then 'ok' else 'not ok' end || ' 4 - la acción de asesor es del sistema y está activa; nacen las 7 acciones y las 6 fichas; los bots tienen un modo válido';

-- Reglas de la base (con datos propios: proveedor de pago, sin llave y apagado, como recién instalado)
update agente_config set estado = 'apagado', proveedor = 'deepseek', llave_id = null, presupuesto_usd = 0 where id = 1;
update conocimiento set activa = false where categoria = 'Garantía';
update conocimiento set respuesta = '', archivo = null where categoria = 'Garantía';
select case when pg_temp.falla($q$ update acciones set activa = false where sistema $q$)
             and pg_temp.falla($q$ delete from acciones where sistema $q$)
             and pg_temp.falla($q$ update acciones set prioridad = 99 where sistema $q$)
            then 'ok' else 'not ok' end || ' 5 - la acción de asesor no se apaga, no se borra ni pierde el primer lugar';

select case when pg_temp.falla($q$ update conocimiento set activa = true where categoria = 'Garantía' $q$)
             and pg_temp.falla($q$ insert into acciones (nombre, prioridad, activa) values ('vacía', 500, true) $q$)
             and pg_temp.falla($q$ update agente_config set estado = 'todos' $q$)
             and pg_temp.falla($q$ update bots set modo = 'otro' $q$)
            then 'ok' else 'not ok' end || ' 6 - no se activa conocimiento sin respuesta, acción sin pasos ni agente sin llave y presupuesto';

-- Reordenar acciones intercambiando prioridades en una transacción (restricción diferida)
select case when not pg_temp.falla($q$ update acciones set prioridad = case prioridad when 40 then 50 when 50 then 40 end where prioridad in (40, 50) $q$)
            then 'ok' else 'not ok' end || ' 7 - se pueden intercambiar prioridades';

-- El asesor: lee conocimiento, no lo cambia, no ve acciones ni configuración ni llaves
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000024a1', 'role', 'authenticated')::text, true);
with c as (update conocimiento set respuesta = 'x' returning 1)
select case when (select count(*) from conocimiento) = 6 and (select count(*) from c) = 0
             and (select count(*) from acciones) = 0 and (select count(*) from agente_config) = 0
             and pg_temp.falla($q$ select agente_guardar_llave(repeat('k', 40)) $q$)
             and pg_temp.falla('select agente_llaves()')
            then 'ok' else 'not ok' end || ' 8 - el asesor lee el conocimiento pero no lo cambia ni ve acciones, configuración ni llaves';

-- El administrador: guarda la llave (no la puede leer), configura y enciende con presupuesto
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select agente_guardar_llave('sk-prueba-0024-' || repeat('a', 30));
select case when (select llave_guardada_en from agente_config) is not null
             and pg_temp.falla('select llave_id from agente_config')
             and pg_temp.falla('select agente_llaves()')
             and pg_temp.falla($q$ select agente_guardar_llave('corta') $q$)
            then 'ok' else 'not ok' end || ' 9 - el administrador guarda la llave pero ni él la puede leer';

update agente_config set presupuesto_usd = 10, estado = 'lista_blanca', lista_blanca = '{573000000000}', nombre = 'Avi';
select case when (select estado from agente_config) = 'lista_blanca' and (select actualizado_por from agente_config) = :'admin'::uuid
            then 'ok' else 'not ok' end || ' 10 - con llave y presupuesto se enciende para la lista blanca, con sello';

-- El servidor sí lee la llave
reset role;
set local role service_role;
select case when (select agente_llaves() ->> 'llave') like 'sk-prueba-0024-%'
            then 'ok' else 'not ok' end || ' 11 - solo el servidor lee la llave';

-- Gasto del mes: no cuenta el simulador
reset role;
insert into agente_turnos (proveedor, modelo, costo_usd, resultado) values ('deepseek', 'deepseek-chat', 0.002, 'respondido'),
                                                                          ('deepseek', 'deepseek-chat', 5, 'simulador');
select case when agente_gasto_mes() = 0.002 then 'ok' else 'not ok' end || ' 12 - el gasto del mes no cuenta las pruebas del simulador';

-- Cotizaciones: validaciones y consecutivo
select l.id as lead from leads l limit 1 \gset
select case when pg_temp.falla($q$ insert into cotizaciones (lead_id, nombre, cedula, celular, tipo_cliente, items, subtotal, total, valida_hasta)
                                    values ($q$ || :'lead' || $q$, 'Ana', '12a', '3001234567', 'cliente_final', '[{"codigo":"x"}]', 1, 1, now()) $q$)
             and pg_temp.falla($q$ insert into cotizaciones (lead_id, nombre, cedula, celular, tipo_cliente, items, subtotal, total, valida_hasta)
                                    values ($q$ || :'lead' || $q$, 'Ana', '1234567', '6001234567', 'cliente_final', '[{"codigo":"x"}]', 1, 1, now()) $q$)
             and pg_temp.falla($q$ insert into cotizaciones (lead_id, nombre, cedula, celular, tipo_cliente, items, subtotal, total, valida_hasta)
                                    values ($q$ || :'lead' || $q$, 'Ana', '1234567', '3001234567', 'cliente_final', '[]', 1, 1, now()) $q$)
            then 'ok' else 'not ok' end || ' 13 - la cotización exige cédula, celular colombiano y al menos un ítem';

insert into cotizaciones (lead_id, nombre, cedula, celular, tipo_cliente, items, subtotal, total, valida_hasta)
values (:'lead', 'Ana', '1234567', '3001234567', 'distribuidor', '[{"codigo":"100-102-1030-1","cantidad":1,"precio":1500000}]', 1500000, 1500000, now() + interval '24 hours'),
       (:'lead', 'Ana', '1234567', '3001234567', 'distribuidor', '[{"codigo":"100-102-1030-1","cantidad":2,"precio":1500000}]', 3000000, 3000000, now() + interval '24 hours');
select case when (select max(consecutivo) - min(consecutivo) from cotizaciones where lead_id = :'lead') = 1
            then 'ok' else 'not ok' end || ' 14 - cada cotización toma el siguiente consecutivo';

-- anon no ve nada
set local role anon;
select case when pg_temp.falla('select * from conocimiento') and pg_temp.falla('select * from agente_config')
             and pg_temp.falla('select * from cotizaciones') and pg_temp.falla('select agente_gasto_mes()')
            then 'ok' else 'not ok' end || ' 15 - anon no ve nada del agente';

rollback;

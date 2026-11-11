-- Pruebas de la migración 0076 (F4·71, RB-23 a RB-29): ficha técnica del equipo desde el chat. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into productos (codigo, categoria, marca, modelo, procesador, ram, almacenamiento, estado, precio, stock)
values ('ZZ-0076-1', 'Portatil', 'PRUEBA', 'Con stock', 'Core i5', '16GB', '256GB', 'A', 1234567, 2),
       ('ZZ-0076-2', 'Portatil', 'PRUEBA', 'Agotado', 'Core i7', '8GB', '512GB', 'A', 999000, 0);
insert into leads (telefono, nombre, etapa) values ('570000076001', 'Fabio Ficha', 'Nuevo') returning id as l1 \gset
insert into mensajes (lead_id, lado, tipo, texto) values (:l1, 'cliente', 'text', 'hola');
insert into leads (telefono, nombre, etapa) values ('570000076002', 'Viejo Ficha', 'Nuevo') returning id as l2 \gset
insert into mensajes (lead_id, lado, tipo, texto, creado_en) values (:l2, 'cliente', 'text', 'hola', now() - interval '25 hours');

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select case when (select count(*) from jsonb_array_elements(herramientas_chat() -> 'equipos') x where x ->> 'ref' = 'ZZ-0076-1') = 1
              and (select count(*) from jsonb_array_elements(herramientas_chat() -> 'equipos') x where x ->> 'ref' = 'ZZ-0076-2') = 0
            then 'ok' else 'not ok' end || ' 1 - la lista trae los equipos con stock y no los agotados (RB-23)';
select case when (select x ->> 'detalle' from jsonb_array_elements(herramientas_chat() -> 'equipos') x where x ->> 'ref' = 'ZZ-0076-1')
                 = 'Core i5 · 16GB · 256GB · $1.234.567'
            then 'ok' else 'not ok' end || ' 2 - el detalle muestra procesador, RAM, disco y precio con puntos';
select case when (select count(*) from jsonb_array_elements(herramientas_chat() -> 'catalogos')) >= 0
              and herramientas_chat() ? 'flujos' then 'ok' else 'not ok' end || ' 3 - catálogos, acciones y flujos siguen en la lista';

select herramienta_chat(:l1, 'equipo', 'ZZ-0076-1');
select case when (select estado_chat = 'asignada' and pausar_bot and asignado_a = :'admin'::uuid from leads where id = :l1)
              and exists (select 1 from lead_eventos where lead_id = :l1 and tipo = 'herramienta' and detalle = '📋 Ficha técnica «PRUEBA Con stock (ZZ-0076-1)»')
            then 'ok' else 'not ok' end || ' 4 - enviar la ficha toma la conversación y queda en el historial (RB-24, RB-28)';
select case when pg_temp.falla(format('select herramienta_chat(%s, %L, %L)', :l1, 'equipo', 'ZZ-0076-2')) then 'ok' else 'not ok' end
       || ' 5 - un equipo agotado no se envía';
select case when pg_temp.falla(format('select herramienta_chat(%s, %L, %L)', :l1, 'equipo', 'NO-EXISTE')) then 'ok' else 'not ok' end
       || ' 6 - un código que no existe no se envía';
select case when pg_temp.falla(format('select herramienta_chat(%s, %L, %L)', :l2, 'equipo', 'ZZ-0076-1')) then 'ok' else 'not ok' end
       || ' 7 - fuera de las 24 h de WhatsApp no deja (RB-29)';

reset role;
select set_config('request.jwt.claims', '', true);
select case when not has_function_privilege('anon', 'public.herramienta_chat(bigint, text, text, text)', 'execute')
              and not has_function_privilege('anon', 'public.herramientas_chat()', 'execute') then 'ok' else 'not ok' end
       || ' 8 - anon sigue sin poder usar las herramientas';

rollback;

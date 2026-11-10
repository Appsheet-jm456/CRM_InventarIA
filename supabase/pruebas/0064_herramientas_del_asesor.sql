-- Pruebas de la migración 0064 (F4·61, RB-07 a RB-12): herramientas del asesor en el chat. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into catalogos (nombre, tipo, url) values ('Cat prueba 0064', 'drive', 'https://drive.google.com/x') returning id as cat \gset
insert into catalogos (nombre, tipo, url, activo) values ('Cat apagado 0064', 'drive', 'https://drive.google.com/y', false) returning id as cat_off \gset
insert into acciones (nombre, prioridad, activa, cuando, hacer) values ('Envía 0064', 990, true, '[{"texto": "zz0064"}]', '[{"tipo": "texto", "texto": "hola"}, {"tipo": "etiqueta", "etiqueta": "X"}]')
returning id as acc \gset
insert into acciones (nombre, prioridad, activa, cuando, hacer) values ('Asesor 0064', 991, true, '[{"texto": "zz0064b"}]', '[{"tipo": "asesor"}]') returning id as acc_no \gset

insert into leads (telefono, nombre, etapa) values ('570000064001', 'Hugo Herramientas', 'Nuevo') returning id as l1 \gset
insert into mensajes (lead_id, lado, tipo, texto) values (:l1, 'cliente', 'text', 'hola');
insert into leads (telefono, nombre, etapa) values ('570000064002', 'Viejo Ventana', 'Nuevo') returning id as l2 \gset
insert into mensajes (lead_id, lado, tipo, texto, creado_en) values (:l2, 'cliente', 'text', 'hola', now() - interval '25 hours');

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

-- La lista: catálogos activos, acciones que solo envían, flujos
select case when (select count(*) from jsonb_array_elements(herramientas_chat() -> 'catalogos') x where x ->> 'ref' = :'cat') = 1
              and (select count(*) from jsonb_array_elements(herramientas_chat() -> 'catalogos') x where x ->> 'ref' = :'cat_off') = 0
            then 'ok' else 'not ok' end || ' 1 - la lista trae los catálogos activos y no los desactivados';
select case when (select count(*) from jsonb_array_elements(herramientas_chat() -> 'acciones') x where x ->> 'ref' = :'acc') = 1
              and (select count(*) from jsonb_array_elements(herramientas_chat() -> 'acciones') x where x ->> 'ref' = :'acc_no') = 0
            then 'ok' else 'not ok' end || ' 2 - acciones: la que solo envía sí, «pasar a asesor» no (RB-08)';
select case when (select count(*) from jsonb_array_elements(herramientas_chat() -> 'flujos') x where x ->> 'ref' in ('compra', 'cotizacion')) = 2
            then 'ok' else 'not ok' end || ' 3 - flujos: compra y cotización';

-- Catálogo: el asesor toma la conversación (RB-01) y queda en la línea de tiempo (RB-11)
select herramienta_chat(:l1, 'catalogo', :'cat');
select case when (select estado_chat = 'asignada' and pausar_bot and asignado_a = :'admin'::uuid from leads where id = :l1)
              and exists (select 1 from lead_eventos where lead_id = :l1 and tipo = 'herramienta' and detalle like '📚 Catálogo%')
            then 'ok' else 'not ok' end || ' 4 - enviar un catálogo toma la conversación y lo anota';

select case when pg_temp.falla(format('select herramienta_chat(%s, %L, %L)', :l1, 'catalogo', :'cat_off')) then 'ok' else 'not ok' end
       || ' 5 - un catálogo desactivado no se envía';
select case when pg_temp.falla(format('select herramienta_chat(%s, %L, %L)', :l1, 'accion', :'acc_no')) then 'ok' else 'not ok' end
       || ' 6 - una acción que no solo envía no se dispara desde el chat';
select case when pg_temp.falla(format('select herramienta_chat(%s, %L, %L)', :l2, 'catalogo', :'cat')) then 'ok' else 'not ok' end
       || ' 7 - fuera de las 24 h de WhatsApp no deja (RB-12)';

-- Flujo: el bot hace el tramo; «Vuelve a mí» guarda a quién volver (RB-09b)
select herramienta_chat(:l1, 'flujo', 'compra', 'asesor');
select case when (select estado_chat = 'bot' and not pausar_bot and asignado_a is null
                         and estado_bot -> 'volver_a' ->> 'usuario' = :'admin' from leads where id = :l1)
            then 'ok' else 'not ok' end || ' 8 - un flujo devuelve el tramo al bot y guarda «vuelve a mí»';
select herramienta_chat(:l1, 'flujo', 'compra', 'bot');
select case when (select not (estado_bot ? 'volver_a') from leads where id = :l1) then 'ok' else 'not ok' end
       || ' 9 - con «sigue el bot» no queda a quién volver';
select case when pg_temp.falla(format('select herramienta_chat(%s, %L, %L)', :l1, 'flujo', 'bot:999999999')) then 'ok' else 'not ok' end
       || ' 10 - un bot que no existe no se dispara';

reset role;
select set_config('request.jwt.claims', '', true);
select case when not has_function_privilege('anon', 'public.herramienta_chat(bigint, text, text, text)', 'execute')
              and not has_function_privilege('anon', 'public.herramientas_chat()', 'execute') then 'ok' else 'not ok' end
       || ' 11 - anon no puede usar las herramientas';

rollback;

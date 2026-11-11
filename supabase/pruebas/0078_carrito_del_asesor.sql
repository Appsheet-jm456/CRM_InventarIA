-- Pruebas de la migración 0078 (F4·72, RCA-01 a RCA-10): carrito del asesor. Con ROLLBACK.
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
values ('ZZ-0078-1', 'Portatil', 'PRUEBA', 'Usado uno', 'Core i5', '16GB', '256GB', 'Usado · Grado A', 1300000, 1),
       ('ZZ-0078-2', 'Portatil', 'PRUEBA', 'Nuevo dos', 'Core i7', '16GB', '512GB', 'Nuevo', 3000000, 2),
       ('ZZ-0078-3', 'Portatil', 'PRUEBA', 'Agotado', 'Core i3', '8GB', '256GB', 'Usado', 700000, 0);
insert into leads (telefono, nombre, etapa) values ('570000078001', 'Carla Carrito', 'Nuevo') returning id as l1 \gset
insert into mensajes (lead_id, lado, tipo, texto) values (:l1, 'cliente', 'text', 'hola');
insert into leads (telefono, nombre, etapa) values ('570000078002', 'Viejo Carrito', 'Nuevo') returning id as l2 \gset
insert into mensajes (lead_id, lado, tipo, texto, creado_en) values (:l2, 'cliente', 'text', 'hola', now() - interval '25 hours');

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select case when (select count(*) from jsonb_array_elements(carrito_inventario()) x where x ->> 'codigo' like 'ZZ-0078-%') = 2
            then 'ok' else 'not ok' end || ' 1 - el buscador trae los equipos con stock y no el agotado (RCA-02)';

-- Guardar: uno con precio cambiado (admin tiene modificar_precios), un nuevo y un renglón libre
select carrito_guardar(:l1, '[{"codigo": "zz-0078-1", "precio": 1250000}, {"codigo": "ZZ-0078-2", "precio": 3000000},
                              {"libre": true, "equipo": "Mouse inalámbrico", "precio": 45000}]', 'Cliente final', false) as c \gset
select case when (:'c'::jsonb ->> 'subtotal')::numeric = 4295000 and (:'c'::jsonb ->> 'cargo')::numeric = 80000
              and (:'c'::jsonb ->> 'total')::numeric = 4375000 and (:'c'::jsonb ->> 'aplica_configuracion')::boolean
            then 'ok' else 'not ok' end || ' 2 - suma los precios del asesor y la configuración por el equipo usado (RCA-05)';
select case when (:'c'::jsonb -> 'items' -> 0 ->> 'codigo') = 'ZZ-0078-1' and (:'c'::jsonb -> 'items' -> 0 ->> 'precio_base')::numeric = 1300000
              and (:'c'::jsonb -> 'items' -> 2 ->> 'codigo') = 'LIBRE-1' and (:'c'::jsonb -> 'items' -> 2 ->> 'libre')::boolean
            then 'ok' else 'not ok' end || ' 3 - guarda el código de la base, el precio base y el renglón libre como LIBRE-1 (RCA-03)';
select case when exists (select 1 from lead_eventos where lead_id = :l1 and detalle like '💲 Precio en el carrito de PRUEBA Usado uno (ZZ-0078-1): $1.300.000 → $1.250.000%')
            then 'ok' else 'not ok' end || ' 4 - el cambio de precio queda en el historial (RCA-04)';

select case when (carrito_guardar(:l1, '[{"codigo": "ZZ-0078-1", "precio": 1250000}]', 'Cliente final', true) ->> 'cargo')::numeric = 0
            then 'ok' else 'not ok' end || ' 5 - con la casilla, la configuración se quita';
select case when (carrito_guardar(:l1, '[{"codigo": "ZZ-0078-2", "precio": 3000000}]', 'Cliente final', false) ->> 'cargo')::numeric = 0
              and (carrito_guardar(:l1, '[{"codigo": "ZZ-0078-1", "precio": 1250000}]', 'Distribuidor', false) ->> 'cargo')::numeric = 0
            then 'ok' else 'not ok' end || ' 6 - sin configuración con solo equipos nuevos o con distribuidor';

select case when pg_temp.falla(format('select carrito_guardar(%s, %L, %L, false)', :l1, '[{"codigo": "ZZ-0078-1", "precio": 1}, {"codigo": "zz-0078-1", "precio": 1}]', 'Cliente final'))
            then 'ok' else 'not ok' end || ' 7 - el mismo equipo no se repite';
select case when pg_temp.falla(format('select carrito_guardar(%s, %L, %L, false)', :l1, '[{"codigo": "NO-EXISTE", "precio": 5}]', 'Cliente final'))
              and pg_temp.falla(format('select carrito_guardar(%s, %L, %L, false)', :l1, '[{"libre": true, "equipo": "", "precio": 5}]', 'Cliente final'))
              and pg_temp.falla(format('select carrito_guardar(%s, %L, %L, false)', :l1, '[{"libre": true, "equipo": "X", "precio": 0}]', 'Cliente final'))
            then 'ok' else 'not ok' end || ' 8 - código inexistente, libre sin nombre o precio 0 no se guardan';

-- Enviar: deja el chat al bot con «vuelve a mí» y el tipo en la ficha (RCA-06, RCA-07, RCA-09)
select carrito_guardar(:l1, '[{"codigo": "ZZ-0078-1", "precio": 1250000}, {"libre": true, "equipo": "Mouse", "precio": 45000}]', 'Cliente final', false);
select carrito_enviar(:l1);
select case when (select estado_chat = 'bot' and not pausar_bot and estado_bot -> 'volver_a' ->> 'usuario' = :'admin'
                         and atributos ->> 'tipo_cliente' = 'Cliente final' from leads where id = :l1)
              and exists (select 1 from lead_eventos where lead_id = :l1 and detalle like '🛒 Carrito enviado por %: 2 producto(s) · total $1.375.000')
            then 'ok' else 'not ok' end || ' 9 - enviar deja el chat al bot, «vuelve a mí», el tipo en la ficha y el historial';

select case when pg_temp.falla(format('select carrito_enviar(%s)', :l2)) then 'ok' else 'not ok' end || ' 10 - fuera de las 24 h no se envía';
update productos set stock = 0 where codigo = 'ZZ-0078-1';
select case when pg_temp.falla(format('select carrito_enviar(%s)', :l1)) then 'ok' else 'not ok' end || ' 11 - con un equipo sin stock no se envía';
update productos set stock = 1 where codigo = 'ZZ-0078-1';
reset role;
update leads set estado_bot = jsonb_build_object('compra', jsonb_build_object('paso', 'esperando_pago')) where id = :l1;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select case when pg_temp.falla(format('select carrito_enviar(%s)', :l1)) then 'ok' else 'not ok' end || ' 12 - no pisa una compra esperando pago (RCA-10)';

-- Sin modificar_precios no se cambia el precio (RCA-04)
reset role;
delete from rol_permisos where permiso = 'modificar_precios';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select case when pg_temp.falla(format('select carrito_guardar(%s, %L, %L, false)', :l1, '[{"codigo": "ZZ-0078-1", "precio": 900000}]', 'Cliente final'))
              and not pg_temp.falla(format('select carrito_guardar(%s, %L, %L, false)', :l1, '[{"codigo": "ZZ-0078-1", "precio": 1300000}, {"libre": true, "equipo": "Cable", "precio": 9000}]', 'Cliente final'))
              and not (carrito_de(:l1) ->> 'puede_precios')::boolean
            then 'ok' else 'not ok' end || ' 13 - sin el permiso, el precio del inventario no cambia; el libre sí';

reset role;
select set_config('request.jwt.claims', '', true);
select case when not has_table_privilege('authenticated', 'public.carritos', 'select')
              and not has_function_privilege('anon', 'public.carrito_enviar(bigint)', 'execute')
              and not has_function_privilege('authenticated', 'public.carrito_armar(bigint)', 'execute')
            then 'ok' else 'not ok' end || ' 14 - la tabla y las funciones internas no se tocan desde la app; anon no envía';

rollback;

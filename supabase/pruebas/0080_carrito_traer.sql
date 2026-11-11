-- Pruebas de la migración 0080 (F4·72b, RCA-11 a RCA-13): traer lo que eligió el cliente. Con ROLLBACK.
begin;

insert into productos (codigo, categoria, marca, modelo, estado, precio, stock)
values ('ZZ-0080-1', 'Portatil', 'PRUEBA', 'Uno', 'Usado', 1300000, 1),
       ('ZZ-0080-2', 'Portatil', 'PRUEBA', 'Dos', 'NUEVA', 3000000, 0);
insert into leads (telefono, nombre, etapa, estado_bot) values ('570000080001', 'Tina Traer', 'Nuevo',
  '{"compra": {"paso": "confirmar", "tipo": "cliente_final", "equipos": [{"codigo": "ZZ-0080-1", "equipo": "x", "precio": 1200000},
    {"codigo": "ZZ-0080-2", "equipo": "y", "precio": 2900000}, {"libre": true, "codigo": "LIBRE-1", "equipo": "Mouse", "precio": 45000}]}}')
returning id as l1 \gset
insert into leads (telefono, nombre, etapa, cotiz_producto) values ('570000080002', 'Pablo Pedido', 'Nuevo', 'ZZ-0080-1') returning id as l2 \gset

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select case when jsonb_array_length(carrito_traer(:l1) -> 'items') = 3 and carrito_traer(:l1) ->> 'origen' like '%compra%'
            and carrito_traer(:l1) ->> 'tipo' = 'Cliente final' then 'ok' else 'not ok' end || ' 1 - trae los equipos y el renglón libre de la compra con el bot';
select case when (carrito_traer(:l1) -> 'items' -> 0 ->> 'precio')::numeric = 1200000 and (carrito_traer(:l1) -> 'items' -> 1 ->> 'stock')::int = 0
            then 'ok' else 'not ok' end || ' 2 - respeta el precio cotizado y marca el que ya no tiene stock';
select case when jsonb_array_length(carrito_traer(:l2) -> 'items') = 1 and carrito_traer(:l2) ->> 'origen' like '%cotiz%'
            then 'ok' else 'not ok' end || ' 3 - sin compra, trae el último equipo cotizado';
select carrito_traer(:l1) is not null as leyo \gset
reset role;
select case when :'leyo' = 't' and (select count(*) from carritos where lead_id = :l1) = 0
            then 'ok' else 'not ok' end || ' 4 - solo lee: no guarda nada';
rollback;

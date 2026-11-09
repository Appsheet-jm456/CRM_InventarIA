-- Pruebas de la migración 0060 (F4·55): lista de pedidos con fase y alertas, y permiso ver_pedidos. Con ROLLBACK.
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
values ('999-060-0001', 'Portatil', 'DELL', 'LISTA', 'i5', '16GB', '512GB', 'Usado', 1500000, 1);
insert into leads (telefono, nombre, etapa, atributos) values ('570000060001', 'Lina Lista', 'Nuevo', '{"venta_online": true}');
insert into leads (telefono, nombre, etapa, atributos) values ('570000060002', 'Raúl Cancela', 'Nuevo', '{"venta_online": true}');
select id as l1 from leads where telefono = '570000060001' and eliminado_en is null \gset
select id as l2 from leads where telefono = '570000060002' and eliminado_en is null \gset
select abrir_oportunidad_interna(:l1, 1) as o1 \gset
select abrir_oportunidad_interna(:l2, 1) as o2 \gset
update oportunidades set producto = '999-060-0001', etapa_id = (select id from etapas where embudo_id = 1 and nombre = 'Alistamiento') where id in (:o1, :o2);
select id as a1 from alistamientos where oportunidad_id = :o1 \gset
select id as a2 from alistamientos where oportunidad_id = :o2 \gset
update alistamientos set estado = 'listo', tecnico = 'Josep', tomado_en = now() - interval '3 days', listo_en = now() - interval '2 days',
  creado_en = now() - interval '3 days' where id = :a1;
update alistamientos set cancelado_en = now(), cancelado_motivo = 'No compró', doc_tipo = 'FVE', doc_numero = '1' where id = :a2;

select case when (select count(*) from permisos where codigo = 'ver_pedidos') = 1
             and exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where rp.permiso = 'ver_pedidos' and r.nombre = 'administrador')
             and not exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where rp.permiso = 'ver_pedidos' and r.nombre = 'Técnico')
            then 'ok' else 'not ok' end || ' 1 - ver_pedidos lo tienen administrador y asesores, no el técnico';

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select pedidos_lista() as lista \gset
select case when exists (select 1 from jsonb_array_elements(:'lista'::jsonb) x where (x ->> 'id')::bigint = :a1 and x ->> 'fase' = 'listo'
                          and x ->> 'cliente' = 'Lina Lista' and x -> 'equipos' -> 0 ->> 'codigo' = '999-060-0001')
            then 'ok' else 'not ok' end || ' 2 - la lista trae el pedido con cliente, equipos y fase';
select case when exists (select 1 from jsonb_array_elements(:'lista'::jsonb) x where (x ->> 'id')::bigint = :a1
                          and x -> 'alertas' ? 'Sin documento hace más de 24 h' and x -> 'alertas' ? 'Listo hace más de 24 h sin despachar')
            then 'ok' else 'not ok' end || ' 3 - marca las alertas: sin documento y listo sin despachar';
select case when exists (select 1 from jsonb_array_elements(:'lista'::jsonb) x where (x ->> 'id')::bigint = :a2 and x ->> 'fase' = 'cancelado'
                          and jsonb_array_length(x -> 'alertas') = 0)
            then 'ok' else 'not ok' end || ' 4 - un cancelado sale como cancelado y sin alertas';

select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
select case when pg_temp.falla('select pedidos_lista()') then 'ok' else 'not ok' end || ' 5 - sin el permiso no se ve la lista';

rollback;

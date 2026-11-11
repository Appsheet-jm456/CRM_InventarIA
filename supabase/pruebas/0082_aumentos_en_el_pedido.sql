-- Pruebas de la migración 0082 (F4·73c, RAM-10 a RAM-12): aumentos en el pedido y reenviar el resumen. Con ROLLBACK.
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into leads (telefono, nombre, etapa) values ('570000082001', 'Aurora Aumento', 'Nuevo') returning id as l1 \gset
insert into mensajes (lead_id, lado, tipo, texto) values (:l1, 'cliente', 'text', 'hola');
select compra_mover(:l1, 'esperando_pago') is not null as movio \gset
select compra_aumentos(:l1, '[{"de": "X", "tipo": "ram", "desde": 8, "hasta": 16, "texto": "Aumento RAM 8GB → 16GB", "precio": 140000}]') as op \gset
select case when (select jsonb_array_length(aumentos) from oportunidades where id = :op) = 1
            then 'ok' else 'not ok' end || ' 1 - el bot anota los aumentos en la oportunidad de la compra';
update oportunidades set etapa_id = (select e.id from etapas e where e.embudo_id = oportunidades.embudo_id and e.nombre = 'Alistamiento') where id = :op;
select case when (select aumentos ->> 0 from alistamientos where oportunidad_id = :op) like '%8GB → 16GB%'
            then 'ok' else 'not ok' end || ' 2 - el alistamiento nace con los aumentos';
update oportunidades set aumentos = '[]' where id = :op;
select case when (select aumentos from alistamientos where oportunidad_id = :op) = '[]'
            then 'ok' else 'not ok' end || ' 3 - si cambian en la oportunidad, el alistamiento los sigue';
select id as al from alistamientos where oportunidad_id = :op \gset

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select case when pedido_reenviar_resumen(:al) = :l1 then 'ok' else 'not ok' end || ' 4 - reenviar el resumen deja el registro y da el cliente';
select case when pg_temp.falla($$select compra_aumentos(1, '[]')$$) then 'ok' else 'not ok' end
       || ' 5 - la app no puede escribir aumentos directo (solo el bot)';
reset role;
update mensajes set creado_en = now() - interval '25 hours' where lead_id = :l1;
set local role authenticated;
select case when pg_temp.falla(format('select pedido_reenviar_resumen(%s)', :al)) then 'ok' else 'not ok' end
       || ' 6 - fuera de las 24 h no se reenvía';
rollback;

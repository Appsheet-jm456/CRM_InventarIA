-- Pruebas de la migración 0057 (F4·50 bloques C y D): guía → Despachado y Vendido, entregado en tienda y reporte. Todo con ROLLBACK.
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
values ('999-057-0001', 'Portatil', 'DELL', 'ENVIO', 'i5', '16GB', '512GB', 'Usado', 1500000, 1);
-- Venta con envío y los datos de despacho llenos (Alistamiento y Despachado los exigen).
insert into leads (telefono, nombre, etapa, atributos) values ('570000057001', 'Marta Envio', 'Nuevo',
  '{"venta_online": true, "nombre_completo": "Marta Envio", "cedula": "123456", "celular": "3001234567", "correo_para_la_factura": "m@x.co",
    "ciudad": "Cali", "direccion_entrega": "Calle 1"}');
insert into leads (telefono, nombre, etapa, atributos) values ('570000057002', 'Pablo Tienda', 'Nuevo', '{"venta_online": false}');
select id as le from leads where telefono = '570000057001' and eliminado_en is null \gset
select id as lt from leads where telefono = '570000057002' and eliminado_en is null \gset
select abrir_oportunidad_interna(:le, 1) as ope \gset
select abrir_oportunidad_interna(:lt, 1) as opt \gset
update oportunidades set producto = '999-057-0001', etapa_id = (select id from etapas where embudo_id = 1 and nombre = 'Alistamiento') where id in (:ope, :opt);
select id as ae from alistamientos where oportunidad_id = :ope \gset
select id as at from alistamientos where oportunidad_id = :opt \gset
insert into storage.objects (bucket_id, name) values ('guias', :'ae' || '/guia.jpg');

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select case when pg_temp.falla(format('select alistamiento_guia(%s, %L, %L, %L)', :ae, :'ae' || '/guia.jpg', 'Servientrega', '123')) then 'ok' else 'not ok' end
       || ' 1 - sin el «listo» del servicio técnico no se registra la guía';
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :ae, 'documento')) then 'ok' else 'not ok' end
       || ' 2 - no se envía el documento si el asesor no lo ha puesto';

-- El técnico lo deja listo (con video registrado a mano: lo prueba 0056).
reset role;
update alistamientos set estado = 'listo', tecnico = 'Josep', tomado_en = now() - interval '3 hours', listo_en = now(), doc_tipo = 'FVE', doc_numero = '99' where id in (:ae, :at);
set local role authenticated;

select case when (alistamiento_para_enviar(:ae, 'documento') ->> 'lead')::bigint = :le then 'ok' else 'not ok' end
       || ' 3 - con el documento puesto, se puede enviar al cliente';
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :ae, 'video')) then 'ok' else 'not ok' end
       || ' 4 - sin videos listos no hay video que enviar';
select case when pg_temp.falla(format('select alistamiento_guia(%s, %L, %L, %L)', :ae, :'ae' || '/no-existe.jpg', 'Servientrega', '123')) then 'ok' else 'not ok' end
       || ' 5 - si la foto de la guía no llegó, no se registra';
select case when pg_temp.falla(format('select alistamiento_guia(%s, %L, %L, %L)', :ae, :'ae' || '/guia.jpg', '', '123')) then 'ok' else 'not ok' end
       || ' 6 - hace falta la transportadora';

select alistamiento_guia(:ae, :'ae' || '/guia.jpg', 'Servientrega', 'SV-778899');
select case when (select o.estado <> 'abierta' and e.cierre = 'ganada' from oportunidades o join etapas e on e.id = o.etapa_id where o.id = :ope)
             and exists (select 1 from historial_etapas h where h.oportunidad_id = :ope and h.a = 'Despachado')
            then 'ok' else 'not ok' end || ' 7 - al registrar la guía pasa por Despachado y queda en Vendido';
select case when (select atributos ->> 'transportadora' = 'Servientrega' and atributos ->> 'numero_guia' = 'SV-778899' from leads where id = :le)
            then 'ok' else 'not ok' end || ' 8 - la transportadora y el número quedan en la ficha del cliente';
select case when (alistamiento_para_enviar(:ae, 'guia') ->> 'que') = 'guia' then 'ok' else 'not ok' end
       || ' 9 - después se puede (re)enviar la guía al cliente';

select case when pg_temp.falla(format('select alistamiento_guia(%s, %L, %L, %L)', :at, :'ae' || '/guia.jpg', 'Servientrega', '1'))
            then 'ok' else 'not ok' end || ' 10 - una venta en tienda no lleva guía';
select case when (alistamiento_para_enviar(:at, 'listo_tienda') ->> 'que') = 'listo_tienda' then 'ok' else 'not ok' end
       || ' 11 - en tienda se puede avisar «listo para recoger»';
select alistamiento_entregado(:at);
select case when (select e.cierre = 'ganada' from oportunidades o join etapas e on e.id = o.etapa_id where o.id = :opt)
             and (select entregado_en is not null from alistamientos where id = :at)
            then 'ok' else 'not ok' end || ' 12 - «Entregado» en tienda pasa a Vendido';

select case when (select (r -> 'totales' ->> 'despachados')::int >= 1 and (r -> 'totales' ->> 'entregados_tienda')::int >= 1
                         and exists (select 1 from jsonb_array_elements(r -> 'por_tecnico') t where t ->> 'tecnico' = 'Josep' and (t ->> 'listos')::int >= 2
                                     and (t ->> 'horas_revision')::numeric between 2.9 and 3.1)
                  from (select alistamiento_reporte(current_date - 1, current_date) r) x)
            then 'ok' else 'not ok' end || ' 13 - el reporte cuenta pedidos por técnico y las horas de revisión';

rollback;

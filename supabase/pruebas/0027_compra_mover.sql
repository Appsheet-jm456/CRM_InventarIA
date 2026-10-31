-- Pruebas de la migración 0027 (F4·25): compra_mover. Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into leads (telefono, nombre, etapa) values ('570000002701', 'Prueba compra CF', 'Nuevo'), ('570000002702', 'Prueba compra Distri', 'Nuevo');
select id as cf from leads where telefono = '570000002701' \gset
select id as di from leads where telefono = '570000002702' \gset
select id as emb_di from embudos where nombre = 'Distribuidor' \gset
select abrir_oportunidad_interna(:di, :emb_di);

select compra_mover(:cf, 'esperando_pago') as r1 \gset
select case when :'r1' = 'Cliente Final'
             and (select e.nombre from oportunidades o join etapas e on e.id = o.etapa_id where o.lead_id = :cf and o.estado = 'abierta') = 'Esperando pago'
            then 'ok' else 'not ok' end || ' 1 - sin oportunidad abre una en Cliente Final y la lleva a Esperando pago';

select compra_mover(:di, 'esperando_pago') as r2 \gset
select case when :'r2' = 'Distribuidor'
             and (select e.nombre from oportunidades o join etapas e on e.id = o.etapa_id join embudos b on b.id = o.embudo_id
                   where o.lead_id = :di and b.nombre = 'Distribuidor') = 'Esperando pago'
            then 'ok' else 'not ok' end || ' 2 - con oportunidad en Distribuidor mueve esa';

select compra_mover(:cf, 'pago_por_confirmar');
select compra_mover(:cf, 'esperando_pago');
select case when (select e.nombre from oportunidades o join etapas e on e.id = o.etapa_id where o.lead_id = :cf and o.estado = 'abierta') = 'Pago por confirmar'
            then 'ok' else 'not ok' end || ' 3 - los pasos de pago solo avanzan';

select case when compra_mover(:cf, 'cancelada') is null and pg_temp.falla($q$ select compra_mover(1, 'otro') $q$)
            then 'ok' else 'not ok' end || ' 4 - cancelar sin etapa elegida no mueve; un paso desconocido falla';

set local role authenticated;
select case when pg_temp.falla($q$ select compra_mover(1, 'esperando_pago') $q$)
            then 'ok' else 'not ok' end || ' 5 - un usuario no puede llamarla (solo el servidor)';

rollback;

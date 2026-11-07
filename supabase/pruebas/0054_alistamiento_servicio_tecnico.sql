-- Pruebas de la migración 0054 (F4·50 bloque A): alistamiento con servicio técnico. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select case when exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where r.nombre = 'Técnico' and rp.permiso = 'gestionar_alistamiento')
             and not exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where r.nombre = 'Técnico' and rp.permiso <> 'gestionar_alistamiento')
            then 'ok' else 'not ok' end || ' 1 - el rol Técnico solo tiene gestionar_alistamiento (sin Bandeja, pagos ni métricas)';

select case when (select count(*) from alistamiento_tecnicos where activo) = 3 then 'ok' else 'not ok' end
       || ' 2 - «¿Quién eres?» trae a Camilo, Sebastián y Josep';

-- Escenario: un cliente con venta online y una oportunidad que llega a Alistamiento.
insert into productos (codigo, categoria, marca, modelo, procesador, ram, almacenamiento, estado, precio, stock)
values ('999-054-0001', 'Portatil', 'DELL', 'LATITUDE PRUEBA', 'i5', '16GB', '512GB', 'Usado', 1500000, 1);
insert into leads (telefono, nombre, etapa, atributos) values ('570000054001', 'Ana Prueba', 'Nuevo', '{"venta_online": true}');
select id as l from leads where telefono = '570000054001' and eliminado_en is null \gset
select abrir_oportunidad_interna(:l, 1) as op \gset
update oportunidades set producto = '999-054-0001, 999-054-9999' where id = :op;
select case when not exists (select 1 from alistamientos where oportunidad_id = :op) then 'ok' else 'not ok' end
       || ' 3 - antes de Alistamiento no hay registro';
update oportunidades set etapa_id = (select id from etapas where embudo_id = 1 and nombre = 'Alistamiento') where id = :op;
select id as a from alistamientos where oportunidad_id = :op \gset
select case when (select estado = 'por_revisar' and equipos -> 0 ->> 'nombre' = 'DELL LATITUDE PRUEBA' and equipos -> 1 ->> 'nombre' = '999-054-9999'
                  from alistamientos where id = :a)
            then 'ok' else 'not ok' end || ' 4 - al entrar a Alistamiento se crea el pedido con sus equipos (sin etapa nueva)';

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select case when pg_temp.falla(format('select alistamiento_tomar(%s, %L)', :a, 'Pedro')) then 'ok' else 'not ok' end
       || ' 5 - un nombre que no está en la lista no puede tomar el pedido';
select alistamiento_tomar(:a, 'Camilo Osorio');
select case when (select estado = 'en_revision' and tecnico = 'Camilo Osorio' from alistamientos where id = :a) then 'ok' else 'not ok' end
       || ' 6 - Camilo toma el pedido: en revisión';
select case when pg_temp.falla(format('select alistamiento_tomar(%s, %L)', :a, 'Josep')) then 'ok' else 'not ok' end
       || ' 7 - otro técnico no lo puede tomar si ya está en revisión';

select alistamiento_checklist(:a, 'pasta_termica', true, 'Camilo Osorio');
select case when (select checklist -> 'pasta_termica' ->> 'por' = 'Camilo Osorio' from alistamientos where id = :a) then 'ok' else 'not ok' end
       || ' 8 - el checklist guarda quién marcó cada punto';
select case when pg_temp.falla(format('select alistamiento_checklist(%s, %L, true, %L)', :a, 'pintar', 'Camilo Osorio')) then 'ok' else 'not ok' end
       || ' 9 - un punto que no existe se rechaza';

select case when pg_temp.falla(format('select alistamiento_listo(%s, %L)', :a, 'Camilo Osorio')) then 'ok' else 'not ok' end
       || ' 10 - sin OP ni FVE no se puede marcar listo (lo pone el asesor)';
select case when pg_temp.falla(format('select alistamiento_documento(%s, %L, %L)', :a, 'XYZ', '123')) then 'ok' else 'not ok' end
       || ' 11 - el documento solo es OP o FVE';
select alistamiento_documento(:a, 'FVE', ' FVE-1234 ');
select case when (select doc_tipo = 'FVE' and doc_numero = 'FVE-1234' and doc_por = :'admin' from alistamientos where id = :a) then 'ok' else 'not ok' end
       || ' 12 - el asesor guarda el documento (recortado) y queda quién lo puso';

select alistamiento_listo(:a, 'Camilo Osorio');
select case when (select estado = 'listo' and listo_por = 'Camilo Osorio' from alistamientos where id = :a)
             and (select 'Listo-Para-Despachar' = any(etiquetas) from leads where id = :l)
             and (select e.nombre = 'Alistamiento' from oportunidades o join etapas e on e.id = o.etapa_id where o.id = :op)
            then 'ok' else 'not ok' end || ' 13 - «listo»: etiqueta para el asesor y la etapa sigue en Alistamiento (control interno)';

select case when (select count(*) from lead_eventos where lead_id = :l and tipo = 'alistamiento') = 3 then 'ok' else 'not ok' end
       || ' 14 - la línea de tiempo registra documento, toma y listo';

select case when (select p ->> 'cliente' = 'Ana' and p ->> 'entrega' = 'envio' and p ->> 'estado' = 'listo' and not (p ? 'telefono')
                  from jsonb_array_elements(servicio_tecnico_pedidos()) p where (p ->> 'id')::bigint = :a)
            then 'ok' else 'not ok' end || ' 15 - el servicio técnico ve el pedido sin el teléfono del cliente';

select alistamiento_reabrir(:a, 'Camilo Osorio');
select case when (select estado = 'en_revision' from alistamientos where id = :a)
             and (select not 'Listo-Para-Despachar' = any(etiquetas) from leads where id = :l)
            then 'ok' else 'not ok' end || ' 16 - reabrir quita el «listo» y la etiqueta';

reset role;
update oportunidades set etapa_id = (select id from etapas where embudo_id = 1 and nombre = 'Despachado') where id = :op;
set local role authenticated;
select case when not exists (select 1 from jsonb_array_elements(servicio_tecnico_pedidos()) p where (p ->> 'id')::bigint = :a)
            then 'ok' else 'not ok' end || ' 17 - al pasar a Despachado sale de la pantalla del servicio técnico';

rollback;

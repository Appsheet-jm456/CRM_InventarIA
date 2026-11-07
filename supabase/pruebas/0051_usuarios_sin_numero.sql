-- Pruebas de la migración 0051: clientes sin número. Todo con ROLLBACK.
begin;
create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin execute sentencia; return false; exception when others then return true; end $$;

insert into leads (telefono, nombre, etapa) values ('CO.2435241720632393', 'Sin número', 'Nuevo');
select case when exists (select 1 from leads where telefono = 'CO.2435241720632393') then 'ok' else 'not ok' end
       || ' 1 - un cliente sin número se guarda con su identificador de WhatsApp';
select case when pg_temp.falla($q$insert into leads (telefono, nombre, etapa) values ('hola', 'x', 'Nuevo')$q$) then 'ok' else 'not ok' end
       || ' 2 - un texto cualquiera sigue sin valer como teléfono';
insert into leads (telefono, nombre, etapa, wa_user_id) values ('570000051001', 'Con número', 'Nuevo', 'CO.9990001');
select case when pg_temp.falla($q$insert into leads (telefono, nombre, etapa, wa_user_id) values ('570000051002', 'y', 'Nuevo', 'CO.9990001')$q$) then 'ok' else 'not ok' end
       || ' 3 - el identificador no se repite entre clientes activos';
rollback;

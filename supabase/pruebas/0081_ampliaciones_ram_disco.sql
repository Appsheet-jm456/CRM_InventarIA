-- Pruebas de la migración 0081 (F4·73): aumentos de RAM y disco. Con ROLLBACK.
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select case when (select count(*) from producto_atributos where clave in ('ram_onboard', 'ram_ranuras', 'ram_velocidad', 'disco_ranuras', 'disco_tipo')) = 5
            then 'ok' else 'not ok' end || ' 1 - vienen los cinco atributos de ampliación';
select case when (select count(*) from ampliaciones where tipo = 'ram') = 7 and (select count(*) from ampliaciones where tipo = 'disco') = 5
             and (select precio_rapida from ampliaciones where tipo = 'ram' and desde_gb = 8 and hasta_gb = 16) = 140000
            then 'ok' else 'not ok' end || ' 2 - la tabla arranca con los precios del afiche';
select case when pg_temp.falla($$insert into ampliaciones (tipo, desde_gb, hasta_gb, precio) values ('ram', 8, 12, 1000)$$)
             and pg_temp.falla($$insert into ampliaciones (tipo, desde_gb, hasta_gb, precio) values ('disco', 512, 256, 1000)$$)
             and pg_temp.falla($$insert into ampliaciones (tipo, desde_gb, hasta_gb, precio) values ('disco', 256, 512, 1)$$)
            then 'ok' else 'not ok' end || ' 3 - RAM pide los dos precios, hasta > desde y sin repetir';
update productos set atributos = atributos || '{"ram_onboard": true, "ram_ranuras": "Ninguna", "disco_tipo": "NVMe"}'
 where codigo = (select codigo from productos limit 1);
select 'ok 4 - un equipo acepta los atributos de ampliación';
select case when (select ampliacion_activa and ampliacion_nvme = 30000 from agente_config where id = 1) then 'ok' else 'not ok' end
       || ' 5 - interruptor encendido y NVMe +$30.000';

select set_config('request.jwt.claims', json_build_object('sub', coalesce((select u.id from usuarios u where not exists (
  select 1 from rol_permisos rp where rp.rol_id = u.rol_id and rp.permiso = 'administrar_agente') limit 1),
  '00000000-0000-0000-0000-000000000000'), 'role', 'authenticated')::text, true);
set local role authenticated;
with cambio as (update ampliaciones set precio = 1 where tipo = 'disco' returning 1)
select case when (select count(*) from ampliaciones) = 12 and (select count(*) from cambio) = 0
            then 'ok' else 'not ok' end || ' 6 - un usuario sin administrar_agente lee los precios y no los cambia';
rollback;

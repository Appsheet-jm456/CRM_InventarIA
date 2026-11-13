-- Pruebas de la migración 0086 (F4·75b): enlace web manual del equipo. Con ROLLBACK.
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select case when (select count(*) from productos where enlace_web <> '') = 0 then 'ok' else 'not ok' end || ' 1 - los equipos arrancan sin enlace manual';
update productos set enlace_web = 'https://ventasvirtualcolombia.com/producto/x' where id = (select min(id) from productos);
select 'ok 2 - un equipo guarda su enlace https';
select case when pg_temp.falla($$update productos set enlace_web = 'http://inseguro.com' where id = (select min(id) from productos)$$)
             and pg_temp.falla($$update productos set enlace_web = 'ventasvirtualcolombia.com' where id = (select min(id) from productos)$$)
            then 'ok' else 'not ok' end || ' 3 - solo enlaces https';

rollback;

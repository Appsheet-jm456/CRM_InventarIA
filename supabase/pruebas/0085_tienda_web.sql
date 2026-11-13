-- Pruebas de la migración 0085 (F4·75): enlace a la tienda web. Con ROLLBACK.
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select case when (select activa and url = 'https://ventasvirtualcolombia.com' and catalogo_url like '%categoria=portatil' from tienda_web where id = 1)
            then 'ok' else 'not ok' end || ' 1 - una fila encendida con la tienda y el catálogo de portátiles';
select case when pg_temp.falla($$insert into tienda_web (id) values (2)$$)
             and pg_temp.falla($$update tienda_web set url = 'http://inseguro.com' where id = 1$$)
             and pg_temp.falla($$update tienda_web set texto_equipo = 'sin marca' where id = 1$$)
            then 'ok' else 'not ok' end || ' 2 - una sola fila, solo https y el texto lleva {enlace}';
select case when not has_table_privilege('anon', 'public.tienda_web', 'select')
             and not has_table_privilege('authenticated', 'public.tienda_web', 'delete')
            then 'ok' else 'not ok' end || ' 3 - anon no la ve y nadie la borra';

rollback;

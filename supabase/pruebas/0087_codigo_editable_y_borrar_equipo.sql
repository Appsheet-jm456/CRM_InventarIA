-- Pruebas de la migración 0087 (F4·76): código editable y borrar equipos. Con ROLLBACK.
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into productos (codigo, categoria, marca, modelo, precio, stock) values
  ('QA-0087-A', 'Portatil', 'QA', 'Uno', 1000, 1),
  ('QA-0087-B', 'Portatil', 'QA', 'Dos', 1000, 1);
insert into carritos (lead_id, items)
  select id, '[{"codigo":"QA-0087-A","equipo":"QA Uno","precio":1000},{"codigo":"OTRO","equipo":"x","precio":1}]'::jsonb
    from leads where not exists (select 1 from carritos c where c.lead_id = leads.id) order by id limit 1;

update productos set codigo = ' QA-0087-Z ' where codigo = 'QA-0087-A';
select case when exists (select 1 from productos where codigo = 'QA-0087-Z') and not exists (select 1 from productos where codigo = 'QA-0087-A')
            then 'ok' else 'not ok' end || ' 1 - el código de un equipo se puede cambiar (y se limpian los espacios)';

select case when not exists (select 1 from carritos where items::text like '%QA-0087-A%')
             and (not exists (select 1 from carritos where items::text like '%OTRO%') or exists (select 1 from carritos where items::text like '%QA-0087-Z%' and items::text like '%OTRO%'))
            then 'ok' else 'not ok' end || ' 2 - el carrito se lleva el código nuevo y deja los demás renglones';

select case when pg_temp.falla($$update productos set codigo = 'qa-0087-b' where codigo = 'QA-0087-Z'$$)
            then 'ok' else 'not ok' end || ' 3 - no se puede repetir un código (sin importar mayúsculas)';
select case when pg_temp.falla($$update productos set codigo = '  ' where codigo = 'QA-0087-Z'$$)
            then 'ok' else 'not ok' end || ' 4 - el código no puede quedar vacío';

select case when exists (select 1 from pg_policies where tablename = 'productos' and policyname = 'productos_borrar' and cmd = 'DELETE')
             and has_table_privilege('authenticated', 'public.productos', 'DELETE')
            then 'ok' else 'not ok' end || ' 5 - quien administra el inventario puede borrar (política y permiso)';

delete from productos where codigo = 'QA-0087-B';
select case when not exists (select 1 from productos where codigo = 'QA-0087-B')
            then 'ok' else 'not ok' end || ' 6 - un equipo se borra';

rollback;

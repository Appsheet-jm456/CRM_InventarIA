-- Pruebas de la migración 0009 (F3·9, decisión 0025). Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000009a1', 'prueba-0009-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000009a1', 'Prueba Asesor 0009', id from roles where nombre = 'asesor';
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset

-- Punto de partida conocido: dos equipos de prueba y el resto del inventario tal cual.
insert into productos (codigo, marca, modelo, precio, stock) values
  ('PR-0009-A', 'DELL', 'Latitude 5400', 1000000, 2),
  ('PR-0009-B', 'DELL', 'Latitude 7490', 1500000, 1);

-- RI-01: el asesor lee pero no escribe
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009a1","role":"authenticated"}', true);
select case when (select count(*) from productos where codigo like 'PR-0009-%') = 2 then 'ok' else 'not ok' end
       || ' 1 - el asesor ve el inventario';
select case when pg_temp.falla($q$insert into productos (codigo, precio) values ('PR-0009-X', 1)$q$)
             and (select count(*) from productos where codigo = 'PR-0009-X') = 0
            then 'ok' else 'not ok' end || ' 2 - el asesor no crea equipos';
update productos set precio = 1 where codigo = 'PR-0009-A';
select case when pg_temp.falla($q$select cargar_inventario('[{"codigo":"PR-0009-A","precio":1}]', false)$q$)
            then 'ok' else 'not ok' end || ' 3 - el asesor no carga el Excel';
select case when pg_temp.falla($q$insert into catalogos (nombre, tipo, url) values ('X', 'drive', 'https://x')$q$)
            then 'ok' else 'not ok' end || ' 4 - el asesor no crea catálogos';
reset role;
select case when precio = 1000000 then 'ok' else 'not ok' end || ' 5 - el update del asesor no cambió nada'
from productos where codigo = 'PR-0009-A';

-- El administrador edita; el código no cambia y la foto nueva borra el id de Meta
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
update productos set foto_meta_id = 'meta-viejo' where codigo = 'PR-0009-A';
update productos set foto_ruta = '1/foto.jpg' where codigo = 'PR-0009-A';
select case when foto_meta_id = '' then 'ok' else 'not ok' end || ' 6 - cambiar la foto borra el id de Meta'
from productos where codigo = 'PR-0009-A';
select case when pg_temp.falla($q$update productos set codigo = 'PR-0009-Z' where codigo = 'PR-0009-A'$q$)
            then 'ok' else 'not ok' end || ' 7 - el código no cambia';
select case when pg_temp.falla($q$insert into productos (codigo, precio) values ('pr-0009-a', 1)$q$)
            then 'ok' else 'not ok' end || ' 8 - el código es único sin importar mayúsculas';
select case when pg_temp.falla($q$update productos set stock = -1 where codigo = 'PR-0009-A'$q$)
            then 'ok' else 'not ok' end || ' 9 - el stock no es negativo';

-- RI-04: vista previa sin escribir
select cargar_inventario(jsonb_build_array(
  jsonb_build_object('codigo', 'pr-0009-a', 'precio', 1100000, 'stock', 2),
  jsonb_build_object('codigo', 'PR-0009-C', 'marca', 'DELL', 'modelo', 'Precision', 'precio', 2500000, 'stock', 3))
  || (select coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'precio', precio)), '[]')
      from productos where codigo not like 'PR-0009-%'), false) as previa \gset
select case when jsonb_array_length((:'previa'::jsonb)->'nuevos') = 1
             and (:'previa'::jsonb)->'cambian'->0->'cambios' ? 'precio'
             and not ((:'previa'::jsonb)->'cambian'->0->'cambios' ? 'stock')
             and (:'previa'::jsonb)->'sin_stock'->0->>'codigo' = 'PR-0009-B'
             and (select count(*) from productos where codigo = 'PR-0009-C') = 0
            then 'ok' else 'not ok' end || ' 10 - la vista previa muestra nuevos, cambios y sin stock sin escribir';

-- Con un error no se carga nada
select cargar_inventario('[{"codigo":"PR-0009-C","precio":1},{"codigo":"PR-0009-C","precio":2},{"codigo":"PR-0009-D","precio":"mil"}]', true) as errada \gset
select case when jsonb_array_length((:'errada'::jsonb)->'errores') = 2 and not ((:'errada'::jsonb)->>'aplicado')::boolean
             and (select count(*) from productos where codigo in ('PR-0009-C', 'PR-0009-D')) = 0
             and (select stock from productos where codigo = 'PR-0009-B') = 1
            then 'ok' else 'not ok' end || ' 11 - una hoja con errores no carga nada';

-- Aplicar: crea, actualiza, deja en 0 lo que no vino y no toca columnas ausentes
select cargar_inventario(jsonb_build_array(
  jsonb_build_object('codigo', 'pr-0009-a', 'precio', 1100000),
  jsonb_build_object('codigo', 'PR-0009-C', 'marca', 'DELL', 'modelo', 'Precision', 'precio', 2500000, 'stock', 3))
  || (select coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'precio', precio)), '[]')
      from productos where codigo not like 'PR-0009-%'), true);
reset role;
select case when (select precio from productos where codigo = 'PR-0009-A') = 1100000
             and (select stock from productos where codigo = 'PR-0009-A') = 2
             and (select modelo from productos where codigo = 'PR-0009-A') = 'Latitude 5400'
             and (select stock from productos where codigo = 'PR-0009-C') = 3
             and (select stock from productos where codigo = 'PR-0009-B') = 0
            then 'ok' else 'not ok' end || ' 12 - aplicar crea, actualiza y deja en 0 lo que no vino';

-- Un solo catálogo "Todos" activo
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
insert into catalogos (nombre, tipo, url, todos) values ('Todos 1', 'drive', 'https://drive.google.com/a', true);
select case when pg_temp.falla($q$insert into catalogos (nombre, tipo, url, todos) values ('Todos 2', 'drive', 'https://drive.google.com/b', true)$q$)
            then 'ok' else 'not ok' end || ' 13 - un solo catálogo Todos activo';
reset role;

-- Buckets privados con límite
select case when (select count(*) from storage.buckets where id in ('productos', 'catalogos') and not public) = 2
             and (select file_size_limit from storage.buckets where id = 'productos') = 5242880
            then 'ok' else 'not ok' end || ' 14 - los buckets son privados y con límite';

rollback;

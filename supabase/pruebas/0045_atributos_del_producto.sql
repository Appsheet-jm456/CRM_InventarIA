-- Pruebas de la migración 0045 (F4·41): atributos del producto. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

-- La carga corre como el servidor (service_role), igual que el script de consola.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Datos propios de la prueba (no dependen del inventario vivo)
insert into producto_atributos (clave, nombre, tipo, opciones, orden) values
  ('zz_rgb', 'ZZ Teclado RGB', 'si_no', '[]', 90),
  ('zz_hz', 'ZZ Frecuencia', 'numero', '[]', 91),
  ('zz_panel', 'ZZ Panel', 'lista', '["IPS", "OLED"]', 92);
insert into productos (codigo, marca, modelo, precio, stock, categoria) values ('ZZ-PRUEBA-1', 'LENOVO', 'LEGION 7', 4800000, 1, 'Portatil');

select case when (select count(*) from producto_atributos where clave in ('grafica', 'pantalla', 'teclado', 'bateria', 'estado_estetico')) = 5
            then 'ok' else 'not ok' end || ' 1 - vienen los cinco atributos sugeridos';
select case when pg_temp.falla($$insert into producto_atributos (clave, nombre, tipo) values ('precio', 'Precio 2', 'texto')$$)
             and pg_temp.falla($$insert into producto_atributos (clave, nombre, tipo) values ('Mala Clave', 'X', 'texto')$$)
             and pg_temp.falla($$insert into producto_atributos (clave, nombre, tipo) values ('zz_lista', 'X', 'lista')$$)
            then 'ok' else 'not ok' end || ' 2 - no se repite una marca de la plantilla, la clave es válida y una lista trae opciones';

update productos set atributos = '{"grafica": "RTX 3080", "zz_rgb": true, "zz_hz": 165, "zz_panel": "IPS"}' where codigo = 'ZZ-PRUEBA-1';
select case when (select atributos->>'grafica' = 'RTX 3080' and (atributos->'zz_rgb')::boolean from productos where codigo = 'ZZ-PRUEBA-1')
            then 'ok' else 'not ok' end || ' 3 - un equipo guarda valores válidos de cada tipo';
select case when pg_temp.falla($$update productos set atributos = '{"no_existe": "x"}' where codigo = 'ZZ-PRUEBA-1'$$)
             and pg_temp.falla($$update productos set atributos = '{"zz_hz": "mucho"}' where codigo = 'ZZ-PRUEBA-1'$$)
             and pg_temp.falla($$update productos set atributos = '{"zz_rgb": "si"}' where codigo = 'ZZ-PRUEBA-1'$$)
             and pg_temp.falla($$update productos set atributos = '{"zz_panel": "TN"}' where codigo = 'ZZ-PRUEBA-1'$$)
            then 'ok' else 'not ok' end || ' 4 - la base rechaza un atributo que no existe y valores del tipo equivocado';

-- Excel (RI-09): encabezado por nombre o clave, sin tildes ni mayúsculas; las celdas se convierten por tipo.
select case when (
  select r->'errores' = '[]' and r->'cambian'->0->'cambios' ? 'Pantalla' and r->'cambian'->0->'cambios' ? 'ZZ Frecuencia'
     and r->'columnas_ignoradas' = '["Color"]'
  from (select cargar_inventario(jsonb_build_array(
          (select jsonb_agg(jsonb_build_object('codigo', codigo, 'precio', precio, 'stock', stock)) -> 0 from productos where codigo = 'ZZ-PRUEBA-1')
          || jsonb_build_object('atributos', jsonb_build_object('PANTALLA', '16" QHD', 'zz hz', '240', 'zz panel', 'oled', 'Color', 'Negro'))), false) r) x)
            then 'ok' else 'not ok' end || ' 5 - la vista previa reconoce las columnas por nombre o clave y avisa las que no usa';
select case when (
  select r->'errores'->0->>'error' like '%ZZ Teclado RGB%' and r->'errores'->0->>'error' like '%ZZ Panel%'
  from (select cargar_inventario(jsonb_build_array(jsonb_build_object('codigo', 'ZZ-PRUEBA-1', 'precio', 1,
          'atributos', jsonb_build_object('ZZ Teclado RGB', 'quizás', 'ZZ Panel', 'TN'))), false) r) x)
            then 'ok' else 'not ok' end || ' 6 - un valor que no cumple el tipo es error de la fila (no se carga nada)';

-- Aplicar en un inventario aislado: la prueba deja todo lo demás tal cual (rollback).
create temp table vivos as select codigo, precio, stock from productos where stock <> 0 and codigo <> 'ZZ-PRUEBA-1';
select cargar_inventario((
  select jsonb_agg(jsonb_build_object('codigo', codigo, 'precio', precio, 'stock', stock)) from vivos)
  || jsonb_build_array(jsonb_build_object('codigo', 'ZZ-PRUEBA-1', 'precio', 4800000, 'stock', 1,
       'atributos', jsonb_build_object('Pantalla', '16" QHD', 'ZZ Teclado RGB', 'Sí', 'Tarjeta gráfica', ''))), true);
select case when (select atributos = '{"pantalla": "16\" QHD", "zz_rgb": true, "zz_hz": 165, "zz_panel": "IPS"}'::jsonb
                    from productos where codigo = 'ZZ-PRUEBA-1')
            then 'ok' else 'not ok' end || ' 7 - al cargar: escribe los que vienen, una celda vacía borra y lo que no viene no se toca';

select case when has_column_privilege('authenticated', 'public.producto_atributos', 'nombre', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.producto_atributos', 'tipo', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.producto_atributos', 'clave', 'UPDATE')
             and not has_table_privilege('anon', 'public.producto_atributos', 'SELECT')
            then 'ok' else 'not ok' end || ' 8 - la clave y el tipo no cambian; anon no ve los atributos';
rollback;

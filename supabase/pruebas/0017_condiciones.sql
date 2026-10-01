-- Pruebas de la migración 0017 (F4·11): cuadro Condiciones. Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;
create function pg_temp.problemas(p_bot bigint, p_clave text) returns text language sql security definer as $$
  select coalesce(string_agg(p->>'problema', ' | '), '')
  from jsonb_array_elements(problemas_del_flujo((select id from bot_flujos where bot_id = p_bot and estado = 'borrador'))) p
  where p->>'clave' = p_clave
$$;
create function pg_temp.cuadro(p_bot bigint, p_clave text) returns bot_cuadros language sql security definer as $$
  select k.* from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.bot_id = p_bot and f.estado = 'borrador' and k.clave = p_clave
$$;

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset

select case when normalizar_condicion('  ¡Úno!  ') = 'uno' and normalizar_condicion('Hablar   con ASESOR.') = 'hablar con asesor'
             and normalizar_condicion('Año 2026') = 'ano 2026'
            then 'ok' else 'not ok' end || ' 1 - normaliza como flujo.py: minúsculas, sin tildes, sin signos, un espacio';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select crear_bot('Prueba 0017') as b \gset
select borrador_crear_cuadro('condicion', 0, 0, :b) as c \gset

select case when (pg_temp.cuadro(:b, :'c')).tipo = 'condicion' and (pg_temp.cuadro(:b, :'c')).salidas = '{"ninguna": null}'
             and pg_temp.problemas(:b, :'c') like '%no tiene palabras%'
             and pg_temp.problemas(:b, :'c') like '%Ninguna se cumple» no lleva%'
            then 'ok' else 'not ok' end || ' 2 - un cuadro nuevo trae una condición vacía y la salida «ninguna» suelta';

select borrador_guardar_condiciones(:'c', 'Qué quiere', '[{"titulo":"Asesor","palabras":["1","¡Uno!","Asesor"],"destino":"B-ASESOR"},{"titulo":"Volver","palabras":["menú principal"],"destino":"B00"}]', 'B00', :b);
select case when (pg_temp.cuadro(:b, :'c')).nombre = 'Qué quiere'
             and (pg_temp.cuadro(:b, :'c')).opciones = '[{"id":"1","titulo":"Asesor","palabras":["1","uno","asesor"],"destino":"B-ASESOR"},{"id":"2","titulo":"Volver","palabras":["menu principal"],"destino":"B00"}]'::jsonb
             and (pg_temp.cuadro(:b, :'c')).salidas = '{"ninguna": "B00"}'
            then 'ok' else 'not ok' end || ' 3 - guarda las condiciones en orden con sus palabras normalizadas';

select case when pg_temp.falla(format('select borrador_guardar_condiciones(%L, null, %L, null, %s)', :'c', '[{"titulo":"A","palabras":["uno"]},{"titulo":"B","palabras":["UNO"]}]', :b))
             and pg_temp.falla(format('select borrador_guardar_condiciones(%L, null, %L, null, %s)', :'c', '[]', :b))
             and pg_temp.falla(format('select borrador_guardar_condiciones(%L, null, %L, null, %s)', :'c', '[{"titulo":" ","palabras":["x"]}]', :b))
             and pg_temp.falla(format('select borrador_guardar_condiciones(%L, null, %L, null, %s)', :'c', '[{"titulo":"A","palabras":["x"],"destino":"R11"}]', :b))
             and pg_temp.falla(format('select borrador_guardar_condiciones(%L, null, %L, %L, %s)', :'c', '[{"titulo":"A","palabras":["x"]}]', :'c', :b))
            then 'ok' else 'not ok' end || ' 4 - rechaza palabras repetidas, lista vacía, condición sin nombre, ir a la ficha o a sí mismo';

select case when pg_temp.falla(format('select borrador_guardar_cuadro(%L, null, %L, %L, %s)', :'c', 'x', '[]', :b))
             and pg_temp.falla(format('select borrador_guardar_condiciones(%L, null, %L, null, %s)', 'B00', '[{"titulo":"A","palabras":["x"]}]', :b))
            then 'ok' else 'not ok' end || ' 5 - las condiciones se guardan solo con su función y solo en su cuadro';

-- Se une como cualquier cuadro del dueño: la condición 2 y «ninguna» con flechas
select borrador_conectar(:'c', '2', 'B-ASESOR', :b);
select borrador_conectar(:'c', 'ninguna', 'B-ASESOR', :b);
select borrador_guardar_cuadro('B00', null, null, '[]', :b, json_build_object('respuesta', :'c')::jsonb);
select case when pg_temp.problemas(:b, :'c') = ''
             and (pg_temp.cuadro(:b, :'c')).salidas = '{"ninguna": "B-ASESOR"}'
             and ((pg_temp.cuadro(:b, :'c')).opciones->1->>'destino') = 'B-ASESOR'
            then 'ok' else 'not ok' end || ' 6 - condiciones y «ninguna» se unen con flechas y el cuadro queda sano';

select publicar_borrador('Con condiciones', false, :b) as v \gset
select crear_borrador(:b);
select case when :v = 1 and (pg_temp.cuadro(:b, :'c')).opciones->0->'palabras' = '["1","uno","asesor"]'
            then 'ok' else 'not ok' end || ' 7 - se publica y el borrador nuevo copia las condiciones';

select borrador_borrar_cuadro(:'c', :b);
select case when (pg_temp.cuadro(:b, 'B00')).salidas = '{"respuesta": null}'
            then 'ok' else 'not ok' end || ' 8 - borrar las condiciones suelta la flecha que llegaba';

reset role;
rollback;

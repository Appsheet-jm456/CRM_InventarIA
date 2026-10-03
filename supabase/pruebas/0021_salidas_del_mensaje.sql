-- Pruebas de la migración 0021 (F4·18): salidas del Mensaje (Otra respuesta, Sin respuesta y Error al enviar).
-- Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
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

select case when salidas_opcionales('mensaje', '[{"id":"1"}]') = array['otra', 'sin_respuesta', 'error']
             and salidas_opcionales('mensaje', '[]') = array['sin_respuesta', 'error']
             and salidas_opcionales('pausa', null) = '{}'
             and exists (select 1 from information_schema.columns where table_name = 'mensajes' and column_name = 'cuadro')
            then 'ok' else 'not ok' end || ' 1 - un mensaje con botones tiene tres salidas opcionales; sin botones, dos';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select crear_bot('Prueba 0021') as b \gset
select borrador_crear_cuadro('mensaje', 300, 0, :b) as m \gset
select borrador_crear_cuadro('mensaje', 600, 0, :b) as n \gset
select borrador_guardar_cuadro('B00', null, '¿Qué buscas?', ('[{"id":"1","titulo":"Uno","destino":"' || :'m' || '"}]')::jsonb, :b);
select borrador_guardar_cuadro(:'m', null, 'Hola', '[{"id":"1","titulo":"Volver","destino":"B00"}]', :b);
select borrador_guardar_cuadro(:'n', null, 'Te paso con un asesor', '[{"id":"1","titulo":"Volver","destino":"B00"}]', :b);

-- RF-20 a RF-22: se unen con flechas y no son obligatorias
select borrador_conectar('B00', 'otra', :'m', :b);
select borrador_conectar('B00', 'sin_respuesta', :'n', :b);
select borrador_conectar('B00', 'error', 'B-ASESOR', :b);
select case when (pg_temp.cuadro(:b, 'B00')).salidas = jsonb_build_object('otra', :'m', 'sin_respuesta', :'n', 'error', 'B-ASESOR')
             and (pg_temp.cuadro(:b, 'B00')).ajustes->>'espera_segundos' = '900'
             and pg_temp.problemas(:b, 'B00') = '' and pg_temp.problemas(:b, :'m') = ''
            then 'ok' else 'not ok' end || ' 2 - las tres salidas se unen, «Sin respuesta» arranca en 15 min y no dejan problemas';

select case when pg_temp.problemas(:b, :'n') like '%Ningún cuadro lleva aquí%' is false
            then 'ok' else 'not ok' end || ' 3 - un cuadro al que solo se llega por «Sin respuesta» cuenta como alcanzado';

-- Guardar el cuadro conserva las salidas y cambia el tiempo
select borrador_guardar_cuadro('B00', null, '¿Qué buscas hoy?', null, :b, '{"espera_segundos": 3600}');
select case when (pg_temp.cuadro(:b, 'B00')).salidas = jsonb_build_object('otra', :'m', 'sin_respuesta', :'n', 'error', 'B-ASESOR')
             and (pg_temp.cuadro(:b, 'B00')).ajustes->>'espera_segundos' = '3600'
            then 'ok' else 'not ok' end || ' 4 - guardar el texto conserva las salidas y cambia el tiempo a 1 h';

select borrador_guardar_cuadro('B00', null, null, null, :b, '{"otra": null}');
select case when (pg_temp.cuadro(:b, 'B00')).salidas->'otra' = 'null'::jsonb and (pg_temp.cuadro(:b, 'B00')).salidas->>'error' = 'B-ASESOR'
            then 'ok' else 'not ok' end || ' 5 - soltar una salida desde el panel no toca las otras';

select case when pg_temp.falla(format('select borrador_conectar(%L, %L, %L, %s)', 'B00', 'sin_respuesta', 'B00', :b))
             and pg_temp.falla(format('select borrador_guardar_cuadro(%L, null, null, null, %s, %L)', 'B00', :b, '{"sin_respuesta": "B00"}'))
             and pg_temp.falla(format('select borrador_guardar_cuadro(%L, null, null, null, %s, %L)', 'B00', :b, '{"espera_segundos": 0}'))
             and pg_temp.falla(format('select borrador_guardar_cuadro(%L, null, null, null, %s, %L)', 'B00', :b, '{"espera_segundos": 86400}'))
             and pg_temp.falla(format('select borrador_guardar_cuadro(%L, null, null, null, %s, %L)', 'B00', :b, '{"error": "R11"}'))
             and pg_temp.falla(format('select borrador_conectar(%L, %L, %L, %s)', 'B00', 'tiempo', :'m', :b))
            then 'ok' else 'not ok' end || ' 6 - rechaza volver al mismo mensaje, 0 s, 24 h, ir a la ficha y salidas que no son del mensaje';

-- Sin botones: «Otra respuesta» no aplica y se suelta; quedan respuesta, sin_respuesta y error
select borrador_guardar_cuadro(:'m', null, 'Escríbeme tu ciudad', '[]', :b, ('{"respuesta": "B00", "otra": "' || :'n' || '", "error": "' || :'n' || '"}')::jsonb);
select case when (pg_temp.cuadro(:b, :'m')).salidas = jsonb_build_object('respuesta', 'B00', 'sin_respuesta', null, 'error', :'n')
            then 'ok' else 'not ok' end || ' 7 - sin botones guarda «Cuando responda», «Sin respuesta» y «Error», y descarta «Otra respuesta»';

select borrador_conectar(:'m', 'error', 'B00', :b);
select case when (pg_temp.cuadro(:b, :'m')).salidas->>'error' = 'B00' then 'ok' else 'not ok' end || ' 8 - «Error al enviar» puede volver al mismo flujo';

-- Borrar el destino suelta la flecha; publicar y abrir otro borrador copia salidas y tiempo
select borrador_borrar_cuadro(:'n', :b);
select case when (pg_temp.cuadro(:b, 'B00')).salidas->'sin_respuesta' = 'null'::jsonb
            then 'ok' else 'not ok' end || ' 9 - borrar el cuadro de destino suelta «Sin respuesta»';

select borrador_conectar('B00', 'sin_respuesta', :'m', :b);
select publicar_borrador('Con salidas', false, :b) as v \gset
select crear_borrador(:b);
select case when :v = 1 and (pg_temp.cuadro(:b, 'B00')).salidas->>'sin_respuesta' = :'m'
             and (pg_temp.cuadro(:b, 'B00')).ajustes->>'espera_segundos' = '3600'
            then 'ok' else 'not ok' end || ' 10 - se publica y el borrador nuevo copia las salidas y el tiempo';

-- Si el tiempo queda fuera de rango (dato viejo), publicar lo avisa
reset role;
update bot_cuadros k set ajustes = k.ajustes || '{"espera_segundos": 0}'
from bot_flujos f where f.id = k.flujo_id and f.bot_id = :b and f.estado = 'borrador' and k.clave = 'B00';
select case when pg_temp.problemas(:b, 'B00') like '%espera de «Sin respuesta»%'
            then 'ok' else 'not ok' end || ' 11 - un tiempo fuera de rango impide publicar';

rollback;

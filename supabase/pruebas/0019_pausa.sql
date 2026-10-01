-- Pruebas de la migración 0019 (F4·13): cuadro Pausa. Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
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

select case when exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'espera_vence_en')
             and exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'espera_cuadro')
            then 'ok' else 'not ok' end || ' 1 - el cliente guarda cuándo vence su espera y en qué cuadro';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select crear_bot('Prueba 0019') as b \gset
select borrador_crear_cuadro('pausa', 0, 0, :b) as p \gset
select borrador_crear_cuadro('mensaje', 300, 0, :b) as m \gset

select case when (pg_temp.cuadro(:b, :'p')).tipo = 'pausa' and (pg_temp.cuadro(:b, :'p')).ajustes = '{"segundos": 900}'
             and pg_temp.problemas(:b, :'p') like '%El cliente respondió» no lleva%'
             and pg_temp.problemas(:b, :'p') like '%Pasó el tiempo» no lleva%'
            then 'ok' else 'not ok' end || ' 2 - una Pausa nueva espera 15 min y pide sus dos salidas';

select borrador_guardar_pausa(:'p', 'Espera respuesta', 915, 'B-ASESOR', :'m', :b);
select borrador_guardar_cuadro('B00', null, null, ('[{"id":"1","titulo":"Esperar","destino":"' || :'p' || '"}]')::jsonb, :b);
select borrador_guardar_cuadro(:'m', null, '¿Sigues ahí? 👋', '[{"id":"1","titulo":"Sí","destino":"B00"}]', :b);
select case when (pg_temp.cuadro(:b, :'p')).ajustes = '{"segundos": 915}'
             and (pg_temp.cuadro(:b, :'p')).salidas = jsonb_build_object('respondio', 'B-ASESOR', 'tiempo', :'m')
             and pg_temp.problemas(:b, :'p') = ''
            then 'ok' else 'not ok' end || ' 3 - guarda 0 h 15 min 15 s y sus dos salidas, y queda sana';

select case when pg_temp.falla(format('select borrador_guardar_pausa(%L, null, 0, null, null, %s)', :'p', :b))
             and pg_temp.falla(format('select borrador_guardar_pausa(%L, null, 86400, null, null, %s)', :'p', :b))
             and pg_temp.falla(format('select borrador_guardar_pausa(%L, null, 60, %L, null, %s)', :'p', 'R11', :b))
             and pg_temp.falla(format('select borrador_guardar_pausa(%L, null, 60, null, %L, %s)', :'p', :'p', :b))
             and pg_temp.falla(format('select borrador_guardar_cuadro(%L, null, %L, null, %s)', :'p', 'x', :b))
            then 'ok' else 'not ok' end || ' 4 - rechaza 0 s, 24 h o más, ir a la ficha o a sí misma';

select borrador_conectar(:'p', 'respondio', :'m', :b);
select case when (pg_temp.cuadro(:b, :'p')).salidas->>'respondio' = :'m'
            then 'ok' else 'not ok' end || ' 5 - sus salidas se unen con flechas';

select publicar_borrador('Con pausa', false, :b) as v \gset
select crear_borrador(:b);
select case when :v = 1 and (pg_temp.cuadro(:b, :'p')).ajustes = '{"segundos": 915}'
            then 'ok' else 'not ok' end || ' 6 - se publica y el borrador nuevo copia el tiempo';

reset role;
rollback;

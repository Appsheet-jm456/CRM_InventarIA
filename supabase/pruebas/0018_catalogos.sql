-- Pruebas de la migración 0018 (F4·12): cuadro Catálogos. Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
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
insert into catalogos (nombre, tipo, url, marca) values ('Prueba 0018 Lenovo', 'drive', 'https://drive.google.com/prueba-0018', 'LENOVO')
returning id as cat \gset

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select crear_bot('Prueba 0018') as b \gset
select borrador_crear_cuadro('catalogo', 0, 0, :b) as k \gset

select case when (pg_temp.cuadro(:b, :'k')).tipo = 'catalogo' and (pg_temp.cuadro(:b, :'k')).salidas = '{"siguiente": null}'
             and pg_temp.problemas(:b, :'k') like '%Elige qué catálogo envía%'
             and pg_temp.problemas(:b, :'k') like '%Siguiente» no lleva%'
            then 'ok' else 'not ok' end || ' 1 - un cuadro nuevo pide su catálogo y a dónde sigue';

select borrador_guardar_catalogo(:'k', 'Catálogo Lenovo', 'Te envío los equipos *Lenovo* 💻', :cat, 'B-ASESOR', :b);
select borrador_guardar_cuadro('B00', null, null, ('[{"id":"1","titulo":"Lenovo","destino":"' || :'k' || '"}]')::jsonb, :b);
select case when (pg_temp.cuadro(:b, :'k')).ajustes = jsonb_build_object('catalogo_id', :cat)
             and (pg_temp.cuadro(:b, :'k')).texto = 'Te envío los equipos *Lenovo* 💻'
             and pg_temp.problemas(:b, :'k') = ''
            then 'ok' else 'not ok' end || ' 2 - guarda encabezado, catálogo y siguiente, y queda sano';

select case when pg_temp.falla(format('select borrador_guardar_catalogo(%L, null, %L, 999999, null, %s)', :'k', 'x', :b))
             and pg_temp.falla(format('select borrador_guardar_catalogo(%L, null, %L, null, null, %s)', :'k', '  ', :b))
             and pg_temp.falla(format('select borrador_guardar_catalogo(%L, null, %L, null, %L, %s)', :'k', 'x', 'R11', :b))
             and pg_temp.falla(format('select borrador_guardar_catalogo(%L, null, %L, null, %L, %s)', :'k', 'x', :'k', :b))
             and pg_temp.falla(format('select borrador_guardar_cuadro(%L, null, %L, null, %s)', :'k', 'x', :b))
            then 'ok' else 'not ok' end || ' 3 - rechaza catálogo inexistente, encabezado vacío, ir a la ficha o a sí mismo';

reset role;
update catalogos set activo = false where id = :cat;
set local role authenticated;
select case when pg_temp.problemas(:b, :'k') like '%está desactivado%'
            then 'ok' else 'not ok' end || ' 4 - un catálogo desactivado impide publicar';
reset role;
update catalogos set activo = true where id = :cat;
set local role authenticated;

select publicar_borrador('Con catálogo', false, :b) as v \gset
select crear_borrador(:b);
select case when :v = 1 and (pg_temp.cuadro(:b, :'k')).ajustes = jsonb_build_object('catalogo_id', :cat)
             and (pg_temp.cuadro(:b, :'k')).salidas = '{"siguiente": "B-ASESOR"}'
            then 'ok' else 'not ok' end || ' 5 - se publica y el borrador nuevo copia catálogo y siguiente';

-- El encabezado se puede corregir en la versión publicada (pestaña Mensajes)
select editar_cuadro(:'k', 'Encabezado corregido', null, :b);
select case when (select k.texto from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                  where f.bot_id = :b and f.estado = 'publicada' and k.clave = :'k') = 'Encabezado corregido'
            then 'ok' else 'not ok' end || ' 6 - el encabezado se corrige desde Mensajes del bot';

reset role;
rollback;

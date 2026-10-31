-- Pruebas de la migración 0033 (F4·30 C): lista paginada, filtros, acciones en grupo y vistas guardadas. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

-- Datos propios: un asesor y 60 leads de prueba con prefijo 5799 (los reales no se tocan; los filtros los aíslan por el texto «Prueba 0033»).
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000033a1', 'prueba-0033-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000033a1', 'Prueba Asesor 0033', id from roles where nombre = 'asesor';
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
insert into leads (telefono, nombre, etapa, valor_estimado, asignado_a, etiquetas, fecha_ultimo_contacto, cotiz_producto)
select '5799' || lpad(g::text, 6, '0'), 'Prueba 0033 cliente ' || g, 'Nuevo', 1000 * g,
       case when g <= 10 then '00000000-0000-4000-8000-0000000033a1'::uuid when g <= 20 then :'admin'::uuid end,
       case when g % 2 = 0 then '{Par}'::text[] else '{}' end, now() - g * interval '1 hour',
       case when g = 7 then '100-102-9999' else '' end
  from generate_series(1, 60) g;
select id as l7 from leads where telefono = '5799000007' \gset
select id as l30 from leads where telefono = '5799000030' \gset
select id as l1 from leads where telefono = '5799000001' \gset
select id as l15 from leads where telefono = '5799000015' \gset
insert into mensajes (lead_id, lado, texto) values (:l30, 'cliente', 'Necesito un equipo con maletín azul');
select e.id as cotizacion, e.embudo_id as embudo from etapas e join embudos em on em.id = e.embudo_id
 where em.nombre = 'Cliente Final' and e.nombre = 'Cotización' \gset
select e.id as nuevo_cf from etapas e join embudos em on em.id = e.embudo_id where em.nombre = 'Cliente Final' and e.nombre = 'Nuevo' \gset
select e.id as perdido_cf from etapas e join embudos em on em.id = e.embudo_id where em.nombre = 'Cliente Final' and e.nombre = 'Perdido' \gset

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select case when (leads_lista('{"q": "Prueba 0033"}') ->> 'total')::int = 60
             and jsonb_array_length(leads_lista('{"q": "Prueba 0033"}') -> 'filas') = 50
             and jsonb_array_length(leads_lista('{"q": "Prueba 0033", "pagina": 2}') -> 'filas') = 10
             and (leads_lista('{"q": "Prueba 0033"}') ->> 'valor')::numeric = 1830000
            then 'ok' else 'not ok' end || ' 1 - pagina de 50 en 50, cuenta el total y suma el valor de todo lo filtrado (RL-01)';
select case when jsonb_array_length(leads_lista('{"q": "Prueba 0033", "tamano": 1000}') -> 'filas') = 60
             and (leads_lista('{"q": "Prueba 0033", "tamano": 1000}') ->> 'tamano')::int = 200
            then 'ok' else 'not ok' end || ' 2 - nunca devuelve más de 200 por página';
select case when leads_lista('{"q": "Prueba 0033", "orden": "valor", "dir": "desc", "tamano": 3}') -> 'filas' -> 0 ->> 'nombre' = 'Prueba 0033 cliente 60'
             and leads_lista('{"q": "Prueba 0033", "orden": "contacto", "dir": "desc", "tamano": 3}') -> 'filas' -> 0 ->> 'nombre' = 'Prueba 0033 cliente 1'
            then 'ok' else 'not ok' end || ' 3 - ordena por valor y por último contacto';
select case when leads_lista('{"q": "maletín azul"}') -> 'filas' -> 0 ->> 'id' = :'l30'
             and leads_lista('{"q": "100-102-9999"}') -> 'filas' -> 0 ->> 'id' = :'l7'
             and (leads_lista('{"q": "5799000045"}') ->> 'total')::int = 1
             and (leads_lista('{"q": "100%"}') ->> 'total')::int = 0
            then 'ok' else 'not ok' end || ' 4 - busca por texto de los mensajes, código de equipo y teléfono; % no es comodín';
select case when (leads_lista('{"q": "Prueba 0033", "responsable": "sin"}') ->> 'total')::int = 40
             and (leads_lista(jsonb_build_object('q', 'Prueba 0033', 'responsable', '00000000-0000-4000-8000-0000000033a1')) ->> 'total')::int = 10
             and (leads_lista('{"q": "Prueba 0033", "etiqueta": "Par"}') ->> 'total')::int = 30
            then 'ok' else 'not ok' end || ' 5 - filtra por responsable (incluido «sin asignar») y por etiqueta';

-- Acciones en grupo
select (leads_en_grupo('etapa', (select array_agg(id) from leads where telefono like '57990000%' and telefono <= '5799000005'),
                       jsonb_build_object('etapa', :cotizacion)) ->> 'hechos')::int as movidos \gset
select case when :movidos = 5 and (leads_lista(jsonb_build_object('q', 'Prueba 0033', 'etapa', :cotizacion)) ->> 'total')::int = 5
            then 'ok' else 'not ok' end || ' 6 - mover de etapa en grupo abre la oportunidad si no hay y la mueve';
select case when (select (r ->> 'hechos')::int = 0 and jsonb_array_length(r -> 'errores') = 2
                    from leads_en_grupo('etapa', array[:l7, :l30]::bigint[], jsonb_build_object('etapa', :perdido_cf)) r)
            then 'ok' else 'not ok' end || ' 7 - a Perdido sin motivo no se mueve y dice el error de cada lead';
select (leads_en_grupo('etiqueta_poner', array[:l7, :l30]::bigint[], '{"etiqueta": "VIP"}') ->> 'hechos')::int as puestas \gset
select (leads_lista('{"q": "Prueba 0033", "etiqueta": "VIP"}') ->> 'total')::int as con_vip \gset
select (leads_en_grupo('etiqueta_quitar', array[:l7]::bigint[], '{"etiqueta": "VIP"}') ->> 'hechos')::int as quitadas \gset
select (leads_en_grupo('etiqueta_poner', array[:l30]::bigint[], '{"etiqueta": "VIP"}') ->> 'hechos')::int as repetida \gset
select case when :puestas = 2 and :con_vip = 2 and :quitadas = 1 and :repetida = 0
             and (leads_lista('{"q": "Prueba 0033", "etiqueta": "VIP"}') ->> 'total')::int = 1
            then 'ok' else 'not ok' end || ' 8 - pone y quita etiquetas en grupo; poner una que ya tiene no cuenta como hecho';
select (leads_en_grupo('tarea', array[:l7, :l30]::bigint[],
          jsonb_build_object('que', 'Llamar', 'tipo', 'Llamar', 'vence', now() - interval '1 hour')) ->> 'hechos')::int as tareas \gset
select case when :tareas = 2
             and (leads_lista('{"q": "Prueba 0033", "vencidas": true}') ->> 'total')::int = 2
             and (select count(*) from seguimientos where lead_id in (:l7, :l30) and tipo = 'Llamar') = 2
            then 'ok' else 'not ok' end || ' 9 - crea tareas en grupo con su tipo y filtra las vencidas';
select (leads_en_grupo('archivar', array[:l7]::bigint[]) ->> 'hechos')::int as archivados \gset
select (leads_lista('{"q": "Prueba 0033"}') ->> 'total')::int as activos_tras_archivar \gset
select (leads_en_grupo('eliminar', array[:l30]::bigint[]) ->> 'hechos')::int as eliminados \gset
select case when :archivados = 1 and :activos_tras_archivar = 59 and :eliminados = 1
             and (leads_lista('{"q": "Prueba 0033", "estado": "archivados"}') ->> 'total')::int = 1
             and (leads_lista('{"q": "Prueba 0033", "estado": "papelera"}') ->> 'total')::int = 1
             and (leads_lista('{"q": "Prueba 0033", "estado": "todos"}') ->> 'total')::int = 59
            then 'ok' else 'not ok' end || ' 10 - archivados y papelera salen de la lista activa y tienen su propio filtro';
select case when pg_temp.falla($q$select leads_en_grupo('borrar_todo', array[1]::bigint[])$q$)
             and pg_temp.falla($q$select leads_en_grupo('archivar', (select array_agg(g) from generate_series(1, 501) g)::bigint[])$q$)
            then 'ok' else 'not ok' end || ' 11 - no acepta acciones inventadas ni más de 500 leads';
select case when jsonb_array_length(leads_lista('{"q": "Prueba 0033", "exportar": true}') -> 'filas') = 58
            then 'ok' else 'not ok' end || ' 12 - el administrador exporta todo lo filtrado, sin páginas';

-- El asesor
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000033a1', 'role', 'authenticated')::text, true);
select case when (leads_lista('{"q": "Prueba 0033", "estado": "todos"}') ->> 'total')::int = 49
            then 'ok' else 'not ok' end || ' 13 - el asesor ve sus leads y los sin asignar, no los de otro (49 de 59)';
select case when pg_temp.falla($q$select leads_lista('{"exportar": true}')$q$)
            then 'ok' else 'not ok' end || ' 14 - el asesor no exporta';
select case when (select jsonb_array_length(r -> 'errores') = 1 and (r ->> 'hechos')::int = 1
                    from leads_en_grupo('etiqueta_poner', array[:l1, :l15, :l1]::bigint[], '{"etiqueta": "Asesor"}') r)
            then 'ok' else 'not ok' end || ' 15 - en grupo, el asesor cambia lo suyo, le avisa qué no pudo (lead de otro) y un lead repetido cuenta una vez';
insert into lead_vistas (nombre, filtros, columnas, predeterminada) values ('Mis activos', '{"responsable": "yo"}', '{nombre,etapa}', true);
select case when pg_temp.falla($q$insert into lead_vistas (nombre, predeterminada) values ('Otra', true)$q$)
             and pg_temp.falla(format($q$insert into lead_vistas (usuario_id, nombre) values (%L, 'Ajena')$q$, :'admin'))
            then 'ok' else 'not ok' end || ' 16 - una sola vista predeterminada y nadie guarda vistas a nombre de otro';
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select case when not exists (select 1 from lead_vistas where nombre = 'Mis activos')
            then 'ok' else 'not ok' end || ' 17 - las vistas de cada usuario son privadas';
reset role;

select case when exists (select 1 from lead_eventos where lead_id = :l7 and tipo = 'etiquetas')
             and exists (select 1 from lead_eventos where lead_id = :l7 and tipo = 'archivado' and usuario_id = :'admin')
            then 'ok' else 'not ok' end || ' 18 - lo hecho en grupo queda en el historial de cada lead (RL-02)';

rollback;

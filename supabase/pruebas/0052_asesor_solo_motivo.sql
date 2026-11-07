-- Pruebas de la migración 0052 (F4·47, RF-43): el cuadro Asesor guarda `solo_motivo`. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select crear_bot('Prueba 0052 cierre') as bot \gset
select clave as asesor from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
where f.bot_id = :bot and f.estado = 'borrador' and k.tipo = 'asesor' \gset

select borrador_guardar_ajustes(:'asesor', null, '{"solo_motivo": true}', :bot);
select case when (select k.ajustes = '{"solo_motivo": true}' from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                  where f.bot_id = :bot and f.estado = 'borrador' and k.clave = :'asesor')
            then 'ok' else 'not ok' end || ' 1 - el cuadro Asesor guarda solo_motivo (RF-43)';

select case when pg_temp.falla(format('select borrador_guardar_ajustes(%L, null, ''{"solo_motivo": "si"}'', %s)', :'asesor', :bot))
            then 'ok' else 'not ok' end || ' 2 - solo_motivo debe ser verdadero o falso';

select borrador_guardar_ajustes(:'asesor', null, '{"solo_motivo": false}', :bot);
select case when (select (k.ajustes->>'solo_motivo')::boolean = false from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                  where f.bot_id = :bot and f.estado = 'borrador' and k.clave = :'asesor')
            then 'ok' else 'not ok' end || ' 3 - se puede apagar';

select case when pg_temp.falla(format('select borrador_guardar_ajustes(%L, null, ''{"solo_motivo": true}'', %s)', 'B00', :bot))
            then 'ok' else 'not ok' end || ' 4 - un Mensaje sigue sin ajustes que guardar aquí';

-- 0053: el texto de cierre de una opción se guarda desde el lienzo (efectos.motivo)
select borrador_crear_mensaje(0, 300, :bot) as m \gset
select borrador_guardar_cuadro(:'m', null, 'Hola', '[{"id": "1", "titulo": "Listo", "destino": null, "cierre": "  🏬 Recojo en tienda  "}]', :bot, null);
select case when (select k.opciones->0->'efectos'->>'motivo' = '🏬 Recojo en tienda' from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                  where f.bot_id = :bot and f.estado = 'borrador' and k.clave = :'m')
            then 'ok' else 'not ok' end || ' 5 - la opción guarda su texto de cierre recortado (0053)';

select borrador_guardar_cuadro(:'m', null, 'Hola', '[{"id": "1", "titulo": "Listo otra vez", "destino": null}]', :bot, null);
select case when (select k.opciones->0->'efectos'->>'motivo' = '🏬 Recojo en tienda' from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                  where f.bot_id = :bot and f.estado = 'borrador' and k.clave = :'m')
            then 'ok' else 'not ok' end || ' 6 - sin «cierre» se conserva el que tenía';

select borrador_guardar_cuadro(:'m', null, 'Hola', '[{"id": "1", "titulo": "Listo", "destino": null, "cierre": ""}]', :bot, null);
select case when (select k.opciones->0->'efectos' is null from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                  where f.bot_id = :bot and f.estado = 'borrador' and k.clave = :'m')
            then 'ok' else 'not ok' end || ' 7 - vacío lo quita';

select case when pg_temp.falla(format('select borrador_guardar_cuadro(%L, null, ''Hola'', %L, %s, null)', :'m',
                  json_build_array(json_build_object('id', '1', 'titulo', 'Listo', 'destino', null, 'cierre', repeat('x', 1001)))::text, :bot))
            then 'ok' else 'not ok' end || ' 8 - más de 1.000 caracteres no se guarda';

rollback;

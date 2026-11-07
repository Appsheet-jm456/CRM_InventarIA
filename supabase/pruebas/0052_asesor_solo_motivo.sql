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

rollback;

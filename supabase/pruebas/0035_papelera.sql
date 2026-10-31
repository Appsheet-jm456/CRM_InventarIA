-- Pruebas de la migración 0035 (F4·30 E): desarchivar al escribir, papelera, teléfono reutilizable y borrado. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000035a1', 'prueba-0035-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000035a1', 'Prueba Asesor 0035', id from roles where nombre = 'asesor';
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
insert into leads (telefono, nombre, etapa, archivado_en) values ('5796000001', 'Archivado', 'Nuevo', now());
insert into leads (telefono, nombre, etapa) values ('5796000002', 'Para papelera', 'Nuevo'), ('5796000003', 'Para borrar ya', 'Nuevo');
select id as archivado from leads where telefono = '5796000001' \gset
select id as papelera from leads where telefono = '5796000002' \gset
select id as borrar from leads where telefono = '5796000003' \gset
insert into mensajes (lead_id, lado, texto, media_ruta, media_mime) values
  (:borrar, 'cliente', 'mi foto', 'clientes/5796000003/foto.jpg', 'image/jpeg'), (:borrar, 'bot', 'gracias', '', '');

-- Desarchivar al escribir
insert into mensajes (lead_id, lado, texto) values (:archivado, 'bot', 'recordatorio');
select case when (select archivado_en is not null from leads where id = :archivado)
            then 'ok' else 'not ok' end || ' 1 - un mensaje del bot no desarchiva';
insert into mensajes (lead_id, lado, texto) values (:archivado, 'cliente', 'hola de nuevo');
select case when (select archivado_en is null from leads where id = :archivado)
             and exists (select 1 from lead_eventos where lead_id = :archivado and tipo = 'desarchivado' and usuario_id is null)
            then 'ok' else 'not ok' end || ' 2 - si el cliente escribe, se desarchiva solo y queda en el historial como del sistema';

-- Papelera y teléfono reutilizable (RL-11)
update leads set eliminado_en = now() where id = :papelera;
select case when not pg_temp.falla($q$insert into leads (telefono, nombre, etapa) values ('5796000002', 'Volvió a escribir', 'Nuevo')$q$)
             and pg_temp.falla($q$insert into leads (telefono, nombre, etapa) values ('5796000002', 'Otra vez', 'Nuevo')$q$)
            then 'ok' else 'not ok' end || ' 3 - un cliente en la papelera que vuelve a escribir entra como lead nuevo; dos activos con el mismo teléfono, no';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select case when leads_eliminar(array[:papelera]::bigint[], true) = 0
            then 'ok' else 'not ok' end || ' 4 - no se restaura si ya hay un lead activo con ese teléfono';

-- Borrar ya (Ley 1581)
select case when pg_temp.falla(format($q$select lead_borrar_ya(%s, '3001234567')$q$, :borrar))
            then 'ok' else 'not ok' end || ' 5 - borrar ya pide escribir el teléfono correcto';
select lead_borrar_ya(:borrar, '+57 96 000 003') as r \gset
reset role;
select case when not exists (select 1 from leads where id = :borrar) and not exists (select 1 from mensajes where lead_id = :borrar)
             and :'r'::jsonb -> 'media' = '["clientes/5796000003/foto.jpg"]'
             and exists (select 1 from leads_borrados where lead_id = :borrar and motivo = 'solicitud_cliente' and usuario_id = :'admin'
                          and mensajes = 2 and archivos = 1)
            then 'ok' else 'not ok' end || ' 6 - borra lead y mensajes, devuelve los archivos a quitar y deja constancia sin datos personales';
select case when not exists (select 1 from information_schema.columns where table_name = 'leads_borrados'
                              and column_name in ('telefono', 'nombre', 'texto'))
            then 'ok' else 'not ok' end || ' 7 - la constancia no tiene columnas de datos personales';

-- Lo que no puede el asesor
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000035a1', 'role', 'authenticated')::text, true);
select case when pg_temp.falla(format($q$select lead_borrar_ya(%s, '5796000001')$q$, :archivado))
             and pg_temp.falla($q$select leads_vaciar_papelera()$q$)
             and pg_temp.falla($q$select leads_purgar(array[1]::bigint[], 'solicitud_cliente')$q$)
             and not exists (select 1 from leads_borrados)
            then 'ok' else 'not ok' end || ' 8 - el asesor no borra, no vacía la papelera ni ve la constancia';
reset role;

-- Vaciar la papelera a los 30 días
update leads set eliminado_en = now() - interval '31 days' where id = :papelera;
insert into leads (telefono, nombre, etapa, eliminado_en) values ('5796000004', 'Reciente en papelera', 'Nuevo', now() - interval '5 days');
select set_config('request.jwt.claims', '', true) \g /dev/null
select leads_vaciar_papelera() as v \gset
select case when (:'v'::jsonb ->> 'borrados')::int >= 1 and not exists (select 1 from leads where id = :papelera)
             and exists (select 1 from leads where telefono = '5796000004')
             and exists (select 1 from leads_borrados where lead_id = :papelera and motivo = 'papelera_30_dias' and usuario_id is null)
            then 'ok' else 'not ok' end || ' 9 - la papelera borra lo de más de 30 días y respeta lo reciente';
select case when has_function_privilege('service_role', 'leads_vaciar_papelera()', 'execute')
             and not has_function_privilege('authenticated', 'leads_vaciar_papelera()', 'execute')
            then 'ok' else 'not ok' end || ' 10 - solo el servidor vacía la papelera';

rollback;

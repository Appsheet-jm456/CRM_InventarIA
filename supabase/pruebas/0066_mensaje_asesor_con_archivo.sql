-- Pruebas de la migración 0066 (F4·62, RB-14 a RB-18): el asesor envía archivos desde el chat. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into leads (telefono, nombre, etapa) values ('570000066001', 'Ada Adjuntos', 'Nuevo') returning id as l1 \gset

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select registrar_mensaje_asesor_archivo(:l1, 'Mira la foto', 'wamid.0066', 'image', :'l1' || '/asesor-1.jpg', 'image/jpeg', 'equipo.jpg');
select case when (select count(*) = 1 from mensajes where lead_id = :l1 and lado = 'asesor' and tipo = 'image' and media_mime = 'image/jpeg'
                    and usuario_id = :'admin'::uuid and texto = 'Mira la foto') then 'ok' else 'not ok' end
       || ' 1 - queda el mensaje del asesor con su archivo y su pie';
select case when (select estado_chat = 'asignada' and pausar_bot and asignado_a = :'admin'::uuid from leads where id = :l1) then 'ok' else 'not ok' end
       || ' 2 - enviar un archivo toma la conversación (RB-01)';
select registrar_mensaje_asesor_archivo(:l1, '', 'wamid.0066b', 'document', :'l1' || '/asesor-2.pdf', 'application/pdf', 'garantia.pdf');
select case when (select ultimo_mensaje = '📄 garantia.pdf' from leads where id = :l1) then 'ok' else 'not ok' end
       || ' 3 - sin pie, la lista muestra el nombre del documento';
select case when pg_temp.falla(format('select registrar_mensaje_asesor_archivo(%s, %L, %L, %L, %L, %L, %L)', :l1, '', 'w', 'sticker', :'l1' || '/x.webp', 'image/webp', ''))
            then 'ok' else 'not ok' end || ' 4 - un tipo que no es imagen, documento, video o audio no se registra';
select case when pg_temp.falla(format('select registrar_mensaje_asesor_archivo(%s, %L, %L, %L, %L, %L, %L)', :l1, '', 'w', 'image', '999/x.jpg', 'image/jpeg', ''))
            then 'ok' else 'not ok' end || ' 5 - un archivo de otra conversación no se registra';

reset role;
select case when not has_function_privilege('anon', 'public.registrar_mensaje_asesor_archivo(bigint, text, text, text, text, text, text)', 'execute')
            then 'ok' else 'not ok' end || ' 6 - anon no puede registrar archivos';

rollback;

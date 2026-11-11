-- Pruebas de la migración 0074 (F4·68): instructivo del comprobante. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select case when (select texto_instructivo_pago like '📎 *Último paso:*%Envío comprobante de pago%' from agente_config where id = 1)
            then 'ok' else 'not ok' end || ' 1 - viene con el texto del dueño';

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
update agente_config set texto_instructivo_pago = '' where id = 1;
select case when (select texto_instructivo_pago = '' from agente_config where id = 1) then 'ok' else 'not ok' end
       || ' 2 - el administrador lo puede leer y dejar vacío desde la pantalla (permiso de la columna)';
select case when pg_temp.falla(format('update agente_config set texto_instructivo_pago = %L where id = 1', repeat('x', 1025)))
            then 'ok' else 'not ok' end || ' 3 - más de 1.024 caracteres no se acepta';

rollback;

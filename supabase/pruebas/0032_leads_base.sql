-- Pruebas de la migración 0032 (F4·30 A): atributos, validación, historial, archivar/papelera y permisos. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

-- Datos propios: un asesor de prueba y dos leads (uno suyo y uno de otro asesor).
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000032a1', 'prueba-0032-asesor@inventaria.local'),
                                          ('00000000-0000-4000-8000-0000000032a2', 'prueba-0032-otro@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000032a1', 'Prueba Asesor 0032', id from roles where nombre = 'asesor';
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000032a2', 'Prueba Otro 0032', id from roles where nombre = 'asesor';
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
insert into leads (telefono, nombre, etapa, asignado_a) values ('570000003201', 'Lead Suyo', 'Nuevo', '00000000-0000-4000-8000-0000000032a1'),
                                                               ('570000003202', 'Lead Ajeno', 'Nuevo', '00000000-0000-4000-8000-0000000032a2');
select id as suyo from leads where telefono = '570000003201' \gset
select id as ajeno from leads where telefono = '570000003202' \gset

-- Permisos (RL-10)
select case when (select count(*) from rol_permisos rp join roles r on r.id = rp.rol_id
                   where r.nombre = 'administrador' and rp.permiso in ('administrar_atributos', 'eliminar_leads', 'exportar_leads')) = 3
             and not exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id
                   where r.nombre = 'asesor' and rp.permiso in ('administrar_atributos', 'eliminar_leads', 'exportar_leads'))
            then 'ok' else 'not ok' end || ' 1 - los tres permisos nuevos son del administrador, no del asesor';

-- Definiciones
select case when (select count(*) from lead_atributos where clave in ('tipo_cliente', 'cedula', 'ciudad', 'metodo_pago', 'descuento',
                   'numero_serie', 'numero_contrato', 'fecha_contrato', 'direccion_entrega')) = 9
            then 'ok' else 'not ok' end || ' 2 - nacen los 9 atributos de Kommo';
select case when pg_temp.falla($q$insert into lead_atributos (clave, nombre, tipo) values ('color', 'Color', 'lista')$q$)
             and pg_temp.falla($q$insert into lead_atributos (clave, nombre, tipo) values ('Mal Clave', 'X', 'texto')$q$)
             and pg_temp.falla($q$insert into lead_atributos (clave, nombre, tipo) values ('raro', 'Raro', 'imagen')$q$)
             and pg_temp.falla($q$insert into lead_atributos (clave, nombre, tipo, obligatorio) values ('obl', 'Obl', 'texto', 'etapa')$q$)
            then 'ok' else 'not ok' end || ' 3 - no se crea una lista sin opciones, una clave mal escrita, un tipo raro ni un obligatorio sin etapa';

-- Validación de valores
select case when not pg_temp.falla(format($q$update leads set atributos = '{"ciudad": "Cali", "tipo_cliente": "Distribuidor",
                     "fecha_contrato": "2026-10-31", "direccion_entrega": "Cra 1 # 2-3"}' where id = %s$q$, :suyo))
            then 'ok' else 'not ok' end || ' 4 - se guardan valores válidos de cada tipo';
select case when pg_temp.falla(format($q$update leads set atributos = '{"inventado": "x"}' where id = %s$q$, :suyo))
             and pg_temp.falla(format($q$update leads set atributos = '{"tipo_cliente": "Mayorista"}' where id = %s$q$, :suyo))
             and pg_temp.falla(format($q$update leads set atributos = '{"fecha_contrato": "31/10/2026"}' where id = %s$q$, :suyo))
             and pg_temp.falla(format($q$update leads set atributos = '{"ciudad": 5}' where id = %s$q$, :suyo))
            then 'ok' else 'not ok' end || ' 5 - no se guarda un atributo que no existe, una opción fuera de la lista, una fecha mal escrita ni un tipo equivocado';
insert into lead_atributos (clave, nombre, tipo, opciones) values ('accesorios', 'Accesorios', 'multiseleccion', '["Mouse", "Maleta"]'),
                                                                 ('correo', 'Correo', 'correo', '[]'), ('pagina', 'Página', 'enlace', '[]'),
                                                                 ('cupo', 'Cupo', 'moneda', '[]'), ('recompra', 'Recompra', 'si_no', '[]');
select case when not pg_temp.falla(format($q$update leads set atributos = atributos || '{"accesorios": ["Mouse"], "correo": "a@b.co",
                     "pagina": "https://x.co", "cupo": 1500000, "recompra": true}' where id = %s$q$, :suyo))
             and pg_temp.falla(format($q$update leads set atributos = atributos || '{"accesorios": ["Teclado"]}' where id = %s$q$, :suyo))
             and pg_temp.falla(format($q$update leads set atributos = atributos || '{"correo": "sin-arroba"}' where id = %s$q$, :suyo))
             and pg_temp.falla(format($q$update leads set atributos = atributos || '{"pagina": "javascript:alert(1)"}' where id = %s$q$, :suyo))
             and pg_temp.falla(format($q$update leads set atributos = atributos || '{"cupo": "mucho"}' where id = %s$q$, :suyo))
            then 'ok' else 'not ok' end || ' 6 - multiselección, correo, enlace, moneda y sí/no se validan';
update lead_atributos set archivado_en = now() where clave = 'ciudad';
select case when not pg_temp.falla(format($q$update leads set nombre = 'Lead Suyo 2' where id = %s$q$, :suyo))
             and (select atributos ->> 'ciudad' from leads where id = :suyo) = 'Cali'
            then 'ok' else 'not ok' end || ' 7 - archivar un atributo conserva sus datos (RL-08)';
update lead_atributos set archivado_en = null where clave = 'ciudad';

-- Obligatorios por etapa
update lead_atributos set obligatorio = 'etapa', etapas_obligatorio = '{Vendido}' where clave in ('metodo_pago', 'direccion_entrega');
select case when lead_atributos_faltantes(:suyo, 'Vendido') = '{"Método de pago"}' and lead_atributos_faltantes(:suyo, 'Nuevo') = '{}'
            then 'ok' else 'not ok' end || ' 8 - dice qué atributos faltan para pasar a una etapa';

-- Historial (RL-12)
delete from lead_eventos where lead_id = :suyo;
update leads set ultimo_mensaje = 'hola', estado_bot = '{}' where id = :suyo;
select case when not exists (select 1 from lead_eventos where lead_id = :suyo)
            then 'ok' else 'not ok' end || ' 9 - lo que el bot actualiza en cada mensaje no llena el historial';
update leads set etapa = 'Cotización', atributos = atributos || '{"ciudad": "Bogotá"}' where id = :suyo;
select case when exists (select 1 from lead_eventos where lead_id = :suyo and tipo = 'etapa' and despues = '"Cotización"' and usuario_id is null)
             and exists (select 1 from lead_eventos where lead_id = :suyo and tipo = 'atributo' and detalle = 'ciudad'
                          and antes = '"Cali"' and despues = '"Bogotá"')
             and (select count(*) from lead_eventos where lead_id = :suyo and tipo = 'atributo') = 1
            then 'ok' else 'not ok' end || ' 10 - etapa y atributo quedan con antes → después; sin usuario es el sistema';

-- Lo que puede el asesor de prueba
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000032a1', 'role', 'authenticated')::text, true);
select case when exists (select 1 from lead_eventos where lead_id = :suyo) and not exists (select 1 from lead_eventos where lead_id = :ajeno)
            then 'ok' else 'not ok' end || ' 11 - el asesor ve el historial de sus leads y no el de otros';
select case when pg_temp.falla($q$insert into lead_atributos (clave, nombre, tipo) values ('nuevo', 'Nuevo', 'texto')$q$)
             and pg_temp.falla(format($q$select leads_eliminar(array[%s]::bigint[])$q$, :suyo))
             and pg_temp.falla(format($q$insert into lead_eventos (lead_id, tipo) values (%s, 'nota')$q$, :suyo))
             and pg_temp.falla(format($q$select lead_evento(%s, 'nota', null, null)$q$, :suyo))
            then 'ok' else 'not ok' end || ' 12 - el asesor no crea atributos, no elimina leads ni escribe el historial a mano';
select case when leads_archivar(array[:suyo, :ajeno]::bigint[]) = 1
            then 'ok' else 'not ok' end || ' 13 - el asesor archiva sus leads, pero no los de otro asesor';
reset role;
select case when (select archivado_en is not null from leads where id = :suyo) and (select archivado_en is null from leads where id = :ajeno)
             and exists (select 1 from lead_eventos where lead_id = :suyo and tipo = 'archivado'
                          and usuario_id = '00000000-0000-4000-8000-0000000032a1')
            then 'ok' else 'not ok' end || ' 14 - archivar queda en el historial con quién lo hizo';

-- Lo que puede el administrador
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select case when not pg_temp.falla($q$insert into lead_atributos (clave, nombre, tipo) values ('nuevo_admin', 'Nuevo', 'texto')$q$)
             and pg_temp.falla($q$update lead_atributos set tipo = 'numero' where clave = 'nuevo_admin'$q$)
             and pg_temp.falla($q$update lead_atributos set clave = 'otra' where clave = 'nuevo_admin'$q$)
             and not pg_temp.falla($q$update lead_atributos set nombre = 'Nuevo 2', archivado_en = now() where clave = 'nuevo_admin'$q$)
            then 'ok' else 'not ok' end || ' 15 - el administrador crea y archiva atributos, pero la clave y el tipo no cambian (RL-09)';
select case when leads_eliminar(array[:suyo, :ajeno]::bigint[]) = 2 and leads_eliminar(array[:ajeno]::bigint[], true) = 1
            then 'ok' else 'not ok' end || ' 16 - el administrador manda a la papelera y restaura';
reset role;
select case when (select eliminado_en is not null from leads where id = :suyo) and (select eliminado_en is null from leads where id = :ajeno)
             and exists (select 1 from lead_eventos where lead_id = :ajeno and tipo = 'restaurado')
            then 'ok' else 'not ok' end || ' 17 - eliminar y restaurar quedan en el historial';

-- Tareas (RL-06)
insert into seguimientos (lead_id, asignado_a, que, vence_en, creado_por, tipo)
values (:ajeno, '00000000-0000-4000-8000-0000000032a2', 'Llamar al cliente', now() + interval '1 day', :'admin', 'Llamar');
update seguimientos set estado = 'hecho', resultado = 'Confirmó la compra' where lead_id = :ajeno;
select case when exists (select 1 from lead_eventos where lead_id = :ajeno and tipo = 'tarea' and detalle = 'Llamar')
             and exists (select 1 from lead_eventos where lead_id = :ajeno and tipo = 'tarea_cumplida' and detalle = 'Confirmó la compra')
             and (select count(*) from lead_tarea_tipos) >= 5
            then 'ok' else 'not ok' end || ' 18 - las tareas tienen tipo y resultado, y quedan en el historial';

-- Búsqueda (F4·31, punto 7)
select case when (select count(*) from pg_indexes where indexname in ('leads_nombre_trgm', 'leads_telefono_trgm', 'mensajes_texto_trgm', 'leads_atributos_idx')) = 4
            then 'ok' else 'not ok' end || ' 19 - existen los índices de búsqueda por nombre, teléfono, mensajes y atributos';

rollback;

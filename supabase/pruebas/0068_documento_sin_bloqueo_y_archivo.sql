-- Pruebas de la migración 0068 (F4·63): «listo» sin documento y archivo del documento. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into leads (telefono, nombre, etapa) values ('570000068001', 'Diana Documento', 'Nuevo') returning id as l1 \gset
select abrir_oportunidad_interna(:l1, 1) as o1 \gset
insert into alistamientos (oportunidad_id, lead_id, equipos, estado, tecnico, tomado_en)
values (:o1, :l1, '[{"codigo": "100-1", "nombre": "Lenovo X13"}]', 'en_revision', 'Camilo Osorio', now()) returning id as a \gset
insert into alistamiento_videos (alistamiento_id, equipo_codigo, ruta, estado, tecnico)
values (:a, '100-1', :'a' || '/v.mp4', 'listo', 'Camilo Osorio');
insert into storage.objects (bucket_id, name) values ('documentos', :'a' || '/fve-1.pdf'), ('documentos', '999999/otra.pdf');

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select alistamiento_listo(:a, 'Camilo Osorio');
reset role;
select case when (select estado = 'listo' and doc_numero is null from alistamientos where id = :a) then 'ok' else 'not ok' end
       || ' 1 - el técnico marca «listo» sin OP ni FVE (no lo detiene)';
set local role authenticated;
select case when pg_temp.falla(format('select alistamiento_para_enviar(%s, %L)', :a, 'documento')) then 'ok' else 'not ok' end
       || ' 2 - sin número del documento no se envía al cliente';

select alistamiento_documento_archivo(:a, :'a' || '/fve-1.pdf', 'application/pdf', 'FVE 1234.pdf');
reset role;
select case when (select doc_ruta = :'a' || '/fve-1.pdf' and doc_mime = 'application/pdf' and doc_nombre = 'FVE 1234.pdf' from alistamientos where id = :a)
            then 'ok' else 'not ok' end || ' 3 - el asesor sube el archivo del documento';
set local role authenticated;
select case when pg_temp.falla(format('select alistamiento_documento_archivo(%s, %L, %L, %L)', :a, '999999/otra.pdf', 'application/pdf', 'x'))
            then 'ok' else 'not ok' end || ' 4 - un archivo de otro pedido no se acepta';
select case when pg_temp.falla(format('select alistamiento_documento_archivo(%s, %L, %L, %L)', :a, :'a' || '/fve-1.pdf', 'application/zip', 'x'))
            then 'ok' else 'not ok' end || ' 5 - solo PDF, JPG o PNG';

reset role;
select case when exists (select 1 from storage.buckets where id = 'documentos' and not public) then 'ok' else 'not ok' end
       || ' 6 - el bucket de documentos es privado';

rollback;

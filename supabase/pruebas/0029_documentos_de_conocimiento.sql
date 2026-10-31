-- Pruebas de la migración 0029 (F4·32): documentos de conocimiento y búsqueda. Todo con ROLLBACK. Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

-- Datos propios de la prueba: se apaga lo que haya para no depender de lo que cargó el dueño.
update conocimiento set activa = false;
update conocimiento_documentos set activo = false;
insert into conocimiento_documentos (nombre, tipo, archivo, tamano, estado) values
  ('Políticas 2026', 'txt', 'documentos/100.txt', 100, 'listo'),
  ('Políticas 2025', 'txt', 'documentos/99.txt', 100, 'listo'),
  ('Borrador', 'txt', 'documentos/98.txt', 100, 'procesando');
insert into conocimiento_fragmentos (documento_id, orden, texto)
select id, 1, case nombre when 'Políticas 2026' then 'La garantía de los portátiles es de 3 meses por defectos de fábrica.'
                          when 'Políticas 2025' then 'Hacemos envíos a todo Colombia por Servientrega, de 2 a 4 días hábiles.'
                          else 'Texto de garantía sin procesar.' end
  from conocimiento_documentos where nombre in ('Políticas 2026', 'Políticas 2025', 'Borrador');

select case when (select string_agg(titulo, ',') from buscar_conocimiento('cuanto dura la garantia')) = 'Políticas 2026'
            then 'ok' else 'not ok' end || ' 1 - encuentra sin tildes («garantia» = «garantía») y no usa documentos sin procesar';
select case when (select titulo from buscar_conocimiento('hacen envio a cali?') limit 1) = 'Políticas 2025'
            then 'ok' else 'not ok' end || ' 2 - una pregunta natural encuentra el trozo aunque no traiga todas las palabras';
select case when not exists (select 1 from buscar_conocimiento('')) and not exists (select 1 from buscar_conocimiento('el la de'))
            then 'ok' else 'not ok' end || ' 3 - sin palabras útiles no devuelve nada';

update conocimiento_documentos set activo = false where nombre = 'Políticas 2026';
select case when not exists (select 1 from buscar_conocimiento('garantia'))
            then 'ok' else 'not ok' end || ' 4 - un documento apagado no se consulta';

update conocimiento set respuesta = 'Garantía de 3 meses en todos los equipos.', activa = true where categoria = 'Garantía';
update conocimiento_documentos set activo = true where nombre = 'Políticas 2026';
select case when (select fuente from buscar_conocimiento('garantia') limit 1) = 'ficha'
            then 'ok' else 'not ok' end || ' 5 - una ficha activa gana al documento (RAG-31)';

select case when pg_temp.falla($q$ insert into conocimiento_documentos (nombre, tipo, archivo, tamano) values ('x', 'docx', 'documentos/1.docx', 10) $q$)
             and pg_temp.falla($q$ insert into conocimiento_documentos (nombre, tipo, archivo, tamano) values ('x', 'pdf', '../x.pdf', 10) $q$)
             and pg_temp.falla($q$ insert into conocimiento_documentos (nombre, tipo, archivo, tamano) values ('x', 'pdf', 'documentos/1.pdf', 20000000) $q$)
            then 'ok' else 'not ok' end || ' 6 - solo tipos admitidos, ruta propia y hasta 10 MB';

delete from conocimiento_documentos where nombre = 'Políticas 2025';
select case when not exists (select 1 from conocimiento_fragmentos f left join conocimiento_documentos d on d.id = f.documento_id where d.id is null)
            then 'ok' else 'not ok' end || ' 7 - borrar el documento borra sus trozos';

-- El asesor lee y busca, pero no sube ni borra
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000029a1', 'prueba-0029-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000029a1', 'Prueba Asesor 0029', id from roles where nombre = 'asesor';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000029a1","role":"authenticated"}', true);
with b as (delete from conocimiento_documentos returning 1)
select case when (select count(*) from b) = 0 and exists (select 1 from buscar_conocimiento('garantia'))
             and pg_temp.falla($q$ insert into conocimiento_documentos (nombre, tipo, archivo, tamano) values ('x', 'txt', 'documentos/5.txt', 10) $q$)
            then 'ok' else 'not ok' end || ' 8 - el asesor busca pero no sube ni borra documentos';

reset role;
set local role anon;
select case when pg_temp.falla($q$ select * from buscar_conocimiento('garantia') $q$)
            then 'ok' else 'not ok' end || ' 9 - anon no busca';

rollback;

-- Pruebas de la migración 0070 (F4·65): tres fotos JPG o PNG y enlace de Drive. Con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into productos (codigo, marca, modelo, precio, stock) values ('PRUEBA-0070', 'LENOVO', 'T490', 950000, 1) returning id as p \gset

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

update productos set foto_ruta = :'p' || '/1.jpg', fotos_extra = array[:'p' || '/2.png', :'p' || '/3.jpeg'],
       fotos_drive = 'https://drive.google.com/drive/folders/abc123' where id = :p;
select case when (select cardinality(fotos_extra) = 2 and fotos_drive <> '' from productos where id = :p) then 'ok' else 'not ok' end
       || ' 1 - el administrador guarda tres fotos y el enlace de Drive';
select case when pg_temp.falla(format('update productos set fotos_extra = array[%L, %L, %L] where id = %s', 'a.jpg', 'b.jpg', 'c.jpg', :p))
            then 'ok' else 'not ok' end || ' 2 - no se aceptan más de dos fotos extra (tres en total)';
select case when pg_temp.falla(format('update productos set fotos_extra = array[%L] where id = %s', :'p' || '/2.webp', :p))
            then 'ok' else 'not ok' end || ' 3 - una foto extra en WEBP no se acepta';
select case when pg_temp.falla(format('update productos set foto_ruta = %L where id = %s', :'p' || '/1.webp', :p))
            then 'ok' else 'not ok' end || ' 4 - la foto principal en WEBP no se acepta';
select case when pg_temp.falla(format('update productos set fotos_drive = %L where id = %s', 'https://dropbox.com/fotos', :p))
            then 'ok' else 'not ok' end || ' 5 - un enlace que no es de Google Drive no se acepta';
update productos set fotos_extra = '{}', fotos_drive = '' where id = :p;
select case when (select cardinality(fotos_extra) = 0 and fotos_drive = '' from productos where id = :p) then 'ok' else 'not ok' end
       || ' 6 - quitar las fotos extra y el enlace deja los campos vacíos';
reset role;
select case when (select allowed_mime_types = array['image/jpeg', 'image/png'] from storage.buckets where id = 'productos')
            then 'ok' else 'not ok' end || ' 7 - el bucket productos solo acepta JPG y PNG';

rollback;

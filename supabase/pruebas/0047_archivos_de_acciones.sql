-- Pruebas de la migración 0047 (F4·43). Todo con ROLLBACK.
begin;
select case when (select file_size_limit = 16777216 and 'application/pdf' = any (allowed_mime_types) and not public
                  from storage.buckets where id = 'conocimiento')
            then 'ok' else 'not ok' end || ' 1 - el bucket conocimiento acepta PDF de hasta 16 MB y sigue privado';
rollback;

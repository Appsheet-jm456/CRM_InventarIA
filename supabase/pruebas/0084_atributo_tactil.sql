-- Pruebas de la migración 0084 (F4·74): atributo Táctil. Con ROLLBACK.
begin;

select case when (select tipo = 'si_no' and nombre = 'Táctil' and archivado_en is null from producto_atributos where clave = 'tactil')
            then 'ok' else 'not ok' end || ' 1 - existe el atributo Táctil de tipo Sí / No';
update productos set atributos = atributos || '{"tactil": true}' where codigo = (select codigo from productos order by id limit 1);
select case when (select count(*) from productos where atributos->>'tactil' = 'true') >= 1
            then 'ok' else 'not ok' end || ' 2 - un equipo guarda Táctil = Sí';

rollback;

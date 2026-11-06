-- 0047 · Acciones que envían catálogos y archivos (F4·43, docs/AGENTE.md RAG-49 a RAG-53).
-- Los pasos «catalogo» y «archivo» viven en acciones.hacer (jsonb, sin cambio de tabla). Los archivos de las acciones se guardan en el
-- bucket privado conocimiento, carpeta acciones/, con los mismos permisos (administrar_agente escribe). Un PDF de ficha técnica puede
-- pesar más que una imagen: el bucket pasa de 5 MB a 16 MB (WhatsApp acepta documentos de hasta 100 MB). Las imágenes siguen en 5 MB
-- por la pantalla.
update storage.buckets set file_size_limit = 16777216 where id = 'conocimiento';

-- Pruebas de la migración 0046 (F4·42): acción «Pregunta por un equipo». Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;
select case when (select count(*) = 1 from acciones where nombre = 'Pregunta por un equipo' and cuando->0->>'forma' = 'equipo'
                    and hacer->0->>'tipo' = 'ficha_equipo' and hacer->0->>'plantilla' like '%{grafica}%{precio}%')
            then 'ok' else 'not ok' end || ' 1 - existe con el disparador «nombra un equipo» y la plantilla de la ficha';
select case when (select a.prioridad > all (select prioridad from acciones where nombre in ('Pasar a asesor', 'Quiero comprar', 'Cotización'))
                  from acciones a where a.nombre = 'Pregunta por un equipo')
            then 'ok' else 'not ok' end || ' 2 - va después de asesor, compra y cotización (RAG-48)';
select case when (select hacer->0->>'si_agotado' in ('parecidos', 'asesor', 'nada') and (hacer->0->'foto')::boolean
                  from acciones where nombre = 'Pregunta por un equipo')
            then 'ok' else 'not ok' end || ' 3 - trae las opciones de agotado y foto';
rollback;

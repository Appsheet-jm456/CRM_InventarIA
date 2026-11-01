-- Pruebas de la migración 0038 (F4·34). problemas_del_flujo solo la usa publicar: esas revisiones corren como postgres.
-- Pruebas de la migración 0038 (F4·34): cuadro Pregunta, «Marcar un dato», marcas {dato} y compra → bot. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select crear_bot('Prueba 0038 despacho') as bot \gset
select borrador_crear_cuadro('pregunta', 300, 0, :bot) as q \gset
select case when :'q' = 'Q1'
             and (select tipo || '/' || (salidas ? 'siguiente')::text || '/' || (ajustes->>'espera_segundos')
                  from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.bot_id = :bot and k.clave = 'Q1') = 'pregunta/true/1800'
            then 'ok' else 'not ok' end || ' 1 - «+ Agregar → Pregunta» crea Q1 con «Siguiente» y 30 min de espera';

select case when pg_temp.falla(format($q$select borrador_guardar_pregunta('Q1', 'Cédula', '¿Tu cédula?', 'descuento', 'Solo números', null, null, null, 1800, %s)$q$, :bot))
             and pg_temp.falla(format($q$select borrador_guardar_pregunta('Q1', 'Cédula', '¿Tu cédula?', 'venta_online', 'Solo números', null, null, null, 1800, %s)$q$, :bot))
             and pg_temp.falla(format($q$select borrador_guardar_pregunta('Q1', 'Cédula', '¿Tu cédula?', 'cedula', 'Solo números', 'Q1', null, null, 1800, %s)$q$, :bot))
             and pg_temp.falla(format($q$select borrador_guardar_pregunta('Q1', 'Cédula', '¿Tu cédula?', 'cedula', '', null, null, null, 1800, %s)$q$, :bot))
            then 'ok' else 'not ok' end || ' 2 - no guarda un dato archivado, uno sí/no, una salida a sí misma ni el mensaje de error vacío';

reset role;
select case when exists (select 1 from jsonb_array_elements(problemas_del_flujo((select id from bot_flujos where bot_id = :bot and estado = 'borrador'))) p
                         where p->>'clave' = 'Q1' and p->>'problema' like 'Elige en qué dato%')
            then 'ok' else 'not ok' end || ' 3 - al publicar pide elegir el dato de la Pregunta';
set local role authenticated;

select borrador_guardar_pregunta('Q1', 'Cédula', '¿Tu cédula, {nombre_completo}?', 'cedula', 'Solo números 🙏', 'B-ASESOR', null, null, 900, :bot) \g /dev/null
reset role;
select case when (select ajustes->>'atributo' || '/' || (ajustes->>'espera_segundos') || '/' || (salidas->>'siguiente')
                  from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.bot_id = :bot and k.clave = 'Q1') = 'cedula/900/B-ASESOR'
             and not exists (select 1 from jsonb_array_elements(problemas_del_flujo((select id from bot_flujos where bot_id = :bot and estado = 'borrador'))) p
                             where p->>'clave' = 'Q1' and p->>'problema' not like 'Ningún cuadro lleva aquí%')  -- aún no se une
            then 'ok' else 'not ok' end || ' 4 - guarda dato, espera y salida; con {nombre_completo} no hay problemas';
set local role authenticated;

-- «Marcar un dato» en una opción del Mensaje (RF-27)
select borrador_guardar_cuadro('B00', 'Saludo', '¿Cómo recibes tu equipo?',
  '[{"id":"1","titulo":"Envío","destino":"Q1","marcar":{"venta_online":true}},{"id":"2","titulo":"Tienda","destino":"B-ASESOR","marcar":{"venta_online":false}}]', :bot) \g /dev/null
select case when (select opciones->0->'efectos'->'atributos' from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                  where f.bot_id = :bot and k.clave = 'B00') = '{"venta_online": true}'
             and pg_temp.falla(format($q$select borrador_guardar_cuadro('B00', 'Saludo', 'x', '[{"id":"1","titulo":"Envío","destino":"Q1","marcar":{"venta_online":"quizás"}}]', %s)$q$, :bot))
             and pg_temp.falla(format($q$select borrador_guardar_cuadro('B00', 'Saludo', 'x', '[{"id":"1","titulo":"Envío","destino":"Q1","marcar":{"cedula":"123"}}]', %s)$q$, :bot))
            then 'ok' else 'not ok' end || ' 5 - una opción marca Venta online; no con un valor que no vale ni un dato que no es sí/no o lista';

select borrador_guardar_cuadro('B00', 'Saludo', '¿Cómo recibes tu equipo?',
  '[{"id":"1","titulo":"Envío","destino":"Q1"},{"id":"2","titulo":"Tienda","destino":"B-ASESOR"}]', :bot) \g /dev/null
select case when (select opciones->0->'efectos'->'atributos' from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                  where f.bot_id = :bot and k.clave = 'B00') = '{"venta_online": true}'
            then 'ok' else 'not ok' end || ' 6 - guardar sin «marcar» conserva lo que la opción ya marcaba';

reset role;
select case when marcas_desconocidas('Hola {nombre_completo} {horario} {xyz}', '{horario}') = '{xyz}'
             and exists (select 1 from jsonb_array_elements(problemas_del_flujo((select id from bot_flujos where bot_id = :bot and estado = 'borrador'))) p
                         where p->>'problema' like '%{xyz}%') is false
            then 'ok' else 'not ok' end || ' 7 - una marca que no es dato ni del sistema se reconoce como desconocida';
set local role authenticated;

select case when pg_temp.falla(format($q$select borrador_guardar_cuadro('B00', 'Saludo', 'Hola {xyz}', null, %s)$q$, :bot))
            then 'ok' else 'not ok' end || ' 8 - no guarda un mensaje con una marca {dato} que no existe';
reset role;
update lead_atributos set archivado_en = now() where clave = 'nombre_completo';
select case when exists (select 1 from jsonb_array_elements(problemas_del_flujo((select id from bot_flujos where bot_id = :bot and estado = 'borrador'))) p
                         where p->>'clave' = 'Q1' and p->>'problema' like 'El bot no reemplaza {nombre_completo}%')
            then 'ok' else 'not ok' end || ' 9 - si el dato se archiva después, el bot no se publica hasta corregir la marca';
set local role authenticated;
set local role authenticated;

select case when has_column_privilege('authenticated', 'public.agente_config', 'compra_bot_despues', 'UPDATE')
             and has_column_privilege('authenticated', 'public.agente_config', 'compra_bot_despues', 'SELECT')
            then 'ok' else 'not ok' end || ' 10 - la pantalla Compra puede leer y guardar «Después del comprobante» (permiso de columna)';

reset role;
rollback;

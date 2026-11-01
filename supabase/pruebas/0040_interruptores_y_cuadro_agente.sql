-- Pruebas de la migración 0040 (F4·35): interruptores del bot con historial y cuadro Agente. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000040a1', 'prueba-0040-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000040a1', 'Prueba Asesor 0040', id from roles where nombre = 'asesor';
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
select chatbot_activo as antes_chatbot, menu_activo as antes_menu, agente_en_todo as antes_agente, texto_apagado as antes_texto
  from bot_config where id = 1 \gset

select case when (select count(*) from bot_config) = 1 and pg_temp.falla('insert into bot_config (id) values (2)')
            then 'ok' else 'not ok' end || ' 1 - hay una sola fila de interruptores';

-- El asesor no los cambia; el administrador sí, y queda en el historial
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000040a1', 'role', 'authenticated')::text, true);
select case when pg_temp.falla('select bot_config_cambiar(false, true, false, '''')')
             and pg_temp.falla('update bot_config set chatbot_activo = false')
             and pg_temp.falla('insert into bot_config_historial (antes, despues) values (''{}'', ''{}'')')
            then 'ok' else 'not ok' end || ' 2 - el asesor ve los interruptores pero no los cambia (RF-34)';

select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select bot_config_cambiar(false, true, true, '  Hola 👋 En un momento te atiende un asesor  ') \g /dev/null
select case when (select not chatbot_activo and agente_en_todo and texto_apagado = 'Hola 👋 En un momento te atiende un asesor'
                         and actualizado_por = :'admin' from bot_config)
             and (select despues->>'chatbot' = 'false' and usuario_id = :'admin' from bot_config_historial order by id desc limit 1)
            then 'ok' else 'not ok' end || ' 3 - el administrador apaga el chatbot y queda quién, cuándo, antes y después';
select count(*) as historial from bot_config_historial \gset
select bot_config_cambiar(false, true, true, 'Hola 👋 En un momento te atiende un asesor') \g /dev/null
select case when (select count(*) from bot_config_historial) = :historial
             and pg_temp.falla(format('select bot_config_cambiar(true, true, true, %L)', repeat('x', 1025)))
            then 'ok' else 'not ok' end || ' 4 - guardar sin cambios no llena el historial; el mensaje tiene máximo 1.024 caracteres';

-- Cuadro Agente
select crear_bot('Prueba 0040 agente') as bot \gset
select borrador_crear_cuadro('agente', 300, 0, :bot) as a \gset
select case when :'a' = 'A1' and (select (ajustes->>'max_vueltas')::int = 8 and salidas = '{}' from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                                  where f.bot_id = :bot and k.clave = 'A1')
            then 'ok' else 'not ok' end || ' 5 - «+ Agregar → Agente» crea A1 con 8 vueltas y sin flechas';

select borrador_guardar_agente('A1', 'Dudas', 'Cuéntame tu duda 🙂', 'Resuelve dudas y lleva a comprar', array['buscar_productos', 'iniciar_compra'],
                               5, null, 'B-ASESOR', 'B00', null, :bot) \g /dev/null
select case when (select ajustes->>'instruccion' = 'Resuelve dudas y lleva a comprar' and ajustes->'herramientas' = '["buscar_productos", "iniciar_compra"]'
                         and salidas = '{"asesor": "B-ASESOR", "menu": "B00"}'
                  from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.bot_id = :bot and k.clave = 'A1')
             and pg_temp.falla(format($q$select borrador_guardar_agente('A1', 'x', 'x', '', null, 0, null, null, null, null, %s)$q$, :bot))
             and pg_temp.falla(format($q$select borrador_guardar_agente('A1', 'x', 'x', '', null, 8, 'A1', null, null, null, %s)$q$, :bot))
             and pg_temp.falla(format($q$select borrador_guardar_cuadro('A1', 'x', 'x', null, %s)$q$, :bot))
            then 'ok' else 'not ok' end || ' 6 - guarda instrucción, herramientas y salidas; no 0 vueltas, una flecha a sí mismo ni por la función del Mensaje';

select case when rotulo_salida('falla') = 'Error del cerebro' and salidas_opcionales('agente', null) = '{compra,asesor,menu,falla}'
             and tipo_del_dueno('agente')
            then 'ok' else 'not ok' end || ' 7 - las cuatro salidas del Agente son opcionales (sueltas no impiden publicar)';

reset role;
update bot_config set chatbot_activo = :'antes_chatbot', menu_activo = :'antes_menu', agente_en_todo = :'antes_agente', texto_apagado = :'antes_texto';
rollback;

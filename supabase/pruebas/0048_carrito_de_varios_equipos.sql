-- Pruebas de la migración 0048 (F4·44): ajustes del carrito y cuadro 🛒 Carrito. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select case when (select not carrito_activo and carrito_max = 5 and carrito_texto_otro like '%{n}%' from agente_config where id = 1)
            then 'ok' else 'not ok' end || ' 1 - el carrito nace apagado, con 5 equipos y textos por defecto (RAG-54)';

select case when pg_temp.falla('update agente_config set carrito_max = 11 where id = 1')
             and pg_temp.falla('update agente_config set carrito_max = 1 where id = 1')
             and pg_temp.falla('update agente_config set carrito_texto_pedir = '''' where id = 1')
            then 'ok' else 'not ok' end || ' 2 - el máximo va de 2 a 10 y los textos no quedan vacíos';

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);

select crear_bot('Prueba 0048 carrito') as bot \gset
select borrador_crear_cuadro('carrito', 300, 0, :bot) as k \gset
select case when :'k' = 'K1' and (select tipo = 'carrito' and salidas = '{}' and texto <> '' from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
                                  where f.bot_id = :bot and k.clave = 'K1')
            then 'ok' else 'not ok' end || ' 3 - «+ Agregar → Carrito» crea K1 sin flechas (RAG-55)';

select borrador_guardar_carrito('K1', 'Pedido', '🛒 Armemos tu pedido', null, 'B-ASESOR', :bot) \g /dev/null
select case when (select nombre = 'Pedido' and salidas = '{"asesor": "B-ASESOR"}'
                  from bot_cuadros k join bot_flujos f on f.id = k.flujo_id where f.bot_id = :bot and k.clave = 'K1')
             and pg_temp.falla(format($q$select borrador_guardar_carrito('K1', 'x', 'x', 'K1', null, %s)$q$, :bot))
             and pg_temp.falla(format($q$select borrador_guardar_carrito('K1', 'x', 'x', 'NO-EXISTE', null, %s)$q$, :bot))
             and pg_temp.falla(format($q$select borrador_guardar_carrito('B00', 'x', 'x', null, null, %s)$q$, :bot))
            then 'ok' else 'not ok' end || ' 4 - guarda nombre, texto y salidas; no a sí mismo, a un cuadro que no existe ni en otro tipo';

reset role;
select case when rotulo_salida('listo') like 'Pedido pagado%' and salidas_opcionales('carrito', null) = '{listo,asesor}'
             and tipo_del_dueno('carrito')
             and not exists (select 1 from jsonb_array_elements(problemas_del_flujo((select id from bot_flujos where bot_id = :bot and estado = 'borrador'))) p
                             where p->>'clave' = 'K1' and p->>'problema' like '%no lleva a ningún cuadro%')
            then 'ok' else 'not ok' end || ' 5 - salidas opcionales: sueltas no son un problema al publicar';

rollback;

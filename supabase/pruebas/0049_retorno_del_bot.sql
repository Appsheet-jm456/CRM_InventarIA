-- Pruebas de la migración 0049 (F4·45): retorno del bot y «¿Sigues necesitando ayuda?». Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select case when (select not activo and a_horas = 5 and b_horas = 2 and inactividad_horas = 24 and solo_horario
                         and etiquetas_excluidas = '{No-Molestar}' from retorno_config where id = 1)
            then 'ok' else 'not ok' end || ' 1 - nace apagado con 5 h, 2 h hábiles, 24 h y No-Molestar (RT-10)';

select case when pg_temp.falla('update retorno_config set a_horas = 24 where id = 1')
             and pg_temp.falla('update retorno_config set b_horas = 0.2 where id = 1')
             and pg_temp.falla('update retorno_config set a_boton_si = ''un botón demasiado largo'' where id = 1')
             and pg_temp.falla('update retorno_config set a_texto = '''' where id = 1')
            then 'ok' else 'not ok' end || ' 2 - límites de horas, botones de 20 caracteres y textos no vacíos';

-- Escenario fijo: todo el día es horario (RT-08 no estorba la prueba) y la regla A en 1 h.
update retorno_config set activo = true, a_horas = 1, b_horas = 0.5, solo_horario = false where id = 1;
insert into leads (telefono, nombre, etapa) values ('570000049001', 'Ana', 'Nuevo'), ('570000049002', 'Beto', 'Nuevo'),
  ('570000049003', 'Caro', 'Vendido'), ('570000049004', 'Dani', 'Nuevo'), ('570000049005', 'Eva', 'Nuevo');
select id as ana from leads where telefono = '570000049001' and eliminado_en is null \gset
select id as beto from leads where telefono = '570000049002' and eliminado_en is null \gset
select id as caro from leads where telefono = '570000049003' and eliminado_en is null \gset
select id as dani from leads where telefono = '570000049004' and eliminado_en is null \gset
select id as eva from leads where telefono = '570000049005' and eliminado_en is null \gset

-- Ana: escribió hace 3 h, el bot le contestó hace 2 h y no volvió a escribir → A.
insert into mensajes (lead_id, lado, texto, creado_en) values
  (:ana, 'cliente', 'hola', now() - interval '3 hours'), (:ana, 'bot', 'menú', now() - interval '2 hours');
-- Beto: con asesor (cola), escribió hace 1 h y nadie le contestó → B (horas hábiles = todo el día no aplica: usa el horario real).
update leads set pausar_bot = true where id = :beto;
insert into mensajes (lead_id, lado, texto, creado_en) values (:beto, 'cliente', 'precio?', now() - interval '20 hours');
-- Caro: igual que Ana pero ya compró (Vendido) → nada (RT-07).
insert into mensajes (lead_id, lado, texto, creado_en) values
  (:caro, 'cliente', 'gracias', now() - interval '3 hours'), (:caro, 'bot', 'a ti', now() - interval '2 hours');
-- Dani: igual que Ana pero con No-Molestar → nada.
update leads set etiquetas = '{No-Molestar}' where id = :dani;
insert into mensajes (lead_id, lado, texto, creado_en) values
  (:dani, 'cliente', 'hola', now() - interval '3 hours'), (:dani, 'bot', 'menú', now() - interval '2 hours');
-- Eva: escribió hace 23 h 45 min → fuera de las 24 h con margen (RT-04).
insert into mensajes (lead_id, lado, texto, creado_en) values
  (:eva, 'cliente', 'hola', now() - interval '23 hours 45 minutes'), (:eva, 'bot', 'menú', now() - interval '23 hours');

select case when (select regla from retorno_candidatos(:ana)) = 'A' then 'ok' else 'not ok' end
       || ' 3 - el cliente callado 1 h después de nuestro mensaje recibe la regla A (RT-01)';
select case when (select regla from retorno_candidatos(:beto)) = 'B' then 'ok' else 'not ok' end
       || ' 4 - con asesor y sin respuesta de una persona en las horas hábiles: regla B (RT-02)';
select case when not exists (select 1 from retorno_candidatos(:caro)) and not exists (select 1 from retorno_candidatos(:dani))
            then 'ok' else 'not ok' end || ' 5 - Vendido y No-Molestar no reciben nada (RT-07)';
select case when not exists (select 1 from retorno_candidatos(:eva)) then 'ok' else 'not ok' end
       || ' 6 - a 15 min de cumplir 24 h no se envía (RT-04)';

select retorno_marcar(:ana, 'A');
select case when not exists (select 1 from retorno_candidatos(:ana))
             and (select retorno_pendiente = 'A' and 'Seguimiento-Enviado' = any(etiquetas) from leads where id = :ana)
             and exists (select 1 from lead_eventos where lead_id = :ana and tipo = 'retorno')
            then 'ok' else 'not ok' end || ' 7 - una vez enviado no se repite en el mismo silencio, con etiqueta e historial (RT-03, RT-09)';

update leads set seguimiento_enviado_en = now() - interval '100 minutes' where id = :ana;  -- se envió antes de que respondiera
insert into mensajes (lead_id, lado, texto, creado_en) values (:ana, 'cliente', 'sigo', now() - interval '90 minutes'),
  (:ana, 'bot', 'ok', now() - interval '80 minutes');
select case when (select regla from retorno_candidatos(:ana)) = 'A' then 'ok' else 'not ok' end
       || ' 8 - si el cliente vuelve a escribir y calla otra vez, el contador empieza de nuevo';

update retorno_config set activo = false where id = 1;
select case when not exists (select 1 from retorno_candidatos()) then 'ok' else 'not ok' end
       || ' 9 - apagado no hay candidatos (criterio 6)';
update retorno_config set activo = true where id = 1;

-- Inactividad: Beto con asesor y sin mensajes en P horas vuelve al bot en silencio.
update retorno_config set inactividad_horas = 1 where id = 1;
update leads set en_cola_desde = now() - interval '30 hours' where id = :beto;
select retorno_inactivos() >= 1 as volvieron \gset
select case when :'volvieron' and (select not pausar_bot and estado_chat = 'bot' and asignado_a is null from leads where id = :beto)
            then 'ok' else 'not ok' end || ' 10 - P horas sin actividad: el chat vuelve al bot (RT-05.4)';

-- Vendido con asesor no vuelve solo si vendido_vuelve está apagado; el destino de postventa se usa al devolver.
update leads set pausar_bot = true, en_cola_desde = now() - interval '30 hours' where id = :caro;
delete from mensajes where lead_id = :caro;
select retorno_inactivos();
select case when (select pausar_bot from leads where id = :caro) then 'ok' else 'not ok' end
       || ' 11 - un cliente Vendido se queda con el asesor (RT-06)';
select id as postventa from bots where not archivado and not principal limit 1 \gset
update retorno_config set vendido_bot = :postventa where id = 1;
select retorno_devolver(:caro, 'prueba');
select case when (select bot_id = :postventa and not pausar_bot from leads where id = :caro) then 'ok' else 'not ok' end
       || ' 12 - al devolverlo, el cliente Vendido va al bot de postventa';

-- Guardar los ajustes: solo con administrar_bot.
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select retorno_config_cambiar((select to_jsonb(c) - 'id' || jsonb_build_object('a_horas', 6, 'etiquetas_excluidas', '["No-Molestar", " VIP ", ""]'::jsonb)
                               from retorno_config c));
reset role;
select case when (select a_horas = 6 and etiquetas_excluidas = '{No-Molestar,VIP}' from retorno_config) then 'ok' else 'not ok' end
       || ' 13 - el administrador guarda los ajustes y las etiquetas se limpian';
select case when pg_temp.falla('select retorno_candidatos()') = false then 'ok' else 'not ok' end || ' 14 - el receptor (postgres) puede consultar';

rollback;

-- Pruebas de la migración 0008 (F3·8, decisión 0024). Todo corre dentro de una transacción con ROLLBACK:
-- no deja datos. Uso: supabase/migrar.sh --probar
begin;

-- true si la sentencia falla
create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

-- Un asesor QA y el administrador que ya existe.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'prueba-0008-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000000a1', 'Prueba Asesor 0008', id from roles where nombre = 'asesor';
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset

insert into leads (telefono, nombre, etapa) values ('570000000001', 'QA Cliente', 'Nuevo') returning id as lead \gset

-- RM-03: pasar a la cola abre una atención
update leads set pausar_bot = true where id = :lead;
select case when count(*) = 1 then 'ok' else 'not ok' end || ' 1 - pasar a la cola abre una atención'
from atenciones where lead_id = :lead and primera_respuesta_en is null;

-- El asesor toma y responde: la atención queda con su asesor y los minutos de espera
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select tomar_conversacion(:lead);
select registrar_mensaje_asesor(:lead, 'Hola, te atiendo', 'wamid.QA1');
reset role;
select case when count(*) = 1 then 'ok' else 'not ok' end || ' 2 - la primera respuesta cierra la atención con asesor y minutos'
from atenciones where lead_id = :lead and asesor_id = '00000000-0000-4000-8000-0000000000a1'
  and primera_respuesta_en is not null and minutos_espera is not null;

-- RM-07: los estados de Meta no retroceden y guardan categoría y cobrable
select registrar_estado_meta('wamid.QA1', 'sent', now(), 'service', false, 'free_customer_service');
select registrar_estado_meta('wamid.QA1', 'read', now() + interval '2 min');
select registrar_estado_meta('wamid.QA1', 'delivered', now() + interval '1 min');
select case when estado_entrega = 'leido' and categoria_meta = 'service' and cobrable = false
             and entregado_en is not null and leido_en is not null
            then 'ok' else 'not ok' end || ' 3 - un entregado tardío no pisa el leído'
from mensajes where meta_id = 'wamid.QA1';

-- El estado que llega antes que el mensaje se aplica cuando el mensaje se registra
select registrar_estado_meta('wamid.QA2', 'delivered', now(), 'service', true, 'regular');
insert into mensajes (lead_id, lado, texto, meta_id) values (:lead, 'bot', 'Menú', 'wamid.QA2');
select case when estado_entrega = 'entregado' and cobrable then 'ok' else 'not ok' end
       || ' 4 - un estado que llegó antes se aplica al registrar el mensaje'
from mensajes where meta_id = 'wamid.QA2';

select registrar_estado_meta('wamid.QA3', 'failed', now(), '', null, '', '131047 Re-engagement message');
insert into mensajes (lead_id, lado, texto, meta_id) values (:lead, 'bot', 'Tarde', 'wamid.QA3');
select case when estado_entrega = 'fallido' and error_meta like '131047%' then 'ok' else 'not ok' end
       || ' 5 - un fallido guarda su error'
from mensajes where meta_id = 'wamid.QA3';

select registrar_estado_meta('wamid.QA3', 'deleted', now());
select case when (select count(*) from estados_meta where wamid = 'wamid.QA3') = 1
            then 'ok' else 'not ok' end || ' 6 - otros estados de Meta se ignoran';

-- Solo el servidor registra estados
select case when not has_function_privilege('authenticated',
                'public.registrar_estado_meta(text,text,timestamptz,text,boolean,text,text)', 'execute')
             and not has_table_privilege('authenticated', 'public.estados_meta', 'select')
            then 'ok' else 'not ok' end || ' 7 - la app no escribe ni lee estados de Meta';

-- Oportunidad del asesor: pasa por Cotización y se pierde por Precio
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select abrir_oportunidad(:lead, (select id from embudos where predeterminado)) as op \gset
select mover_oportunidad(:op, (select et.id from etapas et join embudos e on e.id = et.embudo_id
                               where e.predeterminado and et.nombre = 'Cotización'));
select mover_oportunidad(:op, (select et.id from etapas et join embudos e on e.id = et.embudo_id
                               where e.predeterminado and et.cierre = 'perdida'), 'Precio');
-- El cliente vuelve a escribir: queda sin respuesta
reset role;
update leads set estado_chat = 'asignada', asignado_a = '00000000-0000-4000-8000-0000000000a1' where id = :lead;
insert into mensajes (lead_id, lado, texto, creado_en) values (:lead, 'cliente', '¿Y el precio?', now() + interval '5 min');

-- RM-02: el asesor ve lo suyo, sin la tabla del equipo ni el consumo
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select metricas(current_date - 1, current_date + 1) as m_asesor \gset
reset role;
select case when (:'m_asesor'::jsonb)->>'alcance' = 'mio'
             and not ((:'m_asesor'::jsonb) ? 'asesores') and not ((:'m_asesor'::jsonb) ? 'clientes_nuevos')
             and ((:'m_asesor'::jsonb)->'atenciones'->>'total')::int = 1
            then 'ok' else 'not ok' end || ' 8 - el asesor ve solo lo suyo';

select case when exists (select 1 from jsonb_array_elements((:'m_asesor'::jsonb)->'motivos') m
                         where m->>'motivo' = 'Precio' and (m->>'cantidad')::int = 1)
             and ((:'m_asesor'::jsonb)->'oportunidades'->>'perdidas_sin_motivo')::int = 0
            then 'ok' else 'not ok' end || ' 9 - motivos de pérdida y cero sin motivo';

select case when (select (et->>'llegaron')::int from jsonb_array_elements((:'m_asesor'::jsonb)->'embudos') e,
                         jsonb_array_elements(e->'etapas') et
                  where e->>'nombre' = 'Cliente Final' and et->>'nombre' = 'Cotización') = 1
             and (select (et->>'llegaron')::int from jsonb_array_elements((:'m_asesor'::jsonb)->'embudos') e,
                         jsonb_array_elements(e->'etapas') et
                  where e->>'nombre' = 'Cliente Final' and et->>'nombre' = 'Negociación') = 0
            then 'ok' else 'not ok' end || ' 10 - la conversión cuenta hasta la etapa a la que llegó';

select case when exists (select 1 from jsonb_array_elements((:'m_asesor'::jsonb)->'sin_respuesta') s
                         where (s->>'id')::bigint = :lead)
            then 'ok' else 'not ok' end || ' 11 - la conversación con el último mensaje del cliente queda sin respuesta';

select case when ((:'m_asesor'::jsonb)->'entrega'->>'leidos')::int = 1
            then 'ok' else 'not ok' end || ' 12 - la entrega del asesor cuenta sus mensajes';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select case when pg_temp.falla('select consumo_meta()') then 'ok' else 'not ok' end
       || ' 13 - el asesor no ve el consumo de Meta';
reset role;

-- El administrador ve todo, la tabla por asesor y el consumo
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select metricas(current_date - 1, current_date + 1) as m_admin \gset
select consumo_meta() as consumo \gset
reset role;
select case when (:'m_admin'::jsonb)->>'alcance' = 'todo'
             and exists (select 1 from jsonb_array_elements((:'m_admin'::jsonb)->'asesores') a
                         where a->>'nombre' = 'Prueba Asesor 0008' and (a->>'perdidas')::int = 1 and (a->>'atenciones')::int = 1)
            then 'ok' else 'not ok' end || ' 14 - el administrador ve la tabla por asesor';
select case when ((:'consumo'::jsonb)->>'servicio')::int >= 2 and ((:'consumo'::jsonb)->>'cobrables')::int >= 1
             and ((:'consumo'::jsonb)->>'limite_gratis')::int = 1000
            then 'ok' else 'not ok' end || ' 15 - el consumo cuenta servicio y cobrables del mes';

-- Un período al revés no se acepta
select case when pg_temp.falla('select metricas(current_date, current_date - 1)') then 'ok' else 'not ok' end
       || ' 16 - un período al revés falla';

rollback;

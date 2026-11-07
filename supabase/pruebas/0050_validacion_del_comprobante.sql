-- Pruebas de la migración 0050 (F4·46): el asesor valida el comprobante. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

select case when exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where r.nombre = 'administrador' and rp.permiso = 'validar_pagos')
             and not exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where r.nombre = 'asesor' and rp.permiso = 'validar_pagos')
            then 'ok' else 'not ok' end || ' 1 - validar_pagos es del administrador; el asesor no lo tiene por defecto (RAG-67)';

select case when (select pago_validado_id = 30 from compra_etapas where embudo_id = 1)
             and (select pago_validado_id = 16 from compra_etapas where embudo_id = 3)
            then 'ok' else 'not ok' end || ' 2 - pago validado va a la etapa que sigue a Pago por confirmar (Alistamiento / Primer pedido)';

-- Escenario: un cliente con la compra en pago por confirmar y su oportunidad en Pago por confirmar (Cliente Final).
insert into leads (telefono, nombre, etapa, estado_bot, etiquetas)
values ('570000050001', 'Pedro', 'Pago por confirmar',
        '{"compra": {"paso": "pago_por_confirmar", "total": 4080000, "codigo": "100-102-1137"}}', '{Comprobante-Por-Validar}');
select id as l from leads where telefono = '570000050001' and eliminado_en is null \gset
select abrir_oportunidad_interna(:l, 1) as op \gset
update oportunidades set etapa_id = 5 where id = :op;
insert into leads (telefono, nombre, etapa, estado_bot) values ('570000050002', 'Sin compra', 'Nuevo', '{}');
select id as otro from leads where telefono = '570000050002' and eliminado_en is null \gset

select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
select coalesce((select u.id::text from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'asesor' and u.activo limit 1), '') as asesor \gset
set local role authenticated;

-- Un asesor sin el permiso no valida.
select set_config('request.jwt.claims', json_build_object('sub', nullif(:'asesor', ''), 'role', 'authenticated')::text, true);
select case when :'asesor' = '' or pg_temp.falla(format('select validar_comprobante(%s)', :l)) then 'ok' else 'not ok' end
       || ' 3 - sin validar_pagos no se puede validar';

select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select case when pg_temp.falla(format('select validar_comprobante(%s)', :otro)) then 'ok' else 'not ok' end
       || ' 4 - sin comprobante por validar, avisa y no hace nada';
select case when pg_temp.falla(format('select rechazar_comprobante(%s, %L)', :l, '')) then 'ok' else 'not ok' end
       || ' 5 - rechazar exige el motivo';

-- Primer rechazo: vuelve a Esperando pago, etiqueta Comprobante-Rechazado, sin fraude.
select rechazar_comprobante(:l, 'El monto no coincide');
reset role;
select case when (select estado_bot -> 'compra' ->> 'validacion' = 'rechazado' and estado_bot -> 'compra' ->> 'rechazos' = '1'
                         and 'Comprobante-Rechazado' = any(etiquetas) and not 'Revisar-Posible-Fraude' = any(etiquetas)
                         and not 'Comprobante-Por-Validar' = any(etiquetas) from leads where id = :l)
             and (select etapa_id = 27 from oportunidades where id = :op)
             and exists (select 1 from lead_eventos where lead_id = :l and tipo = 'pago' and detalle like '%El monto no coincide%')
            then 'ok' else 'not ok' end || ' 6 - el rechazo deja motivo, etiqueta, historial y la oportunidad en Esperando pago (RAG-66)';

-- El cliente manda otro soporte (lo hace el receptor) y lo rechazan otra vez: Revisar-Posible-Fraude.
update leads set estado_bot = jsonb_set(estado_bot, '{compra}', (estado_bot -> 'compra') - 'validacion' || '{"paso": "pago_por_confirmar"}')
where id = :l;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select rechazar_comprobante(:l, 'No aparece en la cuenta');
reset role;
select case when (select 'Revisar-Posible-Fraude' = any(etiquetas) and estado_bot -> 'compra' ->> 'rechazos' = '2' from leads where id = :l)
            then 'ok' else 'not ok' end || ' 7 - al segundo rechazo queda Revisar-Posible-Fraude';

-- Tercer soporte, esta vez bueno: validado.
update leads set estado_bot = jsonb_set(estado_bot, '{compra}', (estado_bot -> 'compra') - 'validacion' || '{"paso": "pago_por_confirmar"}')
where id = :l;
update oportunidades set etapa_id = 5 where id = :op;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select validar_comprobante(:l) ->> 'total' as total \gset
reset role;
select case when :'total' = '4080000'
             and (select estado_bot -> 'compra' ->> 'validacion' = 'validado' and estado_bot -> 'compra' ->> 'validado_por' is not null
                         and 'Pago-Validado' = any(etiquetas) and not 'Comprobante-Rechazado' = any(etiquetas) from leads where id = :l)
             and (select etapa_id = 30 from oportunidades where id = :op)
             and exists (select 1 from lead_eventos where lead_id = :l and tipo = 'pago' and detalle like 'Comprobante validado por%')
            then 'ok' else 'not ok' end || ' 8 - validar deja quién y el total, Pago-Validado y la oportunidad en Alistamiento (RAG-65)';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select case when pg_temp.falla(format('select rechazar_comprobante(%s, %L)', :l, 'x')) then 'ok' else 'not ok' end
       || ' 9 - un comprobante validado ya no se puede rechazar';
reset role;

select case when (select validar_comprobante and texto_validado = '✅ Recibimos tu comprobante.' and array_length(motivos_rechazo, 1) = 3
                  from agente_config where id = 1)
            then 'ok' else 'not ok' end || ' 10 - viene encendido con sus textos y tres motivos (RAG-70)';

rollback;

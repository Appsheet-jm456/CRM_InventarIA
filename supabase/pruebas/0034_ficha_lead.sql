-- Pruebas de la migración 0034 (F4·30 D): editar, atributos, notas, tareas y obligatorios por etapa. Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000034a1', 'prueba-0034-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000034a1', 'Prueba Asesor 0034', id from roles where nombre = 'asesor';
select u.id as admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo limit 1 \gset
insert into leads (telefono, nombre, etapa, asignado_a) values
  ('5798000001', 'Ficha Suya', 'Nuevo', '00000000-0000-4000-8000-0000000034a1'),
  ('5798000002', 'Ficha Ajena', 'Nuevo', :'admin');
select id as suyo from leads where telefono = '5798000001' \gset
select id as ajeno from leads where telefono = '5798000002' \gset
select e.id as vendido, e.embudo_id as embudo from etapas e join embudos em on em.id = e.embudo_id
 where em.nombre = 'Cliente Final' and e.nombre = 'Vendido' \gset
select e.id as nuevo_cf from etapas e join embudos em on em.id = e.embudo_id where em.nombre = 'Cliente Final' and e.nombre = 'Nuevo' \gset
insert into oportunidades (lead_id, embudo_id, etapa_id) values (:suyo, :embudo, :nuevo_cf);
select id as op from oportunidades where lead_id = :suyo \gset
update lead_atributos set obligatorio = 'etapa', etapas_obligatorio = '{Vendido}' where clave = 'metodo_pago';
update lead_atributos set obligatorio = 'no', etapas_obligatorio = '{}' where clave <> 'metodo_pago' and obligatorio = 'etapa';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000034a1', 'role', 'authenticated')::text, true);

select case when not pg_temp.falla(format($q$select lead_editar(%s, 'Ana Gómez', 1500000)$q$, :suyo))
             and pg_temp.falla(format($q$select lead_editar(%s, 'Otro nombre')$q$, :ajeno))
             and pg_temp.falla(format($q$select lead_editar(%s, null, -5)$q$, :suyo))
            then 'ok' else 'not ok' end || ' 1 - el asesor edita nombre y valor de sus leads, no los de otro ni con valor negativo';
select case when (lead_guardar_atributos(:suyo, '{"ciudad": " Cali ", "tipo_cliente": "Distribuidor"}') ->> 'ciudad') = 'Cali'
            then 'ok' else 'not ok' end || ' 2 - guarda atributos y recorta espacios';
select case when not (lead_guardar_atributos(:suyo, '{"ciudad": "", "tipo_cliente": null}') ? 'ciudad')
            then 'ok' else 'not ok' end || ' 3 - un valor vacío o null borra el atributo';
select case when pg_temp.falla(format($q$select lead_guardar_atributos(%s, '{"tipo_cliente": "Mayorista"}')$q$, :suyo))
             and pg_temp.falla(format($q$select lead_guardar_atributos(%s, '{"inventado": "x"}')$q$, :suyo))
             and pg_temp.falla(format($q$select lead_guardar_atributos(%s, '{"ciudad": "Cali"}')$q$, :ajeno))
            then 'ok' else 'not ok' end || ' 4 - no guarda opciones fuera de la lista, atributos que no existen ni en leads ajenos';
select case when not pg_temp.falla(format($q$select lead_nota(%s, 'Prefiere que lo llamen en la tarde')$q$, :suyo))
             and pg_temp.falla(format($q$select lead_nota(%s, '   ')$q$, :suyo))
             and pg_temp.falla(format($q$select lead_nota(%s, 'hola')$q$, :ajeno))
            then 'ok' else 'not ok' end || ' 5 - deja notas internas en sus leads; vacías o en ajenos, no';
select crear_tarea(:suyo, 'Llamar', 'Confirmar dirección', now() + interval '2 hours') as tarea \gset
select case when (select tipo from seguimientos where id = :tarea) = 'Llamar'
             and pg_temp.falla(format($q$select crear_tarea(%s, 'Llamar', 'x', now())$q$, :ajeno))
            then 'ok' else 'not ok' end || ' 6 - crea tareas con su tipo, solo en sus leads';
select cumplir_tarea(:tarea, 'Confirmó: Cra 10 # 20-30');
select case when (select estado = 'hecho' and resultado = 'Confirmó: Cra 10 # 20-30' from seguimientos where id = :tarea)
            then 'ok' else 'not ok' end || ' 7 - cumplir la tarea guarda el resultado';

-- Obligatorios por etapa
select case when pg_temp.falla(format($q$select mover_oportunidad(%s, %s)$q$, :op, :vendido))
            then 'ok' else 'not ok' end || ' 8 - no pasa a Vendido sin el método de pago';
select lead_guardar_atributos(:suyo, '{"metodo_pago": "Transferencia"}') \g /dev/null
select case when not pg_temp.falla(format($q$select mover_oportunidad(%s, %s)$q$, :op, :vendido))
            then 'ok' else 'not ok' end || ' 9 - con el método de pago sí pasa';
select case when not pg_temp.falla(format($q$select mover_oportunidad(%s, %s)$q$, :op, :nuevo_cf))
            then 'ok' else 'not ok' end || ' 10 - a mano se puede devolver una etapa (RL-03)';
reset role;

select case when exists (select 1 from lead_eventos where lead_id = :suyo and tipo = 'nota' and detalle = 'Prefiere que lo llamen en la tarde'
                          and usuario_id = '00000000-0000-4000-8000-0000000034a1')
             and exists (select 1 from lead_eventos where lead_id = :suyo and tipo = 'nombre' and despues = '"Ana Gómez"')
             and exists (select 1 from lead_eventos where lead_id = :suyo and tipo = 'tarea_cumplida')
             and (select count(*) from lead_eventos where lead_id = :suyo and tipo = 'oportunidad') = 2
            then 'ok' else 'not ok' end || ' 11 - nota, nombre, tarea y cambios de etapa quedan en la línea de tiempo';
select case when not pg_temp.falla(format($q$update leads set etapa = 'Cotización' where id = %s$q$, :suyo))
            then 'ok' else 'not ok' end || ' 12 - el bot (sin sesión) no se frena por atributos obligatorios';

rollback;

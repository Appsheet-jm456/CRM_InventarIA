-- Pruebas de la migración 0036 (F4·33): Venta online o tienda, datos de despacho, Alistamiento y «Guardar cambios». Todo con ROLLBACK.
-- Uso: supabase/migrar.sh --probar
begin;

create function pg_temp.falla(sentencia text) returns boolean language plpgsql as $$
begin
  execute sentencia;
  return false;
exception when others then
  return true;
end $$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000036a1', 'prueba-0036-asesor@inventaria.local');
insert into usuarios (id, nombre, rol_id) select '00000000-0000-4000-8000-0000000036a1', 'Prueba Asesor 0036', id from roles where nombre = 'asesor';
insert into leads (telefono, nombre, etapa, asignado_a) values
  ('5794000001', 'Venta Online', 'Nuevo', '00000000-0000-4000-8000-0000000036a1'),
  ('5794000002', 'Venta Tienda', 'Nuevo', '00000000-0000-4000-8000-0000000036a1');
select id as online from leads where telefono = '5794000001' \gset
select id as tienda from leads where telefono = '5794000002' \gset
select e.embudo_id as embudo from etapas e join embudos em on em.id = e.embudo_id where em.nombre = 'Cliente Final' limit 1 \gset
select id as pago from etapas where embudo_id = :embudo and nombre = 'Pago por confirmar' \gset
select id as alistamiento from etapas where embudo_id = :embudo and nombre = 'Alistamiento' \gset
insert into oportunidades (lead_id, embudo_id, etapa_id) values (:online, :embudo, :pago), (:tienda, :embudo, :pago);
select id as op_online from oportunidades where lead_id = :online \gset
select id as op_tienda from oportunidades where lead_id = :tienda \gset

select case when (select opciones from lead_atributos where clave = 'metodo_pago') = '["Efectivo en tienda", "Transferencia"]'
             and (select count(*) from lead_atributos where clave in ('descuento', 'numero_serie') and archivado_en is not null) = 2
             and (select nombre || '/' || tipo from lead_atributos where clave = 'numero_contrato') = 'Nota del asesor/texto_largo'
            then 'ok' else 'not ok' end || ' 1 - método de pago con dos opciones, sin descuento ni serie, y Nota del asesor (RL-13 a RL-15)';

select case when (select string_agg(nombre, ' > ' order by orden) from etapas where embudo_id = :embudo and orden >= (select orden from etapas where id = :pago))
                 = 'Pago por confirmar > Alistamiento > Despachado > Vendido > Perdido'
            then 'ok' else 'not ok' end || ' 2 - Alistamiento y Despachado van entre Pago por confirmar y Vendido (RL-21)';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000036a1', 'role', 'authenticated')::text, true);

select case when pg_temp.falla(format($q$select lead_guardar_ficha(%s, '{"cedula": "10A20"}', '{}')$q$, :online))
             and pg_temp.falla(format($q$select lead_guardar_ficha(%s, '{"correo_para_la_factura": "sin-arroba"}', '{}')$q$, :online))
             and pg_temp.falla(format($q$select lead_guardar_ficha(%s, '{"metodo_pago": "Tarjeta"}', '{}')$q$, :online))
            then 'ok' else 'not ok' end || ' 3 - no guarda cédula con letras, correo sin @ ni un método de pago que ya no existe';

-- Datos de despacho: obligatorios para Alistamiento solo en venta online (RL-20)
select lead_guardar_ficha(:online, '{"venta_online": true}', '{}') \g /dev/null
select lead_guardar_ficha(:tienda, '{"venta_online": false}', '{}') \g /dev/null
select case when cardinality(lead_atributos_faltantes(:online, 'Alistamiento')) = 6
             and lead_atributos_faltantes(:tienda, 'Alistamiento') = '{}'
             and pg_temp.falla(format('select mover_oportunidad(%s, %s)', :op_online, :alistamiento))
            then 'ok' else 'not ok' end || ' 4 - la venta online no pasa a Alistamiento sin los datos de despacho; la de tienda, sí';

-- Guardar cambios: un solo evento con todo lo que cambió (RL-25)
reset role;
delete from lead_eventos where lead_id = :online;
set local role authenticated;
select lead_guardar_ficha(:online, jsonb_build_object('nombre', 'Juan Pérez', 'valor', 1500000, 'nombre_completo', 'Juan Pérez Gómez',
         'cedula', '1020345678', 'celular', '3001234567', 'correo_para_la_factura', 'juan@correo.com', 'ciudad', 'Cali, Valle del Cauca',
         'direccion_entrega', 'Calle 10 #5-20'), '{"nombre": "Venta Online"}') \g /dev/null
select case when (select count(*) from lead_eventos where lead_id = :online) = 1
             and (select despues ->> 'cedula' from lead_eventos where lead_id = :online and tipo = 'ficha') = '1020345678'
             and (select antes ->> 'nombre' from lead_eventos where lead_id = :online and tipo = 'ficha') = 'Venta Online'
             and (select nombre from leads where id = :online) = 'Juan Pérez'
            then 'ok' else 'not ok' end || ' 5 - «Guardar cambios» deja un solo registro con cada antes y después';

-- Conflicto: el asesor vio otro valor del que hay ahora
select case when lead_guardar_ficha(:online, '{"ciudad": "Palmira, Valle"}', '{"ciudad": "Cali"}') -> 'conflictos' ->> 'ciudad' = 'Cali, Valle del Cauca'
             and (select atributos ->> 'ciudad' from leads where id = :online) = 'Cali, Valle del Cauca'
             and lead_guardar_ficha(:online, '{"ciudad": "Palmira, Valle"}', '{"ciudad": "Cali"}', true) -> 'atributos' ->> 'ciudad' = 'Palmira, Valle'
            then 'ok' else 'not ok' end || ' 6 - si otro cambió el dato, avisa y no guarda; con «conservar el mío», guarda';

-- Tareas automáticas al pasar a Alistamiento (RL-22)
select mover_oportunidad(:op_online, :alistamiento) \g /dev/null
select mover_oportunidad(:op_tienda, :alistamiento) \g /dev/null
select case when (select string_agg(tipo, ', ' order by tipo) from seguimientos where lead_id = :online) = 'Alistar equipo, Despachar, Enviar guía al cliente'
             and (select string_agg(tipo, ', ') from seguimientos where lead_id = :tienda) = 'Entregar en tienda'
            then 'ok' else 'not ok' end || ' 7 - Alistamiento crea las tareas de despacho (online) o de entrega en tienda';

select case when pg_temp.falla(format($q$select lead_guardar_ficha(%s, '{"descuento": "5 %%"}', '{}')$q$, :online))
            then 'ok' else 'not ok' end || ' 8 - no se guarda un atributo archivado';

reset role;
rollback;

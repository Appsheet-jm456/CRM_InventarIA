-- 0039 · Bot de ejemplo «Datos de despacho» (F4·34, RF-29), ya dibujado y publicado para que el dueño lo ajuste.
-- Se arma con las mismas funciones del lienzo, firmadas por el primer administrador activo. Si no hay administrador o el bot ya
-- existe, no hace nada. No lo conecta a la compra: eso lo elige el dueño en Configuración → Agente → Compra.

do $$
declare admin uuid; b bigint; q text; i int;
  preguntas text[][] := array[
    ['Nombre completo', 'nombre_completo', 'Para despachar tu pedido necesito unos datos 📦' || chr(10) || '¿Cuál es tu *nombre completo*?',
     'Escríbeme tu nombre completo, por favor 🙏'],
    ['Cédula', 'cedula', '¿Tu número de *cédula*?', 'La cédula va solo con números 🙏 ¿Me la escribes de nuevo?'],
    ['Celular', 'celular', '¿Un *celular* de contacto para la transportadora?', 'El celular tiene 10 números y empieza por 3 🙏 ¿Me lo escribes de nuevo?'],
    ['Correo', 'correo_para_la_factura', '¿Tu *correo*? Ahí te llega la factura.', 'Ese correo no parece completo (le falta la @ o el dominio) 🙏'],
    ['Ciudad', 'ciudad', '¿En qué *ciudad y departamento* lo recibes?', 'Escríbeme la ciudad y el departamento, por favor 🙏'],
    ['Dirección', 'direccion_entrega', '¿Cuál es la *dirección de entrega*? Agrega barrio, apartamento o indicaciones.', 'Escríbeme la dirección completa, por favor 🙏']];
begin
  select u.id into admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo order by u.creado_en limit 1;
  if admin is null or exists (select 1 from bots where nombre = 'Datos de despacho') then
    return;
  end if;
  if exists (select 1 from unnest(array['nombre_completo', 'cedula', 'celular', 'correo_para_la_factura', 'ciudad', 'direccion_entrega', 'venta_online']) k
             where not exists (select 1 from lead_atributos a where a.clave = k and a.archivado_en is null)) then
    return;  -- sin los datos de F4·33 el ejemplo no tiene dónde guardar
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);

  b := crear_bot('Datos de despacho');
  -- Seis preguntas en dos filas
  for i in 1..6 loop
    q := borrador_crear_cuadro('pregunta', 300 * (((i - 1) % 3) + 1), case when i <= 3 then 0 else 260 end, b);
  end loop;
  perform borrador_crear_mensaje(1200, 120, b);  -- M1: confirmar
  for i in 1..6 loop
    perform borrador_guardar_pregunta('Q' || i, preguntas[i][1], preguntas[i][3], preguntas[i][2], preguntas[i][4],
                                      case when i < 6 then 'Q' || (i + 1) else 'M1' end, null, null, 1800, b);
  end loop;
  perform borrador_guardar_cuadro('M1', 'Confirmar datos',
    'Confirma tus datos 👇' || chr(10) || '👤 {nombre_completo}' || chr(10) || '🪪 CC {cedula}' || chr(10) || '📱 {celular}' || chr(10)
    || '✉️ {correo_para_la_factura}' || chr(10) || '📍 {direccion_entrega}, {ciudad}' || chr(10) || chr(10) || '¿Están bien?',
    '[{"id":"1","titulo":"Sí, están bien","destino":"B-ASESOR"},{"id":"2","titulo":"Corregir","destino":"Q1"}]', b);
  perform borrador_guardar_cuadro('B00', 'Comprobante recibido',
    '✅ Recibimos tu comprobante. ¿Cómo recibes tu equipo?',
    '[{"id":"1","titulo":"Envío a domicilio","destino":"Q1","marcar":{"venta_online":true}},'
    '{"id":"2","titulo":"Recojo en tienda","destino":"B-ASESOR","marcar":{"venta_online":false}}]', b);
  perform borrador_guardar_cuadro('B-ASESOR', null,
    '{motivo}🙌 ¡Listo! Un asesor valida tu pago y te escribe por aquí para coordinar la entrega.' || chr(10) || chr(10) || '{horario}', null, b);
  perform borrador_mover('B-ASESOR', 1500, 120, b);
  perform publicar_borrador('Ejemplo de F4·34: pide los datos de despacho después del pago', false, b);
  perform set_config('request.jwt.claims', '', true);
end $$;

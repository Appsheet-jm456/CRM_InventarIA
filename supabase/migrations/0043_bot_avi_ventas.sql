-- 0043 · Bot «Avi Ventas» (F4·39): el flujo del Salesbot de Kommo en el CRM, con Menú guiado + Avi + Asesor.
-- Bienvenida → Productos → Portátiles Usados → Marcas → Catálogo → Avi → compra o asesor.
-- Se arma con las mismas funciones del lienzo, firmadas por el primer administrador activo, y queda en BORRADOR: no atiende a nadie
-- ni cambia el bot principal. Los catálogos quedan sin elegir: el dueño los carga en Inventario → Catálogos, los elige y publica.
-- Si no hay administrador o el bot ya existe, no hace nada.

do $$
declare admin uuid; b bigint; f bigint; productos text; c_marcas text; avi text; distrib text; i int; cat text; cats text[] := '{}';
  nota text := E'\n\n💡 Recuerda: los precios del catálogo son *precios de distribución*. Para cliente final, cada equipo suma *$80.000* por la configuración.'
    || E'\n\n👥 Únete a la comunidad de Ventas Virtuales en WhatsApp:\nhttps://whatsapp.com/channel/0029VaD7DstGE56qZWxnkp36';
  -- nombre del cuadro, primera línea del encabezado
  catalogos text[][] := array[
    ['Catálogo Lenovo', '📎 Te envío el catálogo de portátiles *Lenovo*:'],
    ['Catálogo Dell', '📎 Te envío el catálogo de portátiles *Dell*:'],
    ['Catálogo HP', '📎 Te envío el catálogo de portátiles *HP*:'],
    ['Catálogo Gaming', '📎 Te envío el catálogo de portátiles *Gaming*:'],
    ['Catálogo Unificado', '📎 Te envío el catálogo con *todos nuestros portátiles usados*:']];
begin
  select u.id into admin from usuarios u join roles r on r.id = u.rol_id where r.nombre = 'administrador' and u.activo order by u.creado_en limit 1;
  if admin is null or exists (select 1 from bots where nombre = 'Avi Ventas') then
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);

  b := crear_bot('Avi Ventas');
  select id into f from bot_flujos where bot_id = b and estado = 'borrador';

  productos := borrador_crear_mensaje(380, 0, b);
  c_marcas := borrador_crear_mensaje(760, -120, b);
  for i in 1..5 loop
    cats := cats || borrador_crear_cuadro('catalogo', 1140, -480 + (i - 1) * 230, b);
  end loop;
  avi := borrador_crear_cuadro('agente', 1520, -120, b);
  distrib := borrador_crear_cuadro('ir_bot', 380, 520, b);
  perform borrador_mover('B-ASESOR', 760, 520, b);

  perform borrador_guardar_ajustes(distrib, 'Bot Distribuidor',
    jsonb_build_object('bot_id', (select id from bots where nombre = 'Distribuidor' and not archivado)), b);

  -- Avi: desde el catálogo conversa, verifica precios en la base y lleva a la compra o al asesor (RF-36 a RF-38).
  perform borrador_guardar_agente(avi, 'Avi: resuelve y cierra',
    E'🔎 Cuando veas el que te gusta, envíame su *código* (ej. 100-102-1007-3) o cuéntame qué buscas, y te confirmo disponibilidad y precio. ✅\n\n💬 Escribe *asesor* si prefieres hablar con una persona.',
    'El cliente acaba de recibir un catálogo de portátiles usados. Resuelve sus dudas sobre los equipos, dale la ficha cuando te dé un código y llévalo a comprar. '
    || 'Si pide un descuento, una condición especial o algo que no puedes verificar, pásalo a un asesor.',
    null, 12, null, 'B-ASESOR', 'B00', null, b);

  for i in 1..5 loop
    perform borrador_guardar_catalogo(cats[i], catalogos[i][1], catalogos[i][2] || nota, null, avi, b);
  end loop;

  -- Bienvenida
  perform borrador_guardar_cuadro('B00', 'Bienvenida',
    E'¡Hola! 👋 Bienvenido a *Ventas Virtuales Colombia*, distribuidores al por mayor y detal de equipos de cómputo en Cali.\nSoy *Avi*, el asistente de Ventas Virtuales 🤖 ¿En qué te podemos ayudar hoy?\n\n_También puedes escribirme lo que buscas, por ejemplo: "Dell i5 de décima"._',
    jsonb_build_array(
      jsonb_build_object('id', '1', 'titulo', 'Productos', 'destino', productos),
      jsonb_build_object('id', '2', 'titulo', 'Distribuidores', 'destino', distrib),
      jsonb_build_object('id', '3', 'titulo', 'Servicio al cliente', 'destino', 'B-ASESOR')), b);

  -- Lista de productos (el 9 está reservado para pasar a asesor: «Otros» es el 10)
  perform borrador_guardar_cuadro(productos, 'Productos',
    E'💻 ¡Perfecto! ¿Qué producto estás buscando?\nTe envío la lista de productos de nuestro portafolio.',
    jsonb_build_array(
      jsonb_build_object('id', '1', 'titulo', 'Portátiles Usados', 'destino', c_marcas),
      jsonb_build_object('id', '2', 'titulo', 'Portátiles Nuevos', 'destino', 'B-ASESOR'),
      jsonb_build_object('id', '3', 'titulo', 'Portátiles Gamer', 'destino', 'B-ASESOR'),
      jsonb_build_object('id', '4', 'titulo', 'Computadores Escritorio', 'destino', 'B-ASESOR'),
      jsonb_build_object('id', '5', 'titulo', 'Monitores', 'destino', 'B-ASESOR'),
      jsonb_build_object('id', '6', 'titulo', 'Impresoras', 'destino', 'B-ASESOR'),
      jsonb_build_object('id', '7', 'titulo', 'Accesorios', 'destino', 'B-ASESOR'),
      jsonb_build_object('id', '8', 'titulo', 'Tablet', 'destino', 'B-ASESOR'),
      jsonb_build_object('id', '10', 'titulo', 'Otros', 'destino', 'B-ASESOR'),
      jsonb_build_object('id', '0', 'titulo', 'Volver al menú', 'destino', 'B00')), b);

  -- Lista de marcas
  perform borrador_guardar_cuadro(c_marcas, 'Marcas',
    E'💻 ¿De qué marca prefieres ver los portátiles?\nSelecciona la opción de tu preferencia para enviarte el catálogo correspondiente de nuestro portafolio comercial.',
    jsonb_build_array(
      jsonb_build_object('id', '1', 'titulo', 'Lenovo', 'destino', cats[1]),
      jsonb_build_object('id', '2', 'titulo', 'Dell', 'destino', cats[2]),
      jsonb_build_object('id', '3', 'titulo', 'HP', 'destino', cats[3]),
      jsonb_build_object('id', '4', 'titulo', 'Gaming varios', 'destino', cats[4]),
      jsonb_build_object('id', '5', 'titulo', 'Catálogo Unificado', 'destino', cats[5]),
      jsonb_build_object('id', '0', 'titulo', 'Volver al menú', 'destino', productos)), b);

  -- Textos del asesor sin la línea de prueba que trae la copia del principal
  perform borrador_guardar_cuadro('B-ASESOR', null,
    E'{motivo}👤 ¡Entendido! En breve un asesor de *Ventas Virtuales Colombia* te atenderá personalmente. 😊\n\n{horario}', null, b);
  perform borrador_guardar_cuadro('B-CERRADO', null,
    E'{motivo}¡Entendido! 🙌 Ahora estamos fuera de horario, pero tu chat ya quedó en la fila: un asesor de *Ventas Virtuales Colombia* te responde {proxima}.\n\n{horario}', null, b);

  -- Lo que las funciones del lienzo no reciben: descripción de la lista, palabras y lo que se anota al elegir (etiqueta, categoría, marca).
  -- El lienzo lo conserva al editar el cuadro.
  update bot_cuadros c set opciones = (
    select jsonb_agg(o || coalesce(x.extra, '{}') order by n)
    from jsonb_array_elements(c.opciones) with ordinality t(o, n)
    left join lateral (select e.extra from (values
      ('B00', '1', '{"palabras": ["producto", "productos", "portatil", "portatiles", "torre", "torres"]}'::jsonb),
      ('B00', '2', '{"efectos": {"etiqueta": "Interes-Distribuidor"}, "palabras": ["distribuidor", "distribuidores", "mayorista", "al por mayor"]}'),
      ('B00', '3', '{"efectos": {"etiqueta": "Interes-Soporte"}, "palabras": ["servicio", "servicio al cliente", "garantia", "soporte", "soporte tecnico"]}'),
      (productos, '1', '{"descripcion": "Corporativos Lenovo, Dell, HP", "efectos": {"campos": {"Categoría interés": "Portátiles"}, "etiqueta": "Interes-Productos"}, "palabras": ["usado", "usados", "portatil", "portatiles", "laptop", "laptops"]}'),
      (productos, '2', '{"descripcion": "Equipos nuevos", "efectos": {"campos": {"Categoría interés": "Portátiles nuevos"}, "etiqueta": "Interes-Productos"}, "palabras": ["nuevo", "nuevos"]}'),
      (productos, '3', '{"descripcion": "Equipos de alto rendimiento y gamer", "efectos": {"campos": {"Categoría interés": "Portátiles gamer"}, "etiqueta": "Interes-Productos"}, "palabras": ["gamer", "gaming"]}'),
      (productos, '4', '{"descripcion": "Torres SFF, Tinys, Torres Gamer", "efectos": {"campos": {"Categoría interés": "Escritorio"}, "etiqueta": "Interes-Productos"}, "palabras": ["escritorio", "torre", "torres", "tiny", "sff"]}'),
      (productos, '5', '{"efectos": {"campos": {"Categoría interés": "Monitores"}, "etiqueta": "Interes-Productos"}, "palabras": ["monitor"]}'),
      (productos, '6', '{"efectos": {"campos": {"Categoría interés": "Impresoras"}, "etiqueta": "Interes-Productos"}, "palabras": ["impresora"]}'),
      (productos, '7', '{"efectos": {"campos": {"Categoría interés": "Accesorios"}, "etiqueta": "Interes-Productos"}, "palabras": ["accesorio"]}'),
      (productos, '8', '{"efectos": {"campos": {"Categoría interés": "Tablet"}, "etiqueta": "Interes-Productos"}, "palabras": ["tablets"]}'),
      (productos, '10', '{"efectos": {"campos": {"Categoría interés": "Otros"}, "etiqueta": "Interes-Productos"}, "palabras": ["otro"]}'),
      (c_marcas, '1', '{"descripcion": "Línea Yoga, T, P y corporativas", "efectos": {"campos": {"Marca interés": "Lenovo"}, "etiqueta": "Catalogo-Enviado"}}'),
      (c_marcas, '2', '{"descripcion": "Latitude, Precision, Inspiron", "efectos": {"campos": {"Marca interés": "Dell"}, "etiqueta": "Catalogo-Enviado"}}'),
      (c_marcas, '3', '{"descripcion": "EliteBook, ProBook y más", "efectos": {"campos": {"Marca interés": "HP"}, "etiqueta": "Catalogo-Enviado"}}'),
      (c_marcas, '4', '{"descripcion": "Equipos Acer, Gigabyte, MSI", "efectos": {"campos": {"Marca interés": "Gaming"}, "etiqueta": "Catalogo-Enviado"}, "palabras": ["gaming", "gamer"]}'),
      (c_marcas, '5', '{"descripcion": "Catálogo completo unificado", "efectos": {"campos": {"Marca interés": "Todas"}, "etiqueta": "Catalogo-Enviado"}, "palabras": ["todas", "todos", "unificado"]}')
    ) e(clave, id, extra) where e.clave = c.clave and e.id = o->>'id') x on true)
  where c.flujo_id = f and c.clave in ('B00', productos, c_marcas);

  perform set_config('request.jwt.claims', '', true);
end $$;

-- F4·74: atributo «Táctil» (Sí / No) para el filtro dinámico de Inventario → Equipos.
-- Va en productos.atributos.tactil, como los demás atributos (F4·41). Sin dato no cuenta como No.
-- La 0083 queda reservada a F4·69 (segundo número).
insert into public.producto_atributos (clave, nombre, tipo, emoji, orden, opciones) values
  ('tactil', 'Táctil', 'si_no', '👆', 6, '[]')
on conflict (clave) do nothing;

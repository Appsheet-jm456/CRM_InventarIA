-- 0078 · F4·72 Carrito del asesor (docs/CARRITO-DEL-ASESOR.md, RCA-01 a RCA-10).
-- El asesor arma en la Ficha un carrito para el cliente (equipos con stock y renglones libres, precios con permiso) y lo envía:
-- el receptor arma la compra en el paso «confirmar» y el cliente responde Sí → cuentas, como la compra de siempre.
--
-- · Permiso nuevo `modificar_precios` (RCA-04), para el administrador.
-- · Tabla `carritos`: un renglón por cliente. Sin acceso directo: todo por las funciones (como `pagos`).
-- · carrito_de(lead): el carrito con stock y precio de la base al día, el cargo de configuración y si quien pide puede cambiar precios.
-- · carrito_guardar(lead, items, tipo, sin_configuracion): valida y guarda. Cada cambio de precio queda en el historial.
-- · carrito_enviar(lead): 24 h, stock, sin pago en curso; deja el chat al bot con «vuelve a mí» (como un flujo de F4·61).
-- · carrito_inventario(): los equipos con stock para el buscador del carrito.

insert into public.permisos (codigo, descripcion)
values ('modificar_precios', 'Carrito del asesor: cambiar el precio de un equipo del inventario (queda en el historial)');
insert into public.rol_permisos (rol_id, permiso)
select r.id, 'modificar_precios' from roles r where r.nombre = 'administrador';

create table public.carritos (
  lead_id            bigint primary key references public.leads (id) on delete cascade,
  items              jsonb  not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 10),
  tipo               text   check (tipo in ('Cliente final', 'Distribuidor')),
  sin_configuracion  boolean not null default false,
  actualizado_por    uuid references public.usuarios (id) on delete set null,
  actualizado_en     timestamptz not null default now(),
  enviado_por        uuid references public.usuarios (id) on delete set null,
  enviado_en         timestamptz
);
alter table public.carritos enable row level security;
revoke all on public.carritos from anon, authenticated;
comment on table public.carritos is 'F4·72: carrito que arma el asesor para el cliente (RCA-01). Se lee y escribe solo con carrito_de / carrito_guardar / carrito_enviar.';

-- La regla de la configuración es la de la compra del bot (flujo.lleva_configuracion, F4·48): todo lo que no empiece por «nuevo».
create or replace function public.carrito_lleva_configuracion(p_estado text) returns boolean
language sql immutable
as $$ select not lower(btrim(coalesce(p_estado, ''))) like 'nuevo%' $$;

-- El carrito con los datos al día: stock y precio de la base de cada equipo, cargo y totales.
create or replace function public.carrito_armar(p_lead bigint) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare c carritos; items jsonb := '[]'; i jsonb; p productos; tipo text; cargo numeric := 0; suma numeric := 0; usados boolean := false;
        valor_cargo numeric;
begin
  select * into c from carritos where lead_id = p_lead;
  select coalesce(c.tipo, (select atributos ->> 'tipo_cliente' from leads where id = p_lead)) into tipo;
  if tipo not in ('Cliente final', 'Distribuidor') then tipo := null; end if;
  for i in select * from jsonb_array_elements(coalesce(c.items, '[]')) loop
    if coalesce((i ->> 'libre')::boolean, false) then
      items := items || jsonb_build_array(i);
    else
      select * into p from productos where upper(codigo) = upper(i ->> 'codigo');
      items := items || jsonb_build_array(i || jsonb_build_object(
        'stock', coalesce(p.stock, 0), 'precio_base', p.precio, 'estado', p.estado,
        'usado', carrito_lleva_configuracion(p.estado)));
      usados := usados or (found and carrito_lleva_configuracion(p.estado));
    end if;
    suma := suma + coalesce((i ->> 'precio')::numeric, 0);
  end loop;
  select cargo_configuracion into valor_cargo from agente_config limit 1;
  if tipo = 'Cliente final' and usados and not coalesce(c.sin_configuracion, false) then
    cargo := coalesce(valor_cargo, 0);
  end if;
  return jsonb_build_object(
    'items', items, 'tipo', tipo, 'sin_configuracion', coalesce(c.sin_configuracion, false),
    'aplica_configuracion', tipo = 'Cliente final' and usados, 'valor_configuracion', coalesce(valor_cargo, 0),
    'cargo', cargo, 'subtotal', suma, 'total', suma + cargo,
    'enviado_en', c.enviado_en, 'enviado_por', (select nombre from usuarios where id = c.enviado_por),
    'actualizado_en', c.actualizado_en, 'actualizado_por', (select nombre from usuarios where id = c.actualizado_por));
end $$;
revoke all on function public.carrito_armar(bigint) from public, anon, authenticated;

create or replace function public.carrito_de(p_lead bigint) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('atender_bandeja');
  if not puede_ver_lead(p_lead) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  return carrito_armar(p_lead) || jsonb_build_object('puede_precios', tiene_permiso('modificar_precios'));
end $$;

create or replace function public.carrito_inventario() returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('atender_bandeja');
  return coalesce((select jsonb_agg(jsonb_build_object(
      'codigo', p.codigo, 'equipo', btrim(coalesce(p.marca, '') || ' ' || coalesce(p.modelo, '')), 'precio', p.precio,
      'estado', p.estado, 'stock', p.stock,
      'detalle', concat_ws(' · ', nullif(btrim(p.procesador), ''), nullif(btrim(p.ram), ''), nullif(btrim(p.almacenamiento), '')))
      order by p.marca, p.modelo, p.codigo)
    from productos p where p.stock > 0 and coalesce(p.codigo, '') <> ''), '[]');
end $$;

-- p_items: [{codigo, precio}] del inventario y [{libre: true, equipo, precio}] fuera de él.
create or replace function public.carrito_guardar(p_lead bigint, p_items jsonb, p_tipo text, p_sin_configuracion boolean) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; antes jsonb; i jsonb; p productos; limpio jsonb := '[]'; precio numeric; nombre_libre text; quien text; previo numeric;
        vistos text[] := '{}'; libres int := 0; puede boolean := tiene_permiso('modificar_precios');
begin
  perform exigir_permiso('atender_bandeja');
  l := lead_a_cargo(p_lead);
  if jsonb_typeof(coalesce(p_items, '[]')) <> 'array' or jsonb_array_length(coalesce(p_items, '[]')) > 10 then
    raise exception 'El carrito lleva máximo 10 productos.';
  end if;
  if p_tipo is not null and p_tipo not in ('Cliente final', 'Distribuidor') then
    raise exception 'Tipo de cliente: «Cliente final» o «Distribuidor».';
  end if;
  select items into antes from carritos where lead_id = p_lead;
  select u.nombre into quien from usuarios u where id = auth.uid();
  for i in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    precio := round(coalesce((i ->> 'precio')::numeric, 0));
    if precio <= 0 or precio >= 1000000000 then
      raise exception 'Cada producto necesita un precio mayor que cero.';
    end if;
    if coalesce((i ->> 'libre')::boolean, false) then
      nombre_libre := btrim(coalesce(i ->> 'equipo', ''));
      if nombre_libre = '' or length(nombre_libre) > 80 then
        raise exception 'Escribe el nombre del producto (máximo 80 caracteres).';
      end if;
      libres := libres + 1;
      limpio := limpio || jsonb_build_array(jsonb_build_object('libre', true, 'codigo', 'LIBRE-' || libres, 'equipo', nombre_libre, 'precio', precio));
    else
      select * into p from productos where upper(codigo) = upper(btrim(coalesce(i ->> 'codigo', '')));
      if not found then
        raise exception 'El código % no está en el inventario.', i ->> 'codigo';
      end if;
      if upper(p.codigo) = any(vistos) then
        raise exception 'El equipo % ya está en el carrito.', p.codigo;
      end if;
      vistos := vistos || upper(p.codigo);
      -- RCA-04: sin el permiso, el precio es el de la base
      if precio <> round(p.precio) and not puede then
        raise exception 'Tu rol no puede cambiar precios (permiso «modificar_precios»): % va a %.', p.codigo, pesos_texto(p.precio);
      end if;
      select (x ->> 'precio')::numeric into previo from jsonb_array_elements(coalesce(antes, '[]')) x
       where upper(x ->> 'codigo') = upper(p.codigo) limit 1;
      if precio <> round(p.precio) and precio is distinct from previo then
        perform lead_evento(p_lead, 'herramienta', null, jsonb_build_object('codigo', p.codigo, 'base', p.precio, 'precio', precio),
                            format('💲 Precio en el carrito de %s (%s): %s → %s, por %s', btrim(p.marca || ' ' || p.modelo), p.codigo,
                                   pesos_texto(p.precio), pesos_texto(precio), coalesce(quien, 'un usuario')));
      end if;
      limpio := limpio || jsonb_build_array(jsonb_build_object('codigo', p.codigo, 'equipo', btrim(coalesce(p.marca, '') || ' ' || coalesce(p.modelo, '')),
                                                               'precio', precio));
    end if;
  end loop;
  insert into carritos (lead_id, items, tipo, sin_configuracion, actualizado_por, actualizado_en)
  values (p_lead, limpio, p_tipo, coalesce(p_sin_configuracion, false), auth.uid(), now())
  on conflict (lead_id) do update set items = excluded.items, tipo = excluded.tipo, sin_configuracion = excluded.sin_configuracion,
                                      actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en;
  return carrito_armar(p_lead) || jsonb_build_object('puede_precios', puede);
end $$;

create or replace function public.carrito_enviar(p_lead bigint) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; c jsonb; ultimo timestamptz; i jsonb; agotados text[] := '{}'; quien text; paso text;
begin
  perform exigir_permiso('atender_bandeja');
  l := lead_a_cargo(p_lead);
  c := carrito_armar(p_lead);
  if jsonb_array_length(c -> 'items') = 0 then
    raise exception 'El carrito está vacío.';
  end if;
  if c ->> 'tipo' is null then
    raise exception 'Elige si es cliente final o distribuidor.';
  end if;
  -- RCA-07: solo dentro de las 24 h de WhatsApp.
  select max(creado_en) into ultimo from mensajes where lead_id = p_lead and lado = 'cliente';
  if ultimo is null or ultimo < now() - interval '24 hours' then
    raise exception 'Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo deja escribirle con una plantilla.';
  end if;
  for i in select * from jsonb_array_elements(c -> 'items') loop
    if not coalesce((i ->> 'libre')::boolean, false) and coalesce((i ->> 'stock')::int, 0) <= 0 then
      agotados := agotados || (i ->> 'equipo') || ' (' || (i ->> 'codigo') || ')';
    end if;
  end loop;
  if cardinality(agotados) > 0 then
    raise exception 'Sin stock: %. Quítalo del carrito antes de enviar.', array_to_string(agotados, ', ');
  end if;
  -- RCA-10: no se pisa un pago en curso.
  paso := l.estado_bot -> 'compra' ->> 'paso';
  if paso in ('esperando_pago', 'pago_por_confirmar') then
    raise exception 'El cliente ya tiene una compra esperando pago o por validar: termínala o cancélala antes de enviar otro carrito.';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  -- RCA-06 y RCA-07: queda el tipo en la ficha y el bot hace el tramo; al pasar a asesor vuelve a quien envió (24 h).
  update leads set estado_chat = 'bot', pausar_bot = false, asignado_a = null, errores_bot = 0, retorno_pendiente = null,
                   atributos = coalesce(atributos, '{}'::jsonb) || jsonb_build_object('tipo_cliente', c ->> 'tipo'),
                   estado_bot = coalesce(estado_bot, '{}'::jsonb) || jsonb_build_object('volver_a',
                                  jsonb_build_object('usuario', auth.uid(), 'hasta', now() + interval '24 hours'))
   where id = p_lead;
  update carritos set enviado_por = auth.uid(), enviado_en = now() where lead_id = p_lead;
  perform lead_evento(p_lead, 'herramienta', null, jsonb_build_object('items', c -> 'items', 'total', c -> 'total', 'cargo', c -> 'cargo'),
                      format('🛒 Carrito enviado por %s: %s producto(s) · total %s', coalesce(quien, 'un usuario'),
                             jsonb_array_length(c -> 'items'), pesos_texto((c ->> 'total')::numeric)));
  return jsonb_build_object('usuario', auth.uid(), 'total', c -> 'total', 'productos', jsonb_array_length(c -> 'items'));
end $$;

revoke all on function public.carrito_de(bigint) from public, anon;
revoke all on function public.carrito_inventario() from public, anon;
revoke all on function public.carrito_guardar(bigint, jsonb, text, boolean) from public, anon;
revoke all on function public.carrito_enviar(bigint) from public, anon;
grant execute on function public.carrito_de(bigint) to authenticated;
grant execute on function public.carrito_inventario() to authenticated;
grant execute on function public.carrito_guardar(bigint, jsonb, text, boolean) to authenticated;
grant execute on function public.carrito_enviar(bigint) to authenticated;

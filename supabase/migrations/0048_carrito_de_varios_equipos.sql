-- 0048 · Carrito: comprar varios equipos en un pedido (F4·44)
--
-- Diseño: docs/AGENTE.md §4f (RAG-54 a RAG-62).
-- RAG-54: Agente → Compra → Carrito (columnas carrito_* de agente_config; la casilla nace apagada).
-- RAG-55: cuadro 🛒 Carrito en el lienzo (tipo «carrito», clave K1, K2…): empieza la compra con carrito desde un bot dibujado.
--         Salidas opcionales: «listo» (después del comprobante sigue aquí) y «asesor» (pidió asesor o no avanza).
-- El motor está en herramientas/meta-webhook-prueba/compra.py.

-- --------------------------------------------------------------------------- --
-- Ajustes del carrito (RAG-54)
-- --------------------------------------------------------------------------- --
alter table public.agente_config
  add column carrito_activo boolean not null default false,
  add column carrito_max integer not null default 5 check (carrito_max between 2 and 10),
  add column carrito_texto_otro text not null default '¿Quieres agregar otro equipo a tu pedido? 🛒 Llevas {n}.'
    check (length(carrito_texto_otro) between 1 and 1024),
  add column carrito_texto_pedir text not null default 'Escríbeme el *código* o el *modelo* del otro equipo 👇'
    check (length(carrito_texto_pedir) between 1 and 1024),
  add column carrito_texto_maximo text not null default 'Llegaste al máximo de {max} equipos por pedido 🙌'
    check (length(carrito_texto_maximo) between 1 and 1024),
  add column carrito_encabezado text not null default '🛒 *Resumen de tu pedido*'
    check (length(carrito_encabezado) between 1 and 300);
comment on column public.agente_config.carrito_activo is 'F4·44 (RAG-54): la compra pregunta «¿otro equipo?» y arma un pedido de varios. Apagado: un solo equipo, como antes.';
comment on column public.agente_config.carrito_max is 'Máximo de equipos por pedido (2 a 10).';
comment on column public.agente_config.carrito_texto_otro is 'Pregunta «¿otro equipo?». Marcas: {n} (equipos en el pedido), {nombre}.';
comment on column public.agente_config.carrito_texto_pedir is 'Lo que pide al decir «Sí, agregar otro».';
comment on column public.agente_config.carrito_texto_maximo is 'Aviso al llegar al máximo. Marca: {max}.';
comment on column public.agente_config.carrito_encabezado is 'Primera línea del resumen del pedido.';
grant select (carrito_activo, carrito_max, carrito_texto_otro, carrito_texto_pedir, carrito_texto_maximo, carrito_encabezado),
      update (carrito_activo, carrito_max, carrito_texto_otro, carrito_texto_pedir, carrito_texto_maximo, carrito_encabezado)
  on public.agente_config to authenticated;

-- --------------------------------------------------------------------------- --
-- Cuadro 🛒 Carrito (RAG-55)
-- --------------------------------------------------------------------------- --
alter table public.bot_cuadros drop constraint bot_cuadros_tipo_check;
alter table public.bot_cuadros add constraint bot_cuadros_tipo_check check (tipo in (
  'mensaje', 'presupuesto', 'marca', 'equipos', 'ficha', 'asesor', 'aviso', 'ir_bot', 'condicion', 'catalogo', 'pausa', 'pregunta', 'agente',
  'carrito'));

create or replace function public.tipo_del_dueno(p_tipo text) returns boolean
language sql immutable
as $$ select p_tipo in ('mensaje', 'ir_bot', 'condicion', 'catalogo', 'pausa', 'pregunta', 'agente', 'carrito') $$;

-- Las dos salidas del Carrito son opcionales: sin unir, después del comprobante sigue lo de Agente → Compra y el asesor recibe el chat.
create or replace function public.salidas_opcionales(p_tipo text, p_opciones jsonb) returns text[]
language sql immutable
as $$
  select case
    when p_tipo = 'agente' then array['compra', 'asesor', 'menu', 'falla']
    when p_tipo = 'carrito' then array['listo', 'asesor']
    when p_tipo = 'pregunta' then array['sin_respuesta', 'no_logro']
    when p_tipo <> 'mensaje' then '{}'::text[]
    when coalesce(jsonb_array_length(p_opciones), 0) = 0 then array['sin_respuesta', 'error']
    else array['otra', 'sin_respuesta', 'error'] end
$$;

create or replace function public.rotulo_salida(p_salida text) returns text
language sql immutable
as $$
  select coalesce(('{"respuesta": "Cuando el cliente responda", "ninguna": "Ninguna se cumple", "siguiente": "Siguiente",
                     "respondio": "El cliente respondió", "tiempo": "Pasó el tiempo", "otra": "Otra respuesta",
                     "sin_respuesta": "Sin respuesta", "error": "Error al enviar el mensaje", "no_logro": "No logró responder",
                     "compra": "Inició compra", "asesor": "Pidió asesor o no avanza", "menu": "Volvió al menú",
                     "falla": "Error del cerebro", "listo": "Pedido pagado (comprobante recibido)"}'::jsonb) ->> p_salida, p_salida)
$$;

-- Texto de entrada y las dos salidas.
create function public.borrador_guardar_carrito(p_clave text, p_nombre text, p_texto text, p_listo text, p_asesor text,
                                                p_bot bigint default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros; f bot_flujos; s record;
begin
  perform exigir_permiso('administrar_bot');
  f := borrador_del_flujo(bot_editable(p_bot));
  c := cuadro_del_borrador(p_clave, f.bot_id);
  if c.tipo <> 'carrito' then
    raise exception 'Este cuadro no es un carrito.';
  end if;
  if length(coalesce(p_texto, '')) > 1024 then
    raise exception 'El mensaje de entrada tiene máximo 1.024 caracteres.';
  end if;
  for s in select * from (values ('listo', p_listo), ('asesor', p_asesor)) x(salida, destino) loop
    if s.destino is not null and (not destino_valido(f.id, s.destino) or s.destino = c.clave) then
      raise exception '«%» lleva a un cuadro que no existe, al que no se puede ir directo o al mismo carrito.', rotulo_salida(s.salida);
    end if;
  end loop;
  update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre), texto = btrim(coalesce(p_texto, '')),
                         salidas = jsonb_strip_nulls(jsonb_build_object('listo', p_listo, 'asesor', p_asesor)),
                         actualizado_por = auth.uid()
  where id = c.id;
end $$;
revoke execute on function public.borrador_guardar_carrito(text, text, text, text, text, bigint) from public, anon;
grant execute on function public.borrador_guardar_carrito(text, text, text, text, text, bigint) to authenticated;

-- "+ Agregar" → Carrito.
CREATE OR REPLACE FUNCTION public.borrador_crear_cuadro(p_tipo text, p_x integer, p_y integer, p_bot bigint DEFAULT NULL::bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare f bot_flujos; n integer; v_clave text;
begin
  perform exigir_permiso('administrar_bot');
  if p_tipo = 'mensaje' then
    return borrador_crear_mensaje(p_x, p_y, p_bot);
  end if;
  if p_tipo not in ('ir_bot', 'condicion', 'catalogo', 'pausa', 'pregunta', 'agente', 'carrito') or p_tipo is null then
    raise exception 'Ese tipo de cuadro no existe.';
  end if;
  f := borrador_del_flujo(bot_editable(p_bot));
  if p_tipo = 'ir_bot' then
    select coalesce(max(substring(k.clave from '^IR(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^IR\d+$';
    v_clave := 'IR' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, ajustes, x, y, actualizado_por)
    values (f.id, v_clave, 'ir_bot', 'Ir a otro bot ' || n, 950 + n, 'Lleva al cliente al inicio de otro bot.',
            'Lleva al cliente al inicio de otro bot.', 'sistema', '{"bot_id": null}', p_x, p_y, auth.uid());
  elsif p_tipo = 'agente' then
    select coalesce(max(substring(k.clave from '^A(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^A\d+$';
    v_clave := 'A' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, salidas, ajustes,
                             x, y, actualizado_por)
    values (f.id, v_clave, 'agente', 'Agente ' || n, 995 + n, 'Cuéntame, ¿en qué te puedo ayudar? 🙂', 'Cuéntame, ¿en qué te puedo ayudar? 🙂',
            'texto', '{}', '{"instruccion": "", "herramientas": null, "max_vueltas": 8}', p_x, p_y, auth.uid());
  elsif p_tipo = 'carrito' then
    select coalesce(max(substring(k.clave from '^K(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^K\d+$';
    v_clave := 'K' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, salidas, ajustes,
                             x, y, actualizado_por)
    values (f.id, v_clave, 'carrito', 'Carrito ' || n, 1000 + n, '🛒 ¡Perfecto! Armemos tu pedido.', '🛒 ¡Perfecto! Armemos tu pedido.',
            'texto', '{}', '{}', p_x, p_y, auth.uid());
  elsif p_tipo = 'pregunta' then
    select coalesce(max(substring(k.clave from '^Q(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^Q\d+$';
    v_clave := 'Q' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, salidas, ajustes,
                             x, y, actualizado_por)
    values (f.id, v_clave, 'pregunta', 'Pregunta ' || n, 990 + n, '¿Escribe aquí la pregunta?', '¿Escribe aquí la pregunta?', 'texto',
            '{"siguiente": null}',
            '{"atributo": null, "texto_error": "Esa respuesta no me sirve 🙏 ¿Me la escribes de nuevo?", "espera_segundos": 1800}',
            p_x, p_y, auth.uid());
  elsif p_tipo = 'pausa' then
    select coalesce(max(substring(k.clave from '^P(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^P\d+$';
    v_clave := 'P' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, salidas, ajustes,
                             x, y, actualizado_por)
    values (f.id, v_clave, 'pausa', 'Pausa ' || n, 980 + n, 'Espera a que el cliente responda.',
            'Espera a que el cliente responda.', 'sistema', '{"respondio": null, "tiempo": null}', '{"segundos": 900}',
            p_x, p_y, auth.uid());
  elsif p_tipo = 'catalogo' then
    select coalesce(max(substring(k.clave from '^CAT(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^CAT\d+$';
    v_clave := 'CAT' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, salidas, ajustes,
                             x, y, actualizado_por)
    values (f.id, v_clave, 'catalogo', 'Catálogos ' || n, 970 + n, 'Te envío nuestro catálogo 📚',
            'Te envío nuestro catálogo 📚', 'texto', '{"siguiente": null}', '{"catalogo_id": null}', p_x, p_y, auth.uid());
  else
    select coalesce(max(substring(k.clave from '^C(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^C\d+$';
    v_clave := 'C' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, opciones, opciones_original,
                             max_titulo, formato, salidas, x, y, actualizado_por)
    values (f.id, v_clave, 'condicion', 'Condiciones ' || n, 960 + n, 'Compara el último mensaje del cliente.',
            'Compara el último mensaje del cliente.', '[{"id":"1","titulo":"Condición 1","palabras":[],"destino":null}]',
            '[{"id":"1","titulo":"Condición 1","palabras":[],"destino":null}]', 40, 'sistema', '{"ninguna": null}',
            p_x, p_y, auth.uid());
  end if;
  return v_clave;
end $function$;

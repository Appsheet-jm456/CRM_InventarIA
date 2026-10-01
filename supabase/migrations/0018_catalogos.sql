-- 0018 · Cuadro Catálogos (F4·12, decisión 0027)
--
-- Diseño: docs/FLUJO-DEL-BOT.md (RF-12, RF-13). Envía un encabezado (texto, hasta 4.096) y el catálogo elegido de
-- Inventario → Catálogos (el PDF como documento o el enlace de Drive), y sigue en el acto por "siguiente".
-- El catálogo va en ajustes.catalogo_id. Para publicar debe existir y estar activo; si después se apaga o se borra,
-- el bot envía el encabezado con "catálogo no disponible" y sigue igual.

-- "+ Agregar" → Catálogos
create or replace function public.borrador_crear_cuadro(p_tipo text, p_x integer, p_y integer, p_bot bigint default null) returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare f bot_flujos; n integer; v_clave text;
begin
  perform exigir_permiso('administrar_bot');
  if p_tipo = 'mensaje' then
    return borrador_crear_mensaje(p_x, p_y, p_bot);
  end if;
  if p_tipo = 'pausa' then
    raise exception 'Ese cuadro llega en una próxima versión del lienzo.';
  end if;
  if p_tipo not in ('ir_bot', 'condicion', 'catalogo') or p_tipo is null then
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
end $$;

-- Nombre, encabezado, catálogo y a dónde sigue.
create function public.borrador_guardar_catalogo(p_clave text, p_nombre text, p_texto text, p_catalogo bigint,
                                                 p_siguiente text, p_bot bigint default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros; f bot_flujos;
begin
  perform exigir_permiso('administrar_bot');
  f := borrador_del_flujo(bot_editable(p_bot));
  c := cuadro_del_borrador(p_clave, f.bot_id);
  if c.tipo <> 'catalogo' then
    raise exception 'Este cuadro no es de catálogos.';
  end if;
  if length(btrim(coalesce(p_texto, ''))) = 0 then
    raise exception 'Escribe el encabezado: es lo que el cliente lee antes del catálogo.';
  end if;
  if p_catalogo is not null and not exists (select 1 from catalogos where id = p_catalogo) then
    raise exception 'Ese catálogo no existe.';
  end if;
  if p_siguiente is not null and (not destino_valido(f.id, p_siguiente) or p_siguiente = c.clave) then
    raise exception '«Siguiente» lleva a un cuadro que no existe o al que no se puede ir directo.';
  end if;
  update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre), texto = p_texto,
                         ajustes = jsonb_build_object('catalogo_id', p_catalogo),
                         salidas = jsonb_build_object('siguiente', p_siguiente), actualizado_por = auth.uid()
  where id = c.id;
end $$;

-- Los catálogos se guardan con su función.
create or replace function public.borrador_guardar_cuadro(p_clave text, p_nombre text, p_texto text, p_opciones jsonb,
                                                          p_bot bigint default null, p_salidas jsonb default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros; f bot_flujos; op jsonb; nuevas jsonb := '[]'; ids text[] := '{}'; previa jsonb; respuesta jsonb;
begin
  perform exigir_permiso('administrar_bot');
  f := borrador_del_flujo(bot_editable(p_bot));
  c := cuadro_del_borrador(p_clave, f.bot_id);
  if c.tipo = 'ir_bot' then
    raise exception 'Este cuadro se guarda con su bot de destino (borrador_guardar_ajustes).';
  end if;
  if c.tipo = 'condicion' then
    raise exception 'Este cuadro se guarda con sus condiciones (borrador_guardar_condiciones).';
  end if;
  if c.tipo = 'catalogo' then
    raise exception 'Este cuadro se guarda con su catálogo (borrador_guardar_catalogo).';
  end if;
  if c.tipo <> 'mensaje' then
    if p_opciones is not null and ((select array_agg(o->>'id' order by o->>'id') from jsonb_array_elements(p_opciones) o)
        is distinct from (select array_agg(o->>'id' order by o->>'id') from jsonb_array_elements(c.opciones) o)) then
      raise exception 'Los cuadros del sistema no cambian sus opciones: solo sus textos y títulos (RF-03).';
    end if;
    update bot_cuadros set
      texto = coalesce(p_texto, texto),
      opciones = case when p_opciones is null then opciones else
        (select jsonb_agg(o || jsonb_build_object('titulo', btrim(t->>'titulo')) order by n)
         from jsonb_array_elements(c.opciones) with ordinality as x(o, n)
         join jsonb_array_elements(p_opciones) t on t->>'id' = o->>'id') end,
      actualizado_por = auth.uid()
    where id = c.id;
    return;
  end if;

  p_opciones := coalesce(p_opciones, c.opciones, '[]');
  if jsonb_typeof(p_opciones) <> 'array' then
    raise exception 'Las opciones deben ser una lista.';
  end if;
  if jsonb_array_length(p_opciones) > 10 then
    raise exception 'WhatsApp permite hasta 10 opciones en una lista.';
  end if;
  for op in select * from jsonb_array_elements(p_opciones) loop
    if coalesce(op->>'id', '') !~ '^\d{1,2}$' or op->>'id' = any (ids) then
      raise exception 'Cada opción necesita un número distinto (0 a 99).';
    end if;
    if op->>'id' = '9' then
      raise exception 'El 9 está reservado: en cualquier punto pasa al cliente con un asesor.';
    end if;
    ids := ids || (op->>'id');
    if op->>'destino' is not null and not destino_valido(f.id, op->>'destino') then
      raise exception 'La opción "%" lleva a un cuadro que no existe o al que no se puede ir directo.', op->>'titulo';
    end if;
    select o into previa from jsonb_array_elements(c.opciones) o where o->>'id' = op->>'id';
    nuevas := nuevas || jsonb_strip_nulls(
      coalesce(previa, '{}') - 'titulo' - 'destino'
      || jsonb_build_object('id', op->>'id', 'titulo', btrim(coalesce(op->>'titulo', '')), 'destino', op->'destino'));
  end loop;

  if jsonb_array_length(nuevas) = 0 then
    respuesta := case when p_salidas ? 'respuesta' then p_salidas->'respuesta' else coalesce(c.salidas->'respuesta', 'null') end;
    if jsonb_typeof(respuesta) = 'string' and not destino_valido(f.id, respuesta #>> '{}') then
      raise exception '"Cuando el cliente responda" lleva a un cuadro que no existe o al que no se puede ir directo.';
    end if;
    update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre), texto = coalesce(p_texto, texto),
                           opciones = '[]', formato = 'texto', salidas = jsonb_build_object('respuesta', respuesta),
                           actualizado_por = auth.uid()
    where id = c.id;
  else
    update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre), texto = coalesce(p_texto, texto),
                           opciones = nuevas, formato = 'menu', salidas = '{}', actualizado_por = auth.uid()
    where id = c.id;
  end if;
end $$;

-- Qué impide publicar: además, que el catálogo exista y esté activo (RF-12).
create or replace function public.problemas_del_flujo(p_flujo bigint) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb := '[]';
  alcanzados text[];
  nuevos text[];
  medida jsonb;
  c bot_cuadros;
  s text;
  destino bots;
  cat catalogos;
  mi_bot bigint := (select bot_id from bot_flujos where id = p_flujo);
  rotulos jsonb := '{"respuesta": "Cuando el cliente responda", "ninguna": "Ninguna se cumple", "siguiente": "Siguiente", "respondio": "El cliente respondió", "tiempo": "Pasó el tiempo"}';
begin
  if (select count(*) from bot_cuadros where flujo_id = p_flujo and inicio) <> 1 then
    r := r || jsonb_build_object('clave', '', 'nombre', '', 'problema', 'El flujo necesita un único cuadro de inicio.');
  end if;
  select array_agg(clave) into alcanzados from bot_cuadros where flujo_id = p_flujo and inicio;
  loop
    select array_agg(distinct d) into nuevos from (
      select o->>'destino' as d from bot_cuadros k, jsonb_array_elements(coalesce(k.opciones, '[]')) o
      where k.flujo_id = p_flujo and k.clave = any (alcanzados)
      union
      select x.value from bot_cuadros k, jsonb_each_text(k.salidas) x
      where k.flujo_id = p_flujo and k.clave = any (alcanzados)
    ) x
    where d is not null and not (d = any (alcanzados))
      and exists (select 1 from bot_cuadros k where k.flujo_id = p_flujo and k.clave = d);
    exit when nuevos is null;
    alcanzados := alcanzados || nuevos;
  end loop;

  for c in select * from bot_cuadros where flujo_id = p_flujo order by orden loop
    if c.tipo = 'mensaje' then
      r := r || coalesce((
        select jsonb_agg(jsonb_build_object('clave', c.clave, 'nombre', c.nombre, 'problema',
                 case when o->>'destino' is null then format('La opción %s (%s) no lleva a ningún cuadro.', o->>'id', o->>'titulo')
                      else format('La opción %s (%s) lleva a un cuadro que no existe.', o->>'id', o->>'titulo') end))
        from jsonb_array_elements(coalesce(c.opciones, '[]')) o
        where o->>'destino' is null
           or (o->>'destino' <> '@pedir_codigo' and not destino_valido(p_flujo, o->>'destino'))), '[]');
    end if;
    if c.tipo = 'condicion' then
      r := r || coalesce((
        select jsonb_agg(jsonb_build_object('clave', c.clave, 'nombre', c.nombre, 'problema',
                 case when jsonb_array_length(coalesce(o->'palabras', '[]')) = 0 then format('La condición «%s» no tiene palabras.', o->>'titulo')
                      when o->>'destino' is null then format('La condición «%s» no lleva a ningún cuadro.', o->>'titulo')
                      else format('La condición «%s» lleva a un cuadro que no existe.', o->>'titulo') end))
        from jsonb_array_elements(coalesce(c.opciones, '[]')) o
        where jsonb_array_length(coalesce(o->'palabras', '[]')) = 0 or o->>'destino' is null
           or not destino_valido(p_flujo, o->>'destino')), '[]');
    end if;
    if tipo_del_dueno(c.tipo) then
      foreach s in array salidas_del_cuadro(c.tipo, c.opciones) loop
        if c.salidas->>s is null then
          r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                       'problema', format('«%s» no lleva a ningún cuadro.', coalesce(rotulos->>s, s)));
        elsif not destino_valido(p_flujo, c.salidas->>s) then
          r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                       'problema', format('«%s» lleva a un cuadro que no existe.', coalesce(rotulos->>s, s)));
        end if;
      end loop;
      if not (c.clave = any (alcanzados)) then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                     'problema', 'Ningún cuadro lleva aquí: el cliente nunca llegará.');
      end if;
    end if;
    if c.tipo = 'catalogo' then
      select * into cat from catalogos where id = nullif(c.ajustes->>'catalogo_id', '')::bigint;
      if cat.id is null then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre, 'problema',
                                     case when c.ajustes->>'catalogo_id' is null then 'Elige qué catálogo envía.'
                                          else 'Ese catálogo ya no existe: elige otro.' end);
      elsif not cat.activo then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                     'problema', format('El catálogo «%s» está desactivado.', cat.nombre));
      end if;
    end if;
    if c.tipo = 'ir_bot' then
      select * into destino from bots where id = nullif(c.ajustes->>'bot_id', '')::bigint;
      if destino.id is null then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre, 'problema', 'Elige a qué bot lleva.');
      elsif destino.id = mi_bot then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre, 'problema', 'Un bot no se lleva a sí mismo.');
      elsif destino.archivado then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                     'problema', format('El bot «%s» está archivado.', destino.nombre));
      elsif not exists (select 1 from bot_flujos where bot_id = destino.id and estado = 'publicada') then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                     'problema', format('El bot «%s» aún no está publicado.', destino.nombre));
      end if;
    end if;
    medida := bot_medir(c.texto, c.formato, coalesce(c.opciones, c.opciones_codigo), c.marcas);
    if (medida->>'largo')::int > (medida->>'limite')::int then
      r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                   'problema', format('El texto pasa el límite de WhatsApp (%s de %s).', medida->>'largo', medida->>'limite'));
    end if;
  end loop;
  return r;
end $$;

revoke execute on function public.borrador_guardar_catalogo(text, text, text, bigint, text, bigint) from public, anon;
grant execute on function public.borrador_guardar_catalogo(text, text, text, bigint, text, bigint) to authenticated;

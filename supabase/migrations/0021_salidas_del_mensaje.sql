-- 0021 · Salidas del Mensaje: Otra respuesta, Sin respuesta y Error al enviar (F4·18 bloque A, decisión 0030)
--
-- Diseño: docs/FLUJO-DEL-BOT.md (RF-20 a RF-22). Tres salidas OPCIONALES en bot_cuadros.salidas de un Mensaje:
--   otra           lo que el cliente escribe y no es una opción (solo con botones o lista)
--   sin_respuesta  si el cliente no escribe en ajustes.espera_segundos (por defecto 900 = 15 min)
--   error          si Meta rechaza el envío o avisa que falló (estado failed)
-- Sin conectar, el bot hace lo de siempre: no se exigen al publicar. Cada mensaje del bot guarda de qué cuadro salió
-- (mensajes.cuadro) para ligar un failed tardío; error_atendido evita seguirlo dos veces y desde_error, encadenarlo.

create function public.salidas_opcionales(p_tipo text, p_opciones jsonb) returns text[]
language sql immutable
as $$
  select case
    when p_tipo <> 'mensaje' then '{}'::text[]
    when coalesce(jsonb_array_length(p_opciones), 0) = 0 then array['sin_respuesta', 'error']
    else array['otra', 'sin_respuesta', 'error'] end
$$;

create function public.rotulo_salida(p_salida text) returns text
language sql immutable
as $$
  select coalesce(('{"respuesta": "Cuando el cliente responda", "ninguna": "Ninguna se cumple", "siguiente": "Siguiente",
                     "respondio": "El cliente respondió", "tiempo": "Pasó el tiempo", "otra": "Otra respuesta",
                     "sin_respuesta": "Sin respuesta", "error": "Error al enviar el mensaje"}'::jsonb) ->> p_salida, p_salida)
$$;

-- --------------------------------------------------------------------------- --
-- De qué cuadro salió cada mensaje del bot (para «Error al enviar», RF-22)
-- --------------------------------------------------------------------------- --
alter table public.mensajes
  add column cuadro text,
  add column desde_error boolean not null default false,
  add column error_atendido boolean not null default false;
comment on column public.mensajes.cuadro is 'Cuadro del bot que envió el mensaje (RF-22).';
comment on column public.mensajes.desde_error is 'Lo envió la salida «Error al enviar»: si también falla, no se vuelve a seguir.';
comment on column public.mensajes.error_atendido is 'Ya se siguió «Error al enviar» por este mensaje.';

-- --------------------------------------------------------------------------- --
-- Guardar, unir y revisar
-- --------------------------------------------------------------------------- --
-- Un Mensaje guarda además sus salidas opcionales y el tiempo de «Sin respuesta» (p_salidas: otra, sin_respuesta, error,
-- espera_segundos). Al pasar de botones a sin botones, «Otra respuesta» se suelta (sin botones no aplica).
create or replace function public.borrador_guardar_cuadro(p_clave text, p_nombre text, p_texto text, p_opciones jsonb,
                                                          p_bot bigint default null, p_salidas jsonb default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros; f bot_flujos; op jsonb; nuevas jsonb := '[]'; ids text[] := '{}'; previa jsonb; respuesta jsonb;
        extra jsonb := '{}'; s text; v jsonb; espera int;
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
  if c.tipo = 'pausa' then
    raise exception 'Este cuadro se guarda con su tiempo (borrador_guardar_pausa).';
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

  -- Salidas opcionales (RF-20 a RF-22): las que manda la pantalla, o las que ya tenía; null las suelta.
  foreach s in array salidas_opcionales('mensaje', nuevas) loop
    v := case when p_salidas ? s then p_salidas->s else coalesce(c.salidas->s, 'null') end;
    if jsonb_typeof(v) = 'string' then
      if not destino_valido(f.id, v #>> '{}') then
        raise exception '«%» lleva a un cuadro que no existe o al que no se puede ir directo.', rotulo_salida(s);
      end if;
      if s = 'sin_respuesta' and v #>> '{}' = c.clave then
        raise exception '«Sin respuesta» no puede volver al mismo mensaje: se repetiría sin fin.';
      end if;
    end if;
    if jsonb_typeof(v) = 'string' then  -- solo las conectadas: un mensaje sin ellas queda igual que antes
      extra := extra || jsonb_build_object(s, v);
    end if;
  end loop;
  espera := coalesce((p_salidas->>'espera_segundos')::int, (c.ajustes->>'espera_segundos')::int, 900);
  if espera not between 1 and 86399 then
    raise exception 'La espera de «Sin respuesta» va de 1 segundo a 23 h 59 min 59 s (ventana de 24 h de Meta).';
  end if;

  if jsonb_array_length(nuevas) = 0 then
    respuesta := case when p_salidas ? 'respuesta' then p_salidas->'respuesta' else coalesce(c.salidas->'respuesta', 'null') end;
    if jsonb_typeof(respuesta) = 'string' and not destino_valido(f.id, respuesta #>> '{}') then
      raise exception '"Cuando el cliente responda" lleva a un cuadro que no existe o al que no se puede ir directo.';
    end if;
    update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre), texto = coalesce(p_texto, texto),
                           opciones = '[]', formato = 'texto', salidas = jsonb_build_object('respuesta', respuesta) || extra,
                           ajustes = coalesce(ajustes, '{}') || jsonb_build_object('espera_segundos', espera), actualizado_por = auth.uid()
    where id = c.id;
  else
    update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre), texto = coalesce(p_texto, texto),
                           opciones = nuevas, formato = 'menu', salidas = extra,
                           ajustes = coalesce(ajustes, '{}') || jsonb_build_object('espera_segundos', espera), actualizado_por = auth.uid()
    where id = c.id;
  end if;
end $$;

-- Flechas: también las salidas opcionales; «Sin respuesta» no vuelve al mismo cuadro.
create or replace function public.borrador_conectar(p_clave text, p_opcion text, p_destino text, p_bot bigint default null) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros; v bigint;
begin
  perform exigir_permiso('administrar_bot');
  v := bot_editable(p_bot);
  c := cuadro_del_borrador(p_clave, v);
  if not tipo_del_dueno(c.tipo) then
    raise exception 'Las salidas de los cuadros del sistema no se cambian (RF-03).';
  end if;
  if p_destino is not null and not destino_valido(c.flujo_id, p_destino) then
    raise exception 'A ese cuadro no se puede llegar con una flecha (la ficha y la lista de equipos las abre el bot).';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(c.opciones, '[]')) o where o->>'id' = p_opcion) then
    update bot_cuadros set
      opciones = (select jsonb_agg(case when o->>'id' = p_opcion then o || jsonb_build_object('destino', p_destino) else o end order by n)
                  from jsonb_array_elements(c.opciones) with ordinality as x(o, n)),
      actualizado_por = auth.uid()
    where id = c.id;
  elsif p_opcion = any (salidas_del_cuadro(c.tipo, c.opciones) || salidas_opcionales(c.tipo, c.opciones)) then
    if p_opcion = 'sin_respuesta' and p_destino = c.clave then
      raise exception '«Sin respuesta» no puede volver al mismo mensaje: se repetiría sin fin.';
    end if;
    update bot_cuadros set salidas = salidas || jsonb_build_object(p_opcion, p_destino),
                           ajustes = case when p_opcion = 'sin_respuesta' and not coalesce(ajustes, '{}') ? 'espera_segundos'
                                          then coalesce(ajustes, '{}') || '{"espera_segundos": 900}' else ajustes end,
                           actualizado_por = auth.uid()
    where id = c.id;
  else
    raise exception 'Esa opción no existe en el cuadro.';
  end if;
end $$;

-- Qué impide publicar: además, las salidas opcionales que lleven a un cuadro que no existe y el tiempo de «Sin respuesta».
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
    foreach s in array salidas_opcionales(c.tipo, c.opciones) loop
      if c.salidas->>s is not null and not destino_valido(p_flujo, c.salidas->>s) then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                     'problema', format('«%s» lleva a un cuadro que no existe.', rotulo_salida(s)));
      end if;
    end loop;
    if c.tipo = 'mensaje' and c.salidas->>'sin_respuesta' is not null then
      if c.salidas->>'sin_respuesta' = c.clave then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                     'problema', '«Sin respuesta» no puede volver al mismo mensaje: se repetiría sin fin.');
      end if;
      if coalesce((c.ajustes->>'espera_segundos')::int, 0) not between 1 and 86399 then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                     'problema', 'La espera de «Sin respuesta» va de 1 segundo a 23 h 59 min 59 s.');
      end if;
    end if;
    if c.tipo = 'pausa' and coalesce((c.ajustes->>'segundos')::int, 0) not between 1 and 86399 then
      r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                   'problema', 'La espera va de 1 segundo a 23 h 59 min 59 s (ventana de 24 h de Meta).');
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

revoke execute on function public.salidas_opcionales(text, jsonb), public.rotulo_salida(text) from public, anon;
grant execute on function public.salidas_opcionales(text, jsonb), public.rotulo_salida(text) to authenticated, service_role;

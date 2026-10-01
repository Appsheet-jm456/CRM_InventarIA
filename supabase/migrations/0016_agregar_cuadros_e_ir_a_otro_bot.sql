-- 0016 · "+ Agregar": mensaje sin botones, "Ir a otro bot" y la base para Condiciones, Catálogos y Pausa
--        (F4·10, decisiones 0027 y 0028)
--
-- Diseño: docs/FLUJO-DEL-BOT.md (RF-08, RF-09, RF-17).
-- · Los cuadros que crea el dueño son: mensaje, ir_bot y (desde F4·11 a F4·13) condicion, catalogo y pausa.
--   Se editan, se unen y se borran; los del sistema siguen fijos (RF-03).
-- · Un mensaje sin opciones tiene una sola salida, "respuesta": lo que escriba el cliente sigue a ese cuadro.
-- · ir_bot lleva al cliente al inicio de la versión publicada de otro bot (ajustes.bot_id). El cliente guarda
--   en qué bot va (leads.bot_id).

-- --------------------------------------------------------------------------- --
-- Modelo
-- --------------------------------------------------------------------------- --
alter table public.bot_cuadros drop constraint bot_cuadros_tipo_check;
alter table public.bot_cuadros add constraint bot_cuadros_tipo_check check (tipo in (
  'mensaje', 'presupuesto', 'marca', 'equipos', 'ficha', 'asesor', 'aviso',  -- 0011
  'ir_bot', 'condicion', 'catalogo', 'pausa'));                              -- 0016 (los tres últimos, F4·11 a F4·13)

alter table public.bot_cuadros add column ajustes jsonb not null default '{}';
comment on column public.bot_cuadros.ajustes is
  'Lo propio de cada tipo de cuadro del dueño: ir_bot {bot_id}; catalogo {catalogo_id}; pausa {segundos}.';
comment on column public.bot_cuadros.salidas is
  'Salidas con nombre. Del sistema: {"siguiente"} o {"cambiar_presupuesto"}. Del dueño: mensaje sin opciones '
  '{"respuesta"}; condicion {"ninguna"}; catalogo {"siguiente"}; pausa {"respondio", "tiempo"}. Un valor null es una '
  'flecha suelta (solo en un borrador).';

alter table public.leads add column bot_id bigint references public.bots on delete set null;
comment on column public.leads.bot_id is 'En qué bot va el cliente (0028). null: el principal.';

-- Los tipos que crea el dueño desde "+ Agregar" (RF-08).
create function public.tipo_del_dueno(p_tipo text) returns boolean
language sql immutable
as $$ select p_tipo in ('mensaje', 'ir_bot', 'condicion', 'catalogo', 'pausa') $$;

-- Las salidas con nombre que puede tener un cuadro del dueño.
create function public.salidas_del_cuadro(p_tipo text, p_opciones jsonb) returns text[]
language sql immutable
as $$
  select case
    when p_tipo = 'mensaje' and coalesce(jsonb_array_length(p_opciones), 0) = 0 then array['respuesta']
    when p_tipo = 'condicion' then array['ninguna']
    when p_tipo = 'catalogo' then array['siguiente']
    when p_tipo = 'pausa' then array['respondio', 'tiempo']
    else '{}'::text[] end
$$;

-- ¿Se puede llegar con una flecha a ese cuadro? (a la ficha, la lista y los avisos los abre el bot)
create function public.destino_valido(p_flujo bigint, p_clave text) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from bot_cuadros k where k.flujo_id = p_flujo and k.clave = p_clave
                 and k.tipo not in ('aviso', 'ficha', 'equipos'))
$$;

-- --------------------------------------------------------------------------- --
-- Copias de versiones: ahora llevan los ajustes
-- --------------------------------------------------------------------------- --
create or replace function public.copiar_cuadros(p_origen bigint, p_destino bigint) returns void
language sql security definer
set search_path = public, pg_temp
as $$
  insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, inicio, texto, texto_original, opciones, opciones_original,
                           opciones_codigo, max_titulo, marcas, formato, salidas, al_entrar, ajustes, x, y, actualizado_por)
  select p_destino, clave, tipo, nombre, orden, inicio, texto, texto_original, opciones, opciones_original,
         opciones_codigo, max_titulo, marcas, formato, salidas, al_entrar, ajustes, x, y, auth.uid()
  from bot_cuadros where flujo_id = p_origen
$$;

-- --------------------------------------------------------------------------- --
-- Crear cuadros desde "+ Agregar"
-- --------------------------------------------------------------------------- --
create function public.borrador_crear_cuadro(p_tipo text, p_x integer, p_y integer, p_bot bigint default null) returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare f bot_flujos; n integer; v_clave text;
begin
  perform exigir_permiso('administrar_bot');
  if p_tipo = 'mensaje' then
    return borrador_crear_mensaje(p_x, p_y, p_bot);
  end if;
  if p_tipo in ('condicion', 'catalogo', 'pausa') then
    raise exception 'Ese cuadro llega en una próxima versión del lienzo.';
  end if;
  if p_tipo is distinct from 'ir_bot' then
    raise exception 'Ese tipo de cuadro no existe.';
  end if;
  f := borrador_del_flujo(bot_editable(p_bot));
  select coalesce(max(substring(k.clave from '^IR(\d+)$')::int), 0) + 1 into n
  from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^IR\d+$';
  v_clave := 'IR' || n;
  insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, ajustes, x, y, actualizado_por)
  values (f.id, v_clave, 'ir_bot', 'Ir a otro bot ' || n, 950 + n, 'Lleva al cliente al inicio de otro bot.',
          'Lleva al cliente al inicio de otro bot.', 'sistema', '{"bot_id": null}', p_x, p_y, auth.uid());
  return v_clave;
end $$;

-- --------------------------------------------------------------------------- --
-- Guardar un cuadro desde el panel
-- --------------------------------------------------------------------------- --
drop function public.borrador_guardar_cuadro(text, text, text, jsonb, bigint);

-- mensaje: nombre, texto y opciones completas [{id, titulo, destino}] (0 a 10). Sin opciones es un mensaje de texto
--          cuya salida "respuesta" (p_salidas) lleva lo que escriba el cliente (RF-09).
-- del sistema: solo texto y títulos (RF-03).
create function public.borrador_guardar_cuadro(p_clave text, p_nombre text, p_texto text, p_opciones jsonb,
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
    -- Sin botones (RF-09): la flecha "Cuando el cliente responda".
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

-- ir_bot: nombre y bot de destino (RF-17). Que el destino esté publicado se exige al publicar.
create function public.borrador_guardar_ajustes(p_clave text, p_nombre text, p_ajustes jsonb, p_bot bigint default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros; f bot_flujos; destino bigint;
begin
  perform exigir_permiso('administrar_bot');
  f := borrador_del_flujo(bot_editable(p_bot));
  c := cuadro_del_borrador(p_clave, f.bot_id);
  if c.tipo <> 'ir_bot' then
    raise exception 'Este cuadro no tiene ajustes que guardar aquí.';
  end if;
  destino := nullif(p_ajustes->>'bot_id', '')::bigint;
  if destino is not null and not exists (select 1 from bots where id = destino) then
    raise exception 'Ese bot no existe.';
  end if;
  if destino = f.bot_id then
    raise exception 'Un bot no se lleva a sí mismo: para volver a su inicio, une la flecha al saludo.';
  end if;
  update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre),
                         ajustes = jsonb_build_object('bot_id', destino), actualizado_por = auth.uid()
  where id = c.id;
end $$;

-- --------------------------------------------------------------------------- --
-- Flechas: opciones de un mensaje o salidas con nombre de los cuadros del dueño (null la suelta)
-- --------------------------------------------------------------------------- --
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
  elsif p_opcion = any (salidas_del_cuadro(c.tipo, c.opciones)) then
    update bot_cuadros set salidas = salidas || jsonb_build_object(p_opcion, p_destino), actualizado_por = auth.uid()
    where id = c.id;
  else
    raise exception 'Esa opción no existe en el cuadro.';
  end if;
end $$;

-- Se borran los cuadros del dueño que no sean el inicio; las flechas que llegaban quedan sueltas.
create or replace function public.borrador_borrar_cuadro(p_clave text, p_bot bigint default null) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros;
begin
  perform exigir_permiso('administrar_bot');
  c := cuadro_del_borrador(p_clave, bot_editable(p_bot));
  if not tipo_del_dueno(c.tipo) or c.inicio then
    raise exception 'Los cuadros del sistema y el de inicio no se borran (RF-03).';
  end if;
  delete from bot_cuadros where id = c.id;
  update bot_cuadros k set opciones =
    (select jsonb_agg(case when o->>'destino' = p_clave then o || '{"destino": null}' else o end order by n)
     from jsonb_array_elements(k.opciones) with ordinality as x(o, n))
  where k.flujo_id = c.flujo_id and k.opciones @> jsonb_build_array(jsonb_build_object('destino', p_clave));
  update bot_cuadros k set salidas =
    (select jsonb_object_agg(s.key, case when s.value = to_jsonb(p_clave) then 'null'::jsonb else s.value end)
     from jsonb_each(k.salidas) s)
  where k.flujo_id = c.flujo_id and tipo_del_dueno(k.tipo)
    and exists (select 1 from jsonb_each(k.salidas) s where s.value = to_jsonb(p_clave));
end $$;

-- --------------------------------------------------------------------------- --
-- Qué impide publicar (RF-05, RF-09 y RF-17)
-- --------------------------------------------------------------------------- --
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
  mi_bot bigint := (select bot_id from bot_flujos where id = p_flujo);
  rotulos jsonb := '{"respuesta": "Cuando el cliente responda", "ninguna": "Ninguna se cumple", "siguiente": "Siguiente", "respondio": "El cliente respondió", "tiempo": "Pasó el tiempo"}';
begin
  if (select count(*) from bot_cuadros where flujo_id = p_flujo and inicio) <> 1 then
    r := r || jsonb_build_object('clave', '', 'nombre', '', 'problema', 'El flujo necesita un único cuadro de inicio.');
  end if;
  -- Lo que se alcanza desde el inicio por opciones y salidas.
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

-- --------------------------------------------------------------------------- --
-- Un bot al que otro lleva no se archiva (RF-17)
-- --------------------------------------------------------------------------- --
create or replace function public.archivar_bot(p_bot bigint) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare quien text;
begin
  perform exigir_permiso('administrar_bot');
  perform bot_de(p_bot);
  if (select principal from bots where id = p_bot) then
    raise exception 'El bot principal no se archiva: marca otro como principal primero.';
  end if;
  select string_agg(distinct b.nombre, ', ') into quien
  from bot_cuadros k join bot_flujos f on f.id = k.flujo_id join bots b on b.id = f.bot_id
  where k.tipo = 'ir_bot' and k.ajustes->>'bot_id' = p_bot::text
    and f.estado in ('publicada', 'borrador') and not b.archivado and b.id <> p_bot;
  if quien is not null then
    raise exception 'No se archiva: «Ir a otro bot» lleva aquí desde %. Cambia esos cuadros primero.', quien;
  end if;
  update bots set archivado = true, actualizado_en = now() where id = p_bot;
end $$;

-- --------------------------------------------------------------------------- --
-- Privilegios
-- --------------------------------------------------------------------------- --
revoke execute on function
  public.tipo_del_dueno(text), public.salidas_del_cuadro(text, jsonb), public.destino_valido(bigint, text),
  public.borrador_crear_cuadro(text, integer, integer, bigint),
  public.borrador_guardar_cuadro(text, text, text, jsonb, bigint, jsonb),
  public.borrador_guardar_ajustes(text, text, jsonb, bigint)
from public, anon;
revoke execute on function public.destino_valido(bigint, text) from authenticated;
grant execute on function
  public.borrador_crear_cuadro(text, integer, integer, bigint),
  public.borrador_guardar_cuadro(text, text, text, jsonb, bigint, jsonb),
  public.borrador_guardar_ajustes(text, text, jsonb, bigint)
to authenticated;

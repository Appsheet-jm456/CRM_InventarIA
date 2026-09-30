-- 0012 · Borrador del flujo para el lienzo (F4·6, decisión 0026)
--
-- Diseño: docs/FLUJO-DEL-BOT.md. El lienzo edita solo el borrador; el bot sigue con la versión publicada hasta
-- publicar (F4·7). El dueño crea, une y borra cuadros de mensaje; los del sistema se unen pero no cambian (RF-03).

-- Una opción de un borrador puede quedar sin destino mientras se arma; publicar lo exige (RF-05, F4·7).
comment on column public.bot_cuadros.opciones is
  '[{id, titulo, destino, palabras?, reconocer?, efectos?}]. destino: clave de otro cuadro, @pedir_codigo o null '
  '(solo en un borrador). palabras: exacta, "*x" contiene x, "re:x" expresión al inicio. reconocer: uso o '
  'quiere_comprar. efectos: {campos, etiqueta, etapa, motivo} que se anotan al elegirla.';

-- --------------------------------------------------------------------------- --
-- El borrador y sus cuadros
-- --------------------------------------------------------------------------- --
create or replace function public.borrador_del_flujo() returns bot_flujos
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare f bot_flujos;
begin
  select * into f from bot_flujos where estado = 'borrador';
  if not found then
    raise exception 'No hay un borrador abierto: créalo desde el lienzo' using errcode = 'P0002';
  end if;
  return f;
end $$;

create or replace function public.cuadro_del_borrador(p_clave text) returns bot_cuadros
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros;
begin
  select * into c from bot_cuadros where flujo_id = (borrador_del_flujo()).id and clave = p_clave for update;
  if not found then
    raise exception 'Ese cuadro no está en el borrador' using errcode = 'P0002';
  end if;
  return c;
end $$;

-- Copia la versión publicada como borrador (o devuelve el que ya está abierto).
create or replace function public.crear_borrador() returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare pub bot_flujos; nuevo bot_flujos;
begin
  perform exigir_permiso('administrar_bot');
  select * into nuevo from bot_flujos where estado = 'borrador';
  if found then
    return nuevo.version;
  end if;
  select * into pub from bot_flujos where estado = 'publicada';
  insert into bot_flujos (version, estado, nota, creado_por)
  values ((select max(version) + 1 from bot_flujos), 'borrador', '', auth.uid())
  returning * into nuevo;
  insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, inicio, texto, texto_original, opciones, opciones_original,
                           opciones_codigo, max_titulo, marcas, formato, salidas, al_entrar, x, y, actualizado_por)
  select nuevo.id, clave, tipo, nombre, orden, inicio, texto, texto_original, opciones, opciones_original,
         opciones_codigo, max_titulo, marcas, formato, salidas, al_entrar, x, y, auth.uid()
  from bot_cuadros where flujo_id = pub.id;
  return nuevo.version;
end $$;

create or replace function public.descartar_borrador() returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('administrar_bot');
  delete from bot_flujos where id = (borrador_del_flujo()).id;
end $$;

-- Nuevo cuadro de mensaje (RF-01, RF-04): una opción y la de volver al inicio.
create or replace function public.borrador_crear_mensaje(p_x integer, p_y integer) returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare f bot_flujos; v_clave text; n integer; ops jsonb;
begin
  perform exigir_permiso('administrar_bot');
  f := borrador_del_flujo();
  select coalesce(max(substring(k.clave from '^M(\d+)$')::int), 0) + 1 into n
  from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^M\d+$';
  v_clave := 'M' || n;
  ops := jsonb_build_array(jsonb_build_object('id', '1', 'titulo', 'Opción 1', 'destino', null),
                           jsonb_build_object('id', '0', 'titulo', 'Volver al menú', 'destino',
                                              (select k.clave from bot_cuadros k where k.flujo_id = f.id and k.inicio)));
  insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, opciones, opciones_original,
                           max_titulo, formato, x, y, actualizado_por)
  values (f.id, v_clave, 'mensaje', 'Mensaje ' || n, 900 + n, 'Escribe aquí el mensaje.', 'Escribe aquí el mensaje.',
          ops, ops, 24, 'menu', p_x, p_y, auth.uid());
  return v_clave;
end $$;

-- Guarda un cuadro desde el panel del lienzo.
-- mensaje: nombre, texto y opciones completas [{id, titulo, destino}]; lo que la opción ya reconocía o anotaba
--          (palabras, reconocer, efectos) se conserva por id.
-- del sistema: solo texto y títulos, como editar_cuadro (RF-03).
create or replace function public.borrador_guardar_cuadro(p_clave text, p_nombre text, p_texto text, p_opciones jsonb)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros; f bot_flujos; op jsonb; nuevas jsonb := '[]'; ids text[] := '{}'; previa jsonb;
begin
  perform exigir_permiso('administrar_bot');
  f := borrador_del_flujo();
  c := cuadro_del_borrador(p_clave);
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

  if jsonb_typeof(p_opciones) is distinct from 'array' or jsonb_array_length(p_opciones) = 0 then
    raise exception 'Un mensaje necesita al menos una opción.';
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
    if op->>'destino' is not null and not exists (
         select 1 from bot_cuadros k where k.flujo_id = f.id and k.clave = op->>'destino' and k.tipo not in ('aviso', 'ficha', 'equipos')) then
      raise exception 'La opción "%" lleva a un cuadro que no existe o al que no se puede ir directo.', op->>'titulo';
    end if;
    select o into previa from jsonb_array_elements(c.opciones) o where o->>'id' = op->>'id';
    nuevas := nuevas || jsonb_strip_nulls(
      coalesce(previa, '{}') - 'titulo' - 'destino'
      || jsonb_build_object('id', op->>'id', 'titulo', btrim(coalesce(op->>'titulo', '')), 'destino', op->'destino'));
  end loop;
  update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre), texto = coalesce(p_texto, texto),
                         opciones = nuevas, actualizado_por = auth.uid()
  where id = c.id;
end $$;

-- Arrastrar una flecha desde una opción (null la suelta).
create or replace function public.borrador_conectar(p_clave text, p_opcion text, p_destino text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros;
begin
  perform exigir_permiso('administrar_bot');
  c := cuadro_del_borrador(p_clave);
  if c.tipo <> 'mensaje' then
    raise exception 'Las salidas de los cuadros del sistema no se cambian (RF-03).';
  end if;
  if not exists (select 1 from jsonb_array_elements(c.opciones) o where o->>'id' = p_opcion) then
    raise exception 'Esa opción no existe en el cuadro.';
  end if;
  if p_destino is not null and not exists (
       select 1 from bot_cuadros k where k.flujo_id = c.flujo_id and k.clave = p_destino and k.tipo not in ('aviso', 'ficha', 'equipos')) then
    raise exception 'A ese cuadro no se puede llegar con una flecha (la ficha y la lista de equipos las abre el bot).';
  end if;
  update bot_cuadros set
    opciones = (select jsonb_agg(case when o->>'id' = p_opcion then o || jsonb_build_object('destino', p_destino) else o end order by n)
                from jsonb_array_elements(c.opciones) with ordinality as x(o, n)),
    actualizado_por = auth.uid()
  where id = c.id;
end $$;

create or replace function public.borrador_mover(p_clave text, p_x integer, p_y integer) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros;
begin
  perform exigir_permiso('administrar_bot');
  c := cuadro_del_borrador(p_clave);
  update bot_cuadros set x = p_x, y = p_y where id = c.id;
end $$;

-- Solo se borran mensajes que no sean el inicio; las flechas que llegaban quedan sueltas.
create or replace function public.borrador_borrar_cuadro(p_clave text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros;
begin
  perform exigir_permiso('administrar_bot');
  c := cuadro_del_borrador(p_clave);
  if c.tipo <> 'mensaje' or c.inicio then
    raise exception 'Los cuadros del sistema y el de inicio no se borran (RF-03).';
  end if;
  delete from bot_cuadros where id = c.id;
  update bot_cuadros k set opciones =
    (select jsonb_agg(case when o->>'destino' = p_clave then o || '{"destino": null}' else o end order by n)
     from jsonb_array_elements(k.opciones) with ordinality as x(o, n))
  where k.flujo_id = c.flujo_id and k.opciones @> jsonb_build_array(jsonb_build_object('destino', p_clave));
end $$;

-- --------------------------------------------------------------------------- --
-- Privilegios
-- --------------------------------------------------------------------------- --
revoke execute on function
  public.borrador_del_flujo(), public.cuadro_del_borrador(text), public.crear_borrador(), public.descartar_borrador(),
  public.borrador_crear_mensaje(integer, integer), public.borrador_guardar_cuadro(text, text, text, jsonb),
  public.borrador_conectar(text, text, text), public.borrador_mover(text, integer, integer), public.borrador_borrar_cuadro(text)
from public, anon;
revoke execute on function public.borrador_del_flujo(), public.cuadro_del_borrador(text) from authenticated;
grant execute on function
  public.crear_borrador(), public.descartar_borrador(), public.borrador_crear_mensaje(integer, integer),
  public.borrador_guardar_cuadro(text, text, text, jsonb), public.borrador_conectar(text, text, text),
  public.borrador_mover(text, integer, integer), public.borrador_borrar_cuadro(text)
to authenticated;

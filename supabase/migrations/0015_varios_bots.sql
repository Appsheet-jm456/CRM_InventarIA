-- 0015 · Varios bots, cada uno con su lienzo, borrador y versiones (F4·9, decisión 0028)
--
-- Diseño: docs/FLUJO-DEL-BOT.md (RF-16). Hasta ahora había un solo flujo. Ahora hay una tabla `bots`; cada versión
-- (`bot_flujos`) y sus cuadros pertenecen a un bot, y la numeración de versiones es por bot. Un bot es el principal:
-- el que atiende al cliente (el motor sigue usando solo ese hasta F4·10).
--
-- Compatibilidad: todas las funciones del borrador reciben `p_bot` al final, con valor por defecto null = el
-- principal; así las llamadas de antes siguen funcionando igual.

-- --------------------------------------------------------------------------- --
-- Bots
-- --------------------------------------------------------------------------- --
create table public.bots (
  id             bigint generated always as identity primary key,
  nombre         text not null check (length(btrim(nombre)) between 1 and 60),
  principal      boolean not null default false,
  archivado      boolean not null default false,
  creado_por     uuid references public.usuarios on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (not (principal and archivado))
);
comment on table public.bots is 'Un bot es un flujo con sus versiones (RF-16). El principal atiende a todo cliente que no está en otro bot.';
create unique index bots_nombre_unico on public.bots (lower(btrim(nombre)));
create unique index bots_un_principal on public.bots (principal) where principal;

insert into public.bots (nombre, principal) values ('Bienvenida', true);

alter table public.bot_flujos add column bot_id bigint references public.bots on delete restrict;
update public.bot_flujos set bot_id = (select id from public.bots where principal);
alter table public.bot_flujos alter column bot_id set not null;

alter table public.bot_flujos drop constraint bot_flujos_version_key;
alter table public.bot_flujos add constraint bot_flujos_version_por_bot unique (bot_id, version);
drop index public.bot_flujos_una_publicada;
drop index public.bot_flujos_un_borrador;
create unique index bot_flujos_una_publicada on public.bot_flujos (bot_id) where estado = 'publicada';
create unique index bot_flujos_un_borrador on public.bot_flujos (bot_id) where estado = 'borrador';

-- --------------------------------------------------------------------------- --
-- Qué bot: null es el principal
-- --------------------------------------------------------------------------- --
create function public.bot_de(p_bot bigint) returns bigint
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v bigint;
begin
  select id into v from bots where id = coalesce(p_bot, (select id from bots where principal));
  if v is null then
    raise exception 'Ese bot no existe' using errcode = 'P0002';
  end if;
  return v;
end $$;

-- Un bot archivado se puede ver, no cambiar.
create function public.bot_editable(p_bot bigint) returns bigint
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v bigint := bot_de(p_bot);
begin
  if (select archivado from bots where id = v) then
    raise exception 'Ese bot está archivado: desarchívalo para cambiarlo.';
  end if;
  return v;
end $$;

drop function
  public.borrador_del_flujo(), public.cuadro_del_borrador(text), public.crear_borrador(), public.descartar_borrador(),
  public.borrador_crear_mensaje(integer, integer), public.borrador_guardar_cuadro(text, text, text, jsonb),
  public.borrador_conectar(text, text, text), public.borrador_mover(text, integer, integer),
  public.borrador_borrar_cuadro(text), public.cambios_publicados_despues(), public.publicar_borrador(text, boolean),
  public.borrador_desde_version(integer, boolean), public.editar_cuadro(text, text, jsonb), public.restaurar_cuadro(text);

-- --------------------------------------------------------------------------- --
-- Editar la versión publicada (pestaña Mensajes): solo textos y títulos
-- --------------------------------------------------------------------------- --
create function public.editar_cuadro(p_clave text, p_texto text, p_titulos jsonb default null, p_bot bigint default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros; v bigint;
begin
  perform exigir_permiso('administrar_bot');
  v := bot_editable(p_bot);
  select k.* into c from bot_cuadros k join bot_flujos f on f.id = k.flujo_id
  where f.estado = 'publicada' and f.bot_id = v and k.clave = p_clave for update of k;
  if not found then
    raise exception 'Ese mensaje no existe' using errcode = 'P0002';
  end if;
  if p_titulos is not null then
    if c.opciones is null
       or (select array_agg(o->>'id' order by o->>'id') from jsonb_array_elements(p_titulos) o)
          is distinct from (select array_agg(o->>'id' order by o->>'id') from jsonb_array_elements(c.opciones) o) then
      raise exception 'Aquí solo se cambian los títulos: las opciones y a dónde llevan se cambian en el lienzo.';
    end if;
    c.opciones := (select jsonb_agg(o || jsonb_build_object('titulo', btrim(t->>'titulo')) order by n)
                   from jsonb_array_elements(c.opciones) with ordinality as x(o, n)
                   join jsonb_array_elements(p_titulos) t on t->>'id' = o->>'id');
  end if;
  update bot_cuadros set texto = coalesce(p_texto, texto), opciones = c.opciones, actualizado_por = auth.uid()
  where id = c.id;
end $$;

create function public.restaurar_cuadro(p_clave text, p_bot bigint default null) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v bigint;
begin
  perform exigir_permiso('administrar_bot');
  v := bot_editable(p_bot);
  update bot_cuadros k set texto = texto_original, opciones = opciones_original, actualizado_por = auth.uid()
  from bot_flujos f
  where f.id = k.flujo_id and f.estado = 'publicada' and f.bot_id = v and k.clave = p_clave;
  if not found then
    raise exception 'Ese mensaje no existe' using errcode = 'P0002';
  end if;
end $$;

-- --------------------------------------------------------------------------- --
-- El borrador y sus cuadros
-- --------------------------------------------------------------------------- --
create function public.borrador_del_flujo(p_bot bigint default null) returns bot_flujos
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare f bot_flujos;
begin
  select * into f from bot_flujos where estado = 'borrador' and bot_id = bot_de(p_bot);
  if not found then
    raise exception 'No hay un borrador abierto: créalo desde el lienzo' using errcode = 'P0002';
  end if;
  return f;
end $$;

create function public.cuadro_del_borrador(p_clave text, p_bot bigint default null) returns bot_cuadros
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros;
begin
  select * into c from bot_cuadros where flujo_id = (borrador_del_flujo(p_bot)).id and clave = p_clave for update;
  if not found then
    raise exception 'Ese cuadro no está en el borrador' using errcode = 'P0002';
  end if;
  return c;
end $$;

-- Copia los cuadros de una versión a otra (las columnas van explícitas: una nueva se agrega aquí y en las otras copias).
create function public.copiar_cuadros(p_origen bigint, p_destino bigint) returns void
language sql security definer
set search_path = public, pg_temp
as $$
  insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, inicio, texto, texto_original, opciones, opciones_original,
                           opciones_codigo, max_titulo, marcas, formato, salidas, al_entrar, x, y, actualizado_por)
  select p_destino, clave, tipo, nombre, orden, inicio, texto, texto_original, opciones, opciones_original,
         opciones_codigo, max_titulo, marcas, formato, salidas, al_entrar, x, y, auth.uid()
  from bot_cuadros where flujo_id = p_origen
$$;

-- Copia la versión publicada como borrador (o devuelve el que ya está abierto).
create function public.crear_borrador(p_bot bigint default null) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v bigint; pub bot_flujos; nuevo bot_flujos;
begin
  perform exigir_permiso('administrar_bot');
  v := bot_editable(p_bot);
  select * into nuevo from bot_flujos where estado = 'borrador' and bot_id = v;
  if found then
    return nuevo.version;
  end if;
  select * into pub from bot_flujos where estado = 'publicada' and bot_id = v;
  if not found then
    raise exception 'Este bot no tiene versión publicada ni borrador.';
  end if;
  insert into bot_flujos (bot_id, version, estado, nota, creado_por)
  values (v, (select max(version) + 1 from bot_flujos where bot_id = v), 'borrador', '', auth.uid())
  returning * into nuevo;
  perform copiar_cuadros(pub.id, nuevo.id);
  return nuevo.version;
end $$;

create function public.descartar_borrador(p_bot bigint default null) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v bigint; f bot_flujos;
begin
  perform exigir_permiso('administrar_bot');
  v := bot_editable(p_bot);
  f := borrador_del_flujo(v);
  -- Un bot que nunca se publicó vive en su borrador: descartarlo sería dejarlo sin nada.
  if not exists (select 1 from bot_flujos where bot_id = v and estado in ('publicada', 'archivada')) then
    raise exception 'Este bot aún no se ha publicado: su borrador es todo lo que tiene. Archiva el bot si ya no lo quieres.';
  end if;
  delete from bot_flujos where id = f.id;
end $$;

-- Nuevo cuadro de mensaje (RF-01, RF-04): una opción y la de volver al inicio.
create function public.borrador_crear_mensaje(p_x integer, p_y integer, p_bot bigint default null) returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare f bot_flujos; v_clave text; n integer; ops jsonb;
begin
  perform exigir_permiso('administrar_bot');
  f := borrador_del_flujo(bot_editable(p_bot));
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
create function public.borrador_guardar_cuadro(p_clave text, p_nombre text, p_texto text, p_opciones jsonb, p_bot bigint default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros; f bot_flujos; op jsonb; nuevas jsonb := '[]'; ids text[] := '{}'; previa jsonb;
begin
  perform exigir_permiso('administrar_bot');
  f := borrador_del_flujo(bot_editable(p_bot));
  c := cuadro_del_borrador(p_clave, f.bot_id);
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
create function public.borrador_conectar(p_clave text, p_opcion text, p_destino text, p_bot bigint default null) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros; v bigint;
begin
  perform exigir_permiso('administrar_bot');
  v := bot_editable(p_bot);
  c := cuadro_del_borrador(p_clave, v);
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

create function public.borrador_mover(p_clave text, p_x integer, p_y integer, p_bot bigint default null) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros;
begin
  perform exigir_permiso('administrar_bot');
  c := cuadro_del_borrador(p_clave, bot_editable(p_bot));
  update bot_cuadros set x = p_x, y = p_y where id = c.id;
end $$;

-- Solo se borran mensajes que no sean el inicio; las flechas que llegaban quedan sueltas.
create function public.borrador_borrar_cuadro(p_clave text, p_bot bigint default null) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros;
begin
  perform exigir_permiso('administrar_bot');
  c := cuadro_del_borrador(p_clave, bot_editable(p_bot));
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
-- Publicar, choques y volver a una versión (por bot)
-- --------------------------------------------------------------------------- --
-- Cuadros de la versión publicada que alguien cambió (pestaña Mensajes) después de abrir el borrador: publicarlo
-- los pisaría.
create function public.cambios_publicados_despues(p_bot bigint default null) returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('clave', p.clave, 'nombre', p.nombre, 'cuando', p.actualizado_en)
                            order by p.orden), '[]')
  from bot_flujos b
  join bot_flujos f on f.estado = 'publicada' and f.bot_id = b.bot_id
  join bot_cuadros p on p.flujo_id = f.id
  left join bot_cuadros d on d.flujo_id = b.id and d.clave = p.clave
  where b.estado = 'borrador' and b.bot_id = bot_de(p_bot) and p.actualizado_en > b.creado_en
    and (d.id is null or d.texto is distinct from p.texto or d.opciones is distinct from p.opciones)
$$;

create function public.publicar_borrador(p_nota text default '', p_pisar boolean default false, p_bot bigint default null) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v bigint; b bot_flujos; problemas jsonb; choques jsonb;
begin
  perform exigir_permiso('administrar_bot');
  v := bot_editable(p_bot);
  select * into b from bot_flujos where estado = 'borrador' and bot_id = v for update;
  if not found then
    raise exception 'No hay un borrador para publicar' using errcode = 'P0002';
  end if;
  problemas := problemas_del_flujo(b.id);
  if jsonb_array_length(problemas) > 0 then
    raise exception 'El borrador tiene % cosa(s) por resolver: %', jsonb_array_length(problemas),
      (select string_agg(coalesce(nullif(p->>'nombre', '') || ': ', '') || (p->>'problema'), ' · ')
       from jsonb_array_elements(problemas) p);
  end if;
  choques := cambios_publicados_despues(v);
  if jsonb_array_length(choques) > 0 and not p_pisar then
    raise exception 'CHOQUE: desde que abriste el borrador cambiaron en la versión publicada: %. Publicar los reemplaza por lo del borrador.',
      (select string_agg(c->>'nombre', ', ') from jsonb_array_elements(choques) c);
  end if;
  update bot_flujos set estado = 'archivada' where estado = 'publicada' and bot_id = v;
  update bot_flujos set estado = 'publicada', nota = btrim(coalesce(p_nota, '')), publicado_por = auth.uid(), publicado_en = now()
  where id = b.id;
  return b.version;
end $$;

-- Volver a una versión: se copia como borrador para revisarla y publicarla (RF-06)
create function public.borrador_desde_version(p_version integer, p_reemplazar boolean default false, p_bot bigint default null) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v bigint; origen bot_flujos; nuevo bot_flujos;
begin
  perform exigir_permiso('administrar_bot');
  v := bot_editable(p_bot);
  select * into origen from bot_flujos where bot_id = v and version = p_version and estado <> 'borrador';
  if not found then
    raise exception 'Esa versión no existe' using errcode = 'P0002';
  end if;
  if exists (select 1 from bot_flujos where estado = 'borrador' and bot_id = v) then
    if not p_reemplazar then
      raise exception 'Ya hay un borrador abierto: descártalo o reemplázalo.';
    end if;
    delete from bot_flujos where estado = 'borrador' and bot_id = v;
  end if;
  insert into bot_flujos (bot_id, version, estado, nota, creado_por)
  values (v, (select max(version) + 1 from bot_flujos where bot_id = v), 'borrador',
          format('A partir de la versión %s', p_version), auth.uid())
  returning * into nuevo;
  perform copiar_cuadros(origen.id, nuevo.id);
  return nuevo.version;
end $$;

-- --------------------------------------------------------------------------- --
-- Administrar los bots: crear, duplicar, renombrar, principal y archivar (RF-16)
-- --------------------------------------------------------------------------- --
-- En blanco: un saludo y los cuadros que el motor necesita siempre (asesor, avisos y ficha), tomados del principal.
-- Duplicar: copia la versión publicada del bot de origen (o su borrador si nunca se publicó).
-- El bot nuevo nace como borrador (versión 1): no atiende a nadie hasta que se publique.
create function public.crear_bot(p_nombre text, p_desde bigint default null) returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare nuevo bots; f bot_flujos; origen bot_flujos;
begin
  perform exigir_permiso('administrar_bot');
  p_nombre := btrim(coalesce(p_nombre, ''));
  if p_nombre = '' then
    raise exception 'Escribe el nombre del bot.';
  end if;
  if p_desde is not null then
    perform bot_de(p_desde);
    select * into origen from bot_flujos where bot_id = p_desde and estado = 'publicada';
    if not found then
      select * into origen from bot_flujos where bot_id = p_desde and estado = 'borrador';
    end if;
  end if;
  insert into bots (nombre, creado_por) values (p_nombre, auth.uid()) returning * into nuevo;
  insert into bot_flujos (bot_id, version, estado, nota, creado_por)
  values (nuevo.id, 1, 'borrador',
          case when p_desde is null then '' else 'Copia de ' || (select nombre from bots where id = p_desde) end, auth.uid())
  returning * into f;
  if p_desde is not null then
    perform copiar_cuadros(origen.id, f.id);
  else
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, inicio, texto, texto_original, opciones, opciones_original,
                             max_titulo, formato, x, y, actualizado_por)
    values (f.id, 'B00', 'mensaje', 'Saludo', 0, true,
            'Hola 👋 Escribe aquí el saludo de este bot.', 'Hola 👋 Escribe aquí el saludo de este bot.',
            '[{"id":"1","titulo":"Opción 1","destino":null}]', '[{"id":"1","titulo":"Opción 1","destino":null}]',
            24, 'menu', 0, 0, auth.uid());
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, inicio, texto, texto_original, opciones, opciones_original,
                             opciones_codigo, max_titulo, marcas, formato, salidas, al_entrar, x, y, actualizado_por)
    select f.id, k.clave, k.tipo, k.nombre, k.orden, false, k.texto, k.texto_original, k.opciones, k.opciones_original,
           k.opciones_codigo, k.max_titulo, k.marcas, k.formato, k.salidas, k.al_entrar, k.x, k.y, auth.uid()
    from bot_cuadros k join bot_flujos pf on pf.id = k.flujo_id
    join bots b on b.id = pf.bot_id and b.principal
    where pf.estado = 'publicada' and k.tipo in ('asesor', 'aviso', 'ficha');
  end if;
  return nuevo.id;
end $$;

create function public.renombrar_bot(p_bot bigint, p_nombre text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('administrar_bot');
  perform bot_de(p_bot);
  p_nombre := btrim(coalesce(p_nombre, ''));
  if p_nombre = '' then
    raise exception 'Escribe el nombre del bot.';
  end if;
  update bots set nombre = p_nombre, actualizado_en = now() where id = p_bot;
end $$;

create function public.marcar_principal(p_bot bigint) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('administrar_bot');
  perform bot_editable(p_bot);
  if not exists (select 1 from bot_flujos where bot_id = p_bot and estado = 'publicada') then
    raise exception 'Publica el bot antes de marcarlo como principal: el principal atiende a todos los clientes.';
  end if;
  update bots set principal = false, actualizado_en = now() where principal and id <> p_bot;
  update bots set principal = true, actualizado_en = now() where id = p_bot;
end $$;

create function public.archivar_bot(p_bot bigint) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('administrar_bot');
  perform bot_de(p_bot);
  if (select principal from bots where id = p_bot) then
    raise exception 'El bot principal no se archiva: marca otro como principal primero.';
  end if;
  update bots set archivado = true, actualizado_en = now() where id = p_bot;
end $$;

create function public.desarchivar_bot(p_bot bigint) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('administrar_bot');
  perform bot_de(p_bot);
  update bots set archivado = false, actualizado_en = now() where id = p_bot;
end $$;

-- --------------------------------------------------------------------------- --
-- Privilegios
-- --------------------------------------------------------------------------- --
revoke all on public.bots from anon;
revoke insert, update, delete, truncate on public.bots from authenticated;
alter table public.bots enable row level security;
create policy bots_lectura on public.bots for select to authenticated
  using ((select public.tiene_permiso('administrar_bot')));

revoke execute on function
  public.bot_de(bigint), public.bot_editable(bigint), public.borrador_del_flujo(bigint), public.cuadro_del_borrador(text, bigint),
  public.copiar_cuadros(bigint, bigint), public.crear_borrador(bigint), public.descartar_borrador(bigint),
  public.borrador_crear_mensaje(integer, integer, bigint), public.borrador_guardar_cuadro(text, text, text, jsonb, bigint),
  public.borrador_conectar(text, text, text, bigint), public.borrador_mover(text, integer, integer, bigint),
  public.borrador_borrar_cuadro(text, bigint), public.cambios_publicados_despues(bigint),
  public.publicar_borrador(text, boolean, bigint), public.borrador_desde_version(integer, boolean, bigint),
  public.editar_cuadro(text, text, jsonb, bigint), public.restaurar_cuadro(text, bigint),
  public.crear_bot(text, bigint), public.renombrar_bot(bigint, text), public.marcar_principal(bigint),
  public.archivar_bot(bigint), public.desarchivar_bot(bigint)
from public, anon;
revoke execute on function
  public.bot_de(bigint), public.bot_editable(bigint), public.borrador_del_flujo(bigint), public.cuadro_del_borrador(text, bigint),
  public.copiar_cuadros(bigint, bigint)
from authenticated;
grant execute on function
  public.crear_borrador(bigint), public.descartar_borrador(bigint),
  public.borrador_crear_mensaje(integer, integer, bigint), public.borrador_guardar_cuadro(text, text, text, jsonb, bigint),
  public.borrador_conectar(text, text, text, bigint), public.borrador_mover(text, integer, integer, bigint),
  public.borrador_borrar_cuadro(text, bigint), public.cambios_publicados_despues(bigint),
  public.publicar_borrador(text, boolean, bigint), public.borrador_desde_version(integer, boolean, bigint),
  public.editar_cuadro(text, text, jsonb, bigint), public.restaurar_cuadro(text, bigint),
  public.crear_bot(text, bigint), public.renombrar_bot(bigint, text), public.marcar_principal(bigint),
  public.archivar_bot(bigint), public.desarchivar_bot(bigint)
to authenticated;

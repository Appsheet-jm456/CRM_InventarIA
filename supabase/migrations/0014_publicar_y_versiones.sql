-- 0014 · Publicar el borrador del flujo, historial y volver a una versión (F4·7, decisión 0026)
--
-- Diseño: docs/FLUJO-DEL-BOT.md. Solo se publica un flujo sano (RF-05); publicar archiva la versión anterior con
-- quién y cuándo (RF-06, el historial) y volver a una anterior la copia como borrador.

-- --------------------------------------------------------------------------- --
-- Qué impide publicar (RF-05)
-- --------------------------------------------------------------------------- --
-- [{clave, nombre, problema}] de una versión. Vacío: se puede publicar.
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
      select s.value from bot_cuadros k, jsonb_each_text(k.salidas) s
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
           or not exists (select 1 from bot_cuadros d where d.flujo_id = p_flujo and d.clave = o->>'destino'
                          and d.tipo not in ('aviso', 'ficha', 'equipos'))), '[]');
      if not (c.clave = any (alcanzados)) then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                     'problema', 'Ningún cuadro lleva a este mensaje: el cliente nunca lo verá.');
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

-- Cuadros de la versión publicada que alguien cambió (pestaña Mensajes) después de abrir el borrador: publicarlo
-- los pisaría.
create or replace function public.cambios_publicados_despues() returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('clave', p.clave, 'nombre', p.nombre, 'cuando', p.actualizado_en)
                            order by p.orden), '[]')
  from bot_flujos b
  join bot_flujos f on f.estado = 'publicada'
  join bot_cuadros p on p.flujo_id = f.id
  left join bot_cuadros d on d.flujo_id = b.id and d.clave = p.clave
  where b.estado = 'borrador' and p.actualizado_en > b.creado_en
    and (d.id is null or d.texto is distinct from p.texto or d.opciones is distinct from p.opciones)
$$;

-- --------------------------------------------------------------------------- --
-- Publicar (RF-05, RF-06)
-- --------------------------------------------------------------------------- --
create or replace function public.publicar_borrador(p_nota text default '', p_pisar boolean default false) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare b bot_flujos; problemas jsonb; choques jsonb;
begin
  perform exigir_permiso('administrar_bot');
  select * into b from bot_flujos where estado = 'borrador' for update;
  if not found then
    raise exception 'No hay un borrador para publicar' using errcode = 'P0002';
  end if;
  problemas := problemas_del_flujo(b.id);
  if jsonb_array_length(problemas) > 0 then
    raise exception 'El borrador tiene % cosa(s) por resolver: %', jsonb_array_length(problemas),
      (select string_agg(coalesce(nullif(p->>'nombre', '') || ': ', '') || (p->>'problema'), ' · ')
       from jsonb_array_elements(problemas) p);
  end if;
  choques := cambios_publicados_despues();
  if jsonb_array_length(choques) > 0 and not p_pisar then
    raise exception 'CHOQUE: desde que abriste el borrador cambiaron en la versión publicada: %. Publicar los reemplaza por lo del borrador.',
      (select string_agg(c->>'nombre', ', ') from jsonb_array_elements(choques) c);
  end if;
  update bot_flujos set estado = 'archivada' where estado = 'publicada';
  update bot_flujos set estado = 'publicada', nota = btrim(coalesce(p_nota, '')), publicado_por = auth.uid(), publicado_en = now()
  where id = b.id;
  return b.version;
end $$;

-- --------------------------------------------------------------------------- --
-- Volver a una versión: se copia como borrador para revisarla y publicarla (RF-06)
-- --------------------------------------------------------------------------- --
create or replace function public.borrador_desde_version(p_version integer, p_reemplazar boolean default false) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare origen bot_flujos; nuevo bot_flujos;
begin
  perform exigir_permiso('administrar_bot');
  select * into origen from bot_flujos where version = p_version and estado <> 'borrador';
  if not found then
    raise exception 'Esa versión no existe' using errcode = 'P0002';
  end if;
  if exists (select 1 from bot_flujos where estado = 'borrador') then
    if not p_reemplazar then
      raise exception 'Ya hay un borrador abierto: descártalo o reemplázalo.';
    end if;
    delete from bot_flujos where estado = 'borrador';
  end if;
  insert into bot_flujos (version, estado, nota, creado_por)
  values ((select max(version) + 1 from bot_flujos), 'borrador', format('A partir de la versión %s', p_version), auth.uid())
  returning * into nuevo;
  insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, inicio, texto, texto_original, opciones, opciones_original,
                           opciones_codigo, max_titulo, marcas, formato, salidas, al_entrar, x, y, actualizado_por)
  select nuevo.id, clave, tipo, nombre, orden, inicio, texto, texto_original, opciones, opciones_original,
         opciones_codigo, max_titulo, marcas, formato, salidas, al_entrar, x, y, auth.uid()
  from bot_cuadros where flujo_id = origen.id;
  return nuevo.version;
end $$;

-- La publicada se lee para comparar; las archivadas no se tocan (historial).
create or replace function public.versiones_no_se_editan() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare estado text;
begin
  select f.estado into estado from bot_flujos f where f.id = coalesce(new.flujo_id, old.flujo_id);
  if estado = 'archivada' then
    raise exception 'Una versión archivada no se cambia: vuelve a ella con un borrador.';
  end if;
  return coalesce(new, old);
end $$;

create trigger bot_cuadros_archivados before update or delete on public.bot_cuadros
  for each row execute function public.versiones_no_se_editan();

-- --------------------------------------------------------------------------- --
-- Privilegios
-- --------------------------------------------------------------------------- --
revoke execute on function
  public.problemas_del_flujo(bigint), public.cambios_publicados_despues(), public.publicar_borrador(text, boolean),
  public.borrador_desde_version(integer, boolean), public.versiones_no_se_editan()
from public, anon;
revoke execute on function public.problemas_del_flujo(bigint), public.versiones_no_se_editan() from authenticated;
grant execute on function public.cambios_publicados_despues(), public.publicar_borrador(text, boolean),
  public.borrador_desde_version(integer, boolean)
to authenticated;

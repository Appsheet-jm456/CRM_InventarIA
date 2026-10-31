-- 0033 · Lista de leads (F4·30 C, docs/LEADS.md §1): búsqueda y filtros paginados en la base, acciones en grupo y vistas guardadas
--
-- RL-01: la lista se pagina y se cuenta en la base; el navegador nunca carga todos los leads.
-- RL-02: cada acción en grupo reutiliza las funciones de la Bandeja y el Embudo (mismos permisos y reglas) y queda en el historial (0032).

-- --------------------------------------------------------------------------- --
-- Búsqueda: corre con los permisos de quien consulta (RLS de leads: el asesor ve los suyos y los sin asignar)
-- --------------------------------------------------------------------------- --
create or replace function public.leads_lista(p jsonb) returns jsonb
language plpgsql stable
set search_path = public, extensions, pg_temp
as $$
declare
  f_q        text := nullif(btrim(p ->> 'q'), '');
  f_patron   text;
  f_digitos  text;
  f_estado   text := coalesce(nullif(p ->> 'estado', ''), 'activos');
  f_embudo   bigint := nullif(p ->> 'embudo', '')::bigint;
  f_etapa    bigint := nullif(p ->> 'etapa', '')::bigint;
  f_resp     text := nullif(p ->> 'responsable', '');
  f_etiqueta text := nullif(btrim(p ->> 'etiqueta'), '');
  f_vencidas boolean := coalesce((p ->> 'vencidas')::boolean, false);
  f_campo_f  text := coalesce(nullif(p ->> 'fecha_campo', ''), 'contacto');
  f_desde    timestamptz := (nullif(p ->> 'desde', '')::date)::timestamp at time zone 'America/Bogota';
  f_hasta    timestamptz := ((nullif(p ->> 'hasta', '')::date) + 1)::timestamp at time zone 'America/Bogota';
  f_atributo text := nullif(p ->> 'atributo', '');
  f_valor_at text := nullif(btrim(p ->> 'valor_atributo'), '');
  f_orden    text := coalesce(nullif(p ->> 'orden', ''), 'contacto');
  f_asc_     boolean := coalesce(p ->> 'dir', 'desc') = 'asc';
  f_exportar boolean := coalesce((p ->> 'exportar')::boolean, false);
  f_tamano   integer := greatest(1, least(coalesce((p ->> 'tamano')::int, 50), 200));
  f_pagina   integer := greatest(1, coalesce((p ->> 'pagina')::int, 1));
  r jsonb;
begin
  if f_estado not in ('activos', 'ganados', 'perdidos', 'archivados', 'papelera', 'todos') then
    raise exception 'Estado de la lista no válido';
  end if;
  if f_exportar then                                                           -- f_exportar datos personales pide su permiso
    perform exigir_permiso('exportar_leads');
    f_tamano := 10000; f_pagina := 1;
  end if;
  if f_q is not null then
    f_patron := '%' || replace(replace(replace(lower(f_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    f_digitos := nullif(regexp_replace(f_q, '\D', '', 'g'), '');
  end if;

  with base as (
    select l.*
      from leads l
     where (f_estado = 'todos' and l.eliminado_en is null
            or f_estado = 'papelera' and l.eliminado_en is not null
            or f_estado = 'archivados' and l.archivado_en is not null and l.eliminado_en is null
            or f_estado in ('activos', 'ganados', 'perdidos') and l.archivado_en is null and l.eliminado_en is null)
       and (f_estado <> 'ganados' or exists (select 1 from oportunidades o where o.lead_id = l.id and o.estado = 'ganada'))
       and (f_estado <> 'perdidos' or exists (select 1 from oportunidades o where o.lead_id = l.id and o.estado = 'perdida'))
       and (f_q is null
            or lower(l.nombre) like f_patron or lower(coalesce(l.cotiz_producto, '')) like f_patron
            or (f_digitos is not null and length(f_digitos) >= 3 and l.telefono like '%' || f_digitos || '%')
            or exists (select 1 from mensajes m where m.lead_id = l.id and lower(m.texto) like f_patron))
       and (f_embudo is null or exists (select 1 from oportunidades o where o.lead_id = l.id and o.embudo_id = f_embudo
                                        and (o.estado = 'abierta' or f_estado <> 'activos')))
       and (f_etapa is null or exists (select 1 from oportunidades o where o.lead_id = l.id and o.etapa_id = f_etapa))
       and (f_resp is null or f_resp = 'sin' and l.asignado_a is null or f_resp <> 'sin' and l.asignado_a::text = f_resp)
       and (f_etiqueta is null or l.etiquetas @> array[f_etiqueta])
       and (not f_vencidas or exists (select 1 from seguimientos s where s.lead_id = l.id and s.estado = 'pendiente' and s.vence_en < now()))
       and (f_desde is null or (case when f_campo_f = 'creado' then l.creado_en else l.fecha_ultimo_contacto end) >= f_desde)
       and (f_hasta is null or (case when f_campo_f = 'creado' then l.creado_en else l.fecha_ultimo_contacto end) < f_hasta)
       and (f_atributo is null or (f_valor_at is null and l.atributos ? f_atributo
                                 or f_valor_at is not null and (lower(l.atributos ->> f_atributo) like '%' || lower(f_valor_at) || '%'
                                                              or l.atributos -> f_atributo @> to_jsonb(f_valor_at))))
  ),
  numeradas as (
    select b.*, row_number() over (order by
       case when f_orden = 'nombre' and f_asc_ then lower(b.nombre) end asc nulls last,
       case when f_orden = 'nombre' and not f_asc_ then lower(b.nombre) end desc nulls last,
       case when f_orden = 'valor' and f_asc_ then b.valor_estimado end asc nulls last,
       case when f_orden = 'valor' and not f_asc_ then b.valor_estimado end desc nulls last,
       case when f_orden = 'creado' and f_asc_ then b.creado_en end asc,
       case when f_orden = 'creado' and not f_asc_ then b.creado_en end desc,
       case when f_orden = 'contacto' and f_asc_ then b.fecha_ultimo_contacto end asc nulls first,
       case when f_orden = 'contacto' and not f_asc_ then b.fecha_ultimo_contacto end desc nulls last,
       b.id desc) as rn
      from base b
  )
  select jsonb_build_object(
    'total', (select count(*) from numeradas),
    'valor', (select coalesce(sum(valor_estimado), 0) from numeradas),
    'pagina', f_pagina, 'tamano', f_tamano,
    'filas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'nombre', x.nombre, 'telefono', x.telefono, 'etapa_bot', x.etapa, 'etiquetas', x.etiquetas,
        'valor', x.valor_estimado, 'ultimo_mensaje', x.ultimo_mensaje, 'ultimo_contacto', x.fecha_ultimo_contacto,
        'creado', x.creado_en, 'origen', x.origen, 'atributos', x.atributos, 'asignado_a', x.asignado_a,
        'responsable', (select u.nombre from usuarios u where u.id = x.asignado_a),
        'estado_chat', x.estado_chat, 'producto', x.cotiz_producto,
        'archivado', x.archivado_en, 'eliminado', x.eliminado_en,
        'oportunidad', (select jsonb_build_object('id', o.id, 'embudo', em.nombre, 'etapa', e.nombre, 'estado', o.estado, 'color', e.color)
                          from oportunidades o join etapas e on e.id = o.etapa_id join embudos em on em.id = o.embudo_id
                         where o.lead_id = x.id
                         order by (o.estado = 'abierta') desc, o.actualizado_en desc nulls last, o.id desc limit 1),
        'vencidas', (select count(*) from seguimientos s where s.lead_id = x.id and s.estado = 'pendiente' and s.vence_en < now())
      ) order by x.rn)
      from numeradas x where x.rn > (f_pagina - 1) * f_tamano and x.rn <= f_pagina * f_tamano), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Etiquetas en uso (para el filtro y para poner/quitar en grupo)
create or replace function public.leads_etiquetas() returns setof text
language sql stable
set search_path = public, pg_temp
as $$ select distinct unnest(etiquetas) from leads where eliminado_en is null order by 1 $$;

-- --------------------------------------------------------------------------- --
-- Acciones en grupo (RL-02): una por lead, con las funciones de siempre; lo que falla en un lead no frena a los demás
-- --------------------------------------------------------------------------- --
create or replace function public.leads_en_grupo(p_accion text, p_ids bigint[], p_dato jsonb default '{}') returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  id_ bigint; hechos integer := 0; errores jsonb := '[]'; e etapas; o oportunidades; nueva bigint; et text;
begin
  perform exigir_permiso('atender_bandeja');
  if p_accion not in ('responsable', 'etapa', 'etiqueta_poner', 'etiqueta_quitar', 'tarea', 'archivar', 'desarchivar', 'eliminar', 'restaurar') then
    raise exception 'Acción no válida';
  end if;
  if cardinality(p_ids) > 500 then
    raise exception 'Máximo 500 leads por acción';
  end if;
  if p_accion in ('archivar', 'desarchivar') then
    return jsonb_build_object('hechos', leads_archivar(p_ids, p_accion = 'archivar'), 'errores', errores);
  end if;
  if p_accion in ('eliminar', 'restaurar') then
    return jsonb_build_object('hechos', leads_eliminar(p_ids, p_accion = 'restaurar'), 'errores', errores);
  end if;
  if p_accion = 'etapa' then
    select * into e from etapas where id = (p_dato ->> 'etapa')::bigint;
    if not found then raise exception 'Esa etapa no existe'; end if;
  end if;
  et := nullif(btrim(p_dato ->> 'etiqueta'), '');
  if p_accion like 'etiqueta%' and (et is null or length(et) > 40) then
    raise exception 'Escribe la etiqueta (máximo 40 caracteres)';
  end if;

  foreach id_ in array (select array_agg(distinct x) from unnest(p_ids) x) loop
    begin
      if p_accion = 'responsable' then
        perform asignar_conversacion(id_, (p_dato ->> 'usuario')::uuid);
      elsif p_accion = 'etapa' then
        -- La oportunidad abierta del cliente en el embudo de esa etapa; si no tiene, se le abre una.
        select * into o from oportunidades where lead_id = id_ and embudo_id = e.embudo_id and estado = 'abierta';
        if not found then
          nueva := abrir_oportunidad(id_, e.embudo_id);
          select * into o from oportunidades where id = nueva;
        end if;
        if o.etapa_id <> e.id then
          perform mover_oportunidad(o.id, e.id, p_dato ->> 'motivo');
        end if;
      elsif p_accion = 'tarea' then
        nueva := crear_seguimiento(id_, p_dato ->> 'que', (p_dato ->> 'vence')::timestamptz, nullif(p_dato ->> 'usuario', '')::uuid);
        update seguimientos set tipo = coalesce(nullif(btrim(p_dato ->> 'tipo'), ''), 'Seguimiento') where id = nueva;
      else  -- etiquetas
        if not exists (select 1 from leads where id = id_ and puede_atender(asignado_a)) then
          raise exception 'Esta conversación la atiende otro asesor';
        end if;
        update leads set etiquetas = case when p_accion = 'etiqueta_poner'
                                          then (select array_agg(distinct x) from unnest(etiquetas || et) x)
                                          else array_remove(etiquetas, et) end
         where id = id_ and (et = any (etiquetas)) = (p_accion = 'etiqueta_quitar');
        if not found then continue; end if;                                    -- ya la tenía (o ya no): no cuenta como hecho
      end if;
      hechos := hechos + 1;
    exception when others then
      errores := errores || jsonb_build_object('lead', id_, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('hechos', hechos, 'errores', errores);
end $$;

-- --------------------------------------------------------------------------- --
-- Vistas guardadas: filtros y columnas de cada usuario, una predeterminada
-- --------------------------------------------------------------------------- --
create table public.lead_vistas (
  id            bigint generated always as identity primary key,
  usuario_id    uuid not null default auth.uid() references public.usuarios (id) on delete cascade,
  nombre        text not null check (btrim(nombre) <> '' and length(nombre) <= 40),
  filtros       jsonb not null default '{}' check (jsonb_typeof(filtros) = 'object'),
  columnas      text[] not null default '{}',
  predeterminada boolean not null default false,
  creado_en     timestamptz not null default now(),
  unique (usuario_id, nombre)
);
create unique index lead_vistas_una_predeterminada on public.lead_vistas (usuario_id) where predeterminada;

alter table public.lead_vistas enable row level security;
revoke all on public.lead_vistas from anon, authenticated;
grant select, insert, update, delete on public.lead_vistas to authenticated;
create policy lead_vistas_propias on public.lead_vistas for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid() and (select public.es_usuario_activo()));

revoke execute on function public.leads_lista(jsonb), public.leads_etiquetas(), public.leads_en_grupo(text, bigint[], jsonb) from public, anon;
grant execute on function public.leads_lista(jsonb), public.leads_etiquetas(), public.leads_en_grupo(text, bigint[], jsonb) to authenticated;

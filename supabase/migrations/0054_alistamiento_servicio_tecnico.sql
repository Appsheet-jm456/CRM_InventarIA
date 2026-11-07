-- 0054 · Alistamiento con servicio técnico: bloque A (F4·50, docs/ALISTAMIENTO-Y-VIDEO-TECNICO.md, RAL-01 a RAL-04, RAL-06, RAL-08, RAL-09)
--
-- Sin embudo ni etapas nuevas: el embudo de Cliente Final sigue Alistamiento → Despachado → Vendido → Perdido. Lo nuevo es un registro
-- por pedido (`alistamientos`) con campos que controlan el trabajo del servicio técnico:
--   · el asesor pone el documento (OP de garantía POS o FVE) que le da contabilidad;
--   · el técnico (un solo usuario «Servicio técnico» con «¿Quién eres?») toma el pedido, marca el checklist y pulsa «Revisado, listo
--     para despachar» (control interno: no avisa al cliente ni mueve la etapa);
--   · cada paso queda en la línea de tiempo del cliente con el nombre del técnico.
-- El video por equipo (bloque B) y los envíos al cliente (bloque C) se agregan después.

-- --------------------------------------------------------------------------- --
-- Permiso, rol Técnico y lista de técnicos para «¿Quién eres?»
-- --------------------------------------------------------------------------- --
insert into public.permisos (codigo, descripcion)
values ('gestionar_alistamiento', 'Servicio técnico: tomar pedidos en alistamiento, marcar la revisión y subir los videos de soporte');
insert into public.rol_permisos (rol_id, permiso)
select r.id, 'gestionar_alistamiento' from roles r where r.nombre = 'administrador';

insert into public.roles (nombre) values ('Técnico');
insert into public.rol_permisos (rol_id, permiso)
select r.id, 'gestionar_alistamiento' from roles r where r.nombre = 'Técnico';

create table public.alistamiento_tecnicos (
  id     bigint generated always as identity primary key,
  nombre text not null unique check (btrim(nombre) <> '' and length(nombre) <= 60),
  activo boolean not null default true
);
insert into public.alistamiento_tecnicos (nombre) values ('Camilo Osorio'), ('Sebastián Melenje'), ('Josep');
alter table public.alistamiento_tecnicos enable row level security;
create policy tecnicos_lectura on public.alistamiento_tecnicos for select to authenticated using (true);
revoke all on public.alistamiento_tecnicos from anon, authenticated;
grant select on public.alistamiento_tecnicos to authenticated;

-- --------------------------------------------------------------------------- --
-- Un registro por pedido que entra a Alistamiento
-- --------------------------------------------------------------------------- --
create table public.alistamientos (
  id             bigint generated always as identity primary key,
  oportunidad_id bigint not null unique references public.oportunidades (id) on delete cascade,
  lead_id        bigint not null references public.leads (id) on delete cascade,
  equipos        jsonb  not null default '[]',   -- [{codigo, nombre}] al entrar a Alistamiento
  doc_tipo       text check (doc_tipo in ('OP', 'FVE')),
  doc_numero     text check (doc_numero ~ '^[A-Za-z0-9./ -]{1,40}$'),
  doc_por        uuid references public.usuarios (id) on delete set null,
  doc_en         timestamptz,
  estado         text not null default 'por_revisar' check (estado in ('por_revisar', 'en_revision', 'listo')),
  tecnico        text,
  tomado_en      timestamptz,
  checklist      jsonb  not null default '{}',   -- {clave: {por, en}}
  listo_en       timestamptz,
  listo_por      text,
  creado_en      timestamptz not null default now(),
  check ((doc_tipo is null) = (doc_numero is null))
);
create index alistamientos_lead on public.alistamientos (lead_id);
comment on table public.alistamientos is 'F4·50: control del servicio técnico por pedido en Alistamiento. No es una etapa: el embudo no cambia.';
alter table public.alistamientos enable row level security;
create policy alistamientos_lectura on public.alistamientos for select to authenticated using (puede_ver_lead(lead_id));
revoke all on public.alistamientos from anon, authenticated;
grant select on public.alistamientos to authenticated;

-- El historial del cliente admite el tipo «alistamiento».
alter table public.lead_eventos drop constraint lead_eventos_tipo_check;
alter table public.lead_eventos add constraint lead_eventos_tipo_check check (tipo = any (array['etapa', 'oportunidad', 'responsable',
  'nombre', 'valor', 'etiquetas', 'atributo', 'archivado', 'desarchivado', 'eliminado', 'restaurado', 'tarea', 'tarea_cumplida', 'nota',
  'ficha', 'retorno', 'pago', 'alistamiento']));

-- --------------------------------------------------------------------------- --
-- Se crea solo cuando la oportunidad llega a la etapa Alistamiento (y para las que ya están ahí)
-- --------------------------------------------------------------------------- --
create function public.alistamiento_equipos_de(p_producto text) returns jsonb
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('codigo', c, 'nombre', coalesce(nullif(btrim(concat_ws(' ', p.marca, p.modelo)), ''), c)) order by o), '[]')
    from (select btrim(x) as c, o from unnest(string_to_array(coalesce(p_producto, ''), ',')) with ordinality as t(x, o) where btrim(x) <> '') k
    left join productos p on upper(p.codigo) = upper(k.c)
$$;

create function public.alistamiento_crear() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.estado = 'abierta' and new.etapa_id = (select e.id from etapas e where e.embudo_id = new.embudo_id and e.nombre = 'Alistamiento') then
    insert into alistamientos (oportunidad_id, lead_id, equipos)
    values (new.id, new.lead_id, alistamiento_equipos_de(new.producto))
    on conflict (oportunidad_id) do nothing;
  end if;
  return new;
end $$;
create trigger oportunidades_alistamiento after insert or update of etapa_id on public.oportunidades
  for each row execute function public.alistamiento_crear();

insert into public.alistamientos (oportunidad_id, lead_id, equipos)
select o.id, o.lead_id, alistamiento_equipos_de(o.producto)
  from oportunidades o join etapas e on e.id = o.etapa_id and e.nombre = 'Alistamiento'
 where o.estado = 'abierta'
on conflict (oportunidad_id) do nothing;

-- --------------------------------------------------------------------------- --
-- Documento del pedido: lo pone el asesor (RAL-03)
-- --------------------------------------------------------------------------- --
create function public.alistamiento_documento(p_id bigint, p_tipo text, p_numero text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; quien text; numero text := btrim(coalesce(p_numero, ''));
begin
  perform exigir_permiso('gestionar_oportunidades');
  if p_tipo not in ('OP', 'FVE') then
    raise exception 'El documento es OP de garantía (POS) o FVE (factura electrónica).';
  end if;
  if numero !~ '^[A-Za-z0-9./ -]{1,40}$' then
    raise exception 'Escribe el número del documento (letras, números, guion, punto o barra; máximo 40).';
  end if;
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if not puede_ver_lead(a.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  update alistamientos set doc_tipo = p_tipo, doc_numero = numero, doc_por = auth.uid(), doc_en = now() where id = p_id;
  perform lead_evento(a.lead_id, 'alistamiento', jsonb_build_object('doc', a.doc_tipo || ' ' || coalesce(a.doc_numero, '')),
                      jsonb_build_object('doc', p_tipo || ' ' || numero),
                      format('Documento del pedido: %s %s (lo puso %s)', p_tipo, numero, coalesce(quien, 'un asesor')));
end $$;
revoke execute on function public.alistamiento_documento(bigint, text, text) from public, anon;
grant execute on function public.alistamiento_documento(bigint, text, text) to authenticated;

-- --------------------------------------------------------------------------- --
-- Servicio técnico (RAL-06, RAL-08): «¿Quién eres?» se valida contra la lista
-- --------------------------------------------------------------------------- --
create function public.alistamiento_validar_tecnico(p_tecnico text) returns text
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare t text;
begin
  select nombre into t from alistamiento_tecnicos where nombre = p_tecnico and activo;
  if t is null then
    raise exception 'Elige quién eres (Camilo, Sebastián o Josep).';
  end if;
  return t;
end $$;
revoke execute on function public.alistamiento_validar_tecnico(text) from public, anon, authenticated;

create function public.alistamiento_tomar(p_id bigint, p_tecnico text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; t text;
begin
  perform exigir_permiso('gestionar_alistamiento');
  t := alistamiento_validar_tecnico(p_tecnico);
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if a.estado = 'listo' then
    raise exception 'Ese pedido ya está listo para despachar.';
  end if;
  if a.estado = 'en_revision' and a.tecnico <> t then
    raise exception 'Ya lo tomó %.', a.tecnico;
  end if;
  update alistamientos set estado = 'en_revision', tecnico = t, tomado_en = coalesce(tomado_en, now()) where id = p_id;
  if a.estado = 'por_revisar' then
    perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('estado', 'en_revision', 'tecnico', t),
                        format('%s tomó el pedido para revisión', t));
  end if;
end $$;
revoke execute on function public.alistamiento_tomar(bigint, text) from public, anon;
grant execute on function public.alistamiento_tomar(bigint, text) to authenticated;

create function public.alistamiento_checklist(p_id bigint, p_clave text, p_valor boolean, p_tecnico text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; t text;
begin
  perform exigir_permiso('gestionar_alistamiento');
  t := alistamiento_validar_tecnico(p_tecnico);
  if p_clave not in ('revision', 'inspeccion', 'mantenimiento', 'pasta_termica', 'prueba_funcional') then
    raise exception 'Ese punto del checklist no existe.';
  end if;
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if a.estado <> 'en_revision' then
    raise exception 'Toma el pedido antes de marcar el checklist.';
  end if;
  update alistamientos set checklist = case when p_valor
    then checklist || jsonb_build_object(p_clave, jsonb_build_object('por', t, 'en', now()))
    else checklist - p_clave end
  where id = p_id;
end $$;
revoke execute on function public.alistamiento_checklist(bigint, text, boolean, text) from public, anon;
grant execute on function public.alistamiento_checklist(bigint, text, boolean, text) to authenticated;

-- «✅ Revisado, listo para despachar»: control interno. No avisa al cliente ni cambia la etapa; deja la etiqueta para el asesor.
create function public.alistamiento_listo(p_id bigint, p_tecnico text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; t text;
begin
  perform exigir_permiso('gestionar_alistamiento');
  t := alistamiento_validar_tecnico(p_tecnico);
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if a.estado <> 'en_revision' then
    raise exception 'Toma el pedido antes de marcarlo como revisado.';
  end if;
  if a.doc_numero is null then
    raise exception 'Falta el documento (OP o FVE): lo pone el asesor.';
  end if;
  -- Bloque B: aquí se exigirá además un video por cada equipo (RAL-06).
  update alistamientos set estado = 'listo', listo_en = now(), listo_por = t where id = p_id;
  update leads set etiquetas = array_append(coalesce(etiquetas, '{}'), 'Listo-Para-Despachar')
   where id = a.lead_id and not 'Listo-Para-Despachar' = any(coalesce(etiquetas, '{}'));
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('estado', 'listo', 'tecnico', t),
                      format('Revisado, listo para despachar (%s)', t));
end $$;
revoke execute on function public.alistamiento_listo(bigint, text) from public, anon;
grant execute on function public.alistamiento_listo(bigint, text) to authenticated;

-- Deshacer un «listo» marcado por error: vuelve a revisión y quita la etiqueta.
create function public.alistamiento_reabrir(p_id bigint, p_tecnico text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; t text;
begin
  perform exigir_permiso('gestionar_alistamiento');
  t := alistamiento_validar_tecnico(p_tecnico);
  select * into a from alistamientos where id = p_id for update;
  if not found or a.estado <> 'listo' then
    raise exception 'Ese pedido no está marcado como listo.';
  end if;
  update alistamientos set estado = 'en_revision', listo_en = null, listo_por = null where id = p_id;
  update leads set etiquetas = array_remove(coalesce(etiquetas, '{}'), 'Listo-Para-Despachar') where id = a.lead_id;
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('estado', 'en_revision'),
                      format('%s volvió a abrir la revisión', t));
end $$;
revoke execute on function public.alistamiento_reabrir(bigint, text) from public, anon;
grant execute on function public.alistamiento_reabrir(bigint, text) to authenticated;

-- --------------------------------------------------------------------------- --
-- Lo que ve el servicio técnico: solo el pedido, sin chats, pagos ni teléfono (RAL-08)
-- --------------------------------------------------------------------------- --
create function public.servicio_tecnico_pedidos() returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('gestionar_alistamiento');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'cliente', coalesce(nullif(split_part(btrim(l.nombre), ' ', 1), ''), 'Cliente'),
        'entrega', case l.atributos ->> 'venta_online' when 'true' then 'envio' when 'false' then 'tienda' else null end,
        'equipos', a.equipos, 'doc_tipo', a.doc_tipo, 'doc_numero', a.doc_numero, 'estado', a.estado, 'tecnico', a.tecnico,
        'tomado_en', a.tomado_en, 'listo_en', a.listo_en, 'listo_por', a.listo_por, 'checklist', a.checklist, 'entro_en', a.creado_en)
      order by case a.estado when 'por_revisar' then 0 when 'en_revision' then 1 else 2 end, a.creado_en)
    from alistamientos a
    join oportunidades o on o.id = a.oportunidad_id and o.estado = 'abierta'
    join etapas e on e.id = o.etapa_id and e.nombre = 'Alistamiento'
    join leads l on l.id = a.lead_id and l.eliminado_en is null), '[]');
end $$;
revoke execute on function public.servicio_tecnico_pedidos() from public, anon;
grant execute on function public.servicio_tecnico_pedidos() to authenticated;

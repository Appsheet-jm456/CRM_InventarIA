-- 0006 · Varios embudos y oportunidades por cliente (F3·10, decisión 0022)
--
-- Diseño: docs/EMBUDOS.md. Cada paso de un cliente por un embudo es una oportunidad (RE-02), con una sola
-- abierta por cliente y embudo (RE-03). El bot no cambia su forma de guardar: la base traduce sus
-- etiquetas y su etapa de leads a oportunidades (RE-04, RE-05).

-- --------------------------------------------------------------------------- --
-- Embudos
-- --------------------------------------------------------------------------- --
create table public.embudos (
  id             bigint generated always as identity primary key,
  nombre         text not null unique check (btrim(nombre) <> ''),
  descripcion    text not null default '',
  orden          integer not null,
  etiqueta_bot   text not null default '',
  predeterminado boolean not null default false,
  activo         boolean not null default true
);
comment on column public.embudos.etiqueta_bot is
  'Cuando el bot le pone esta etiqueta al cliente, se le abre una oportunidad en este embudo (RE-04).';
create unique index embudos_un_predeterminado on public.embudos (predeterminado) where predeterminado;

insert into public.embudos (nombre, descripcion, orden, etiqueta_bot, predeterminado) values
  ('Cliente Final', 'Compra online', 1, 'Interes-Productos', true),
  ('Pos Venta', 'Soporte técnico y garantías', 2, 'Interes-Soporte', false),
  ('Distribuidor', 'Venta al por mayor', 3, 'Interes-Distribuidor', false);

-- --------------------------------------------------------------------------- --
-- Etapas por embudo
-- --------------------------------------------------------------------------- --
alter table public.leads drop constraint leads_etapa_fkey;
comment on column public.leads.etapa is
  'Etapa del bot en el embudo Cliente Final. La base la pasa a la oportunidad (RE-05); el tablero lee oportunidades.';

delete from public.etapas where nombre = 'Distribuidores';   -- pasa a ser el embudo Distribuidor

alter table public.etapas add column embudo_id bigint references public.embudos;
update public.etapas set embudo_id = (select id from public.embudos where predeterminado);
alter table public.etapas alter column embudo_id set not null;
alter table public.etapas drop constraint etapas_nombre_key;
alter table public.etapas add constraint etapas_embudo_nombre_key unique (embudo_id, nombre);
create index on public.etapas (embudo_id, orden);

insert into public.etapas (embudo_id, nombre, orden, color, cierre)
select e.id, x.nombre, x.orden, x.color, x.cierre
from public.embudos e
join (values
  ('Pos Venta', 'Recibido', 1, 'Azul', ''),
  ('Pos Venta', 'Diagnóstico', 2, 'Amarillo', ''),
  ('Pos Venta', 'En garantía o reparación', 3, 'Naranja', ''),
  ('Pos Venta', 'Listo para entregar', 4, 'Morado', ''),
  ('Pos Venta', 'Resuelto', 5, 'Verde', 'ganada'),
  ('Pos Venta', 'No procede', 6, 'Rojo', 'perdida'),
  ('Distribuidor', 'Nuevo', 1, 'Gris', ''),
  ('Distribuidor', 'Datos de la empresa', 2, 'Azul', ''),
  ('Distribuidor', 'Lista de precios enviada', 3, 'Amarillo', ''),
  ('Distribuidor', 'Negociación', 4, 'Naranja', ''),
  ('Distribuidor', 'Primer pedido', 5, 'Verde', 'ganada'),
  ('Distribuidor', 'Perdido', 6, 'Rojo', 'perdida')
) as x (embudo, nombre, orden, color, cierre) on x.embudo = e.nombre;

-- --------------------------------------------------------------------------- --
-- Oportunidades
-- --------------------------------------------------------------------------- --
create table public.oportunidades (
  id             bigint generated always as identity primary key,
  lead_id        bigint not null references public.leads on delete cascade,
  embudo_id      bigint not null references public.embudos,
  etapa_id       bigint not null references public.etapas,
  estado         text not null default 'abierta' check (estado in ('abierta', 'ganada', 'perdida')),
  valor_estimado numeric(14, 2),
  producto       text not null default '',
  motivo_perdido text,
  notas          text not null default '',
  creado_por     uuid references public.usuarios,   -- null: la abrió el bot
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  cerrado_en     timestamptz
);
comment on table public.oportunidades is 'Paso de un cliente por un embudo (RE-02). El estado lo deriva la etapa.';
create unique index oportunidades_una_abierta on public.oportunidades (lead_id, embudo_id) where estado = 'abierta';
create index on public.oportunidades (embudo_id, estado);
create index on public.oportunidades (lead_id);

alter table public.historial_etapas
  add column oportunidad_id bigint references public.oportunidades on delete cascade,
  add column embudo_id      bigint references public.embudos;

-- El estado sale de la etapa; la etapa tiene que ser del mismo embudo.
create or replace function public.oportunidades_derivar() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare e etapas;
begin
  select * into e from etapas where id = new.etapa_id;
  if e.embudo_id <> new.embudo_id then
    raise exception 'La etapa % no es de ese embudo', e.nombre;
  end if;
  new.estado := case e.cierre when 'ganada' then 'ganada' when 'perdida' then 'perdida' else 'abierta' end;
  if new.estado = 'abierta' then
    new.cerrado_en := null;
  elsif tg_op = 'INSERT' or old.estado = 'abierta' then
    new.cerrado_en := now();
  end if;
  if new.estado <> 'perdida' then
    new.motivo_perdido := null;
  end if;
  new.actualizado_en := now();
  return new;
end $$;

create trigger oportunidades_derivar before insert or update on public.oportunidades
  for each row execute function public.oportunidades_derivar();

-- Historial por oportunidad. Al cerrarse la de Cliente Final, el bot vuelve a empezar (RE-03).
create or replace function public.oportunidades_despues() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id then
    insert into historial_etapas (lead_id, oportunidad_id, embudo_id, de, a, usuario_id)
    values (new.lead_id, new.id, new.embudo_id,
            case when tg_op = 'UPDATE' then (select nombre from etapas where id = old.etapa_id) end,
            (select nombre from etapas where id = new.etapa_id), auth.uid());
  end if;
  if new.estado <> 'abierta' and (tg_op = 'INSERT' or old.estado = 'abierta')
     and exists (select 1 from embudos where id = new.embudo_id and predeterminado) then
    update leads set etapa = (select nombre from etapas where embudo_id = new.embudo_id and cierre = ''
                              order by orden limit 1)
    where id = new.lead_id;
  end if;
  return null;
end $$;

create trigger oportunidades_despues after insert or update on public.oportunidades
  for each row execute function public.oportunidades_despues();

-- Abre (o devuelve) la oportunidad abierta del cliente en un embudo, en su primera etapa o en la indicada.
create or replace function public.abrir_oportunidad_interna(p_lead bigint, p_embudo bigint, p_etapa bigint default null,
                                                            p_creado_por uuid default null)
returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare abierta bigint; primera bigint; nuevo bigint;
begin
  select id into abierta from oportunidades where lead_id = p_lead and embudo_id = p_embudo and estado = 'abierta';
  if found then
    return abierta;
  end if;
  select id into primera from etapas where embudo_id = p_embudo and cierre = '' order by orden limit 1;
  if primera is null then
    raise exception 'El embudo no tiene etapas abiertas';
  end if;
  insert into oportunidades (lead_id, embudo_id, etapa_id, creado_por)
  values (p_lead, p_embudo, coalesce(p_etapa, primera), p_creado_por)
  returning id into nuevo;
  return nuevo;
end $$;

-- --------------------------------------------------------------------------- --
-- Lo que escribe el bot en leads pasa a oportunidades (RE-04, RE-05)
-- --------------------------------------------------------------------------- --
drop trigger leads_historial on public.leads;
drop function public.leads_historial_etapa();

create or replace function public.leads_a_oportunidades() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  e embudos;
  destino etapas;
  actual record;
  op bigint;
begin
  -- RE-04: una etiqueta del bot abre la oportunidad en su embudo.
  for e in select * from embudos
           where activo and etiqueta_bot <> '' and etiqueta_bot = any (new.etiquetas)
             and (tg_op = 'INSERT' or not (etiqueta_bot = any (coalesce(old.etiquetas, '{}')))) loop
    perform abrir_oportunidad_interna(new.id, e.id);
  end loop;

  -- RE-05: solo el bot (sin usuario) mueve Cliente Final, solo hacia adelante, y le pasa valor y equipo.
  if auth.uid() is not null then
    return null;
  end if;
  select * into e from embudos where predeterminado;
  if not found then
    return null;
  end if;
  if tg_op = 'INSERT' or new.etapa is distinct from old.etapa then
    select * into destino from etapas where embudo_id = e.id and nombre = new.etapa and cierre = '';
    if found and destino.orden > (select min(orden) from etapas where embudo_id = e.id) then
      op := abrir_oportunidad_interna(new.id, e.id, destino.id);
      select o.id, et.orden into actual from oportunidades o join etapas et on et.id = o.etapa_id where o.id = op;
      if actual.orden < destino.orden then
        update oportunidades set etapa_id = destino.id where id = op;
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.valor_estimado is distinct from old.valor_estimado
                           or new.cotiz_producto is distinct from old.cotiz_producto) then
    update oportunidades set valor_estimado = coalesce(new.valor_estimado, valor_estimado),
                             producto = coalesce(nullif(new.cotiz_producto, ''), producto)
    where lead_id = new.id and embudo_id = e.id and estado = 'abierta';
  end if;
  return null;
end $$;

create trigger leads_a_oportunidades after insert or update of etapa, etiquetas, valor_estimado, cotiz_producto
  on public.leads for each row execute function public.leads_a_oportunidades();

-- Los clientes que ya estaban quedan con su oportunidad en Cliente Final, con su historial.
alter table public.oportunidades disable trigger oportunidades_despues;
insert into public.oportunidades (lead_id, embudo_id, etapa_id, valor_estimado, producto, motivo_perdido, creado_en)
select l.id, e.id, et.id, l.valor_estimado, l.cotiz_producto, l.motivo_perdido, l.creado_en
from public.leads l
join public.embudos e on e.predeterminado
join public.etapas et on et.embudo_id = e.id and et.nombre = l.etapa;
alter table public.oportunidades enable trigger oportunidades_despues;
update public.historial_etapas h set oportunidad_id = o.id, embudo_id = o.embudo_id
from public.oportunidades o where o.lead_id = h.lead_id and h.oportunidad_id is null;

-- --------------------------------------------------------------------------- --
-- Acciones de las personas
-- --------------------------------------------------------------------------- --
drop function public.mover_etapa(bigint, text, text);

create or replace function public.abrir_oportunidad(p_lead bigint, p_embudo bigint) returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('gestionar_oportunidades');
  if not puede_ver_lead(p_lead) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if not exists (select 1 from embudos where id = p_embudo and activo) then
    raise exception 'Ese embudo no existe o está inactivo';
  end if;
  if exists (select 1 from oportunidades where lead_id = p_lead and embudo_id = p_embudo and estado = 'abierta') then
    raise exception 'El cliente ya tiene una oportunidad abierta en ese embudo';
  end if;
  return abrir_oportunidad_interna(p_lead, p_embudo, null, auth.uid());
end $$;

-- RE-05 y RE-06: una persona mueve a cualquier etapa del embudo; la de cierre perdida pide motivo.
create or replace function public.mover_oportunidad(p_oportunidad bigint, p_etapa bigint, p_motivo text default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare o oportunidades; e etapas;
begin
  perform exigir_permiso('gestionar_oportunidades');
  select * into o from oportunidades where id = p_oportunidad for update;
  if not found then
    raise exception 'La oportunidad no existe' using errcode = 'P0002';
  end if;
  if not puede_ver_lead(o.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  select * into e from etapas where id = p_etapa and embudo_id = o.embudo_id;
  if not found then
    raise exception 'Esa etapa no es del embudo de la oportunidad';
  end if;
  if e.cierre = 'perdida' and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Para marcarla como perdida hace falta el motivo';
  end if;
  if e.cierre = '' and o.estado <> 'abierta' and exists (
       select 1 from oportunidades where lead_id = o.lead_id and embudo_id = o.embudo_id and estado = 'abierta') then
    raise exception 'El cliente ya tiene otra oportunidad abierta en ese embudo';
  end if;
  update oportunidades set etapa_id = p_etapa, motivo_perdido = case when e.cierre = 'perdida' then btrim(p_motivo) end
  where id = p_oportunidad;
end $$;

-- El embudo predeterminado no se borra.
create or replace function public.proteger_embudo_predeterminado() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'El embudo % es el predeterminado y no se borra', old.nombre;
end $$;

create trigger embudos_predeterminado before delete on public.embudos
  for each row when (old.predeterminado) execute function public.proteger_embudo_predeterminado();

-- --------------------------------------------------------------------------- --
-- Privilegios, RLS y tiempo real
-- --------------------------------------------------------------------------- --
revoke all on public.embudos, public.oportunidades from anon;
revoke insert, update, delete, truncate on public.oportunidades from authenticated;
revoke truncate on public.embudos from authenticated;
grant insert, update, delete on public.embudos to authenticated;

revoke execute on function
  public.oportunidades_derivar(), public.oportunidades_despues(), public.leads_a_oportunidades(),
  public.abrir_oportunidad_interna(bigint, bigint, bigint, uuid), public.proteger_embudo_predeterminado(),
  public.abrir_oportunidad(bigint, bigint), public.mover_oportunidad(bigint, bigint, text)
from public, anon;
revoke execute on function public.abrir_oportunidad_interna(bigint, bigint, bigint, uuid) from authenticated;
grant execute on function public.abrir_oportunidad(bigint, bigint), public.mover_oportunidad(bigint, bigint, text)
  to authenticated;

alter table public.embudos       enable row level security;
alter table public.oportunidades enable row level security;

create policy embudos_lectura on public.embudos for select to authenticated using ((select public.es_usuario_activo()));
create policy embudos_alta on public.embudos for insert to authenticated
  with check ((select public.tiene_permiso('administrar_embudo')));
create policy embudos_edicion on public.embudos for update to authenticated
  using ((select public.tiene_permiso('administrar_embudo')))
  with check ((select public.tiene_permiso('administrar_embudo')));
create policy embudos_baja on public.embudos for delete to authenticated
  using ((select public.tiene_permiso('administrar_embudo')));

create policy oportunidades_lectura on public.oportunidades for select to authenticated
  using (public.puede_ver_lead(lead_id));

alter publication supabase_realtime add table public.oportunidades, public.embudos;

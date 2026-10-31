-- 0035 · Archivar y papelera (F4·30 E, docs/LEADS.md §5)
--
-- Un lead archivado se desarchiva solo cuando el cliente vuelve a escribir. Uno en la papelera conserva su teléfono, pero si el cliente
-- vuelve a escribir entra como lead nuevo (RL-11). La papelera se vacía a los 30 días, y el administrador puede borrar ya a pedido del
-- cliente (Ley 1581): en los dos casos queda constancia sin datos personales y los archivos se borran del almacenamiento.

-- El teléfono es único solo entre los leads que no están en la papelera.
alter table public.leads drop constraint leads_telefono_key;
create unique index leads_telefono_activo on public.leads (telefono) where eliminado_en is null;

-- Si el cliente escribe, el lead archivado vuelve a las listas (el historial lo anota como «Desarchivado» por el sistema).
create or replace function public.mensajes_desarchivar() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update leads set archivado_en = null where id = new.lead_id and archivado_en is not null and eliminado_en is null;
  return new;
end $$;
create trigger mensajes_desarchivar after insert on public.mensajes
  for each row when (new.lado = 'cliente') execute function public.mensajes_desarchivar();

-- Restaurar desde la papelera no pisa a un lead nuevo con el mismo teléfono.
create or replace function public.leads_eliminar(p_ids bigint[], p_restaurar boolean default false) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  perform exigir_permiso('eliminar_leads');
  if p_restaurar then
    update leads l set eliminado_en = null
     where l.id = any (p_ids) and l.eliminado_en is not null
       and not exists (select 1 from leads x where x.telefono = l.telefono and x.eliminado_en is null);
  else
    update leads set eliminado_en = now() where id = any (p_ids) and eliminado_en is null;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- Constancia de lo borrado para siempre: sin nombre, teléfono ni mensajes.
create table public.leads_borrados (
  id         bigint generated always as identity primary key,
  lead_id    bigint not null,                                            -- el id que tenía (no es un dato personal)
  en         timestamptz not null default now(),
  usuario_id uuid references public.usuarios (id) on delete set null,    -- null: lo vació la papelera
  motivo     text not null check (motivo in ('papelera_30_dias', 'solicitud_cliente')),
  mensajes   integer not null default 0,
  archivos   integer not null default 0
);
alter table public.leads_borrados enable row level security;
revoke all on public.leads_borrados from anon, authenticated;
grant select on public.leads_borrados to authenticated;
create policy leads_borrados_lectura on public.leads_borrados for select to authenticated using ((select public.tiene_permiso('eliminar_leads')));

-- Borra leads con todo lo suyo (mensajes, oportunidades, tareas, cotizaciones, historial: en cascada) y devuelve las rutas de sus
-- archivos para que quien llama los quite del almacenamiento. Solo la usan las dos funciones de abajo.
create or replace function public.leads_purgar(p_ids bigint[], p_motivo text) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare media text[]; pdfs text[]; n integer;
begin
  select coalesce(array_agg(media_ruta), '{}') into media from mensajes where lead_id = any (p_ids) and media_ruta <> '';
  select coalesce(array_agg(pdf), '{}') into pdfs from cotizaciones where lead_id = any (p_ids) and coalesce(pdf, '') <> '';
  insert into leads_borrados (lead_id, usuario_id, motivo, mensajes, archivos)
  select l.id, (select id from usuarios where id = auth.uid()), p_motivo,
         (select count(*) from mensajes m where m.lead_id = l.id),
         (select count(*) from mensajes m where m.lead_id = l.id and m.media_ruta <> '')
           + (select count(*) from cotizaciones c where c.lead_id = l.id and coalesce(c.pdf, '') <> '')
    from leads l where l.id = any (p_ids);
  delete from leads where id = any (p_ids);
  get diagnostics n = row_count;
  return jsonb_build_object('borrados', n, 'media', to_jsonb(media), 'cotizaciones', to_jsonb(pdfs));
end $$;

-- La papelera se vacía a los 30 días (la llama el receptor una vez por hora, con la llave del servidor).
create or replace function public.leads_vaciar_papelera() returns jsonb
language sql security definer
set search_path = public, pg_temp
as $$
  select leads_purgar(coalesce(array_agg(id), '{}'), 'papelera_30_dias') from leads where eliminado_en < now() - interval '30 days'
$$;

-- Borrado inmediato a pedido del cliente (Ley 1581). Para no equivocarse de cliente, hay que escribir su teléfono.
create or replace function public.lead_borrar_ya(p_lead bigint, p_confirmacion text) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare tel text;
begin
  perform exigir_permiso('eliminar_leads');
  perform exigir_permiso('ver_todas_conversaciones');                    -- solo el administrador
  select telefono into tel from leads where id = p_lead;
  if not found then
    raise exception 'Ese lead ya no existe' using errcode = 'P0002';
  end if;
  if regexp_replace(coalesce(p_confirmacion, ''), '\D', '', 'g') <> tel then
    raise exception 'Para borrar escribe el teléfono del cliente tal como aparece (solo números)';
  end if;
  return leads_purgar(array[p_lead], 'solicitud_cliente');
end $$;

revoke execute on function public.leads_purgar(bigint[], text), public.leads_vaciar_papelera(), public.lead_borrar_ya(bigint, text),
  public.mensajes_desarchivar() from public, anon, authenticated;
grant execute on function public.lead_borrar_ya(bigint, text) to authenticated;
grant execute on function public.leads_vaciar_papelera() to service_role;

-- 0034 · Ficha del lead (F4·30 D, docs/LEADS.md §2 y §3)
--
-- Editar nombre y valor, guardar atributos, notas internas, tareas con tipo y resultado, y los atributos obligatorios por etapa al mover
-- una oportunidad a mano (ficha y Embudo). Todo pasa por funciones con los permisos de la Bandeja y queda en el historial (lead_eventos, 0032).

-- Nombre y valor del lead. Un null deja el dato como está.
create or replace function public.lead_editar(p_lead bigint, p_nombre text default null, p_valor numeric default null) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('atender_bandeja');
  if not puede_ver_lead(p_lead) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if p_nombre is not null and length(btrim(p_nombre)) > 80 then
    raise exception 'El nombre tiene máximo 80 caracteres';
  end if;
  if p_valor is not null and p_valor < 0 then
    raise exception 'El valor no puede ser negativo';
  end if;
  update leads set nombre = coalesce(btrim(p_nombre), nombre), valor_estimado = coalesce(p_valor, valor_estimado) where id = p_lead;
end $$;

-- Atributos: se mezclan con los que ya tiene; un valor null o vacío lo borra. La validación es la de 0032 (disparador).
create or replace function public.lead_guardar_atributos(p_lead bigint, p_cambios jsonb) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare nuevos jsonb; k text; v jsonb;
begin
  perform exigir_permiso('atender_bandeja');
  if not puede_ver_lead(p_lead) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'Cambios no válidos';
  end if;
  select atributos into nuevos from leads where id = p_lead for update;
  for k, v in select * from jsonb_each(p_cambios) loop
    if not exists (select 1 from lead_atributos where clave = k and archivado_en is null) then
      raise exception 'El atributo «%» no existe o está archivado', k using errcode = '22023';
    end if;
    if v is null or jsonb_typeof(v) = 'null' or v = '""'::jsonb or v = '[]'::jsonb then
      nuevos := nuevos - k;
    else
      nuevos := jsonb_set(nuevos, array[k], case when jsonb_typeof(v) = 'string' then to_jsonb(btrim(v #>> '{}')) else v end);
    end if;
  end loop;
  update leads set atributos = nuevos where id = p_lead;
  return nuevos;
end $$;

-- Nota interna (solo el equipo la ve): va a la línea de tiempo de la ficha.
create or replace function public.lead_nota(p_lead bigint, p_texto text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('atender_bandeja');
  if not puede_ver_lead(p_lead) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if coalesce(btrim(p_texto), '') = '' or length(p_texto) > 2000 then
    raise exception 'La nota va de 1 a 2.000 caracteres';
  end if;
  perform lead_evento(p_lead, 'nota', null, null, btrim(p_texto));
end $$;

-- Tareas (RL-06): las de F3·6 con tipo, y cumplir con resultado.
create or replace function public.crear_tarea(p_lead bigint, p_tipo text, p_que text, p_vence timestamptz, p_asignado uuid default null) returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare nueva bigint;
begin
  nueva := crear_seguimiento(p_lead, p_que, p_vence, p_asignado);
  update seguimientos set tipo = coalesce(nullif(btrim(p_tipo), ''), 'Seguimiento') where id = nueva;
  return nueva;
end $$;

create or replace function public.cumplir_tarea(p_id bigint, p_resultado text default '') returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform seguimiento_a_cargo(p_id);                                         -- primero: que la tarea sea suya (o vea todas)
  if length(coalesce(p_resultado, '')) > 500 then
    raise exception 'El resultado tiene máximo 500 caracteres';
  end if;
  update seguimientos set resultado = btrim(coalesce(p_resultado, '')) where id = p_id and estado = 'pendiente';
  perform cerrar_seguimiento(p_id, 'hecho', btrim(coalesce(p_resultado, '')));
end $$;

-- Mover una oportunidad a mano (ficha y Embudo) pide los atributos obligatorios de esa etapa (docs/LEADS.md §4).
-- El bot no pasa por aquí (compra_mover y el receptor), así que nunca se frena.
create or replace function public.mover_oportunidad(p_oportunidad bigint, p_etapa bigint, p_motivo text default null) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare o oportunidades; e etapas; faltan text[];
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
  faltan := lead_atributos_faltantes(o.lead_id, e.nombre);
  if cardinality(faltan) > 0 then
    raise exception 'Para pasar a % falta llenar: %', e.nombre, array_to_string(faltan, ', ') using errcode = '23514';
  end if;
  if e.cierre = '' and o.estado <> 'abierta' and exists (
       select 1 from oportunidades where lead_id = o.lead_id and embudo_id = o.embudo_id and estado = 'abierta') then
    raise exception 'El cliente ya tiene otra oportunidad abierta en ese embudo';
  end if;
  update oportunidades set etapa_id = p_etapa, motivo_perdido = case when e.cierre = 'perdida' then btrim(p_motivo) end
  where id = p_oportunidad;
end $$;

revoke execute on function public.lead_editar(bigint, text, numeric), public.lead_guardar_atributos(bigint, jsonb), public.lead_nota(bigint, text),
  public.crear_tarea(bigint, text, text, timestamptz, uuid), public.cumplir_tarea(bigint, text) from public, anon;
grant execute on function public.lead_editar(bigint, text, numeric), public.lead_guardar_atributos(bigint, jsonb), public.lead_nota(bigint, text),
  public.crear_tarea(bigint, text, text, timestamptz, uuid), public.cumplir_tarea(bigint, text) to authenticated;

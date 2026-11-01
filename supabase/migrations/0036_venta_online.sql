-- F4·33: ajustes de la ficha tras la prueba del dueño (docs/LEADS.md, RL-13 a RL-25).
-- Venta online o tienda, datos de despacho, etapas Alistamiento y Despachado, tareas automáticas y el botón «Guardar cambios».

-- --------------------------------------------------------------------------- --
-- Atributos: tipo «documento» (solo números) y «solo para venta online»
-- --------------------------------------------------------------------------- --
alter table public.lead_atributos drop constraint lead_atributos_tipo_check;
alter table public.lead_atributos add constraint lead_atributos_tipo_check
  check (tipo in ('texto', 'texto_largo', 'numero', 'moneda', 'fecha', 'lista', 'multiseleccion',
                  'si_no', 'telefono', 'correo', 'direccion', 'enlace', 'documento'));
-- RL-17 y RL-20: se ve y es obligatorio solo cuando Venta = online
alter table public.lead_atributos add column solo_venta_online boolean not null default false;
-- Permisos columna por columna (0032): la columna nueva necesita los suyos o la pantalla no la ve
grant select (solo_venta_online), insert (solo_venta_online), update (solo_venta_online) on public.lead_atributos to authenticated;

create or replace function public.lead_atributo_error(p_def lead_atributos, p_valor jsonb) returns text
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare t text := jsonb_typeof(p_valor); texto text;
begin
  if p_valor is null or t = 'null' then return null; end if;                              -- vaciar un atributo siempre se puede
  texto := case when t = 'string' then p_valor #>> '{}' end;
  case p_def.tipo
    when 'texto', 'direccion' then
      if t <> 'string' or length(texto) > 300 then return 'debe ser un texto de máximo 300 caracteres'; end if;
    when 'texto_largo' then
      if t <> 'string' or length(texto) > 4000 then return 'debe ser un texto de máximo 4.000 caracteres'; end if;
    when 'numero', 'moneda' then
      if t <> 'number' then return 'debe ser un número'; end if;
    when 'fecha' then
      begin
        if t <> 'string' or texto !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'x'; end if;
        perform texto::date;
      exception when others then return 'debe ser una fecha AAAA-MM-DD';
      end;
    when 'lista' then
      if t <> 'string' or not (p_def.opciones ? texto) then return 'debe ser una de las opciones de la lista'; end if;
    when 'multiseleccion' then
      if t <> 'array' or exists (select 1 from jsonb_array_elements(p_valor) e
                                  where jsonb_typeof(e) <> 'string' or not (p_def.opciones ? (e #>> '{}'))) then
        return 'debe ser una o varias opciones de la lista';
      end if;
    when 'si_no' then
      if t <> 'boolean' then return 'debe ser sí o no'; end if;
    when 'telefono' then
      if t <> 'string' or texto !~ '^\+?[0-9 ()-]{7,20}$' then return 'debe ser un teléfono'; end if;
    when 'correo' then
      if t <> 'string' or texto !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(texto) > 200 then return 'debe ser un correo'; end if;
    when 'enlace' then
      if t <> 'string' or texto !~ '^https?://\S+$' or length(texto) > 500 then return 'debe ser un enlace http o https'; end if;
    when 'documento' then
      if t <> 'string' or texto !~ '^[0-9]{5,12}$' then return 'debe tener solo números (de 5 a 12)'; end if;
  end case;
  return null;
end $$;

-- RL-20: los atributos «solo venta online» se piden solo si el lead es venta online
create or replace function public.lead_atributos_faltantes(p_lead bigint, p_etapa text) returns text[]
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(a.nombre order by a.seccion, a.orden), '{}')
    from lead_atributos a, leads l
   where l.id = p_lead and a.archivado_en is null and a.obligatorio = 'etapa' and p_etapa = any (a.etapas_obligatorio)
     and (not a.solo_venta_online or l.atributos -> 'venta_online' = 'true'::jsonb)
     and coalesce(nullif(btrim(l.atributos ->> a.clave), ''), nullif(l.atributos ->> a.clave, 'null')) is null
$$;

-- --------------------------------------------------------------------------- --
-- RL-13 a RL-17, RL-24: los atributos de la ficha
-- --------------------------------------------------------------------------- --
update public.lead_atributos set opciones = '["Efectivo en tienda", "Transferencia"]' where clave = 'metodo_pago';
update public.lead_atributos set archivado_en = now() where clave in ('descuento', 'numero_serie') and archivado_en is null;
-- «Número de contrato» pasa a «Nota del asesor». La clave no cambia (es la llave dentro de leads.atributos); hoy ningún lead la tiene.
update public.lead_atributos set orden = orden + 1 where seccion = 'Compra';
update public.lead_atributos set nombre = 'Nota del asesor', tipo = 'texto_largo', orden = 99 where clave = 'numero_contrato';  -- de último en Compra

insert into public.lead_atributos (clave, nombre, tipo, seccion, orden, visible_lista) values
  ('venta_online', 'Venta online', 'si_no', 'Compra', 0, true);

-- Datos de despacho: se reutilizan Cédula, Ciudad, Correo y Dirección de entrega; se suman nombre completo, celular, transportadora y guía.
update public.lead_atributos set seccion = 'Datos de despacho', orden = 2, tipo = 'documento', nombre = 'Cédula (CC)' where clave = 'cedula';
update public.lead_atributos set seccion = 'Datos de despacho', orden = 4, nombre = 'Correo' where clave = 'correo_para_la_factura';
update public.lead_atributos set seccion = 'Datos de despacho', orden = 5, nombre = 'Ciudad y departamento' where clave = 'ciudad';
update public.lead_atributos set seccion = 'Datos de despacho', orden = 6 where clave = 'direccion_entrega';
insert into public.lead_atributos (clave, nombre, tipo, seccion, orden, llenable_bot) values
  ('nombre_completo', 'Nombre completo', 'texto',    'Datos de despacho', 1, true),
  ('celular',         'Celular',         'telefono', 'Datos de despacho', 3, true)
on conflict (clave) do nothing;
insert into public.lead_atributos (clave, nombre, tipo, seccion, orden) values
  ('transportadora', 'Transportadora',  'texto', 'Datos de despacho', 7),
  ('numero_guia',    'Número de guía',  'texto', 'Datos de despacho', 8)
on conflict (clave) do nothing;

update public.lead_atributos set solo_venta_online = true, obligatorio = 'etapa', etapas_obligatorio = '{Alistamiento,Despachado}'
 where clave in ('nombre_completo', 'cedula', 'celular', 'correo_para_la_factura', 'ciudad', 'direccion_entrega');
update public.lead_atributos set solo_venta_online = true, obligatorio = 'etapa', etapas_obligatorio = '{Despachado}'
 where clave in ('transportadora', 'numero_guia');

-- --------------------------------------------------------------------------- --
-- RL-21: etapas Alistamiento y Despachado en Cliente Final, entre Pago por confirmar y Vendido
-- --------------------------------------------------------------------------- --
do $$
declare e bigint := (select id from embudos where nombre = 'Cliente Final');
        despues integer;
begin
  if e is null or exists (select 1 from etapas where embudo_id = e and nombre = 'Alistamiento') then return; end if;
  select orden into despues from etapas where embudo_id = e and nombre = 'Pago por confirmar';
  if despues is null then return; end if;
  update etapas set orden = orden + 2 where embudo_id = e and orden > despues;
  insert into etapas (nombre, orden, color, embudo_id) values
    ('Alistamiento', despues + 1, 'Naranja', e),
    ('Despachado',   despues + 2, 'Morado',  e);
end $$;

-- --------------------------------------------------------------------------- --
-- RL-22: tipos de tarea y tareas automáticas al pasar a Alistamiento (el pago ya se confirmó)
-- --------------------------------------------------------------------------- --
insert into public.lead_tarea_tipos (nombre, orden) values
  ('Alistar equipo', 6), ('Enviar guía al cliente', 7), ('Entregar en tienda', 8)
on conflict (nombre) do nothing;

create or replace function public.oportunidades_tareas_alistamiento() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; responsable uuid; online boolean;
begin
  if new.etapa_id is not distinct from old.etapa_id
     or not exists (select 1 from etapas where id = new.etapa_id and nombre = 'Alistamiento') then
    return new;
  end if;
  select * into l from leads where id = new.lead_id;
  -- La tarea es del asesor del cliente; si no tiene, de quien movió la oportunidad. Si lo movió el sistema sin asesor, no hay a quién dársela.
  responsable := coalesce(l.asignado_a, (select id from usuarios where id = auth.uid()));
  if responsable is null then return new; end if;
  online := l.atributos -> 'venta_online' = 'true'::jsonb;
  insert into seguimientos (lead_id, asignado_a, que, vence_en, creado_por, tipo)
  select new.lead_id, responsable, t.que, now() + t.plazo, coalesce((select id from usuarios where id = auth.uid()), responsable), t.tipo
    from (values ('Alistar equipo',         'Alistar el equipo para el despacho',                  interval '4 hours', true),
                 ('Despachar',              'Entregar el paquete a la transportadora',             interval '1 day',   true),
                 ('Enviar guía al cliente', 'Enviar al cliente la transportadora y el número de guía', interval '1 day', true),
                 ('Entregar en tienda',     'Tener el equipo listo para entregarlo en la tienda',  interval '4 hours', false)) t (tipo, que, plazo, para_online)
   where t.para_online = online;
  return new;
end $$;
create trigger oportunidades_tareas_alistamiento after update of etapa_id on public.oportunidades
  for each row execute function public.oportunidades_tareas_alistamiento();

-- --------------------------------------------------------------------------- --
-- RL-25: «Guardar cambios» guarda nombre, valor y atributos juntos, con un solo registro en la línea de tiempo
-- --------------------------------------------------------------------------- --
alter table public.lead_eventos drop constraint lead_eventos_tipo_check;
alter table public.lead_eventos add constraint lead_eventos_tipo_check
  check (tipo in ('etapa', 'oportunidad', 'responsable', 'nombre', 'valor', 'etiquetas', 'atributo',
                  'archivado', 'desarchivado', 'eliminado', 'restaurado', 'tarea', 'tarea_cumplida', 'nota', 'ficha'));

-- Con crm.ficha_guardada = 'si' (lo pone lead_guardar_ficha), los cambios de nombre, valor y atributos van en un solo evento «ficha»:
-- antes y después son objetos con solo lo que cambió.
create or replace function public.leads_registrar_cambios() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare k text; junto boolean := current_setting('crm.ficha_guardada', true) = 'si'; antes jsonb := '{}'; despues jsonb := '{}';
begin
  if new.etapa is distinct from old.etapa then perform lead_evento(new.id, 'etapa', to_jsonb(old.etapa), to_jsonb(new.etapa)); end if;
  if new.asignado_a is distinct from old.asignado_a then perform lead_evento(new.id, 'responsable', to_jsonb(old.asignado_a), to_jsonb(new.asignado_a)); end if;
  if new.nombre is distinct from old.nombre then
    if junto then antes := antes || jsonb_build_object('nombre', old.nombre); despues := despues || jsonb_build_object('nombre', new.nombre);
    else perform lead_evento(new.id, 'nombre', to_jsonb(old.nombre), to_jsonb(new.nombre)); end if;
  end if;
  if new.valor_estimado is distinct from old.valor_estimado then
    if junto then antes := antes || jsonb_build_object('valor', old.valor_estimado); despues := despues || jsonb_build_object('valor', new.valor_estimado);
    else perform lead_evento(new.id, 'valor', to_jsonb(old.valor_estimado), to_jsonb(new.valor_estimado)); end if;
  end if;
  if new.etiquetas is distinct from old.etiquetas then perform lead_evento(new.id, 'etiquetas', to_jsonb(old.etiquetas), to_jsonb(new.etiquetas)); end if;
  if new.atributos is distinct from old.atributos then
    for k in select distinct key from (select key from jsonb_object_keys(old.atributos) key union all select key from jsonb_object_keys(new.atributos) key) t loop
      if old.atributos -> k is distinct from new.atributos -> k then
        if junto then
          antes := antes || jsonb_build_object(k, old.atributos -> k);
          despues := despues || jsonb_build_object(k, new.atributos -> k);
        else
          perform lead_evento(new.id, 'atributo', old.atributos -> k, new.atributos -> k, k);
        end if;
      end if;
    end loop;
  end if;
  if despues <> '{}' then perform lead_evento(new.id, 'ficha', antes, despues); end if;
  if new.archivado_en is distinct from old.archivado_en then
    perform lead_evento(new.id, case when new.archivado_en is null then 'desarchivado' else 'archivado' end, null, null);
  end if;
  if new.eliminado_en is distinct from old.eliminado_en then
    perform lead_evento(new.id, case when new.eliminado_en is null then 'restaurado' else 'eliminado' end, null, null);
  end if;
  return new;
end $$;

-- p_antes trae, para cada dato que el asesor cambió, el valor que vio al abrir la ficha. Si alguno ya no es ese (lo cambió otro asesor
-- o el bot), no guarda nada y devuelve los conflictos; con p_forzar guarda igual (el asesor eligió conservar lo suyo).
-- Las claves «nombre» y «valor» son los campos del lead; las demás, atributos. Un valor null o vacío borra el atributo.
create or replace function public.lead_guardar_ficha(p_lead bigint, p_cambios jsonb, p_antes jsonb, p_forzar boolean default false) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; actual jsonb; conflictos jsonb := '{}'; k text; v jsonb; nuevos jsonb; nombre_nuevo text; valor_nuevo numeric;
begin
  perform exigir_permiso('atender_bandeja');
  if not puede_ver_lead(p_lead) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if jsonb_typeof(p_cambios) <> 'object' or jsonb_typeof(coalesce(p_antes, '{}')) <> 'object' then
    raise exception 'Cambios no válidos';
  end if;
  select * into l from leads where id = p_lead for update;
  actual := l.atributos || jsonb_build_object('nombre', l.nombre, 'valor', l.valor_estimado);

  if not p_forzar then
    for k in select jsonb_object_keys(p_cambios) loop
      if coalesce(nullif(actual -> k, '""'), 'null') is distinct from coalesce(nullif(p_antes -> k, '""'), 'null') then
        conflictos := conflictos || jsonb_build_object(k, actual -> k);
      end if;
    end loop;
    if conflictos <> '{}' then
      return jsonb_build_object('conflictos', conflictos);
    end if;
  end if;

  nuevos := l.atributos;
  nombre_nuevo := l.nombre;
  valor_nuevo := l.valor_estimado;
  for k, v in select * from jsonb_each(p_cambios) loop
    if k = 'nombre' then
      nombre_nuevo := btrim(coalesce(v #>> '{}', ''));
      if length(nombre_nuevo) > 80 then raise exception 'El nombre tiene máximo 80 caracteres' using errcode = '22023'; end if;
    elsif k = 'valor' then
      if v is not null and jsonb_typeof(v) not in ('number', 'null') then raise exception 'El valor debe ser un número' using errcode = '22023'; end if;
      valor_nuevo := (v #>> '{}')::numeric;
      if valor_nuevo < 0 then raise exception 'El valor no puede ser negativo' using errcode = '22023'; end if;
    else
      if not exists (select 1 from lead_atributos where clave = k and archivado_en is null) then
        raise exception 'El atributo «%» no existe o está archivado', k using errcode = '22023';
      end if;
      if v is null or jsonb_typeof(v) = 'null' or v = '""'::jsonb or v = '[]'::jsonb then
        nuevos := nuevos - k;
      else
        nuevos := jsonb_set(nuevos, array[k], case when jsonb_typeof(v) = 'string' then to_jsonb(btrim(v #>> '{}')) else v end);
      end if;
    end if;
  end loop;

  perform set_config('crm.ficha_guardada', 'si', true);
  update leads set atributos = nuevos, nombre = nombre_nuevo, valor_estimado = valor_nuevo where id = p_lead;
  perform set_config('crm.ficha_guardada', '', true);
  return jsonb_build_object('atributos', nuevos, 'nombre', nombre_nuevo, 'valor', valor_nuevo);
end $$;
revoke execute on function public.lead_guardar_ficha(bigint, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.lead_guardar_ficha(bigint, jsonb, jsonb, boolean) to authenticated;

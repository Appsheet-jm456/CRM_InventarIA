-- 0040 · Interruptores del bot y cuadro Agente en el lienzo (F4·35, decisión 0034)
--
-- Diseño: docs/FLUJO-DEL-BOT.md (RF-31 a RF-39). Tres interruptores en bot_config: chatbot_activo (todo lo automático),
-- menu_activo (los bots del lienzo) y agente_en_todo (Avi responde el texto libre en todo el bot). El receptor los lee cada 30 s.
-- El cuadro Agente deja que Avi atienda desde un punto del lienzo, con instrucción, herramientas y límite propios.

-- --------------------------------------------------------------------------- --
-- Interruptores (RF-31 a RF-35)
-- --------------------------------------------------------------------------- --
create table public.bot_config (
  id             smallint primary key default 1 check (id = 1),
  chatbot_activo boolean not null default true,
  menu_activo    boolean not null default true,
  agente_en_todo boolean not null default false,
  texto_apagado  text not null default '' check (length(texto_apagado) <= 1024),
  actualizado_por uuid references public.usuarios (id) on delete set null,
  actualizado_en timestamptz not null default now()
);
-- RF-35: el bot que estaba en modo Agente deja «Avi en todo» encendido, para que nada cambie.
insert into public.bot_config (agente_en_todo)
select exists (select 1 from bots where modo = 'agente' and not archivado);
comment on table public.bot_config is 'Interruptores del bot (F4·35): Chatbot, Menú guiado y Avi en texto libre en todo el bot. Una sola fila.';
comment on column public.bots.modo is 'Retirado por F4·35 (decisión 0034): lo reemplazan bot_config.agente_en_todo y el cuadro Agente.';

create table public.bot_config_historial (
  id         bigint generated always as identity primary key,
  en         timestamptz not null default now(),
  usuario_id uuid references public.usuarios (id) on delete set null,
  antes      jsonb not null,
  despues    jsonb not null
);

alter table public.bot_config enable row level security;
alter table public.bot_config_historial enable row level security;
create policy bot_config_lectura on public.bot_config for select to authenticated using ((select es_usuario_activo()));
create policy bot_config_historial_lectura on public.bot_config_historial for select to authenticated
  using ((select tiene_permiso('administrar_bot')));
-- Se leen con la sesión; se cambian solo con bot_config_cambiar (los permisos por defecto de Supabase darían escritura).
revoke all on public.bot_config, public.bot_config_historial from anon, authenticated;
grant select on public.bot_config, public.bot_config_historial to authenticated;

-- Se cambia solo por aquí: exige el permiso y deja el historial (RF-34).
create function public.bot_config_cambiar(p_chatbot boolean, p_menu boolean, p_agente_en_todo boolean, p_texto_apagado text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare antes bot_config; despues bot_config;
begin
  perform exigir_permiso('administrar_bot');
  if p_chatbot is null or p_menu is null or p_agente_en_todo is null then
    raise exception 'Faltan los interruptores.';
  end if;
  if length(coalesce(p_texto_apagado, '')) > 1024 then
    raise exception 'El mensaje con el chatbot apagado tiene máximo 1.024 caracteres.';
  end if;
  select * into antes from bot_config where id = 1 for update;
  update bot_config set chatbot_activo = p_chatbot, menu_activo = p_menu, agente_en_todo = p_agente_en_todo,
                        texto_apagado = btrim(coalesce(p_texto_apagado, '')), actualizado_por = auth.uid(), actualizado_en = now()
  where id = 1 returning * into despues;
  if (antes.chatbot_activo, antes.menu_activo, antes.agente_en_todo, antes.texto_apagado)
     is distinct from (despues.chatbot_activo, despues.menu_activo, despues.agente_en_todo, despues.texto_apagado) then
    insert into bot_config_historial (usuario_id, antes, despues)
    values (auth.uid(),
            jsonb_build_object('chatbot', antes.chatbot_activo, 'menu', antes.menu_activo, 'agente_en_todo', antes.agente_en_todo, 'texto', antes.texto_apagado),
            jsonb_build_object('chatbot', despues.chatbot_activo, 'menu', despues.menu_activo, 'agente_en_todo', despues.agente_en_todo, 'texto', despues.texto_apagado));
  end if;
end $$;
revoke execute on function public.bot_config_cambiar(boolean, boolean, boolean, text) from public, anon;
grant execute on function public.bot_config_cambiar(boolean, boolean, boolean, text) to authenticated;

-- --------------------------------------------------------------------------- --
-- Cuadro Agente (RF-36 a RF-39)
-- --------------------------------------------------------------------------- --
alter table public.bot_cuadros drop constraint bot_cuadros_tipo_check;
alter table public.bot_cuadros add constraint bot_cuadros_tipo_check check (tipo in (
  'mensaje', 'presupuesto', 'marca', 'equipos', 'ficha', 'asesor', 'aviso', 'ir_bot', 'condicion', 'catalogo', 'pausa', 'pregunta', 'agente'));

create or replace function public.tipo_del_dueno(p_tipo text) returns boolean
language sql immutable
as $$ select p_tipo in ('mensaje', 'ir_bot', 'condicion', 'catalogo', 'pausa', 'pregunta', 'agente') $$;

-- Las cuatro salidas del Agente son opcionales: sueltas, la compra sigue su flujo, el asesor recibe el chat, «menú» va al inicio y
-- un error del cerebro lo atiende el Híbrido (RF-37).
create or replace function public.salidas_opcionales(p_tipo text, p_opciones jsonb) returns text[]
language sql immutable
as $$
  select case
    when p_tipo = 'agente' then array['compra', 'asesor', 'menu', 'falla']
    when p_tipo = 'pregunta' then array['sin_respuesta', 'no_logro']
    when p_tipo <> 'mensaje' then '{}'::text[]
    when coalesce(jsonb_array_length(p_opciones), 0) = 0 then array['sin_respuesta', 'error']
    else array['otra', 'sin_respuesta', 'error'] end
$$;

create or replace function public.rotulo_salida(p_salida text) returns text
language sql immutable
as $$
  select coalesce(('{"respuesta": "Cuando el cliente responda", "ninguna": "Ninguna se cumple", "siguiente": "Siguiente",
                     "respondio": "El cliente respondió", "tiempo": "Pasó el tiempo", "otra": "Otra respuesta",
                     "sin_respuesta": "Sin respuesta", "error": "Error al enviar el mensaje", "no_logro": "No logró responder",
                     "compra": "Inició compra", "asesor": "Pidió asesor o no avanza", "menu": "Volvió al menú",
                     "falla": "Error del cerebro"}'::jsonb) ->> p_salida, p_salida)
$$;

-- Texto de entrada, instrucción, herramientas, límite de vueltas y las cuatro salidas.
create function public.borrador_guardar_agente(p_clave text, p_nombre text, p_texto text, p_instruccion text, p_herramientas text[],
                                               p_max_vueltas integer, p_compra text, p_asesor text, p_menu text, p_falla text,
                                               p_bot bigint default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c bot_cuadros; f bot_flujos; s record;
begin
  perform exigir_permiso('administrar_bot');
  f := borrador_del_flujo(bot_editable(p_bot));
  c := cuadro_del_borrador(p_clave, f.bot_id);
  if c.tipo <> 'agente' then
    raise exception 'Este cuadro no es un agente.';
  end if;
  if coalesce(btrim(p_texto), '') = '' or length(p_texto) > 1024 then
    raise exception 'El mensaje de entrada va de 1 a 1.024 caracteres.';
  end if;
  if length(coalesce(p_instruccion, '')) > 2000 then
    raise exception 'La instrucción tiene máximo 2.000 caracteres.';
  end if;
  if p_max_vueltas is null or p_max_vueltas not between 1 and 50 then
    raise exception 'El límite de vueltas va de 1 a 50.';
  end if;
  for s in select * from (values ('compra', p_compra), ('asesor', p_asesor), ('menu', p_menu), ('falla', p_falla)) x(salida, destino) loop
    if s.destino is not null and (not destino_valido(f.id, s.destino) or s.destino = c.clave) then
      raise exception '«%» lleva a un cuadro que no existe, al que no se puede ir directo o al mismo agente.', rotulo_salida(s.salida);
    end if;
  end loop;
  update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre), texto = btrim(p_texto),
                         ajustes = jsonb_build_object('instruccion', btrim(coalesce(p_instruccion, '')), 'herramientas', to_jsonb(p_herramientas),
                                                      'max_vueltas', p_max_vueltas),
                         salidas = jsonb_strip_nulls(jsonb_build_object('compra', p_compra, 'asesor', p_asesor, 'menu', p_menu, 'falla', p_falla)),
                         actualizado_por = auth.uid()
  where id = c.id;
end $$;
revoke execute on function public.borrador_guardar_agente(text, text, text, text, text[], integer, text, text, text, text, bigint) from public, anon;
grant execute on function public.borrador_guardar_agente(text, text, text, text, text[], integer, text, text, text, text, bigint) to authenticated;

-- "+ Agregar" → Agente; el Mensaje no guarda un Agente; al publicar, el límite de vueltas.
CREATE OR REPLACE FUNCTION public.borrador_crear_cuadro(p_tipo text, p_x integer, p_y integer, p_bot bigint DEFAULT NULL::bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare f bot_flujos; n integer; v_clave text;
begin
  perform exigir_permiso('administrar_bot');
  if p_tipo = 'mensaje' then
    return borrador_crear_mensaje(p_x, p_y, p_bot);
  end if;
  if p_tipo not in ('ir_bot', 'condicion', 'catalogo', 'pausa', 'pregunta', 'agente') or p_tipo is null then
    raise exception 'Ese tipo de cuadro no existe.';
  end if;
  f := borrador_del_flujo(bot_editable(p_bot));
  if p_tipo = 'ir_bot' then
    select coalesce(max(substring(k.clave from '^IR(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^IR\d+$';
    v_clave := 'IR' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, ajustes, x, y, actualizado_por)
    values (f.id, v_clave, 'ir_bot', 'Ir a otro bot ' || n, 950 + n, 'Lleva al cliente al inicio de otro bot.',
            'Lleva al cliente al inicio de otro bot.', 'sistema', '{"bot_id": null}', p_x, p_y, auth.uid());
  elsif p_tipo = 'agente' then
    select coalesce(max(substring(k.clave from '^A(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^A\d+$';
    v_clave := 'A' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, salidas, ajustes,
                             x, y, actualizado_por)
    values (f.id, v_clave, 'agente', 'Agente ' || n, 995 + n, 'Cuéntame, ¿en qué te puedo ayudar? 🙂', 'Cuéntame, ¿en qué te puedo ayudar? 🙂',
            'texto', '{}', '{"instruccion": "", "herramientas": null, "max_vueltas": 8}', p_x, p_y, auth.uid());
  elsif p_tipo = 'pregunta' then
    select coalesce(max(substring(k.clave from '^Q(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^Q\d+$';
    v_clave := 'Q' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, salidas, ajustes,
                             x, y, actualizado_por)
    values (f.id, v_clave, 'pregunta', 'Pregunta ' || n, 990 + n, '¿Escribe aquí la pregunta?', '¿Escribe aquí la pregunta?', 'texto',
            '{"siguiente": null}',
            '{"atributo": null, "texto_error": "Esa respuesta no me sirve 🙏 ¿Me la escribes de nuevo?", "espera_segundos": 1800}',
            p_x, p_y, auth.uid());
  elsif p_tipo = 'pausa' then
    select coalesce(max(substring(k.clave from '^P(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^P\d+$';
    v_clave := 'P' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, salidas, ajustes,
                             x, y, actualizado_por)
    values (f.id, v_clave, 'pausa', 'Pausa ' || n, 980 + n, 'Espera a que el cliente responda.',
            'Espera a que el cliente responda.', 'sistema', '{"respondio": null, "tiempo": null}', '{"segundos": 900}',
            p_x, p_y, auth.uid());
  elsif p_tipo = 'catalogo' then
    select coalesce(max(substring(k.clave from '^CAT(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^CAT\d+$';
    v_clave := 'CAT' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, formato, salidas, ajustes,
                             x, y, actualizado_por)
    values (f.id, v_clave, 'catalogo', 'Catálogos ' || n, 970 + n, 'Te envío nuestro catálogo 📚',
            'Te envío nuestro catálogo 📚', 'texto', '{"siguiente": null}', '{"catalogo_id": null}', p_x, p_y, auth.uid());
  else
    select coalesce(max(substring(k.clave from '^C(\d+)$')::int), 0) + 1 into n
    from bot_cuadros k where k.flujo_id = f.id and k.clave ~ '^C\d+$';
    v_clave := 'C' || n;
    insert into bot_cuadros (flujo_id, clave, tipo, nombre, orden, texto, texto_original, opciones, opciones_original,
                             max_titulo, formato, salidas, x, y, actualizado_por)
    values (f.id, v_clave, 'condicion', 'Condiciones ' || n, 960 + n, 'Compara el último mensaje del cliente.',
            'Compara el último mensaje del cliente.', '[{"id":"1","titulo":"Condición 1","palabras":[],"destino":null}]',
            '[{"id":"1","titulo":"Condición 1","palabras":[],"destino":null}]', 40, 'sistema', '{"ninguna": null}',
            p_x, p_y, auth.uid());
  end if;
  return v_clave;
end $function$;

CREATE OR REPLACE FUNCTION public.borrador_guardar_cuadro(p_clave text, p_nombre text, p_texto text, p_opciones jsonb, p_bot bigint DEFAULT NULL::bigint, p_salidas jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c bot_cuadros; f bot_flujos; op jsonb; nuevas jsonb := '[]'; ids text[] := '{}'; previa jsonb; respuesta jsonb;
        extra jsonb := '{}'; s text; v jsonb; espera int; efectos jsonb; k text; d lead_atributos;
begin
  perform exigir_permiso('administrar_bot');
  f := borrador_del_flujo(bot_editable(p_bot));
  c := cuadro_del_borrador(p_clave, f.bot_id);
  if c.tipo = 'ir_bot' then
    raise exception 'Este cuadro se guarda con su bot de destino (borrador_guardar_ajustes).';
  end if;
  if c.tipo = 'condicion' then
    raise exception 'Este cuadro se guarda con sus condiciones (borrador_guardar_condiciones).';
  end if;
  if c.tipo = 'catalogo' then
    raise exception 'Este cuadro se guarda con su catálogo (borrador_guardar_catalogo).';
  end if;
  if c.tipo = 'pausa' then
    raise exception 'Este cuadro se guarda con su tiempo (borrador_guardar_pausa).';
  end if;
  if c.tipo = 'pregunta' then
    raise exception 'Este cuadro se guarda con su dato (borrador_guardar_pregunta).';
  end if;
  if c.tipo = 'agente' then
    raise exception 'Este cuadro se guarda con su instrucción (borrador_guardar_agente).';
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
    efectos := coalesce(previa->'efectos', '{}');
    if op ? 'marcar' then
      if jsonb_typeof(op->'marcar') <> 'object' then
        raise exception 'Los datos que marca una opción van como objeto.';
      end if;
      for k in select jsonb_object_keys(op->'marcar') loop
        select * into d from lead_atributos where clave = k and archivado_en is null;
        if not found or d.tipo not in ('si_no', 'lista') then
          raise exception 'La opción "%" marca un dato que no existe o no es sí/no ni lista.', op->>'titulo';
        end if;
        if lead_atributo_error(d, op->'marcar'->k) is not null then
          raise exception 'La opción "%" marca «%» con un valor que no vale: %.', op->>'titulo', d.nombre, lead_atributo_error(d, op->'marcar'->k);
        end if;
      end loop;
      efectos := case when op->'marcar' = '{}' then efectos - 'atributos' else efectos || jsonb_build_object('atributos', op->'marcar') end;
    end if;
    nuevas := nuevas || jsonb_strip_nulls(
      coalesce(previa, '{}') - 'titulo' - 'destino' - 'efectos'
      || jsonb_build_object('id', op->>'id', 'titulo', btrim(coalesce(op->>'titulo', '')), 'destino', op->'destino',
                            'efectos', case when efectos = '{}' then null else efectos end));
  end loop;

  -- Salidas opcionales (RF-20 a RF-22): las que manda la pantalla, o las que ya tenía; null las suelta.
  foreach s in array salidas_opcionales('mensaje', nuevas) loop
    v := case when p_salidas ? s then p_salidas->s else coalesce(c.salidas->s, 'null') end;
    if jsonb_typeof(v) = 'string' then
      if not destino_valido(f.id, v #>> '{}') then
        raise exception '«%» lleva a un cuadro que no existe o al que no se puede ir directo.', rotulo_salida(s);
      end if;
      if s = 'sin_respuesta' and v #>> '{}' = c.clave then
        raise exception '«Sin respuesta» no puede volver al mismo mensaje: se repetiría sin fin.';
      end if;
    end if;
    if jsonb_typeof(v) = 'string' then  -- solo las conectadas: un mensaje sin ellas queda igual que antes
      extra := extra || jsonb_build_object(s, v);
    end if;
  end loop;
  espera := coalesce((p_salidas->>'espera_segundos')::int, (c.ajustes->>'espera_segundos')::int, 900);
  if espera not between 1 and 86399 then
    raise exception 'La espera de «Sin respuesta» va de 1 segundo a 23 h 59 min 59 s (ventana de 24 h de Meta).';
  end if;

  if jsonb_array_length(nuevas) = 0 then
    respuesta := case when p_salidas ? 'respuesta' then p_salidas->'respuesta' else coalesce(c.salidas->'respuesta', 'null') end;
    if jsonb_typeof(respuesta) = 'string' and not destino_valido(f.id, respuesta #>> '{}') then
      raise exception '"Cuando el cliente responda" lleva a un cuadro que no existe o al que no se puede ir directo.';
    end if;
    update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre), texto = coalesce(p_texto, texto),
                           opciones = '[]', formato = 'texto', salidas = jsonb_build_object('respuesta', respuesta) || extra,
                           ajustes = coalesce(ajustes, '{}') || jsonb_build_object('espera_segundos', espera), actualizado_por = auth.uid()
    where id = c.id;
  else
    update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre), texto = coalesce(p_texto, texto),
                           opciones = nuevas, formato = 'menu', salidas = extra,
                           ajustes = coalesce(ajustes, '{}') || jsonb_build_object('espera_segundos', espera), actualizado_por = auth.uid()
    where id = c.id;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.problemas_del_flujo(p_flujo bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r jsonb := '[]';
  alcanzados text[];
  nuevos text[];
  medida jsonb;
  c bot_cuadros;
  s text;
  destino bots;
  cat catalogos;
  mi_bot bigint := (select bot_id from bot_flujos where id = p_flujo);
  rotulos jsonb := '{"respuesta": "Cuando el cliente responda", "ninguna": "Ninguna se cumple", "siguiente": "Siguiente", "respondio": "El cliente respondió", "tiempo": "Pasó el tiempo"}';
  raras text[];
begin
  if (select count(*) from bot_cuadros where flujo_id = p_flujo and inicio) <> 1 then
    r := r || jsonb_build_object('clave', '', 'nombre', '', 'problema', 'El flujo necesita un único cuadro de inicio.');
  end if;
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
      r := r || coalesce((
        select jsonb_agg(jsonb_build_object('clave', c.clave, 'nombre', c.nombre, 'problema',
                 format('La opción %s (%s) marca «%s», que ya no existe o está archivado.', o->>'id', o->>'titulo', k)))
        from jsonb_array_elements(coalesce(c.opciones, '[]')) o, jsonb_object_keys(coalesce(o->'efectos'->'atributos', '{}')) k
        where not exists (select 1 from lead_atributos a where a.clave = k and a.archivado_en is null)), '[]');
    end if;
    if c.tipo = 'condicion' then
      r := r || coalesce((
        select jsonb_agg(jsonb_build_object('clave', c.clave, 'nombre', c.nombre, 'problema',
                 case when jsonb_array_length(coalesce(o->'palabras', '[]')) = 0 then format('La condición «%s» no tiene palabras.', o->>'titulo')
                      when o->>'destino' is null then format('La condición «%s» no lleva a ningún cuadro.', o->>'titulo')
                      else format('La condición «%s» lleva a un cuadro que no existe.', o->>'titulo') end))
        from jsonb_array_elements(coalesce(c.opciones, '[]')) o
        where jsonb_array_length(coalesce(o->'palabras', '[]')) = 0 or o->>'destino' is null
           or not destino_valido(p_flujo, o->>'destino')), '[]');
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
    foreach s in array salidas_opcionales(c.tipo, c.opciones) loop
      if c.salidas->>s is not null and not destino_valido(p_flujo, c.salidas->>s) then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                     'problema', format('«%s» lleva a un cuadro que no existe.', rotulo_salida(s)));
      end if;
    end loop;
    if c.tipo in ('mensaje', 'pregunta') and c.salidas->>'sin_respuesta' is not null then
      if c.salidas->>'sin_respuesta' = c.clave then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                     'problema', '«Sin respuesta» no puede volver al mismo cuadro: se repetiría sin fin.');
      end if;
    end if;
    if c.tipo in ('mensaje', 'pregunta') and (c.salidas->>'sin_respuesta' is not null or c.tipo = 'pregunta')
       and coalesce((c.ajustes->>'espera_segundos')::int, 0) not between 1 and 86399 then
      r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                   'problema', 'La espera de «Sin respuesta» va de 1 segundo a 23 h 59 min 59 s.');
    end if;
    if c.tipo = 'pregunta' then
      if c.ajustes->>'atributo' is null then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre, 'problema', 'Elige en qué dato de la ficha se guarda la respuesta.');
      elsif not exists (select 1 from lead_atributos a where a.clave = c.ajustes->>'atributo' and a.archivado_en is null) then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                     'problema', 'El dato donde se guarda la respuesta ya no existe o está archivado: elige otro.');
      end if;
    end if;
    if c.tipo = 'agente' and coalesce((c.ajustes->>'max_vueltas')::int, 0) not between 1 and 50 then
      r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre, 'problema', 'El límite de vueltas del agente va de 1 a 50.');
    end if;
    if c.tipo = 'pausa' and coalesce((c.ajustes->>'segundos')::int, 0) not between 1 and 86399 then
      r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                   'problema', 'La espera va de 1 segundo a 23 h 59 min 59 s (ventana de 24 h de Meta).');
    end if;
    if c.tipo = 'catalogo' then
      select * into cat from catalogos where id = nullif(c.ajustes->>'catalogo_id', '')::bigint;
      if cat.id is null then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre, 'problema',
                                     case when c.ajustes->>'catalogo_id' is null then 'Elige qué catálogo envía.'
                                          else 'Ese catálogo ya no existe: elige otro.' end);
      elsif not cat.activo then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                     'problema', format('El catálogo «%s» está desactivado.', cat.nombre));
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
    if tipo_del_dueno(c.tipo) then
      raras := marcas_desconocidas(c.texto, c.marcas);
      if cardinality(raras) > 0 then
        r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre, 'problema',
                                     format('El bot no reemplaza %s: no es un dato de la ficha.', (select string_agg('{' || x || '}', ', ') from unnest(raras) x)));
      end if;
    end if;
    medida := bot_medir(c.texto, c.formato, coalesce(c.opciones, c.opciones_codigo), c.marcas);
    if (medida->>'largo')::int > (medida->>'limite')::int then
      r := r || jsonb_build_object('clave', c.clave, 'nombre', c.nombre,
                                   'problema', format('El texto pasa el límite de WhatsApp (%s de %s).', medida->>'largo', medida->>'limite'));
    end if;
  end loop;
  return r;
end $function$;

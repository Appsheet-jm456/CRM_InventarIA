-- 0024 · Base del agente: acciones, conocimiento, compra, cotizaciones y configuración del agente (F4·22, decisión 0032)
--
-- Diseño: docs/AGENTE.md (RAG-01 a RAG-28). La 0022 sigue reservada para F4·14.
-- Esta migración solo deja la base: las pantallas y los motores llegan en F4·23 a F4·28. Nada de aquí cambia todavía cómo
-- responde el bot: todas las acciones nacen apagadas y el agente nace apagado.

-- --------------------------------------------------------------------------- --
-- Permiso: solo el Administrador
-- --------------------------------------------------------------------------- --
insert into public.permisos (codigo, descripcion) values
  ('administrar_agente', 'Agente, acciones, conocimiento y reglas de compra y cotización (la llave del modelo nunca se ve)');

insert into public.rol_permisos (rol_id, permiso)
select id, 'administrar_agente' from public.roles where nombre = 'administrador';

-- --------------------------------------------------------------------------- --
-- Etapas del tramo de compra (RAG-20): Esperando pago → Pago por confirmar → ganada
-- --------------------------------------------------------------------------- --
-- Cliente Final: «Confirmar transfer» pasa a llamarse «Pago por confirmar» y entra «Esperando pago» antes.
update public.etapas set orden = orden + 1
 where embudo_id = (select id from public.embudos where nombre = 'Cliente Final') and orden >= 5;
update public.etapas set nombre = 'Pago por confirmar'
 where embudo_id = (select id from public.embudos where nombre = 'Cliente Final') and nombre = 'Confirmar transfer';
insert into public.etapas (nombre, orden, color, embudo_id)
select 'Esperando pago', 5, 'Naranja', id from public.embudos where nombre = 'Cliente Final';

-- Distribuidor: las dos entran antes de «Primer pedido».
update public.etapas set orden = orden + 2
 where embudo_id = (select id from public.embudos where nombre = 'Distribuidor') and orden >= 5;
insert into public.etapas (nombre, orden, color, embudo_id)
select x.nombre, x.orden, x.color, e.id
  from public.embudos e, (values ('Esperando pago', 5, 'Naranja'), ('Pago por confirmar', 6, 'Morado')) as x(nombre, orden, color)
 where e.nombre = 'Distribuidor';

-- Qué etapa es cada paso de la compra en cada embudo: el motor no depende del nombre, y el dueño puede renombrarlas.
create table public.compra_etapas (
  embudo_id              bigint primary key references public.embudos (id),
  esperando_pago_id      bigint not null references public.etapas (id),
  pago_por_confirmar_id  bigint not null references public.etapas (id),
  cancelada_id           bigint references public.etapas (id)  -- a dónde vuelve si el cliente cancela (null = no se mueve)
);
insert into public.compra_etapas (embudo_id, esperando_pago_id, pago_por_confirmar_id, cancelada_id)
select b.id,
       (select id from public.etapas where embudo_id = b.id and nombre = 'Esperando pago'),
       (select id from public.etapas where embudo_id = b.id and nombre = 'Pago por confirmar'),
       null
  from public.embudos b where b.nombre in ('Cliente Final', 'Distribuidor');

-- --------------------------------------------------------------------------- --
-- Modo de cada bot (RAG-14) y memoria del agente por cliente
-- --------------------------------------------------------------------------- --
alter table public.bots add column modo text not null default 'hibrido' check (modo in ('guiado', 'hibrido', 'agente'));
alter table public.leads add column resumen_agente text not null default '';

-- --------------------------------------------------------------------------- --
-- Conocimiento: preguntas frecuentes y políticas (F4·23)
-- --------------------------------------------------------------------------- --
create table public.conocimiento (
  id             bigint generated always as identity primary key,
  categoria      text not null check (btrim(categoria) <> ''),
  titulo         text not null check (btrim(titulo) <> ''),         -- la pregunta o el nombre de la política
  respuesta      text not null default '',
  archivo        text check (archivo is null or archivo ~ '^conocimiento/[0-9]+\.(png|jpg|webp|pdf)$'),  -- imagen o PDF (bucket conocimiento)
  activa         boolean not null default false,
  orden          integer not null default 0,
  actualizado_en timestamptz not null default now(),
  -- Activa solo con algo que enviar.
  check (not activa or btrim(respuesta) <> '' or archivo is not null)
);
create index conocimiento_categoria_idx on public.conocimiento (categoria, orden);

insert into public.conocimiento (categoria, titulo, orden) values
  ('Ubicación', 'Dirección del local', 1),
  ('Garantía', 'Política de garantía', 1),
  ('Devoluciones', 'Política de devoluciones', 1),
  ('Envíos', 'Envíos y tiempos de entrega', 1),
  ('Pagos', 'Medios de pago', 1),
  ('Distribuidores', 'Cómo ser distribuidor', 1);

-- --------------------------------------------------------------------------- --
-- Acciones «Cuando → Hacer» (F4·24, RAG-23 a RAG-26)
-- --------------------------------------------------------------------------- --
-- cuando: lista de condiciones [{"forma": "contiene"|"igual"|"empieza", "texto": "..."}]; basta una.
-- hacer:  lista ordenada de pasos [{"tipo": "texto", "texto": "..."} | {"tipo": "conocimiento", "categoria": "..."} |
--         {"tipo": "cuentas"} | {"tipo": "flujo", "flujo": "compra"|"cotizacion"} | {"tipo": "bot", "bot_id": n} |
--         {"tipo": "etiqueta", "etiqueta": "..."} | {"tipo": "seguimiento", "texto": "..."} | {"tipo": "asesor", "texto": "..."}]
create table public.acciones (
  id             bigint generated always as identity primary key,
  nombre         text not null check (btrim(nombre) <> ''),
  prioridad      integer not null,                                  -- menor = se revisa antes (RAG-25)
  activa         boolean not null default false,
  sistema        boolean not null default false,                    -- «Pasar a asesor»: no se borra ni se apaga
  cuando         jsonb not null default '[]' check (jsonb_typeof(cuando) = 'array'),
  hacer          jsonb not null default '[]' check (jsonb_typeof(hacer) = 'array'),
  actualizado_en timestamptz not null default now(),
  check (not activa or (jsonb_array_length(cuando) > 0 and jsonb_array_length(hacer) > 0)),
  -- Diferida: reordenar es intercambiar prioridades dentro de una transacción.
  constraint acciones_prioridad_key unique (prioridad) deferrable initially deferred
);

create table public.acciones_registro (
  id        bigint generated always as identity primary key,
  accion_id bigint not null references public.acciones (id) on delete cascade,
  lead_id   bigint references public.leads (id) on delete set null,
  en        timestamptz not null default now()
);
create index acciones_registro_idx on public.acciones_registro (accion_id, en desc);

insert into public.acciones (nombre, prioridad, activa, sistema, cuando, hacer) values
  ('Pasar a asesor', 1, true, true,
   '[{"forma":"contiene","texto":"asesor"},{"forma":"contiene","texto":"humano"},{"forma":"contiene","texto":"hablar con alguien"},{"forma":"contiene","texto":"una persona"}]',
   '[{"tipo":"asesor","texto":"Te paso con un asesor, en breve te escribe 🙌"}]'),
  ('Cuentas para pagar', 10, false, false,
   '[{"forma":"contiene","texto":"cuentas"},{"forma":"contiene","texto":"numero de cuenta"},{"forma":"contiene","texto":"como pago"},{"forma":"contiene","texto":"datos para pagar"}]',
   '[{"tipo":"cuentas"}]'),
  ('Quiero comprar', 20, false, false,
   '[{"forma":"contiene","texto":"quiero comprar"},{"forma":"contiene","texto":"deseo comprar"},{"forma":"contiene","texto":"lo quiero"},{"forma":"contiene","texto":"lo compro"}]',
   '[{"tipo":"flujo","flujo":"compra"}]'),
  ('Cotización', 30, false, false,
   '[{"forma":"contiene","texto":"cotizacion"},{"forma":"contiene","texto":"cotizame"},{"forma":"contiene","texto":"cotizar"}]',
   '[{"tipo":"flujo","flujo":"cotizacion"}]'),
  ('Ubicación del local', 40, false, false,
   '[{"forma":"contiene","texto":"ubicacion"},{"forma":"contiene","texto":"direccion"},{"forma":"contiene","texto":"donde quedan"},{"forma":"contiene","texto":"donde estan"}]',
   '[{"tipo":"conocimiento","categoria":"Ubicación"}]'),
  ('Garantía', 50, false, false,
   '[{"forma":"contiene","texto":"garantia"}]',
   '[{"tipo":"conocimiento","categoria":"Garantía"}]'),
  ('Devoluciones', 60, false, false,
   '[{"forma":"contiene","texto":"devolucion"},{"forma":"contiene","texto":"devolver"},{"forma":"contiene","texto":"cambio"}]',
   '[{"tipo":"conocimiento","categoria":"Devoluciones"}]'),
  ('Horario', 70, false, false,
   '[{"forma":"contiene","texto":"horario"},{"forma":"contiene","texto":"a que hora"},{"forma":"contiene","texto":"abren"}]',
   '[{"tipo":"texto","texto":"{horario}"}]');

-- «Pasar a asesor» no se apaga ni se borra, ni pierde su lugar (RAG-25).
create or replace function public.acciones_proteger_sistema() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and old.sistema then
    raise exception 'La acción «%» es del sistema y no se puede borrar', old.nombre;
  end if;
  if tg_op = 'UPDATE' and old.sistema and (not new.activa or not new.sistema or new.prioridad <> old.prioridad) then
    raise exception 'La acción «%» es del sistema: siempre activa y primera', old.nombre;
  end if;
  if tg_op = 'UPDATE' then
    new.actualizado_en := now();
    return new;
  end if;
  return old;
end $$;
create trigger acciones_proteger_sistema before update or delete on public.acciones
  for each row execute function public.acciones_proteger_sistema();

-- --------------------------------------------------------------------------- --
-- Cotizaciones (F4·26, RAG-27)
-- --------------------------------------------------------------------------- --
create sequence public.cotizaciones_consecutivo;
create table public.cotizaciones (
  id           bigint generated always as identity primary key,
  consecutivo  integer not null unique default nextval('public.cotizaciones_consecutivo'),
  lead_id      bigint not null references public.leads (id) on delete cascade,
  nombre       text not null check (btrim(nombre) <> ''),
  cedula       text not null check (cedula ~ '^[0-9]{6,10}$'),
  celular      text not null check (celular ~ '^3[0-9]{9}$'),
  tipo_cliente text not null check (tipo_cliente in ('distribuidor', 'cliente_final')),
  items        jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),  -- [{codigo, nombre, cantidad, precio}]
  subtotal     numeric(14,2) not null check (subtotal >= 0),
  cargos       jsonb not null default '[]' check (jsonb_typeof(cargos) = 'array'),                     -- [{concepto, valor}]
  total        numeric(14,2) not null check (total >= 0),
  valida_hasta timestamptz not null,
  pdf          text check (pdf is null or pdf ~ '^cotizaciones/[0-9]+\.pdf$'),
  creado_por   uuid references public.usuarios (id),   -- null = la hizo el bot
  creado_en    timestamptz not null default now()
);
alter sequence public.cotizaciones_consecutivo owned by public.cotizaciones.consecutivo;
create index cotizaciones_lead_idx on public.cotizaciones (lead_id, creado_en desc);

-- --------------------------------------------------------------------------- --
-- Configuración del agente, de la compra y de la cotización (una fila)
-- --------------------------------------------------------------------------- --
create table public.agente_config (
  id                      smallint primary key default 1 check (id = 1),
  -- Encendido por etapas (RAG-16)
  estado                  text not null default 'apagado' check (estado in ('apagado', 'simulador', 'lista_blanca', 'todos')),
  lista_blanca            text[] not null default '{}',
  -- Cerebro (F4·27, RAG-10, RAG-11): la llave vive en Vault, aquí solo su id
  proveedor               text not null default 'deepseek' check (proveedor in ('deepseek', 'openai', 'gemini', 'anthropic', 'local')),
  modelo                  text not null default 'deepseek-chat',
  proveedor_respaldo      text check (proveedor_respaldo in ('deepseek', 'openai', 'gemini', 'anthropic', 'local')),
  modelo_respaldo         text,
  llave_id                uuid,
  llave_respaldo_id       uuid,
  llave_guardada_en       timestamptz,
  temperatura             numeric(3,2) not null default 0.30 check (temperatura between 0 and 1.5),
  presupuesto_usd         numeric(10,2) not null default 0 check (presupuesto_usd >= 0),   -- RAG-17; 0 = sin presupuesto, el agente no corre
  -- Personalidad (RAG-13)
  nombre                  text not null default 'Avi' check (btrim(nombre) <> ''),
  tono                    text not null default 'amigable' check (tono in ('amigable', 'cercano', 'formal')),
  emojis                  text not null default 'pocos' check (emojis in ('si', 'pocos', 'no')),
  trato                   text not null default 'tu' check (trato in ('tu', 'usted')),
  largo                   text not null default 'corto' check (largo in ('corto', 'medio')),
  prompt                  text not null default '',
  -- Límites (RAG-08) y memoria
  memoria_mensajes        integer not null default 20 check (memoria_mensajes between 4 and 60),
  buffer_segundos         integer not null default 15 check (buffer_segundos between 0 and 60),
  max_pasos               integer not null default 6 check (max_pasos between 1 and 12),
  max_mensajes            integer not null default 3 check (max_mensajes between 1 and 5),
  max_turnos_dia          integer not null default 40 check (max_turnos_dia between 1 and 200),
  herramientas_apagadas   text[] not null default '{}',
  -- Compra (F4·25, RAG-09, RAG-20 a RAG-22). El texto de cuentas lo pega el dueño en la pantalla: no va en el repositorio.
  texto_cuentas           text not null default '',
  texto_comprobante       text not null default '✅ Recibimos tu comprobante. Un asesor valida tu pago y te confirma por aquí. 🙌',
  texto_sigue_interesado  text not null default '👋 ¿Sigues interesado en el equipo? Si necesitas ayuda con el pago, escribe *asesor*.',
  texto_cancelacion       text not null default '😊 Entendido. Si cambias de opinión o necesitas otro equipo, escríbenos cuando quieras.',
  minutos_para_pagar      integer not null default 20 check (minutos_para_pagar between 5 and 240),
  horas_sin_respuesta     integer not null default 12 check (horas_sin_respuesta between 1 and 23),
  -- Cotización (F4·26)
  cargo_configuracion     numeric(14,2) not null default 80000 check (cargo_configuracion >= 0),   -- solo cliente final
  recargo_tarjeta_pct     numeric(5,2) not null default 6 check (recargo_tarjeta_pct between 0 and 30),
  validez_cotizacion_h    integer not null default 24 check (validez_cotizacion_h between 1 and 720),
  actualizado_por         uuid references public.usuarios (id),
  actualizado_en          timestamptz not null default now(),
  -- No se enciende para clientes reales sin llave ni presupuesto.
  check (estado in ('apagado', 'simulador') or (llave_id is not null and presupuesto_usd > 0))
);
insert into public.agente_config (id) values (1);

create or replace function public.agente_config_sello() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  return new;
end $$;
create trigger agente_config_sello before update on public.agente_config
  for each row execute function public.agente_config_sello();

-- --------------------------------------------------------------------------- --
-- Registro de turnos del agente (RAG-18): costo y resultado de cada respuesta
-- --------------------------------------------------------------------------- --
create table public.agente_turnos (
  id              bigint generated always as identity primary key,
  lead_id         bigint references public.leads (id) on delete set null,
  en              timestamptz not null default now(),
  proveedor       text not null,
  modelo          text not null,
  tokens_entrada  integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida   integer not null default 0 check (tokens_salida >= 0),
  costo_usd       numeric(10,6) not null default 0 check (costo_usd >= 0),
  herramientas    jsonb not null default '[]',
  ms              integer,
  resultado       text not null check (resultado in ('respondido', 'asesor', 'bloqueado', 'error', 'tope', 'simulador')),
  detalle         jsonb not null default '{}'
);
create index agente_turnos_en_idx on public.agente_turnos (en desc);
create index agente_turnos_lead_idx on public.agente_turnos (lead_id, en desc);

-- Gasto del mes en curso (hora de Colombia), para el tope (RAG-17).
create or replace function public.agente_gasto_mes() returns numeric
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(costo_usd), 0) from agente_turnos
   where resultado <> 'simulador'
     and en >= date_trunc('month', now() at time zone 'America/Bogota') at time zone 'America/Bogota'
$$;

-- --------------------------------------------------------------------------- --
-- Llave del modelo en Vault (RAG-11): se escribe con la sesión y solo el servidor la lee
-- --------------------------------------------------------------------------- --
create or replace function public.agente_guardar_llave(p_llave text, p_respaldo boolean default false) returns void
language plpgsql security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare c agente_config; nuevo uuid;
begin
  perform exigir_permiso('administrar_agente');
  if p_llave is null or length(btrim(p_llave)) < 20 then
    raise exception 'La llave es muy corta';
  end if;
  select * into c from agente_config where id = 1;
  if p_respaldo then
    if c.llave_respaldo_id is null then
      nuevo := vault.create_secret(btrim(p_llave), 'agente_llave_respaldo', 'Llave del modelo de respaldo del agente (F4·22)');
      update agente_config set llave_respaldo_id = nuevo, llave_guardada_en = now() where id = 1;
    else
      perform vault.update_secret(c.llave_respaldo_id, btrim(p_llave));
      update agente_config set llave_guardada_en = now() where id = 1;
    end if;
  else
    if c.llave_id is null then
      nuevo := vault.create_secret(btrim(p_llave), 'agente_llave', 'Llave del modelo del agente (F4·22)');
      update agente_config set llave_id = nuevo, llave_guardada_en = now() where id = 1;
    else
      perform vault.update_secret(c.llave_id, btrim(p_llave));
      update agente_config set llave_guardada_en = now() where id = 1;
    end if;
  end if;
end $$;

-- Lo único que devuelve las llaves: solo el servidor (receptor y app).
create or replace function public.agente_llaves() returns jsonb
language plpgsql stable security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare c agente_config;
begin
  select * into c from agente_config where id = 1;
  return jsonb_build_object(
    'llave', (select decrypted_secret from vault.decrypted_secrets where id = c.llave_id),
    'llave_respaldo', (select decrypted_secret from vault.decrypted_secrets where id = c.llave_respaldo_id));
end $$;

revoke execute on function public.agente_guardar_llave(text, boolean), public.agente_llaves()
  from public, anon, authenticated, service_role;
grant execute on function public.agente_guardar_llave(text, boolean) to authenticated;
grant execute on function public.agente_llaves() to service_role;
revoke execute on function public.agente_gasto_mes() from public, anon;
grant execute on function public.agente_gasto_mes() to authenticated, service_role;

-- --------------------------------------------------------------------------- --
-- Archivos: imágenes o PDF del conocimiento y PDF de cotizaciones (buckets privados, sin SVG)
-- --------------------------------------------------------------------------- --
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('conocimiento', 'conocimiento', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
  ('cotizaciones', 'cotizaciones', false, 5242880, array['application/pdf'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy conocimiento_archivos_lectura on storage.objects for select to authenticated
  using (bucket_id = 'conocimiento' and (select public.es_usuario_activo()));
create policy conocimiento_archivos_alta on storage.objects for insert to authenticated
  with check (bucket_id = 'conocimiento' and (select public.tiene_permiso('administrar_agente')));
create policy conocimiento_archivos_edicion on storage.objects for update to authenticated
  using (bucket_id = 'conocimiento' and (select public.tiene_permiso('administrar_agente')));
create policy conocimiento_archivos_baja on storage.objects for delete to authenticated
  using (bucket_id = 'conocimiento' and (select public.tiene_permiso('administrar_agente')));
-- Las cotizaciones las genera el servidor; las ve quien atiende la bandeja.
create policy cotizaciones_archivos_lectura on storage.objects for select to authenticated
  using (bucket_id = 'cotizaciones' and (select public.tiene_permiso('atender_bandeja')));

-- --------------------------------------------------------------------------- --
-- Privilegios y RLS
-- --------------------------------------------------------------------------- --
alter table public.compra_etapas      enable row level security;
alter table public.conocimiento       enable row level security;
alter table public.acciones           enable row level security;
alter table public.acciones_registro  enable row level security;
alter table public.cotizaciones       enable row level security;
alter table public.agente_config      enable row level security;
alter table public.agente_turnos      enable row level security;

revoke all on public.compra_etapas, public.conocimiento, public.acciones, public.acciones_registro, public.cotizaciones,
              public.agente_config, public.agente_turnos
  from anon, authenticated;

-- Lo lee cualquier usuario activo (el asesor consulta las políticas y ve las cotizaciones de sus chats).
grant select on public.conocimiento, public.compra_etapas to authenticated;
create policy conocimiento_lectura on public.conocimiento for select to authenticated using ((select public.es_usuario_activo()));
create policy compra_etapas_lectura on public.compra_etapas for select to authenticated using ((select public.es_usuario_activo()));

grant select on public.cotizaciones to authenticated;
create policy cotizaciones_lectura on public.cotizaciones for select to authenticated
  using ((select public.tiene_permiso('atender_bandeja')));

-- Lo escribe quien administra el agente.
grant insert, update, delete on public.conocimiento to authenticated;
create policy conocimiento_alta on public.conocimiento for insert to authenticated
  with check ((select public.tiene_permiso('administrar_agente')));
create policy conocimiento_edicion on public.conocimiento for update to authenticated
  using ((select public.tiene_permiso('administrar_agente'))) with check ((select public.tiene_permiso('administrar_agente')));
create policy conocimiento_baja on public.conocimiento for delete to authenticated
  using ((select public.tiene_permiso('administrar_agente')));

grant update on public.compra_etapas to authenticated;
create policy compra_etapas_edicion on public.compra_etapas for update to authenticated
  using ((select public.tiene_permiso('administrar_agente'))) with check ((select public.tiene_permiso('administrar_agente')));

grant select, insert, update, delete on public.acciones to authenticated;
create policy acciones_lectura on public.acciones for select to authenticated using ((select public.tiene_permiso('administrar_agente')));
create policy acciones_alta on public.acciones for insert to authenticated
  with check ((select public.tiene_permiso('administrar_agente')) and not sistema);
create policy acciones_edicion on public.acciones for update to authenticated
  using ((select public.tiene_permiso('administrar_agente'))) with check ((select public.tiene_permiso('administrar_agente')));
create policy acciones_baja on public.acciones for delete to authenticated using ((select public.tiene_permiso('administrar_agente')));

grant select on public.acciones_registro, public.agente_turnos to authenticated;
create policy acciones_registro_lectura on public.acciones_registro for select to authenticated
  using ((select public.tiene_permiso('administrar_agente')));
create policy agente_turnos_lectura on public.agente_turnos for select to authenticated
  using ((select public.tiene_permiso('administrar_agente')));

-- La configuración: todo menos los ids de las llaves; se edita con permiso; las llaves solo por agente_guardar_llave.
grant select (id, estado, lista_blanca, proveedor, modelo, proveedor_respaldo, modelo_respaldo, llave_guardada_en, temperatura,
              presupuesto_usd, nombre, tono, emojis, trato, largo, prompt, memoria_mensajes, buffer_segundos, max_pasos,
              max_mensajes, max_turnos_dia, herramientas_apagadas, texto_cuentas, texto_comprobante, texto_sigue_interesado,
              texto_cancelacion, minutos_para_pagar, horas_sin_respuesta, cargo_configuracion, recargo_tarjeta_pct,
              validez_cotizacion_h, actualizado_por, actualizado_en)
  on public.agente_config to authenticated;
grant update (estado, lista_blanca, proveedor, modelo, proveedor_respaldo, modelo_respaldo, temperatura, presupuesto_usd, nombre,
              tono, emojis, trato, largo, prompt, memoria_mensajes, buffer_segundos, max_pasos, max_mensajes, max_turnos_dia,
              herramientas_apagadas, texto_cuentas, texto_comprobante, texto_sigue_interesado, texto_cancelacion,
              minutos_para_pagar, horas_sin_respuesta, cargo_configuracion, recargo_tarjeta_pct, validez_cotizacion_h)
  on public.agente_config to authenticated;
create policy agente_config_lectura on public.agente_config for select to authenticated
  using ((select public.tiene_permiso('administrar_agente')));
create policy agente_config_edicion on public.agente_config for update to authenticated
  using ((select public.tiene_permiso('administrar_agente'))) with check ((select public.tiene_permiso('administrar_agente')));

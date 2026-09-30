-- 0007 · Editor del bot, horario y respuestas rápidas (F3·7, decisión 0023)
--
-- Diseño: docs/BOT-Y-HORARIO.md. Se editan textos y títulos de opciones; la estructura sigue en el código.

-- --------------------------------------------------------------------------- --
-- Nodos del bot
-- --------------------------------------------------------------------------- --
create table public.bot_nodos (
  clave             text primary key,
  nombre            text not null,
  orden             smallint not null,
  texto             text not null check (length(btrim(texto)) > 0),
  opciones          jsonb,                 -- [{"id":"1","titulo":"Productos"}] o null si el nodo no tiene opciones editables
  texto_original    text,                  -- se llena al sembrar; después no cambia
  opciones_original jsonb,
  max_titulo        smallint,              -- 20 botones, 24 listas (RBOT-02)
  marcas            text[] not null default '{}',
  actualizado_en    timestamptz not null default now(),
  actualizado_por   uuid references public.usuarios(id) on delete set null
);
comment on table public.bot_nodos is 'Textos y títulos de opciones del bot de menú fijo. La estructura vive en el código (decisión 0023).';

create or replace function public.bot_nodos_validar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare op jsonb;
begin
  new.texto := btrim(new.texto);
  -- La estructura no se toca: mismos ids en el mismo orden que el original.
  if new.opciones is distinct from old.opciones then
    if new.opciones is null or old.opciones is null
       or jsonb_array_length(new.opciones) <> jsonb_array_length(old.opciones)
       or (select array_agg(o->>'id') from jsonb_array_elements(new.opciones) o)
          is distinct from (select array_agg(o->>'id') from jsonb_array_elements(old.opciones) o) then
      raise exception 'No se pueden agregar, quitar ni reordenar opciones (RBOT-01).';
    end if;
    for op in select * from jsonb_array_elements(new.opciones) loop
      if length(btrim(coalesce(op->>'titulo', ''))) = 0 then
        raise exception 'Cada opción necesita un título.';
      end if;
      if length(op->>'titulo') > coalesce(new.max_titulo, 24) then
        raise exception 'El título "%" pasa de % caracteres (límite de WhatsApp).', op->>'titulo', coalesce(new.max_titulo, 24);
      end if;
    end loop;
  end if;
  if new.clave is distinct from old.clave or new.texto_original is distinct from old.texto_original
     or new.opciones_original is distinct from old.opciones_original then
    raise exception 'La clave y el original de un nodo no se cambian.';
  end if;
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;
insert into public.bot_nodos (clave, nombre, orden, texto, opciones, texto_original, opciones_original, max_titulo, marcas) values
 ('B00', 'Saludo y menú principal', 1,
  E'¡Hola! 👋 Bienvenido a *Ventas Virtuales Colombia*, distribuidores al por mayor y detal de equipos de cómputo en Cali.\nSoy el *Bot Ventas Virtuales* 🤖 ¿En qué te podemos ayudar hoy?\n\n_También puedes escribirme lo que buscas, por ejemplo: "Dell i5 de décima"._',
  '[{"id":"1","titulo":"Productos"},{"id":"2","titulo":"Distribuidores"},{"id":"3","titulo":"Servicio al cliente"}]', null, null, 20, '{}'),
 ('B001A', '¿Qué producto busca?', 2, '¡Perfecto! ¿Qué producto estás buscando?',
  '[{"id":"1","titulo":"Portátiles corporativos"},{"id":"2","titulo":"Torres Tiny"},{"id":"3","titulo":"Torres SFF"},{"id":"4","titulo":"Partes"},{"id":"0","titulo":"Volver al menú"}]', null, null, 24, '{}'),
 ('B001A1', '¿Para qué tipo de trabajo?', 3, '¿Para qué tipo de trabajo necesitas el portátil?',
  '[{"id":"1","titulo":"Hogar / estudio"},{"id":"2","titulo":"Ejecutivo / oficina"},{"id":"3","titulo":"Diseño / edición"},{"id":"0","titulo":"Volver"}]', null, null, 24, '{}'),
 ('B001A2', 'Presupuesto', 4, E'¿Cuál es tu presupuesto aproximado?\n_(también puedes escribir el monto, por ejemplo 1.5 millones)_',
  null, null, null, null, '{}'),
 ('B001A3', '¿Envío el catálogo?', 5, '¿Deseas que te enviemos el catálogo de portátiles disponibles para *{uso}* y así revises cuál te interesa?',
  '[{"id":"1","titulo":"Sí, el catálogo"},{"id":"2","titulo":"Hablar con asesor"},{"id":"3","titulo":"Volver"}]', null, null, 20, '{uso}'),
 ('B001A4', 'Marca', 6, E'¿De qué marca quieres ver los portátiles?\n_(solo aparecen las marcas con stock)_',
  null, null, null, null, '{}'),
 ('R11', 'Botones de la ficha del equipo', 7, 'Ficha del equipo (sale del inventario)',
  '[{"id":"1","titulo":"Lo quiero"},{"id":"2","titulo":"Ver otro código"},{"id":"0","titulo":"Menú principal"}]', null, null, 20, '{}'),
 ('B-ASESOR', 'Aviso al pasar a asesor (en horario)', 8,
  E'{motivo}¡Entendido! 🙌 En breve un asesor de *Ventas Virtuales Colombia* te atenderá personalmente.\n\n{horario}\n\n_(Prueba: escribe *reiniciar* para volver a hablar con el bot)_',
  null, null, null, null, '{motivo,horario}'),
 ('B-CERRADO', 'Aviso al pasar a asesor (fuera de horario)', 9,
  E'{motivo}¡Entendido! 🙌 Ahora estamos fuera de horario, pero tu chat ya quedó en la fila: un asesor de *Ventas Virtuales Colombia* te responde {proxima}.\n\n{horario}\n\n_(Prueba: escribe *reiniciar* para volver a hablar con el bot)_',
  null, null, null, null, '{motivo,horario,proxima}'),
 ('ERROR', 'No entendió la respuesta', 10, '🤔 No entendí tu respuesta. Toca una opción o escribe el *número*, o *MENU* para volver al inicio.',
  null, null, null, null, '{}'),
 ('ERROR-3', 'Tres respuestas no reconocidas', 11, 'Tres respuestas no reconocidas: te paso con un asesor.',
  null, null, null, null, '{}');

update public.bot_nodos set texto_original = texto, opciones_original = opciones;
alter table public.bot_nodos alter column texto_original set not null;

create trigger bot_nodos_validar before update on public.bot_nodos
  for each row execute function public.bot_nodos_validar();

-- --------------------------------------------------------------------------- --
-- Horario: sin franjas encimadas (RBOT-07)
-- --------------------------------------------------------------------------- --
create or replace function public.horario_sin_solapes() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.horario_atencion h
             where h.dia = new.dia and h.id is distinct from new.id
               and h.abre < new.cierra and new.abre < h.cierra) then
    raise exception 'Esa franja se cruza con otra del mismo día.';
  end if;
  return new;
end $$;
create trigger horario_sin_solapes before insert or update on public.horario_atencion
  for each row execute function public.horario_sin_solapes();

-- --------------------------------------------------------------------------- --
-- Respuestas rápidas (RBOT-08)
-- --------------------------------------------------------------------------- --
create table public.respuestas_rapidas (
  id             bigint generated always as identity primary key,
  atajo          text not null unique check (atajo ~ '^[a-z0-9_-]{1,30}$'),
  titulo         text not null check (length(btrim(titulo)) > 0),
  texto          text not null check (length(btrim(texto)) > 0),
  activo         boolean not null default true,
  creado_por     uuid references public.usuarios(id) on delete set null default auth.uid(),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
comment on table public.respuestas_rapidas is 'Atajos de texto del asesor: se escribe / en la Bandeja y se inserta el texto para revisarlo.';

create or replace function public.respuestas_rapidas_toca() returns trigger
language plpgsql as $$ begin new.actualizado_en := now(); return new; end $$;
create trigger respuestas_rapidas_toca before update on public.respuestas_rapidas
  for each row execute function public.respuestas_rapidas_toca();

insert into public.respuestas_rapidas (atajo, titulo, texto) values
 ('saludo',  'Saludo',            'Hola {nombre}, soy asesor de Ventas Virtuales Colombia. ¿En qué te puedo ayudar?'),
 ('horario', 'Horario',           'Atendemos de lunes a viernes de 8:00 am a 6:00 pm y sábados de 9:00 am a 2:00 pm. Los festivos permanecemos cerrados.'),
 ('gracias', 'Cierre amable',     'Gracias por escribirnos, {nombre}. Quedamos atentos por si necesitas algo más.');

-- --------------------------------------------------------------------------- --
-- Permisos (USUARIOS-Y-PERMISOS.md): leer, usuario activo · escribir, administrar_bot
-- --------------------------------------------------------------------------- --
alter table public.bot_nodos          enable row level security;
alter table public.respuestas_rapidas enable row level security;

create policy bot_nodos_lectura on public.bot_nodos for select to authenticated
  using ((select public.es_usuario_activo()));
create policy bot_nodos_edicion on public.bot_nodos for update to authenticated
  using ((select public.tiene_permiso('administrar_bot')))
  with check ((select public.tiene_permiso('administrar_bot')));

create policy respuestas_rapidas_lectura on public.respuestas_rapidas for select to authenticated
  using ((select public.es_usuario_activo()));
create policy respuestas_rapidas_alta on public.respuestas_rapidas for insert to authenticated
  with check ((select public.tiene_permiso('administrar_bot')));
create policy respuestas_rapidas_edicion on public.respuestas_rapidas for update to authenticated
  using ((select public.tiene_permiso('administrar_bot')))
  with check ((select public.tiene_permiso('administrar_bot')));
create policy respuestas_rapidas_baja on public.respuestas_rapidas for delete to authenticated
  using ((select public.tiene_permiso('administrar_bot')));

revoke all on public.bot_nodos, public.respuestas_rapidas from anon;
grant select, update on public.bot_nodos to authenticated;
grant select, insert, update, delete on public.respuestas_rapidas to authenticated;

-- 0002 · Lo que guarda el bot, las conversaciones y los catálogos
--
-- - leads: los datos que el árbol de respuesta pregunta (docs/ARBOL-DE-RESPUESTA.md, sección 2) y el
--   estado del bot, para que un reinicio del servidor no borre dónde iba cada cliente.
-- - mensajes: todo lo que entra y sale por WhatsApp (decisión 0007). El id de Meta evita duplicados
--   cuando Meta reintenta el webhook.
-- - catalogos: PDF del servidor o enlaces de Drive por marca y categoría (decisión 0015).

alter table public.leads
  add column categoria_interes text not null default '',
  add column uso_equipo        text not null default '' check (uso_equipo in ('', 'Hogar', 'Ejecutivo', 'Diseño')),
  add column presupuesto       text not null default '',
  add column marca_interes     text not null default '',
  add column etiquetas         text[] not null default '{}',
  add column errores_bot       integer not null default 0 check (errores_bot >= 0),
  add column estado_bot        jsonb not null default '{}'::jsonb;
comment on column public.leads.estado_bot is
  'Estado interno del árbol (rango de presupuesto elegido, marcas ofrecidas…). Lo lee y escribe solo el bot.';

create table public.mensajes (
  id         bigint generated always as identity primary key,
  lead_id    bigint not null references public.leads (id) on delete cascade,
  lado       text not null check (lado in ('cliente', 'bot', 'asesor')),
  tipo       text not null default 'text',
  texto      text not null default '',
  meta_id    text unique,
  creado_en  timestamptz not null default now()
);
comment on table public.mensajes is 'Conversación de WhatsApp: el CRM es dueño de su historial (decisión 0007).';
create index mensajes_lead_idx on public.mensajes (lead_id, creado_en);

create table public.catalogos (
  id              bigint generated always as identity primary key,
  nombre          text not null check (btrim(nombre) <> ''),
  categoria       text not null default '',  -- '' = sirve para todas
  marca           text not null default '',  -- '' = sirve para todas
  tipo            text not null check (tipo in ('pdf', 'drive')),
  archivo         text not null default '',  -- ruta en el bucket 'catalogos' (tipo pdf)
  url             text not null default '',  -- enlace de Drive (tipo drive)
  todos           boolean not null default false,  -- el enlace de Drive con todos los catálogos
  activo          boolean not null default true,
  meta_media_id   text not null default '',  -- identificador del PDF subido a Meta, se reutiliza
  meta_media_en   timestamptz,
  creado_en       timestamptz not null default now(),
  check ((tipo = 'pdf' and archivo <> '') or (tipo = 'drive' and url <> ''))
);
comment on table public.catalogos is
  'El bot envía el más específico para la marca y categoría del cliente, y además el enlace de Drive con todos.';

alter table public.mensajes  enable row level security;
alter table public.catalogos enable row level security;

insert into storage.buckets (id, name, public)
values ('catalogos', 'catalogos', false)
on conflict (id) do nothing;

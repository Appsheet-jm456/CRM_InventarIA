-- 0001 · Modelo inicial: las tres tablas de Baserow, pasadas a Postgres
--
-- Es el punto de partida de la migración desde Baserow (decisión 0013). Conserva la misma estructura
-- (Inventario, CRM_Etapas y CRM_Leads) con nombres en minúscula, y corrige solo lo que Baserow no
-- podía: precio y stock como números, códigos y teléfonos únicos, y la etapa amarrada a su tabla.
-- El modelo completo del diseño (contactos, conversaciones, mensajes…) llega en migraciones siguientes.
--
-- Nadie lee estas tablas con la clave pública: RLS encendido y sin políticas. Solo el servidor
-- (service_role) entra, hasta que la Fase 2 defina usuarios y roles.

-- --------------------------------------------------------------------------- --
-- Inventario (Baserow: Inventario). Mientras la app nueva no tenga su módulo,
-- se edita en Baserow y se copia aquí cada 5 minutos (baserow_id empareja las filas).
-- --------------------------------------------------------------------------- --
create table public.productos (
  id              bigint generated always as identity primary key,
  baserow_id      integer unique,
  codigo          text not null unique check (btrim(codigo) <> ''),
  categoria       text not null default '',
  descripcion     text not null default '',
  marca           text not null default '',
  modelo          text not null default '',
  procesador      text not null default '',
  generacion      text not null default '',
  ram             text not null default '',
  almacenamiento  text not null default '',
  estado          text not null default '',
  precio          numeric(14, 2) not null default 0 check (precio >= 0),
  stock           integer not null default 0,
  foto            text not null default '',
  video           text not null default '',
  actualizado_en  timestamptz not null default now()
);
comment on table public.productos is
  'Inventario. Hoy es copia de Baserow (sincronizar_inventario.py); el código se valida contra esta tabla.';
create index productos_categoria_idx on public.productos (categoria);
create index productos_precio_idx on public.productos (precio) where stock > 0;

-- --------------------------------------------------------------------------- --
-- Etapas del embudo (Baserow: CRM_Etapas)
-- --------------------------------------------------------------------------- --
create table public.etapas (
  id      bigint generated always as identity primary key,
  nombre  text not null unique check (btrim(nombre) <> ''),
  orden   integer not null,
  color   text not null default 'Gris'
          check (color in ('Gris', 'Azul', 'Amarillo', 'Naranja', 'Morado', 'Verde', 'Rojo'))
);
comment on table public.etapas is 'Columnas del embudo, en orden. Se crean y renombran desde la app.';

-- --------------------------------------------------------------------------- --
-- Clientes / oportunidades (Baserow: CRM_Leads). Una fila por número de WhatsApp.
-- La etapa apunta a etapas.nombre: renombrar una etapa arrastra a sus leads (on update cascade),
-- y no se puede borrar una etapa con leads (hay que reasignarlos antes), como en la v0.
-- --------------------------------------------------------------------------- --
create table public.leads (
  id                     bigint generated always as identity primary key,
  telefono               text not null unique check (telefono ~ '^[0-9]{8,15}$'),
  nombre                 text not null default '',
  etapa                  text not null references public.etapas (nombre) on update cascade on delete restrict,
  ultimo_mensaje         text not null default '',
  fecha_ultimo_contacto  timestamptz,
  notas                  text not null default '',
  valor_estimado         numeric(14, 2),
  pausar_bot             boolean not null default false,
  paso_menu              text not null default '',
  cotiz_producto         text not null default '',
  cotiz_cantidad         integer,
  motivo_perdido         text check (motivo_perdido in
                           ('Precio', 'Sin respuesta', 'No calificado', 'Compró en otro lado', 'Solo preguntaba', 'Otro')),
  creado_en              timestamptz not null default now()
);
comment on column public.leads.pausar_bot is 'true = un asesor tomó el chat: el bot no responde a este número.';
comment on column public.leads.paso_menu is 'Nodo del árbol de respuesta donde está el cliente (B00, B001A2, R11…).';
create index leads_etapa_idx on public.leads (etapa);

alter table public.productos enable row level security;
alter table public.etapas    enable row level security;
alter table public.leads     enable row level security;

-- --------------------------------------------------------------------------- --
-- Etapas iniciales: las de Baserow al 30 sep 2026. Los leads de Baserow eran pruebas y no se copian.
-- --------------------------------------------------------------------------- --
insert into public.etapas (nombre, orden, color) values
  ('Nuevo',              1, 'Gris'),
  ('En Conversación',    2, 'Azul'),
  ('Cotización',         3, 'Amarillo'),
  ('Negociación',        4, 'Naranja'),
  ('Confirmar transfer', 5, 'Morado'),
  ('Vendido',            6, 'Verde'),
  ('Perdido',            7, 'Rojo'),
  ('Distribuidores',     8, 'Gris');

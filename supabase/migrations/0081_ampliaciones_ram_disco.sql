-- 0081 · Aumentar RAM o disco en el pedido del bot (F4·73, docs/AMPLIACIONES-RAM-DISCO.md, RAM-01 a RAM-08).
-- Atributos del equipo para saber si se puede ampliar, tabla de precios editable en Agente → Compra y el interruptor.

-- --------------------------------------------------------------------------- --
-- Atributos del equipo (sección 2)
-- --------------------------------------------------------------------------- --
insert into public.producto_atributos (clave, nombre, tipo, emoji, orden, opciones) values
  ('ram_onboard',   'RAM soldada (onboard)', 'si_no', '🧩', 20, '[]'),
  ('ram_ranuras',   'Ranuras de RAM',        'lista', '🧩', 21, '["Ninguna", "1", "2", "4", "6", "8"]'),
  ('ram_velocidad', 'Velocidad RAM',         'lista', '⚡', 22, '["2400", "2666-3200"]'),
  ('disco_ranuras', 'Ranuras de disco',      'lista', '💽', 23, '["1", "2"]'),
  ('disco_tipo',    'Tipo de disco',         'lista', '💽', 24, '["SATA", "NVMe"]')
on conflict (clave) do nothing;

-- --------------------------------------------------------------------------- --
-- Precios (sección 3)
-- --------------------------------------------------------------------------- --
create table public.ampliaciones (
  id             bigint generated always as identity primary key,
  tipo           text not null check (tipo in ('ram', 'disco')),
  desde_gb       integer not null check (desde_gb > 0),
  hasta_gb       integer not null,
  precio         integer not null check (precio > 0),          -- RAM: 2400 MHz · disco: SSD SATA
  precio_rapida  integer check (precio_rapida > 0),             -- RAM 2666-3200 MHz (en disco, vacío)
  activa         boolean not null default true,
  orden          integer not null default 0,
  actualizado_en timestamptz not null default now(),
  check (hasta_gb > desde_gb),
  check (tipo = 'disco' or precio_rapida is not null),
  unique (tipo, desde_gb, hasta_gb)
);
comment on table public.ampliaciones is 'F4·73: precios de aumentar RAM o disco que el bot ofrece en el resumen del pedido.';
alter table public.ampliaciones enable row level security;
create policy ampliaciones_lectura on public.ampliaciones for select to authenticated using (true);
create policy ampliaciones_edicion on public.ampliaciones for all to authenticated
  using ((select tiene_permiso('administrar_agente'))) with check ((select tiene_permiso('administrar_agente')));
revoke all on public.ampliaciones from anon;
grant select, insert, update, delete on public.ampliaciones to authenticated;

insert into public.ampliaciones (tipo, desde_gb, hasta_gb, precio, precio_rapida, orden) values
  ('ram', 8, 16, 120000, 140000, 1), ('ram', 16, 24, 120000, 140000, 2),
  ('ram', 8, 24, 200000, 220000, 3), ('ram', 16, 32, 200000, 220000, 4),
  ('ram', 8, 40, 450000, 500000, 5), ('ram', 16, 48, 450000, 500000, 6), ('ram', 32, 64, 450000, 500000, 7),
  ('disco', 128, 256, 80000, null, 11), ('disco', 128, 512, 180000, null, 12), ('disco', 256, 512, 130000, null, 13),
  ('disco', 256, 1024, 280000, null, 14), ('disco', 512, 1024, 180000, null, 15);

alter table public.agente_config
  add column ampliacion_activa boolean not null default true,
  add column ampliacion_nvme integer not null default 30000 check (ampliacion_nvme >= 0);
comment on column public.agente_config.ampliacion_activa is 'F4·73 (RAM-01): ofrecer «Aumentar RAM o disco» en el resumen del carrito.';
comment on column public.agente_config.ampliacion_nvme is 'F4·73 (RAM-04): adicional sobre el precio SATA si el disco es NVMe.';

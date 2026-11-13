-- F4·75b: enlace de la tienda web escrito a mano en cada equipo. Si está, manda sobre la búsqueda automática por código.
alter table public.productos add column enlace_web text not null default ''
  check (enlace_web = '' or enlace_web ~ '^https://\S+$');

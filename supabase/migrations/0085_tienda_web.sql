-- F4·75: enlace a la tienda web (ventasvirtualcolombia.com) en la ficha del equipo y en la ficha que envía el bot.
-- Una sola fila. El bot (receptor, clave de servicio) lee la lista de publicados de {url}/productos cada 5 minutos:
-- el equipo publicado lleva «🌐 Ver en la web: {url}/producto/{código}»; si no está, la ficha suelta lleva el catálogo web.
create table public.tienda_web (
  id int primary key default 1 check (id = 1),
  activa boolean not null default true,
  url text not null default 'https://ventasvirtualcolombia.com'
    check (url ~ '^https://[a-z0-9.-]+[a-z]$'),
  catalogo_url text not null default 'https://ventasvirtualcolombia.com/productos?categoria=portatil'
    check (catalogo_url = '' or catalogo_url ~ '^https://\S+$'),
  texto_equipo text not null default '🌐 Ver en la web: {enlace}' check (length(texto_equipo) between 1 and 200 and texto_equipo like '%{enlace}%'),
  texto_catalogo text not null default '🛒 Mira más equipos en la web: {enlace}' check (length(texto_catalogo) between 1 and 200 and texto_catalogo like '%{enlace}%'),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);
insert into public.tienda_web (id) values (1);

alter table public.tienda_web enable row level security;
revoke all on public.tienda_web from anon, authenticated;
grant select on public.tienda_web to authenticated;
grant update (activa, url, catalogo_url, texto_equipo, texto_catalogo, actualizado_en, actualizado_por) on public.tienda_web to authenticated;
create policy tienda_web_ver on public.tienda_web for select to authenticated using (true);
create policy tienda_web_cambiar on public.tienda_web for update to authenticated
  using ((select tiene_permiso('administrar_inventario'))) with check ((select tiene_permiso('administrar_inventario')));

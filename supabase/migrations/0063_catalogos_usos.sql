-- 0063 · Catálogos: dónde se usa cada uno (F4·60, docs/MEJORAS-CHAT-Y-PAGOS.md, RI-14).
-- Antes de eliminar un catálogo, la pantalla avisa qué cuadros del bot (versión publicada o borrador) y qué Acciones lo envían
-- por su número. Las versiones archivadas no cuentan: ya no se usan. Lectura para cualquier usuario activo, como la tabla catalogos.

create or replace function public.catalogo_usos(p_catalogo bigint) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not es_usuario_activo() then
    raise exception 'No tienes acceso.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(u.fila order by u.orden, u.fila ->> 'donde')
    from (
      select 1 as orden, jsonb_build_object(
               'tipo', 'bot',
               'donde', format('Bot «%s» (%s), cuadro «%s»', b.nombre,
                               case f.estado when 'publicada' then 'publicado' else 'borrador' end, c.nombre)) as fila
        from bot_cuadros c
        join bot_flujos f on f.id = c.flujo_id
        join bots b on b.id = f.bot_id
       where c.tipo = 'catalogo' and f.estado in ('publicada', 'borrador') and not b.archivado
         and c.ajustes ->> 'catalogo_id' = p_catalogo::text
      union all
      select 2, jsonb_build_object(
               'tipo', 'accion',
               'donde', format('Acción «%s»%s', a.nombre, case when a.activa then '' else ' (apagada)' end))
        from acciones a
       where exists (select 1 from jsonb_array_elements(a.hacer) x
                      where x ->> 'tipo' = 'catalogo' and x ->> 'catalogo_id' = p_catalogo::text)
    ) u
  ), '[]'::jsonb);
end $$;

revoke all on function public.catalogo_usos(bigint) from public, anon;
grant execute on function public.catalogo_usos(bigint) to authenticated;
comment on function public.catalogo_usos(bigint) is
  'F4·60 (RI-14): cuadros del bot (publicado o borrador) y Acciones que envían este catálogo por su número.';

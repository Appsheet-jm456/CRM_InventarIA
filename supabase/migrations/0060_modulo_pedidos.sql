-- 0060 · Módulo Pedidos (F4·55, docs/PEDIDOS.md, RPD-08 a RPD-14): todos los pedidos que pasaron el pago, con su servicio técnico,
-- documento y despacho, en tabla y Kanban. Solo consulta: las acciones siguen en la ficha (y en el panel del pedido, que es la misma).
--
-- · Permiso nuevo `ver_pedidos`: administrador y los roles que gestionan oportunidades (asesor). El técnico no lo tiene (RAL-08).
-- · `pedidos_lista()`: una fila por pedido (alistamientos), con la fase calculada y las alertas (RPD-12). Respeta quién ve a cada cliente.

insert into public.permisos (codigo, descripcion)
values ('ver_pedidos', 'Pedidos: ver todos los pedidos pagados con su servicio técnico, documento y despacho');
insert into public.rol_permisos (rol_id, permiso)
select distinct rp.rol_id, 'ver_pedidos' from public.rol_permisos rp where rp.permiso = 'gestionar_oportunidades'
on conflict do nothing;

create index if not exists alistamientos_creado on public.alistamientos (creado_en desc);

create function public.pedidos_lista() returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('ver_pedidos');
  return coalesce((
    select jsonb_agg(x.fila order by x.creado desc)
    from (
      select a.creado_en as creado, jsonb_build_object(
        'id', a.id, 'numero', a.numero, 'lead_id', a.lead_id,
        'cliente', coalesce(nullif(btrim(l.nombre), ''), 'Cliente'), 'telefono', l.telefono,
        'equipos', a.equipos, 'producto', o.producto,
        'total', coalesce(o.valor_estimado, (select c.total from cotizaciones c where c.lead_id = a.lead_id order by c.creado_en desc limit 1)),
        'entrega', case l.atributos ->> 'venta_online' when 'true' then 'envio' when 'false' then 'tienda' end,
        'etapa', e.nombre, 'op_estado', o.estado,
        'estado', a.estado, 'tecnico', a.tecnico,
        'videos', (select count(distinct v.equipo_codigo) from alistamiento_videos v where v.alistamiento_id = a.id and v.estado = 'listo'),
        'doc_tipo', a.doc_tipo, 'doc_numero', a.doc_numero, 'transportadora', a.transportadora, 'numero_guia', a.numero_guia,
        'creado_en', a.creado_en, 'tomado_en', a.tomado_en, 'listo_en', a.listo_en, 'guia_en', a.guia_en, 'guia_enviada_en', a.guia_enviada_en,
        'video_enviado_en', a.video_enviado_en, 'documento_enviado_en', a.documento_enviado_en,
        'primer_video_en', a.primer_video_en, 'primer_documento_en', a.primer_documento_en,
        'aviso_tienda_en', a.aviso_tienda_en, 'entregado_en', a.entregado_en,
        'cancelado_en', a.cancelado_en, 'cancelado_motivo', a.cancelado_motivo,
        'correccion_documento_en', a.correccion_documento_en, 'correccion_video_en', a.correccion_video_en,
        'fase', case when a.cancelado_en is not null then 'cancelado'
                     when a.entregado_en is not null then 'entregado'
                     when a.guia_enviada_en is not null or a.aviso_tienda_en is not null then 'enviado'
                     when a.estado = 'listo' then 'listo'
                     when a.estado = 'en_revision' then 'en_revision'
                     else 'por_revisar' end,
        'alertas', to_jsonb(array_remove(array[
          case when a.cancelado_en is null and a.doc_numero is null and a.creado_en < now() - interval '24 hours'
               then 'Sin documento hace más de 24 h' end,
          case when a.cancelado_en is null and a.estado = 'listo' and a.guia_en is null and a.aviso_tienda_en is null and a.entregado_en is null
                    and a.listo_en < now() - interval '24 hours'
               then 'Listo hace más de 24 h sin despachar' end,
          case when a.cancelado_en is null and a.guia_en is not null and a.guia_enviada_en is null
               then 'Guía registrada sin enviar al cliente' end,
          case when a.cancelado_en is null and a.aviso_tienda_en is not null and a.entregado_en is null and a.aviso_tienda_en < now() - interval '7 days'
               then 'Avisado hace más de 7 días y sin recoger' end,
          case when a.cancelado_en is null and (a.guia_enviada_en is not null or a.entregado_en is not null) and a.video_enviado_en is null
               then 'Despachado sin enviar el video' end
        ]::text[], null))
      ) as fila
      from alistamientos a
      join oportunidades o on o.id = a.oportunidad_id
      join etapas e on e.id = o.etapa_id
      join leads l on l.id = a.lead_id and l.eliminado_en is null
      where puede_ver_lead(a.lead_id)
      order by a.creado_en desc
      limit 1000) x), '[]');
end $$;
revoke execute on function public.pedidos_lista() from public, anon;
grant execute on function public.pedidos_lista() to authenticated;

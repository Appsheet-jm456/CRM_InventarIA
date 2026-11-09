-- 0062 · Servicio técnico → Cerrados (F4·54, docs/PEDIDOS.md, RPD-38 a RPD-40): datos para reenviar el video corregido desde el panel.
-- `servicio_tecnico_cerrados` suma el cliente (id, sin teléfono), cuándo se envió el video, el video corregido y hasta cuándo deja WhatsApp
-- escribirle libremente (24 h desde su último mensaje, menos el minuto de margen del receptor). Sin reglas nuevas: el envío lo valida
-- `alistamiento_para_enviar` (RPD-31) y el receptor vuelve a mirar la ventana.

create or replace function public.servicio_tecnico_cerrados() returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform exigir_permiso('gestionar_alistamiento');
  return coalesce((
    select jsonb_agg(x.fila order by x.cierre desc)
    from (
      select coalesce(a.guia_en, a.entregado_en, o.cerrado_en, a.creado_en) as cierre, jsonb_build_object(
        'id', a.id, 'numero', a.numero,
        'cliente', coalesce(nullif(split_part(btrim(l.nombre), ' ', 1), ''), 'Cliente'),
        'entrega', case l.atributos ->> 'venta_online' when 'true' then 'envio' when 'false' then 'tienda' else null end,
        'equipos', a.equipos, 'doc_tipo', a.doc_tipo, 'doc_numero', a.doc_numero, 'estado', a.estado, 'tecnico', a.tecnico,
        'tomado_en', a.tomado_en, 'listo_en', a.listo_en, 'listo_por', a.listo_por, 'checklist', a.checklist, 'entro_en', a.creado_en,
        'cerrado_en', coalesce(a.guia_en, a.entregado_en, o.cerrado_en), 'cierre', e.nombre,
        'correccion_video_autorizada_en', a.correccion_video_autorizada_en, 'correccion_video_motivo', a.correccion_video_motivo,
        'lead_id', a.lead_id, 'video_enviado_en', a.video_enviado_en, 'correccion_video_en', a.correccion_video_en,
        'correccion_video_id', a.correccion_video_id,
        'ventana_meta_hasta', (select max(m.creado_en) + interval '24 hours' - interval '1 minute' from mensajes m
                                where m.lead_id = a.lead_id and m.lado = 'cliente'),
        'videos', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'equipo_codigo', v.equipo_codigo, 'estado', v.estado,
                                   'tecnico', v.tecnico, 'subido_en', v.subido_en, 'ruta', v.ruta, 'peso', v.peso, 'error', v.error)
                                   order by v.subido_en)
                            from alistamiento_videos v where v.alistamiento_id = a.id and v.estado <> 'vencido'), '[]')) as fila
      from alistamientos a
      join oportunidades o on o.id = a.oportunidad_id and o.estado <> 'abierta'
      join etapas e on e.id = o.etapa_id
      join leads l on l.id = a.lead_id and l.eliminado_en is null
      where a.cancelado_en is null and a.creado_en > now() - interval '6 months'
      order by cierre desc
      limit 100) x), '[]');
end $$;

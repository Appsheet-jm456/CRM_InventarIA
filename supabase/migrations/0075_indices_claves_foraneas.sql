-- 0075 · Índices en las claves foráneas que se consultan o se borran en cascada (rendimiento, 11 nov 2026).
-- Sin cambios de datos ni de comportamiento: solo acelera los JOIN y los filtros por estas columnas,
-- y los borrados de leads, oportunidades y usuarios (Postgres revisa cada FK al borrar).
-- Las FK de tablas de configuración de una sola fila (agente_config, bot_config, apariencia…) no se indexan.

create index if not exists idx_acciones_registro_lead_id      on public.acciones_registro (lead_id);
create index if not exists idx_historial_etapas_oportunidad_id on public.historial_etapas (oportunidad_id);
create index if not exists idx_historial_etapas_embudo_id     on public.historial_etapas (embudo_id);
create index if not exists idx_historial_etapas_usuario_id    on public.historial_etapas (usuario_id);
create index if not exists idx_leads_asignado_a               on public.leads (asignado_a);
create index if not exists idx_leads_bot_id                   on public.leads (bot_id);
create index if not exists idx_lead_eventos_usuario_id        on public.lead_eventos (usuario_id);
create index if not exists idx_mensajes_usuario_id            on public.mensajes (usuario_id);
create index if not exists idx_oportunidades_etapa_id         on public.oportunidades (etapa_id);
create index if not exists idx_oportunidades_creado_por       on public.oportunidades (creado_por);
create index if not exists idx_seguimientos_creado_por        on public.seguimientos (creado_por);
create index if not exists idx_pagos_registrado_por           on public.pagos (registrado_por);
create index if not exists idx_pagos_anulado_por              on public.pagos (anulado_por);
create index if not exists idx_cotizaciones_creado_por        on public.cotizaciones (creado_por);
create index if not exists idx_alistamientos_guia_por         on public.alistamientos (guia_por);
create index if not exists idx_alistamientos_doc_por          on public.alistamientos (doc_por);
create index if not exists idx_alistamientos_cancelado_por    on public.alistamientos (cancelado_por);
create index if not exists idx_alistamientos_correccion_video_id on public.alistamientos (correccion_video_id);
create index if not exists idx_leads_borrados_usuario_id      on public.leads_borrados (usuario_id);

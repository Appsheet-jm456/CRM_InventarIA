-- 0041 · Responder como una persona: «escribiendo…», espera antes de responder y pausa entre mensajes (F4·36, docs/AGENTE.md RAG-35 a RAG-38)

alter table public.agente_config
  add column escribiendo       boolean not null default true,
  add column espera_primera_ms integer not null default 1500 check (espera_primera_ms between 0 and 5000),
  add column pausa_mensajes_ms integer not null default 1000 check (pausa_mensajes_ms between 0 and 5000);
comment on column public.agente_config.escribiendo is 'Mostrar «escribiendo…» en WhatsApp antes de cada respuesta del bot (marca el mensaje del cliente como leído).';
comment on column public.agente_config.espera_primera_ms is 'Milisegundos mínimos entre el mensaje del cliente y la primera respuesta del bot.';
comment on column public.agente_config.pausa_mensajes_ms is 'Milisegundos entre los mensajes de una misma respuesta (con «escribiendo…» entre ellos).';
-- agente_config da permisos columna por columna (0031): sin estos la pantalla dice «No se encontró la configuración del agente».
grant select (escribiendo, espera_primera_ms, pausa_mensajes_ms), update (escribiendo, espera_primera_ms, pausa_mensajes_ms)
  on public.agente_config to authenticated;

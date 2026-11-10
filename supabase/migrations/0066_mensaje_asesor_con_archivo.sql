-- 0066 · El asesor envía imágenes, documentos, videos y audios desde el chat (F4·62, docs/MEJORAS-CHAT-Y-PAGOS.md, RB-14 a RB-18).
-- Igual que registrar_mensaje_asesor (RB-01 a RB-03): permiso, conversación suya, y el asesor la toma; además guarda el archivo
-- (bucket privado `media`, el mismo de lo que manda el cliente) para verlo en el chat. Se llama solo después de que Meta lo aceptó.

create or replace function public.registrar_mensaje_asesor_archivo(p_lead bigint, p_texto text, p_wamid text, p_tipo text,
                                                                   p_ruta text, p_mime text, p_nombre text)
returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; nuevo bigint;
begin
  perform exigir_permiso('atender_bandeja');
  if p_tipo not in ('image', 'document', 'video', 'audio') then
    raise exception 'Tipo de archivo no válido: %', p_tipo;
  end if;
  if coalesce(p_ruta, '') !~ ('^' || p_lead || '/') then
    raise exception 'El archivo no es de esta conversación.';
  end if;
  l := lead_a_cargo(p_lead);
  insert into mensajes (lead_id, lado, tipo, texto, meta_id, usuario_id, media_ruta, media_mime, media_nombre)
  values (p_lead, 'asesor', p_tipo, coalesce(p_texto, ''), nullif(p_wamid, ''), auth.uid(), p_ruta, p_mime, coalesce(p_nombre, ''))
  returning id into nuevo;
  update leads set asignado_a = coalesce(l.asignado_a, auth.uid()), estado_chat = 'asignada', pausar_bot = true,
                   en_cola_desde = coalesce(l.en_cola_desde, now()),
                   primera_respuesta_en = coalesce(l.primera_respuesta_en, now()),
                   ultimo_mensaje = left(case when coalesce(p_texto, '') <> '' then p_texto
                                              else case p_tipo when 'image' then '📷 Imagen' when 'video' then '🎥 Video'
                                                               when 'audio' then '🎤 Audio' else '📄 ' || coalesce(nullif(p_nombre, ''), 'Documento') end end, 500),
                   fecha_ultimo_contacto = now()
  where id = p_lead;
  return nuevo;
end $$;

revoke all on function public.registrar_mensaje_asesor_archivo(bigint, text, text, text, text, text, text) from public, anon;
grant execute on function public.registrar_mensaje_asesor_archivo(bigint, text, text, text, text, text, text) to authenticated;
comment on function public.registrar_mensaje_asesor_archivo(bigint, text, text, text, text, text, text) is
  'F4·62 (RB-14 a RB-18): registra un archivo que el asesor envió por WhatsApp (después de que Meta lo aceptó).';

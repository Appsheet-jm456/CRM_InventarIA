-- 0068 · Documento del pedido: no detiene al servicio técnico y se puede subir el PDF o la foto (F4·63, docs/ALISTAMIENTO-Y-VIDEO-TECNICO.md).
--
-- Pedido del dueño (10 nov 2026): el técnico marca «Revisado, listo para despachar» aunque el asesor no haya puesto el OP o la FVE;
-- contabilidad lo hace después y el asesor lo envía al cliente. Antes (0054, RAL-03) el documento era obligatorio para «listo».
-- Además el documento puede llevar su archivo (PDF, JPG o PNG hasta 10 MB, bucket privado `documentos`): al enviarlo, el cliente
-- recibe el archivo con el texto de siempre como pie. Si el pedido ya está cerrado, cambiar el archivo pide `corregir_pedidos` y
-- habilita un envío más (como «Corregir», RPD-31).

CREATE OR REPLACE FUNCTION public.alistamiento_listo(p_id bigint, p_tecnico text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a alistamientos; t text; faltan text;
begin
  perform exigir_permiso('gestionar_alistamiento');
  t := alistamiento_validar_tecnico(p_tecnico);
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no está en Alistamiento.' using errcode = 'P0002';
  end if;
  if a.estado <> 'en_revision' then
    raise exception 'Toma el pedido antes de marcarlo como revisado.';
  end if;
  select string_agg(e ->> 'nombre', ', ') into faltan
    from jsonb_array_elements(a.equipos) e
   where not exists (select 1 from alistamiento_videos v where v.alistamiento_id = p_id and v.equipo_codigo = e ->> 'codigo'
                       and v.estado in ('procesando', 'listo'));
  if faltan is not null then
    raise exception 'Falta el video de: %.', faltan;
  end if;
  if jsonb_array_length(a.equipos) = 0
     and not exists (select 1 from alistamiento_videos v where v.alistamiento_id = p_id and v.estado in ('procesando', 'listo')) then
    raise exception 'Falta el video del pedido.';
  end if;
  update alistamientos set estado = 'listo', listo_en = now(), listo_por = t where id = p_id;
  update leads set etiquetas = array_append(coalesce(etiquetas, '{}'), 'Listo-Para-Despachar')
   where id = a.lead_id and not 'Listo-Para-Despachar' = any(coalesce(etiquetas, '{}'));
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('estado', 'listo', 'tecnico', t),
                      format('Revisado, listo para despachar (%s)', t));
end $function$;

alter table public.alistamientos add column doc_ruta text, add column doc_mime text, add column doc_nombre text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760, '{application/pdf,image/jpeg,image/png}');
create policy documentos_alta on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (select tiene_permiso('gestionar_oportunidades')));
create policy documentos_lectura on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and exists (select 1 from alistamientos a
          where a.id = alistamiento_de_ruta(objects.name) and puede_ver_lead(a.lead_id)));

-- Devuelve la ruta del archivo anterior (la app lo borra) o null.
create or replace function public.alistamiento_documento_archivo(p_id bigint, p_ruta text, p_mime text, p_nombre text) returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a alistamientos; quien text; cerrado boolean;
begin
  perform exigir_permiso('gestionar_oportunidades');
  select * into a from alistamientos where id = p_id for update;
  if not found then
    raise exception 'Ese pedido no existe.' using errcode = 'P0002';
  end if;
  if not puede_ver_lead(a.lead_id) then
    raise exception 'Esta conversación la atiende otro asesor' using errcode = '42501';
  end if;
  if a.cancelado_en is not null then
    raise exception 'El pedido está cancelado: no se le suben documentos.';
  end if;
  if coalesce(p_mime, '') not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'El documento debe ser PDF, JPG o PNG.';
  end if;
  if alistamiento_de_ruta(p_ruta) is distinct from p_id
     or not exists (select 1 from storage.objects o where o.bucket_id = 'documentos' and o.name = p_ruta) then
    raise exception 'El archivo no llegó al servidor: súbelo de nuevo.';
  end if;
  cerrado := alistamiento_cerrado(a);
  if cerrado and not tiene_permiso('corregir_pedidos') then
    raise exception 'El pedido está cerrado: cambiar el documento pide el permiso «Corregir pedidos».';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  update alistamientos set doc_ruta = p_ruta, doc_mime = p_mime, doc_nombre = left(coalesce(nullif(btrim(p_nombre), ''), 'documento'), 120),
                           correccion_documento_en = case when cerrado then now() else correccion_documento_en end
   where id = p_id;
  perform lead_evento(a.lead_id, 'alistamiento', null, jsonb_build_object('doc_archivo', p_nombre),
                      format('📎 Archivo del documento%s: %s (lo subió %s)', case when cerrado then ' corregido' else '' end,
                             coalesce(nullif(btrim(p_nombre), ''), 'documento'), coalesce(quien, 'un asesor')));
  return a.doc_ruta;
end $$;
revoke all on function public.alistamiento_documento_archivo(bigint, text, text, text) from public, anon;
grant execute on function public.alistamiento_documento_archivo(bigint, text, text, text) to authenticated;

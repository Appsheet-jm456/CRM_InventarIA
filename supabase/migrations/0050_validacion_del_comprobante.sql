-- 0050 · El asesor valida el comprobante antes de confirmar el pago (F4·46, decisión 0036)
--
-- Diseño: docs/AGENTE.md §4g (RAG-63 a RAG-70). Al llegar el soporte el bot solo acusa recibo y deja la compra en
-- «pago_por_confirmar» con el chat en la cola. Una persona con validar_pagos pulsa «Comprobante validado» o «No es válido» en la
-- Bandeja: estas funciones lo registran (quién, cuándo, monto o motivo), mueven la oportunidad y dejan la compra marcada para
-- que el receptor (/interno/comprobante) le escriba al cliente y arranque el bot de despacho.

-- --------------------------------------------------------------------------- --
-- Permiso (RAG-67)
-- --------------------------------------------------------------------------- --
insert into public.permisos (codigo, descripcion)
values ('validar_pagos', 'Validar o rechazar el comprobante de pago de una compra (revisa la cuenta bancaria)');
insert into public.rol_permisos (rol_id, permiso)
select r.id, 'validar_pagos' from roles r where r.nombre = 'administrador';

-- --------------------------------------------------------------------------- --
-- Ajustes en Agente → Compra (RAG-70)
-- --------------------------------------------------------------------------- --
alter table public.agente_config
  add column validar_comprobante boolean not null default true,
  add column texto_soporte text not null
    default '📄 Recibimos tu soporte. Un asesor está validando el pago en nuestra cuenta y te confirma por aquí {proxima}. 🙌'
    check (length(texto_soporte) between 1 and 1024),
  add column texto_validado text not null default '✅ Recibimos tu comprobante.'
    check (length(texto_validado) between 1 and 1024),
  add column texto_rechazado text not null
    default '😕 No pudimos validar tu pago: {motivo}. Envíanos de nuevo el comprobante o escribe *asesor*.'
    check (length(texto_rechazado) between 1 and 1024),
  add column motivos_rechazo text[] not null
    default '{No aparece en la cuenta,El monto no coincide,No se lee el comprobante}';
comment on column public.agente_config.validar_comprobante is 'F4·46 (RAG-63): un asesor valida el comprobante antes de confirmar el pago. Apagado: como antes (confirma y sigue al despacho).';
comment on column public.agente_config.texto_soporte is 'Acuse al recibir el soporte; no confirma el pago. Marcas: {proxima}, {horario}, {total}.';
comment on column public.agente_config.texto_validado is 'Al validar el asesor; luego arranca el bot de después del comprobante. Marca: {total}.';
comment on column public.agente_config.texto_rechazado is 'Al rechazar el asesor. Marcas: {motivo}, {total}.';
grant select (validar_comprobante, texto_soporte, texto_validado, texto_rechazado, motivos_rechazo),
      update (validar_comprobante, texto_soporte, texto_validado, texto_rechazado, motivos_rechazo)
  on public.agente_config to authenticated;

-- --------------------------------------------------------------------------- --
-- Etapa de pago validado por embudo: por defecto la que sigue a «Pago por confirmar» (RAG-65)
-- --------------------------------------------------------------------------- --
alter table public.compra_etapas add column pago_validado_id bigint references public.etapas (id) on delete set null;
update public.compra_etapas c set pago_validado_id = (
  select e.id from etapas e where e.embudo_id = c.embudo_id
     and e.orden > (select orden from etapas where id = c.pago_por_confirmar_id)
   order by e.orden limit 1);

-- El historial del cliente admite el tipo «pago».
alter table public.lead_eventos drop constraint lead_eventos_tipo_check;
alter table public.lead_eventos add constraint lead_eventos_tipo_check check (tipo = any (array['etapa', 'oportunidad', 'responsable',
  'nombre', 'valor', 'etiquetas', 'atributo', 'archivado', 'desarchivado', 'eliminado', 'restaurado', 'tarea', 'tarea_cumplida', 'nota',
  'ficha', 'retorno', 'pago']));

-- --------------------------------------------------------------------------- --
-- Mover la oportunidad del cliente a un paso de compra (para las dos funciones de abajo)
-- --------------------------------------------------------------------------- --
create function public.compra_ir_a(p_lead bigint, p_paso text) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare op oportunidades; destino bigint;
begin
  select o.* into op from oportunidades o join embudos e on e.id = o.embudo_id join compra_etapas c on c.embudo_id = o.embudo_id
   where o.lead_id = p_lead and o.estado = 'abierta' order by e.predeterminado, o.creado_en desc limit 1;
  if not found then
    return;
  end if;
  select case p_paso when 'pago_validado' then pago_validado_id else esperando_pago_id end
    into destino from compra_etapas where embudo_id = op.embudo_id;
  if destino is not null and destino <> op.etapa_id then
    update oportunidades set etapa_id = destino where id = op.id;
  end if;
end $$;
revoke execute on function public.compra_ir_a(bigint, text) from public, anon, authenticated;

create function public.compra_quitar_etiquetas(e text[], quitar text[]) returns text[]
language sql immutable
as $$ select coalesce(array_agg(x order by o), '{}') from unnest(coalesce(e, '{}')) with ordinality as t(x, o) where not x = any(quitar) $$;

-- --------------------------------------------------------------------------- --
-- «✅ Comprobante validado» (RAG-65): lo pulsa una persona con validar_pagos
-- --------------------------------------------------------------------------- --
create function public.validar_comprobante(p_lead bigint) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; c jsonb; quien text;
begin
  perform exigir_permiso('validar_pagos');
  l := lead_a_cargo(p_lead);
  c := l.estado_bot -> 'compra';
  if coalesce(c ->> 'paso', '') <> 'pago_por_confirmar' then
    raise exception 'Este cliente no tiene un comprobante por validar.';
  end if;
  if c ->> 'validacion' = 'rechazado' then
    raise exception 'El comprobante ya se marcó como no válido; espera a que el cliente mande otro.';
  end if;
  select nombre into quien from usuarios where id = auth.uid();
  update leads set
    estado_bot = jsonb_set(estado_bot, '{compra}', c || jsonb_build_object('validacion', 'validado', 'validado_por', quien,
                                                                             'validado_en', now())),
    etiquetas = compra_quitar_etiquetas(etiquetas, '{Comprobante-Por-Validar,Comprobante-Rechazado}')
                || case when 'Pago-Validado' = any(coalesce(etiquetas, '{}')) then '{}'::text[] else '{Pago-Validado}' end
  where id = p_lead;
  perform compra_ir_a(p_lead, 'pago_validado');
  perform lead_evento(p_lead, 'pago', null, jsonb_build_object('validacion', 'validado', 'total', c -> 'total'),
                      format('Comprobante validado por %s (total %s)', coalesce(quien, 'un usuario'), coalesce(c ->> 'total', '?')));
  return jsonb_build_object('total', c -> 'total');
end $$;
revoke execute on function public.validar_comprobante(bigint) from public, anon;
grant execute on function public.validar_comprobante(bigint) to authenticated;

-- --------------------------------------------------------------------------- --
-- «❌ No es válido» (RAG-66): motivo obligatorio; al segundo rechazo, Revisar-Posible-Fraude
-- --------------------------------------------------------------------------- --
create function public.rechazar_comprobante(p_lead bigint, p_motivo text) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; c jsonb; quien text; rechazos integer; motivo text := btrim(coalesce(p_motivo, ''));
begin
  perform exigir_permiso('validar_pagos');
  if motivo = '' or length(motivo) > 200 then
    raise exception 'Escribe el motivo (máximo 200 caracteres).';
  end if;
  l := lead_a_cargo(p_lead);
  c := l.estado_bot -> 'compra';
  if coalesce(c ->> 'paso', '') <> 'pago_por_confirmar' then
    raise exception 'Este cliente no tiene un comprobante por validar.';
  end if;
  if c ->> 'validacion' = 'validado' then
    raise exception 'El comprobante ya está validado.';
  end if;
  rechazos := coalesce((c ->> 'rechazos')::integer, 0) + 1;
  select nombre into quien from usuarios where id = auth.uid();
  update leads set
    estado_bot = jsonb_set(estado_bot, '{compra}', c || jsonb_build_object('validacion', 'rechazado', 'motivo', motivo,
                                                                             'rechazos', rechazos, 'rechazado_por', quien)),
    etiquetas = compra_quitar_etiquetas(etiquetas, '{Comprobante-Por-Validar,Comprobante-Rechazado,Revisar-Posible-Fraude}')
                || '{Comprobante-Rechazado}'::text[]
                || case when rechazos >= 2 then '{Revisar-Posible-Fraude}'::text[] else '{}' end
  where id = p_lead;
  perform compra_ir_a(p_lead, 'esperando_pago');  -- lo decide una persona: la oportunidad vuelve a Esperando pago
  perform lead_evento(p_lead, 'pago', null, jsonb_build_object('validacion', 'rechazado', 'motivo', motivo, 'rechazos', rechazos),
                      format('Comprobante rechazado por %s: %s', coalesce(quien, 'un usuario'), motivo));
  return jsonb_build_object('rechazos', rechazos);
end $$;
revoke execute on function public.rechazar_comprobante(bigint, text) from public, anon;
grant execute on function public.rechazar_comprobante(bigint, text) to authenticated;

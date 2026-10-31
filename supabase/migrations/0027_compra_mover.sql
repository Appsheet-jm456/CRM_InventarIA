-- 0027 · El flujo de compra mueve la oportunidad del cliente (F4·25, RAG-20)
--
-- El bot solo movía Cliente Final por el nombre de la etapa (leads.etapa, 0006). La compra pasa también en Distribuidor:
-- esta función toma la oportunidad abierta del cliente (Distribuidor si tiene una, si no Cliente Final, y la abre si no hay)
-- y la lleva al paso de compra que dice compra_etapas, solo hacia adelante (el embudo no retrocede solo).
-- Solo la llama el servidor (receptor). Devuelve el nombre del embudo, o null si no se movió.

create or replace function public.compra_mover(p_lead bigint, p_paso text) returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  op oportunidades;
  emb embudos;
  destino bigint;
  orden_actual integer;
  orden_destino integer;
begin
  if p_paso not in ('esperando_pago', 'pago_por_confirmar', 'cancelada') then
    raise exception 'Paso de compra desconocido: %', p_paso;
  end if;
  -- La oportunidad abierta en un embudo con pasos de compra; primero Distribuidor (el que no es predeterminado).
  select o.* into op from oportunidades o join embudos e on e.id = o.embudo_id join compra_etapas c on c.embudo_id = o.embudo_id
   where o.lead_id = p_lead and o.estado = 'abierta' order by e.predeterminado, o.creado_en desc limit 1;
  if not found then
    select * into emb from embudos where predeterminado;
    if not exists (select 1 from compra_etapas where embudo_id = emb.id) then
      return null;
    end if;
    select * into op from oportunidades where id = abrir_oportunidad_interna(p_lead, emb.id);
  end if;
  select * into emb from embudos where id = op.embudo_id;
  select case p_paso when 'esperando_pago' then esperando_pago_id when 'pago_por_confirmar' then pago_por_confirmar_id
                     else cancelada_id end
    into destino from compra_etapas where embudo_id = op.embudo_id;
  if destino is null then
    return null;
  end if;
  select orden into orden_actual from etapas where id = op.etapa_id;
  select orden into orden_destino from etapas where id = destino;
  -- Cancelar lleva a la etapa elegida aunque sea anterior (la eligió el dueño); los pasos de pago solo avanzan.
  if p_paso <> 'cancelada' and orden_destino <= orden_actual then
    return emb.nombre;
  end if;
  update oportunidades set etapa_id = destino where id = op.id;
  return emb.nombre;
end $$;

revoke execute on function public.compra_mover(bigint, text) from public, anon, authenticated;
grant execute on function public.compra_mover(bigint, text) to service_role;

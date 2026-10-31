-- 0028 · Arreglo de compra_mover (0027): sin oportunidad abierta no movía nada
--
-- La oportunidad nueva se abría dentro del where de la consulta que la buscaba, y esa consulta no ve la fila recién creada.
-- Se abre primero y se lee después. Encontrado por supabase/pruebas/0027_compra_mover.sql.

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
  nueva bigint;
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
    nueva := abrir_oportunidad_interna(p_lead, emb.id);  -- aparte: dentro del where la consulta no ve la fila nueva
    select * into op from oportunidades where id = nueva;
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


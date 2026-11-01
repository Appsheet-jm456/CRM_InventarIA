-- F4·33 (ajuste del dueño, 1 nov 2026): todas las ventas pasan por Alistamiento, que es la revisión del técnico.
-- Al entrar a Alistamiento siempre se crea «Alistar equipo»; la venta online suma Despachar y Enviar guía, la de tienda suma Entregar en tienda.

create or replace function public.oportunidades_tareas_alistamiento() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare l leads; responsable uuid; online boolean;
begin
  if new.etapa_id is not distinct from old.etapa_id
     or not exists (select 1 from etapas where id = new.etapa_id and nombre = 'Alistamiento') then
    return new;
  end if;
  select * into l from leads where id = new.lead_id;
  -- La tarea es del asesor del cliente; si no tiene, de quien movió la oportunidad. Si lo movió el sistema sin asesor, no hay a quién dársela.
  responsable := coalesce(l.asignado_a, (select id from usuarios where id = auth.uid()));
  if responsable is null then return new; end if;
  online := l.atributos -> 'venta_online' = 'true'::jsonb;
  insert into seguimientos (lead_id, asignado_a, que, vence_en, creado_por, tipo)
  select new.lead_id, responsable, t.que, now() + t.plazo, coalesce((select id from usuarios where id = auth.uid()), responsable), t.tipo
    from (values ('Alistar equipo',         'Revisión del técnico y alistamiento del equipo',           interval '4 hours', null::boolean),
                 ('Despachar',              'Entregar el paquete a la transportadora',                  interval '1 day',   true),
                 ('Enviar guía al cliente', 'Enviar al cliente la transportadora y el número de guía',  interval '1 day',   true),
                 ('Entregar en tienda',     'Entregar el equipo al cliente en la tienda',               interval '1 day',   false)) t (tipo, que, plazo, para_online)
   where t.para_online is null or t.para_online = online;
  return new;
end $$;

-- 0051 · Clientes que escriben sin número de teléfono (nombres de usuario de WhatsApp, BSUID)
--
-- Desde 2026 Meta puede entregar un mensaje sin el número del cliente: trae `from_user_id` (por ejemplo «CO.2435241720632393»),
-- el identificador del usuario para este negocio. Se responde con `recipient` en lugar de `to`. El 7 nov 2026 llegaron así
-- mensajes reales y el bot no respondía (el teléfono era null).
--   · leads.telefono acepta también ese identificador cuando no hay número (el cliente se ve en la Bandeja igual).
--   · leads.wa_user_id guarda el identificador de los clientes que sí tienen número, para encontrarlos cuando escriban sin él.

alter table public.leads drop constraint leads_telefono_check;
alter table public.leads add constraint leads_telefono_check
  check (telefono ~ '^[0-9]{8,15}$' or telefono ~ '^[A-Z]{2}\.[A-Za-z0-9]{1,64}$');

alter table public.leads add column wa_user_id text check (wa_user_id ~ '^[A-Z]{2}\.[A-Za-z0-9]{1,64}$');
create unique index leads_wa_user_id_activo on public.leads (wa_user_id) where eliminado_en is null and wa_user_id is not null;
comment on column public.leads.wa_user_id is 'Identificador de WhatsApp del cliente para este negocio (BSUID, user_id de Meta). Sirve cuando escribe sin número.';

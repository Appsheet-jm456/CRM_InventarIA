-- 0030 · Cerebro del agente (F4·27, RAG-10, RAG-11, RAG-17)
--
-- La pantalla Cerebro deja poner cualquier proveedor de IA (también uno local o propio): cada modelo (principal y de respaldo)
-- tiene su dirección, su protocolo (compatible con OpenAI o Anthropic) y sus precios por millón de tokens, que sirven para
-- estimar el costo de cada turno y respetar el tope mensual. La llave sigue en Vault (0024); aquí no se guarda ninguna.

alter table public.agente_config drop constraint agente_config_proveedor_check;
alter table public.agente_config drop constraint agente_config_proveedor_respaldo_check;
alter table public.agente_config drop constraint agente_config_check;

alter table public.agente_config
  add constraint agente_config_proveedor_check
    check (proveedor in ('deepseek', 'openai', 'gemini', 'anthropic', 'local', 'otro')),
  add constraint agente_config_proveedor_respaldo_check
    check (proveedor_respaldo in ('deepseek', 'openai', 'gemini', 'anthropic', 'local', 'otro')),
  add column url_base                    text not null default 'https://api.deepseek.com'
    check (url_base ~ '^https?://[^\s]+$'),
  add column protocolo                   text not null default 'openai' check (protocolo in ('openai', 'anthropic')),
  add column precio_entrada_usd          numeric(10,4) not null default 0.28 check (precio_entrada_usd >= 0),   -- por millón de tokens
  add column precio_salida_usd           numeric(10,4) not null default 0.42 check (precio_salida_usd >= 0),
  add column url_base_respaldo           text check (url_base_respaldo ~ '^https?://[^\s]+$'),
  add column protocolo_respaldo          text check (protocolo_respaldo in ('openai', 'anthropic')),
  add column precio_entrada_usd_respaldo numeric(10,4) check (precio_entrada_usd_respaldo >= 0),
  add column precio_salida_usd_respaldo  numeric(10,4) check (precio_salida_usd_respaldo >= 0),
  add column tokens_max                  integer not null default 600 check (tokens_max between 100 and 4000),
  add column espera_segundos             integer not null default 20 check (espera_segundos between 5 and 60);   -- RAG-10

-- Si hay respaldo, trae todo lo que necesita para llamarlo.
alter table public.agente_config add constraint agente_config_respaldo_completo
  check (proveedor_respaldo is null
         or (modelo_respaldo is not null and btrim(modelo_respaldo) <> '' and url_base_respaldo is not null and protocolo_respaldo is not null));

-- No se enciende para clientes reales sin cerebro listo: llave (salvo modelo local) y presupuesto (salvo modelo local, que no cuesta).
alter table public.agente_config add constraint agente_config_listo_para_clientes
  check (estado in ('apagado', 'simulador')
         or (proveedor = 'local' or (llave_id is not null and presupuesto_usd > 0)));

-- Gasto y tope del mes en una sola lectura, para la pantalla y para el receptor (RAG-17).
create or replace function public.agente_tope() returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'gasto', g.gasto,
    'presupuesto', c.presupuesto_usd,
    'porcentaje', case when c.presupuesto_usd > 0 then round(g.gasto / c.presupuesto_usd * 100, 1) else null end,
    'agotado', c.proveedor <> 'local' and g.gasto >= c.presupuesto_usd,
    'turnos_mes', g.turnos)
  from agente_config c,
       lateral (select agente_gasto_mes() as gasto,
                       (select count(*) from agente_turnos
                         where resultado <> 'simulador'
                           and en >= date_trunc('month', now() at time zone 'America/Bogota') at time zone 'America/Bogota') as turnos) g
  where c.id = 1
$$;
revoke execute on function public.agente_tope() from public, anon;
grant execute on function public.agente_tope() to authenticated, service_role;

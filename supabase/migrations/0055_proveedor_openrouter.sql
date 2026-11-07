-- 0055 · OpenRouter como proveedor del Cerebro (F4·31, capacidad)
--
-- Con una sola llave de OpenRouter se usan DeepSeek de principal y otro modelo barato de otra empresa de respaldo, los dos en la
-- nube y en paralelo. El modelo local (una respuesta a la vez) queda para cuando haya un equipo con mejor tarjeta de video.
-- La llave sigue en Vault (0024): se pega en Configuración → Agente → Cerebro, en el principal y en el respaldo.

alter table public.agente_config drop constraint agente_config_proveedor_check;
alter table public.agente_config drop constraint agente_config_proveedor_respaldo_check;

alter table public.agente_config
  add constraint agente_config_proveedor_check
    check (proveedor in ('deepseek', 'openrouter', 'openai', 'gemini', 'anthropic', 'local', 'otro')),
  add constraint agente_config_proveedor_respaldo_check
    check (proveedor_respaldo in ('deepseek', 'openrouter', 'openai', 'gemini', 'anthropic', 'local', 'otro'));

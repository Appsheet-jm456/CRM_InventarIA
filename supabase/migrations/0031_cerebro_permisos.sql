-- 0031 · Arreglo de 0030: permisos de las columnas nuevas del cerebro
--
-- agente_config da permisos columna por columna (0024) para esconder los ids de las llaves. Las columnas que agregó la 0030 quedaron
-- sin permiso y las pantallas Cerebro y Avi decían «No se encontró la configuración del agente». Además, la pantalla necesita saber si
-- hay llave guardada sin poder leer su id: lo dice agente_llaves_estado().

grant select (url_base, protocolo, precio_entrada_usd, precio_salida_usd, url_base_respaldo, protocolo_respaldo,
              precio_entrada_usd_respaldo, precio_salida_usd_respaldo, tokens_max, espera_segundos)
  on public.agente_config to authenticated;
grant update (url_base, protocolo, precio_entrada_usd, precio_salida_usd, url_base_respaldo, protocolo_respaldo,
              precio_entrada_usd_respaldo, precio_salida_usd_respaldo, tokens_max, espera_segundos)
  on public.agente_config to authenticated;

-- Si hay llave principal y de respaldo guardadas (sin mostrarlas ni dar su id).
create or replace function public.agente_llaves_estado() returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare c agente_config;
begin
  perform exigir_permiso('administrar_agente');
  select * into c from agente_config where id = 1;
  return jsonb_build_object('principal', c.llave_id is not null, 'respaldo', c.llave_respaldo_id is not null);
end $$;
revoke execute on function public.agente_llaves_estado() from public, anon;
grant execute on function public.agente_llaves_estado() to authenticated;

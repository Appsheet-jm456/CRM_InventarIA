-- 0052 · F4·47 Cierre de la compra: el cuadro Asesor puede enviar solo el texto de la opción (RF-43)
--
-- El cuadro 🔒 Asesor siempre mandaba su aviso de horario («¡Entendido! Ahora estamos fuera de horario…»). En «Datos de despacho» el
-- cierre debe ser la política de despacho de cada camino (envío o tienda). Con `ajustes.solo_motivo = true`, cuando la flecha trae un
-- texto de cierre (`efectos.motivo` de la opción) el cliente recibe solo ese texto, tal cual; sin texto de cierre, el aviso de siempre.
-- Apagado por defecto: ningún otro bot cambia. Se guarda con borrador_guardar_ajustes, que ahora acepta también el cuadro Asesor.

create or replace function public.borrador_guardar_ajustes(p_clave text, p_nombre text, p_ajustes jsonb, p_bot bigint default null)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare c bot_cuadros; f bot_flujos; destino bigint;
begin
  perform exigir_permiso('administrar_bot');
  f := borrador_del_flujo(bot_editable(p_bot));
  c := cuadro_del_borrador(p_clave, f.bot_id);
  if c.tipo = 'asesor' then
    if jsonb_typeof(p_ajustes->'solo_motivo') is distinct from 'boolean' then
      raise exception 'solo_motivo debe ser verdadero o falso.';
    end if;
    update bot_cuadros set ajustes = jsonb_build_object('solo_motivo', (p_ajustes->>'solo_motivo')::boolean),
                           actualizado_por = auth.uid()
    where id = c.id;
    return;
  end if;
  if c.tipo <> 'ir_bot' then
    raise exception 'Este cuadro no tiene ajustes que guardar aquí.';
  end if;
  destino := nullif(p_ajustes->>'bot_id', '')::bigint;
  if destino is not null and not exists (select 1 from bots where id = destino) then
    raise exception 'Ese bot no existe.';
  end if;
  if destino = f.bot_id then
    raise exception 'Un bot no se lleva a sí mismo: para volver a su inicio, une la flecha al saludo.';
  end if;
  update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre),
                         ajustes = jsonb_build_object('bot_id', destino), actualizado_por = auth.uid()
  where id = c.id;
end $$;

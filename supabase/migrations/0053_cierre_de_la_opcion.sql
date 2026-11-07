-- 0053 · F4·47 Texto de cierre de una opción editable desde el lienzo (RF-43)
--
-- La 0052 dejó que el cuadro Asesor envíe solo el texto de cierre de la flecha (`efectos.motivo`), pero ese texto solo se podía
-- escribir por SQL. Ahora borrador_guardar_cuadro acepta `cierre` en cada opción de un Mensaje: texto (hasta 1.000 caracteres) que
-- queda en `efectos.motivo`; vacío lo quita; si la opción no lo trae, se conserva el que tenía. Igual que antes en todo lo demás.

CREATE OR REPLACE FUNCTION public.borrador_guardar_cuadro(p_clave text, p_nombre text, p_texto text, p_opciones jsonb, p_bot bigint DEFAULT NULL::bigint, p_salidas jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c bot_cuadros; f bot_flujos; op jsonb; nuevas jsonb := '[]'; ids text[] := '{}'; previa jsonb; respuesta jsonb;
        extra jsonb := '{}'; s text; v jsonb; espera int; efectos jsonb; k text; d lead_atributos; cierre text;
begin
  perform exigir_permiso('administrar_bot');
  f := borrador_del_flujo(bot_editable(p_bot));
  c := cuadro_del_borrador(p_clave, f.bot_id);
  if c.tipo = 'ir_bot' then
    raise exception 'Este cuadro se guarda con su bot de destino (borrador_guardar_ajustes).';
  end if;
  if c.tipo = 'condicion' then
    raise exception 'Este cuadro se guarda con sus condiciones (borrador_guardar_condiciones).';
  end if;
  if c.tipo = 'catalogo' then
    raise exception 'Este cuadro se guarda con su catálogo (borrador_guardar_catalogo).';
  end if;
  if c.tipo = 'pausa' then
    raise exception 'Este cuadro se guarda con su tiempo (borrador_guardar_pausa).';
  end if;
  if c.tipo = 'pregunta' then
    raise exception 'Este cuadro se guarda con su dato (borrador_guardar_pregunta).';
  end if;
  if c.tipo = 'agente' then
    raise exception 'Este cuadro se guarda con su instrucción (borrador_guardar_agente).';
  end if;
  if c.tipo <> 'mensaje' then
    if p_opciones is not null and ((select array_agg(o->>'id' order by o->>'id') from jsonb_array_elements(p_opciones) o)
        is distinct from (select array_agg(o->>'id' order by o->>'id') from jsonb_array_elements(c.opciones) o)) then
      raise exception 'Los cuadros del sistema no cambian sus opciones: solo sus textos y títulos (RF-03).';
    end if;
    update bot_cuadros set
      texto = coalesce(p_texto, texto),
      opciones = case when p_opciones is null then opciones else
        (select jsonb_agg(o || jsonb_build_object('titulo', btrim(t->>'titulo')) order by n)
         from jsonb_array_elements(c.opciones) with ordinality as x(o, n)
         join jsonb_array_elements(p_opciones) t on t->>'id' = o->>'id') end,
      actualizado_por = auth.uid()
    where id = c.id;
    return;
  end if;

  p_opciones := coalesce(p_opciones, c.opciones, '[]');
  if jsonb_typeof(p_opciones) <> 'array' then
    raise exception 'Las opciones deben ser una lista.';
  end if;
  if jsonb_array_length(p_opciones) > 10 then
    raise exception 'WhatsApp permite hasta 10 opciones en una lista.';
  end if;
  for op in select * from jsonb_array_elements(p_opciones) loop
    if coalesce(op->>'id', '') !~ '^\d{1,2}$' or op->>'id' = any (ids) then
      raise exception 'Cada opción necesita un número distinto (0 a 99).';
    end if;
    if op->>'id' = '9' then
      raise exception 'El 9 está reservado: en cualquier punto pasa al cliente con un asesor.';
    end if;
    ids := ids || (op->>'id');
    if op->>'destino' is not null and not destino_valido(f.id, op->>'destino') then
      raise exception 'La opción "%" lleva a un cuadro que no existe o al que no se puede ir directo.', op->>'titulo';
    end if;
    select o into previa from jsonb_array_elements(c.opciones) o where o->>'id' = op->>'id';
    efectos := coalesce(previa->'efectos', '{}');
    if op ? 'marcar' then
      if jsonb_typeof(op->'marcar') <> 'object' then
        raise exception 'Los datos que marca una opción van como objeto.';
      end if;
      for k in select jsonb_object_keys(op->'marcar') loop
        select * into d from lead_atributos where clave = k and archivado_en is null;
        if not found or d.tipo not in ('si_no', 'lista') then
          raise exception 'La opción "%" marca un dato que no existe o no es sí/no ni lista.', op->>'titulo';
        end if;
        if lead_atributo_error(d, op->'marcar'->k) is not null then
          raise exception 'La opción "%" marca «%» con un valor que no vale: %.', op->>'titulo', d.nombre, lead_atributo_error(d, op->'marcar'->k);
        end if;
      end loop;
      efectos := case when op->'marcar' = '{}' then efectos - 'atributos' else efectos || jsonb_build_object('atributos', op->'marcar') end;
    end if;
    -- F4·47 (RF-43): texto de cierre que la opción lleva al cuadro Asesor; vacío lo quita.
    if op ? 'cierre' then
      if jsonb_typeof(op->'cierre') not in ('string', 'null') then
        raise exception 'El texto de cierre de una opción va como texto.';
      end if;
      cierre := btrim(coalesce(op->>'cierre', ''));
      if char_length(cierre) > 1000 then
        raise exception 'El texto de cierre de la opción "%" pasa de 1.000 caracteres.', op->>'titulo';
      end if;
      efectos := case when cierre = '' then efectos - 'motivo' else efectos || jsonb_build_object('motivo', cierre) end;
    end if;
    nuevas := nuevas || jsonb_strip_nulls(
      coalesce(previa, '{}') - 'titulo' - 'destino' - 'efectos'
      || jsonb_build_object('id', op->>'id', 'titulo', btrim(coalesce(op->>'titulo', '')), 'destino', op->'destino',
                            'efectos', case when efectos = '{}' then null else efectos end));
  end loop;

  -- Salidas opcionales (RF-20 a RF-22): las que manda la pantalla, o las que ya tenía; null las suelta.
  foreach s in array salidas_opcionales('mensaje', nuevas) loop
    v := case when p_salidas ? s then p_salidas->s else coalesce(c.salidas->s, 'null') end;
    if jsonb_typeof(v) = 'string' then
      if not destino_valido(f.id, v #>> '{}') then
        raise exception '«%» lleva a un cuadro que no existe o al que no se puede ir directo.', rotulo_salida(s);
      end if;
      if s = 'sin_respuesta' and v #>> '{}' = c.clave then
        raise exception '«Sin respuesta» no puede volver al mismo mensaje: se repetiría sin fin.';
      end if;
    end if;
    if jsonb_typeof(v) = 'string' then  -- solo las conectadas: un mensaje sin ellas queda igual que antes
      extra := extra || jsonb_build_object(s, v);
    end if;
  end loop;
  espera := coalesce((p_salidas->>'espera_segundos')::int, (c.ajustes->>'espera_segundos')::int, 900);
  if espera not between 1 and 86399 then
    raise exception 'La espera de «Sin respuesta» va de 1 segundo a 23 h 59 min 59 s (ventana de 24 h de Meta).';
  end if;

  if jsonb_array_length(nuevas) = 0 then
    respuesta := case when p_salidas ? 'respuesta' then p_salidas->'respuesta' else coalesce(c.salidas->'respuesta', 'null') end;
    if jsonb_typeof(respuesta) = 'string' and not destino_valido(f.id, respuesta #>> '{}') then
      raise exception '"Cuando el cliente responda" lleva a un cuadro que no existe o al que no se puede ir directo.';
    end if;
    update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre), texto = coalesce(p_texto, texto),
                           opciones = '[]', formato = 'texto', salidas = jsonb_build_object('respuesta', respuesta) || extra,
                           ajustes = coalesce(ajustes, '{}') || jsonb_build_object('espera_segundos', espera), actualizado_por = auth.uid()
    where id = c.id;
  else
    update bot_cuadros set nombre = coalesce(nullif(btrim(p_nombre), ''), nombre), texto = coalesce(p_texto, texto),
                           opciones = nuevas, formato = 'menu', salidas = extra,
                           ajustes = coalesce(ajustes, '{}') || jsonb_build_object('espera_segundos', espera), actualizado_por = auth.uid()
    where id = c.id;
  end if;
end $function$;

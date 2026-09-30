-- 0010 · Bot: formato de cada mensaje, límites de WhatsApp y marcas válidas (F4·4)
--
-- Diseño: docs/FLUJO-DEL-BOT.md. El bot recortaba sin avisar un mensaje con botones de más de 1.024 caracteres;
-- ahora la base no deja guardarlo, igual que una marca {x} que el bot no reemplaza (quedaría tal cual al cliente).

-- --------------------------------------------------------------------------- --
-- Cómo sale cada nodo (lo mismo que hace flujo.py)
-- --------------------------------------------------------------------------- --
alter table public.bot_nodos
  add column formato text not null default 'texto' check (formato in ('menu', 'texto', 'ficha', 'motivo')),
  add column opciones_codigo jsonb;
comment on column public.bot_nodos.formato is
  'menu: texto + opciones numeradas, con botones (hasta 3 de ≤ 20) o lista · texto: mensaje simple · '
  'ficha: el texto sale del inventario, solo se editan los botones · motivo: frase que va dentro del aviso de asesor.';
comment on column public.bot_nodos.opciones_codigo is
  'Opciones que pone el código y no se editan (rangos de presupuesto, marcas de ejemplo). Solo para vista previa y largo.';

update public.bot_nodos set formato = 'menu' where clave in ('B00', 'B001A', 'B001A1', 'B001A2', 'B001A3', 'B001A4');
update public.bot_nodos set formato = 'ficha' where clave = 'R11';
update public.bot_nodos set formato = 'motivo' where clave = 'ERROR-3';
-- Igual a RANGOS de flujo.py (título y descripción de la lista).
update public.bot_nodos set opciones_codigo =
  '[{"id":"1","titulo":"< $1 M","descripcion":"Menos de $1.000.000"},{"id":"2","titulo":"$1 M – $1,5 M","descripcion":"$1.000.000 – $1.500.000"},{"id":"3","titulo":"$1,5 M – $2 M","descripcion":"$1.500.000 – $2.000.000"},{"id":"4","titulo":"> $2 M","descripcion":"Más de $2.000.000"}]'
where clave = 'B001A2';
-- Salen de las marcas con stock; el ejemplo es el caso actual (una marca + "Todas").
update public.bot_nodos set opciones_codigo =
  '[{"id":"1","titulo":"Dell"},{"id":"2","titulo":"Todas las marcas"}]'
where clave = 'B001A4';

-- --------------------------------------------------------------------------- --
-- Largo del mensaje tal como sale (RF-01)
-- --------------------------------------------------------------------------- --
-- Cada marca cuenta con su valor más largo posible: el aviso de asesor y el horario varían.
create or replace function public.bot_largo_marca(p_marca text) returns integer
language sql immutable as $$
  select case p_marca when 'uso' then 9 when 'motivo' then 204 when 'horario' then 400 when 'proxima' then 40 else 0 end
$$;

-- {largo, limite, forma}: forma botones (≤ 3 opciones de ≤ 20) o lista; texto y motivo sin opciones.
create or replace function public.bot_medir(p_texto text, p_formato text, p_opciones jsonb, p_marcas text[])
returns jsonb
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  largo integer := length(p_texto);
  m text;
  ops jsonb := coalesce(p_opciones, '[]');
  botones boolean;
begin
  foreach m in array p_marcas loop
    largo := largo + (length(p_texto) - length(replace(p_texto, '{' || m || '}', ''))) / (length(m) + 2)
                     * (bot_largo_marca(m) - length(m) - 2);
  end loop;
  if p_formato = 'motivo' then
    return jsonb_build_object('largo', largo, 'limite', 200, 'forma', 'texto');
  end if;
  if p_formato <> 'menu' then
    return jsonb_build_object('largo', largo, 'limite', 4096, 'forma', 'texto');
  end if;
  -- flujo.menu: "texto\n\n1️⃣ Título\n2️⃣ Título…"
  largo := largo + 2 + coalesce((select sum(length(o->>'id') + 3 + length(o->>'titulo')) + count(*) - 1
                                 from jsonb_array_elements(ops) o), 0);
  botones := jsonb_array_length(ops) <= 3
             and not exists (select 1 from jsonb_array_elements(ops) o where length(o->>'titulo') > 20);
  return jsonb_build_object('largo', largo, 'limite', case when botones then 1024 else 4096 end,
                            'forma', case when botones then 'botones' else 'lista' end);
end $$;

-- --------------------------------------------------------------------------- --
-- Validación al guardar (se suma a bot_nodos_validar de la 0007)
-- --------------------------------------------------------------------------- --
create or replace function public.bot_nodos_limites() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  desconocida text;
  medida jsonb;
begin
  if new.formato = 'ficha' and new.texto is distinct from old.texto then
    raise exception 'El texto de la ficha sale del inventario; aquí solo se editan los botones.';
  end if;
  if new.formato is distinct from old.formato or new.opciones_codigo is distinct from old.opciones_codigo
     or new.marcas is distinct from old.marcas then
    raise exception 'El formato, las opciones del código y las marcas de un mensaje no se cambian desde la app.';
  end if;
  select string_agg(distinct '{' || x[1] || '}', ', ') into desconocida
  from regexp_matches(new.texto, '\{([^{}]*)\}', 'g') as x
  where not (x[1] = any (new.marcas));
  if desconocida is not null then
    raise exception 'El bot no reemplaza %: el cliente lo vería tal cual. %', desconocida,
      case when cardinality(new.marcas) = 0 then 'Este mensaje no usa marcas.'
           else 'Marcas de este mensaje: ' || (select string_agg('{' || m || '}', ', ') from unnest(new.marcas) m) || '.' end;
  end if;
  medida := bot_medir(new.texto, new.formato, coalesce(new.opciones, new.opciones_codigo), new.marcas);
  if (medida->>'largo')::int > (medida->>'limite')::int then
    raise exception 'El mensaje queda de % caracteres y WhatsApp permite % %: acórtalo.',
      medida->>'largo', medida->>'limite',
      case medida->>'forma' when 'botones' then 'con botones' when 'lista' then 'con lista' else '' end;
  end if;
  return new;
end $$;

create trigger bot_nodos_limites before update on public.bot_nodos
  for each row execute function public.bot_nodos_limites();

revoke execute on function public.bot_nodos_limites() from public, anon, authenticated;
revoke execute on function public.bot_medir(text, text, jsonb, text[]), public.bot_largo_marca(text) from public, anon;
grant execute on function public.bot_medir(text, text, jsonb, text[]), public.bot_largo_marca(text) to authenticated;

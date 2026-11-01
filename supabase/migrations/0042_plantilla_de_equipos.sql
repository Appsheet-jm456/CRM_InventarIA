-- 0042 · Lista de equipos con plantilla (F4·37, docs/AGENTE.md RAG-39 a RAG-42): Avi elige los códigos y el sistema arma cada equipo
-- con esta plantilla y los datos de productos. Un renglón por atributo; las marcas {dato} las reemplaza el receptor.

alter table public.agente_config
  add column plantilla_equipo  text not null default
    E'💻 *{equipo}* · Código {codigo}\n⚙️ {procesador} · {ram} · {disco}\n⭐ {estado}\n💰 *{precio}*'
    check (btrim(plantilla_equipo) <> '' and length(plantilla_equipo) <= 1000),
  add column max_equipos       integer not null default 3 check (max_equipos between 1 and 5),
  add column equipos_separados boolean not null default false;
comment on column public.agente_config.plantilla_equipo is 'Cómo se muestra cada equipo que recomienda Avi (F4·37). Datos: {equipo} {codigo} {marca} {modelo} {procesador} {generacion} {ram} {disco} {estado} {precio} {stock} {categoria} {descripcion}.';
comment on column public.agente_config.equipos_separados is 'true: un mensaje por equipo; false: todos en un mensaje.';
-- agente_config da permisos columna por columna (0031).
grant select (plantilla_equipo, max_equipos, equipos_separados), update (plantilla_equipo, max_equipos, equipos_separados)
  on public.agente_config to authenticated;

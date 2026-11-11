#!/usr/bin/env bash
# Ajusta la memoria de Postgres del CRM al servidor (31 GB de RAM compartidos con Misión Bezer,
# Nextcloud y el modelo local). Los valores quedan en postgresql.auto.conf (dentro de volumes/db/data),
# así que sobreviven a reinicios. shared_buffers solo se aplica al reiniciar el contenedor de la base.
#
#   supabase/ajustar-postgres.sh             # escribe los valores y recarga (sin cortar el servicio)
#   supabase/ajustar-postgres.sh --reiniciar # además reinicia la base (~15 s sin base; el receptor espera)
#   supabase/ajustar-postgres.sh --deshacer  # vuelve a los valores de fábrica de Supabase
#
# Después de restaurar un respaldo en otro servidor, volver a correr este script.
set -euo pipefail
CONTENEDOR=${CONTENEDOR:-crminventaria-supabase-db}
sql() { docker exec -i "$CONTENEDOR" psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 -c "$1"; }

if [[ ${1:-} == --deshacer ]]; then
  for p in shared_buffers effective_cache_size work_mem maintenance_work_mem random_page_cost effective_io_concurrency; do
    sql "alter system reset $p"
  done
else
  sql "alter system set shared_buffers = '2GB'"            # caché propia de Postgres (antes 128 MB)
  sql "alter system set effective_cache_size = '8GB'"     # cuánto puede cachear el sistema operativo (antes 128 MB)
  sql "alter system set work_mem = '16MB'"                # ordenamientos por consulta (antes 4 MB)
  sql "alter system set maintenance_work_mem = '256MB'"   # índices y vacuum (antes 64 MB)
  sql "alter system set random_page_cost = 1.1"           # disco SSD (antes 4, pensado para disco mecánico)
  sql "alter system set effective_io_concurrency = 200"   # SSD
fi
sql "select pg_reload_conf()" >/dev/null

if [[ ${1:-} == --reiniciar ]]; then
  docker restart "$CONTENEDOR" >/dev/null
  until docker exec "$CONTENEDOR" pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 1; done
fi
docker exec "$CONTENEDOR" psql -U postgres -At -c "select name || ' = ' || current_setting(name) || case when pending_restart then '  (falta reiniciar)' else '' end from pg_settings where name in ('shared_buffers','effective_cache_size','work_mem','maintenance_work_mem','random_page_cost','effective_io_concurrency') order by name"

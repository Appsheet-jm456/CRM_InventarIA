#!/usr/bin/env bash
# Aplica en orden las migraciones de supabase/migrations/ que falten, cada una en su
# transacción. Las registra en supabase_migrations.schema_migrations (la que lee Studio).
#
#   supabase/migrar.sh           # aplica las pendientes
#   supabase/migrar.sh --probar  # además corre supabase/pruebas/ (todo con ROLLBACK)
set -euo pipefail
cd "$(dirname "$0")"

CONTENEDOR=${CONTENEDOR:-crminventaria-supabase-db}
sql() {
  docker exec -i -e PGOPTIONS='-c client_min_messages=warning' "$CONTENEDOR" \
    psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"
}

sql -c "create schema if not exists supabase_migrations;
        create table if not exists supabase_migrations.schema_migrations
          (version text primary key, statements text[], name text);"

for archivo in migrations/*.sql; do
  base=$(basename "$archivo" .sql)
  version=${base%%_*}
  nombre=${base#*_}
  if [[ $(sql -Atc "select 1 from supabase_migrations.schema_migrations where version = '$version'") == 1 ]]; then
    continue
  fi
  echo "→ $base"
  { cat "$archivo"
    echo
    echo "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$nombre');"
  } | sql --single-transaction
done
echo "✅ Esquema al día"

if [[ ${1:-} == --probar ]]; then
  fallos=0
  for prueba in pruebas/*.sql; do
    echo "→ $(basename "$prueba")"
    salida=$(sql -At < "$prueba" 2>&1) || true
    echo "$salida" | grep -E '^(not )?ok|^#' || true
    if echo "$salida" | grep -qE '^not ok|ERROR|Looks like'; then
      fallos=1
      echo "$salida" | grep -E 'ERROR|Looks like' || true
    fi
  done
  [[ $fallos == 0 ]] && echo "✅ Pruebas en verde" || { echo "✗ Hay pruebas en rojo"; exit 1; }
fi

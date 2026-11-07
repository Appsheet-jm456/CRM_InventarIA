#!/usr/bin/env bash
# F5·2: copia diaria del CRM InventarIA en el disco de respaldos (/mnt/respaldos, F5·4). Plan: docs/RESPALDOS.md.
#
#   /mnt/respaldos/crm/AAAA-MM-DD/
#     base.dump           pg_dump -Fc de la base del CRM (incluye las cuentas de acceso de auth)
#     supabase-interna.dump  pg_dump -Fc de _supabase
#     globales.sql        roles y permisos (pg_dumpall --globals-only)
#     storage.tar.gz      archivos de Supabase Storage
#     config.tar.gz       .env del CRM y de Supabase (VAULT_ENC_KEY), ~/.cloudflared y las unidades systemd. Solo lo lee atlasjm.
#     SHA256SUMS, LISTO   sumas de verificación; LISTO solo existe si todo salió bien
#
# Lo corre el timer de systemd crm-respaldo.timer (03:30, y al encender si se perdió la hora: Persistent=true).
# Uso a mano: bash herramientas/respaldos/respaldo-diario.sh [--si-falta]
set -euo pipefail
umask 077

RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
DISCO=/mnt/respaldos
DESTINO=$DISCO/crm
DB=crminventaria-supabase-db
DIARIAS=14     # se guardan las últimas 14 copias
SEMANALES=8    # y las de los domingos de las últimas 8 semanas
HOY=$(date +%F)
CARPETA=$DESTINO/$HOY
log() { echo "$(date '+%F %T') $*"; }

# Sin el disco montado no se escribe nada: la copia caería en el mismo disco del sistema.
mountpoint -q "$DISCO" || { log "✗ $DISCO no está montado: no hay copia"; exit 1; }
if [ "${1:-}" = "--si-falta" ] && [ -f "$CARPETA/LISTO" ]; then exit 0; fi

# Al encender, la base tarda en subir: se espera hasta 5 minutos.
for i in $(seq 1 60); do
  docker exec "$DB" pg_isready -U postgres -q 2>/dev/null && break
  [ "$i" = 60 ] && { log "✗ la base no respondió en 5 minutos"; exit 1; }
  sleep 5
done

TMP="$DESTINO/.$HOY.en-curso"
rm -rf "$TMP"; mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

docker exec "$DB" pg_dump -U supabase_admin -Fc postgres > "$TMP/base.dump"
docker exec "$DB" pg_dump -U supabase_admin -Fc _supabase > "$TMP/supabase-interna.dump"
docker exec "$DB" pg_dumpall -U supabase_admin --globals-only > "$TMP/globales.sql"
# Una copia que no se puede leer no sirve: se comprueba que pg_restore entienda el archivo.
docker exec -i "$DB" pg_restore --list < "$TMP/base.dump" > /dev/null

tar -czf "$TMP/storage.tar.gz" -C "$RAIZ/supabase/volumes" storage

CONFIG=()
for f in crm/.env.local .env.local .env.meta .env.notion supabase/.env; do
  [ -f "$RAIZ/$f" ] && CONFIG+=("$RAIZ/$f")
done
[ -d "$HOME/.cloudflared" ] && CONFIG+=("$HOME/.cloudflared")
CONFIG+=("$HOME"/.config/systemd/user/crm-*)
tar -czf "$TMP/config.tar.gz" --absolute-names "${CONFIG[@]}" 2>/dev/null

(cd "$TMP" && sha256sum ./*.dump ./*.sql ./*.tar.gz > SHA256SUMS)
date -Iseconds > "$TMP/LISTO"
rm -rf "$CARPETA"; mv "$TMP" "$CARPETA"; trap - EXIT

# Limpieza: quedan las últimas $DIARIAS y los domingos de las últimas $SEMANALES semanas.
mapfile -t TODAS < <(ls -1 "$DESTINO" | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort -r)
LIMITE_SEM=$(date -d "$HOY -$((SEMANALES * 7)) days" +%F)
for idx in "${!TODAS[@]}"; do
  d=${TODAS[$idx]}
  [ "$idx" -lt "$DIARIAS" ] && continue
  [ "$(date -d "$d" +%u)" = 7 ] && [[ "$d" > "$LIMITE_SEM" ]] && continue
  rm -rf "${DESTINO:?}/$d"
done

USO=$(df --output=pcent "$DISCO" | tail -1 | tr -dc 0-9)
log "✓ copia en $CARPETA ($(du -sh "$CARPETA" | cut -f1)) · disco al $USO %"
[ "$USO" -ge 80 ] && log "⚠ el disco de respaldos pasa del 80 %"
exit 0

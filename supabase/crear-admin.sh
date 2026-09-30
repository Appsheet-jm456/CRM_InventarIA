#!/usr/bin/env bash
# Crea el primer administrador: su cuenta en Supabase Auth y su perfil con el rol administrador.
# Los demás usuarios se crean desde la app (Configuración → Usuarios).
#
#   supabase/crear-admin.sh <usuario> "<Nombre completo>"
#
# Pide la contraseña sin mostrarla. No corre si ya hay un administrador activo.
set -euo pipefail
cd "$(dirname "$0")"

usuario=${1:-}
nombre=${2:-}
if [[ -z $usuario || -z $nombre ]]; then
  echo 'Uso: supabase/crear-admin.sh <usuario> "<Nombre completo>"' >&2
  exit 1
fi
usuario=${usuario,,}
if [[ ! $usuario =~ ^[a-z0-9._-]{3,30}$ ]]; then
  echo "✗ El usuario lleva de 3 a 30 letras minúsculas, números, punto, guion o guion bajo." >&2
  exit 1
fi

CONTENEDOR=${CONTENEDOR:-crminventaria-supabase-db}
sql() { docker exec -i "$CONTENEDOR" psql -U postgres -d postgres -X -q -At -v ON_ERROR_STOP=1 "$@"; }

hay=$(sql -c "select count(*) from usuarios u join rol_permisos rp on rp.rol_id = u.rol_id
              where u.activo and rp.permiso = 'administrar_usuarios'" </dev/null)
if [[ $hay != 0 ]]; then
  echo "✗ Ya hay un administrador. Los demás usuarios se crean desde la app: Configuración → Usuarios." >&2
  exit 1
fi

read -rsp "Contraseña (mínimo 8): " clave; echo
read -rsp "Repítela: " otra; echo
if [[ $clave != "$otra" ]]; then echo "✗ No coinciden." >&2; exit 1; fi
if (( ${#clave} < 8 )); then echo "✗ Mínimo 8 caracteres." >&2; exit 1; fi

leer() { grep "^$1=" .env | cut -d= -f2-; }
url=$(leer SUPABASE_PUBLIC_URL)
llave=$(leer SERVICE_ROLE_KEY)

# La contraseña viaja por variable de entorno y stdin, nunca como argumento visible en ps.
cuerpo=$(USUARIO="$usuario" CLAVE="$clave" python3 -c '
import json, os
print(json.dumps({"email": os.environ["USUARIO"] + "@inventaria.local",
                  "password": os.environ["CLAVE"], "email_confirm": True}))')
respuesta=$(printf '%s' "$cuerpo" | curl -sS -X POST "$url/auth/v1/admin/users" \
  -H "apikey: $llave" -H "Authorization: Bearer $llave" -H 'Content-Type: application/json' --data-binary @-)
id=$(printf '%s' "$respuesta" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("id", ""))')
if [[ -z $id ]]; then
  echo "✗ Supabase Auth no creó la cuenta: $respuesta" >&2
  exit 1
fi

if ! sql -v id="$id" -v nombre="$nombre" <<'SQL'
insert into usuarios (id, nombre, rol_id)
select :'id'::uuid, :'nombre', id from roles where nombre = 'administrador';
SQL
then
  curl -sS -o /dev/null -X DELETE "$url/auth/v1/admin/users/$id" -H "apikey: $llave" -H "Authorization: Bearer $llave"
  echo "✗ No se pudo crear el perfil; se deshizo la cuenta." >&2
  exit 1
fi

echo "✅ Administrador $usuario creado. Entra en la app con ese usuario y esa contraseña."

# Respaldos del CRM (F5·2, F5·4)

Plan completo y decisiones: [docs/RESPALDOS.md](../../docs/RESPALDOS.md).

| Archivo | Qué hace |
|---|---|
| `preparar-disco.sh` | Una sola vez, con `sudo`: borra el SSD Micron de 256 GB (buscado por número de serie), lo formatea ext4 y lo monta en `/mnt/respaldos` (fstab por UUID con `nofail`). Hecho el 7 nov 2026. |
| `respaldo-diario.sh` | Copia del día en `/mnt/respaldos/crm/AAAA-MM-DD/`. Guarda 14 diarias y los domingos de 8 semanas. `--si-falta` no hace nada si la de hoy ya está. |
| `systemd/crm-respaldo.{service,timer}` | Lo corre cada día a las 03:30 de Colombia; con `Persistent=true`, si el servidor estaba apagado a esa hora, lo corre al encender. |

## Ver si está funcionando

```bash
systemctl --user list-timers crm-respaldo.timer
journalctl --user -u crm-respaldo -n 20
ls /mnt/respaldos/crm/
```

Una carpeta sin el archivo `LISTO` no se terminó: no usarla.

Instalar o reinstalar el timer:

```bash
cp herramientas/respaldos/systemd/crm-respaldo.* ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now crm-respaldo.timer
```

## Restaurar

Primero se comprueba la copia y se prueba en una base aparte; la base real se reemplaza solo si hace falta.

```bash
F=/mnt/respaldos/crm/2026-11-07          # la fecha que se quiera
D=crminventaria-supabase-db
(cd $F && sha256sum -c SHA256SUMS)

# 1. En una base aparte (no toca nada del CRM)
docker exec $D psql -U supabase_admin -c "create database prueba_restauracion"
docker exec -i $D pg_restore -U supabase_admin -d prueba_restauracion < $F/base.dump
docker exec $D psql -U supabase_admin -d prueba_restauracion -c "select count(*) from public.leads"
docker exec $D psql -U supabase_admin -c "drop database prueba_restauracion"
```

**Reemplazar la base real** (se pierde lo escrito después de la copia; apagar antes el receptor y la app):

```bash
systemctl --user stop crm-meta-receptor crm-inventaria-app
docker exec -i $D pg_restore -U supabase_admin -d postgres --clean --if-exists < $F/base.dump
systemctl --user start crm-meta-receptor crm-inventaria-app
```

**Archivos de Storage:** `tar -xzf $F/storage.tar.gz -C supabase/volumes/` (con el contenedor `crminventaria-supabase-storage` detenido).

**Servidor nuevo:** `config.tar.gz` trae los `.env` (con `VAULT_ENC_KEY`: sin ella no se leen los secretos de Meta), `~/.cloudflared/` (túnel `crm-inventaria`)
y las unidades systemd. Se descomprime con `tar -xzf config.tar.gz -C /` **después** de clonar el repo y antes de levantar Supabase.

## Prueba de restauración del 7 nov 2026

Copia del 7 nov restaurada en `prueba_restauracion` sin errores: las 76 tablas de `public`, `auth`, `storage` y `vault` con las mismas filas
que la base real (64 productos, 6 leads, 232 mensajes, 2 usuarios), los 4 secretos de Vault se descifran y Storage (13 archivos) idéntico.
La copia completa pesa 6,8 MB y tarda 1,5 s.

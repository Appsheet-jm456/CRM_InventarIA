#!/usr/bin/env bash
# F5·4: deja el SSD Micron de 256 GB (antes Windows 10) como disco de respaldos en /mnt/respaldos.
# BORRA TODO EL DISCO. Lo corre el dueño:  sudo bash herramientas/respaldos/preparar-disco.sh
# El disco se busca por su número de serie (no por sda/sdb/sdc, que pueden cambiar entre arranques).
set -euo pipefail

DISCO_ID=/dev/disk/by-id/ata-MTFDDAK256TBN-1AR1ZABHA_UGXVK01J7C7F51
PUNTO=/mnt/respaldos
DUENO=atlasjm

[ "$(id -u)" -eq 0 ] || { echo "Córrelo con sudo."; exit 1; }
[ -e "$DISCO_ID" ] || { echo "No encuentro el disco Micron ($DISCO_ID). No hago nada."; exit 1; }
DISCO=$(readlink -f "$DISCO_ID")

# Nunca tocar el disco del sistema.
RAIZ=$(lsblk -no PKNAME "$(findmnt -no SOURCE /boot)")
if [ "/dev/$RAIZ" = "$DISCO" ]; then echo "El disco elegido es el del sistema. No hago nada."; exit 1; fi
if lsblk -no MOUNTPOINTS "$DISCO" | grep -q .; then echo "Hay particiones de $DISCO montadas. No hago nada."; exit 1; fi

echo "Disco a borrar:"
lsblk -o NAME,SIZE,FSTYPE,LABEL,MODEL "$DISCO"
read -r -p "Escribe BORRAR para borrar TODO $DISCO: " ok
[ "$ok" = "BORRAR" ] || { echo "Cancelado."; exit 1; }

wipefs -a "$DISCO"
sgdisk --zap-all "$DISCO" >/dev/null
sgdisk -n 1:0:0 -t 1:8300 -c 1:respaldos "$DISCO" >/dev/null
partprobe "$DISCO"; udevadm settle
PART="${DISCO_ID}-part1"
for _ in 1 2 3 4 5; do [ -e "$PART" ] && break; sleep 1; done
mkfs.ext4 -F -L respaldos "$PART"

UUID=$(blkid -s UUID -o value "$PART")
mkdir -p "$PUNTO"
grep -q "$PUNTO" /etc/fstab || {
  cp /etc/fstab /etc/fstab.antes-respaldos
  echo "UUID=$UUID $PUNTO ext4 defaults,nofail,noatime,x-systemd.device-timeout=10s 0 2" >> /etc/fstab
}
systemctl daemon-reload
mount "$PUNTO"
chown "$DUENO:$DUENO" "$PUNTO"
chmod 750 "$PUNTO"

echo; echo "Listo:"; df -h "$PUNTO"

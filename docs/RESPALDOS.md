# Respaldos del CRM y continuidad del servidor (F5·2, F5·4 a F5·6)

> Plan acordado con el dueño el 7 nov 2026. **Nada de esto está hecho todavía:** hoy el CRM no tiene respaldos. Es lo más urgente desde que el
> CRM se publicó por internet (decisión 0037). Modelo del script: `supabase-diario.py` de la web de ventas virtuales (copia diaria y una cada hora
> que solo actúa si falta la del día). Estudio previo: [PUBLICAR-CRM-EMPRESA.md](PUBLICAR-CRM-EMPRESA.md) §7 y §8.

## 1. El disco de respaldos (F5·4)

El servidor tiene tres discos (verificado el 7 nov 2026 con `lsblk`):

| Disco | Tamaño | Qué tiene | Uso |
|---|---|---|---|
| `sda` | 477 GB (Patriot, SSD) | Ubuntu, el CRM, Docker | **No tocar** |
| **`sdc`** | **238 GB** (Micron MTFDDAK256TBN, SATA, SSD) | Windows 10 (EFI, MSR, NTFS de 237,8 GB y recuperación) | **Será el disco de respaldos** |
| `sdb` | 75 GB (Hitachi, HDD) | Una partición NTFS «Info R» | Fuera de este plan |

- Ubuntu arranca desde `sda` (`/boot/efi` está en `sda1`): borrar `sdc` no afecta al arranque; solo desaparece Windows del menú.
- **Antes de formatear, el dueño confirma que no necesita nada del Windows** (archivos, licencias, programas). Es irreversible. Yo no puedo mirar dentro: no tengo `sudo` para montarlo.
- El dueño corre los comandos con `sudo` (Claude solo tiene `sudo` para `apt` y `systemctl`): borrar la tabla de particiones de `sdc`, crear una partición `ext4` con etiqueta
  `respaldos`, montarla en `/mnt/respaldos` por **UUID** en `/etc/fstab` con `nofail` (si el disco falla, el servidor igual arranca) y dejar la carpeta con dueño `atlasjm`.
  Se **verifica el nombre del disco otra vez justo antes** (`lsblk`): los nombres `sda/sdb/sdc` pueden cambiar entre arranques.

## 2. Qué se copia y cómo (F5·2)

| Qué | Cómo |
|---|---|
| Base del CRM (`crminventaria-supabase-db`, incluye las cuentas de acceso) | `pg_dump` completo; se agrega `pg_dumpall --globals-only` |
| Storage de Supabase y `crm/uploads/` (fotos de clientes) | Copia de los archivos |
| **`VAULT_ENC_KEY`** de `supabase/.env` y los `.env` del CRM | Solo permisos de lectura para el dueño; **fuera de git**. Sin la llave de Vault no se recuperan los secretos de Meta |
| **`~/.cloudflared/`** (`cert.pem`, credenciales del túnel y `config.yml`) | Sin ellas hay que crear el túnel y registrarlo de nuevo |
| Unidades de systemd del usuario y los servicios | Copia de los archivos |
| Las otras bases (Escuela, Futur Green) | Opcional: el dueño decide |

- **Cuándo:** una copia diaria y otra cada hora que solo actúa si falta la del día (si el servidor estuvo apagado a la hora programada).
- **Cuántas:** las últimas 14 diarias y una semanal; se borran las viejas solas.
- **Aviso:** si falta la copia de hoy o el disco está lleno al 80 %, el CRM avisa (a definir: alerta en la app o correo).
- **Prueba obligatoria (F5·2 no se cierra sin ella):** restaurar una copia en una base aparte y comprobar que el CRM la lee. Una copia que no se ha restaurado no se sabe si sirve.

## 3. Copia fuera del servidor (F5·5)

Un disco dentro del mismo servidor protege de un daño de `sda` o de un borrado por error, **no de un robo, un incendio, una descarga eléctrica o un virus**.
Propuesta: una copia **cifrada** y más pequeña (las bases y las llaves; no las fotos si pesan mucho) a Google Drive del dueño, una vez al día, con `rclone`.
La clave de cifrado se guarda aparte, fuera del servidor. **El dueño decide el destino.**

## 4. Servidor apagado o sin luz (F5·6)

- **Al encender solo:** Docker y los servicios del CRM arrancan solos (verificado el 7 nov 2026: `crm-inventaria-app`, `crm-meta-receptor`, `crm-meta-tunel-fijo` y
  `crm-llama` están habilitados, `Linger=yes` y los contenedores con `unless-stopped`). Pueden pasar uno o dos minutos hasta que todo quede arriba.
- **Apagar bien:** `sudo systemctl poweroff` (cierra las bases con orden).
- **Un corte de luz:** el servidor puede quedarse apagado hasta que alguien lo encienda; hay que ver en la BIOS la opción de **encender al volver la luz** («Restore on AC power loss»).
  Sin batería de respaldo (UPS), un corte brusco puede dañar la base: evaluar un UPS pequeño.
- **Qué pasa con los mensajes mientras está apagado:** los mensajes de los clientes quedan guardados por WhatsApp/Meta. Meta reintenta entregar el webhook con retraso creciente,
  **hasta 7 días según una guía de terceros; no lo confirmé en la documentación oficial de Meta**, así que no se debe contar con ello. No hay garantía de orden.
  Si el servidor vuelve en pocas horas, los mensajes pueden llegar tarde y el bot responder tarde. Pasadas 24 h del último mensaje del cliente, el bot ya no puede escribirle libremente (solo con plantilla).
- **Plan de caída:** definir quién atiende a los clientes y cómo se avisa si el servidor cae (un mensaje de estado en el WhatsApp del negocio o un asesor desde el celular).

## 5. Orden propuesto

1. F5·4 disco listo (el dueño formatea con `sudo`, Claude verifica).
2. F5·2 script de respaldo y una restauración probada.
3. F5·5 copia fuera del servidor.
4. F5·6 BIOS, UPS y plan de caída.

# 0037 · Webhook fijo con dominio propio y CRM por internet detrás de Cloudflare Access

**Estado:** Aceptada por el dueño el 7 nov 2026 · Cierra F2·10 (webhook fijo) y reemplaza F2·17 (Tailscale Funnel) · Amplía la 0010 (webhook por túnel con dominio propio) · Guía: [TUNEL-WEBHOOK.md](../TUNEL-WEBHOOK.md)

## Contexto

El webhook de Meta dependía de un túnel rápido de `trycloudflare`, cuya dirección cambia en cada reinicio (el 1 oct 2026 el bot estuvo horas sin responder).
El equipo (3 o 4 personas) necesita además entrar al CRM desde fuera de la oficina. El dueño tenía el dominio `ventasvirtualcolombia.shop` en Hostinger
(el `.com` aloja la web de ventas virtuales y su correo, y no se tocó).

## Decisión

- **Dominio:** `ventasvirtualcolombia.shop`, comprado en Hostinger, con los **nameservers de Cloudflare** (plan Free). La web y el correo del `.com` siguen en Hostinger.
- **Un solo túnel con nombre** (`crm-inventaria`, servicio `crm-meta-tunel-fijo`, configuración en `~/.cloudflared/`, fuera de git) con dos direcciones:
  - `bot.<dominio>/webhook` → receptor de Meta (8095). **Sin Access:** Meta debe poder llamarlo; el receptor valida la firma `X-Hub-Signature-256`.
  - `crm.<dominio>` → pantalla (8096) y, solo para `/auth/v1`, `/rest/v1`, `/realtime/v1` y `/storage/v1`, la base (8020). **Detrás de Cloudflare Access.**
  - Todo lo demás responde 404. Studio, n8n, Nextcloud y `/interno/*` no se publican.
- **Cloudflare Access** (Zero Trust, plan Free hasta 50 usuarios): aplicación `crm`, política `Equipo` = lista de correos, código por correo (One-time PIN), sesión de 24 h.
  Es una primera puerta; la segunda es el usuario y contraseña de cada persona en el CRM (RLS y permisos siguen igual).
- **Código:** `navegador.ts` usa la misma dirección pública para la base cuando el host empieza por `crm.` y acaba en `.shop`; por red local y Tailscale sigue el puerto 8020.

## Alternativas descartadas

- **Tailscale Funnel para el webhook:** el plan gratuito se describe como de uso no comercial y el 443 ya lo usa la Escuela.
- **Mover los nameservers del `.com`:** habría puesto en riesgo la web y el correo; el `.shop` estaba vacío.
- **Publicar la pantalla sin Access:** dejaría el login de un sistema con clientes reales abierto a internet.

## Consecuencias y cuidados

- Una persona nueva necesita **dos altas**: su correo en la política `Equipo` y su usuario en el CRM.
- El orden importa: la aplicación de Access se crea **antes** de publicar `crm.<dominio>` en el túnel.
- Un dominio recién registrado tardó ~1 h en publicarse en el registro de `.shop` y ~15 min el certificado de Cloudflare.
- Si el login de Access solo ofrece «Cloudflare», falta agregar **One-time PIN** en Zero Trust → Integrations → Identity providers.
- Renovación del `.shop`: revisar su precio de 2027 (la autorrenovación está encendida en Hostinger).
- Siguen sin hacerse los respaldos del CRM (F5·2), ahora más urgentes.

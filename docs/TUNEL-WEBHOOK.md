# Webhook de Meta con dirección fija: opciones A y B (F2·10 y F2·17)

> Por qué: el 1 oct 2026 el bot dejó de responder desde el 30 sep a las 14:44. El túnel rápido de prueba
> (`trycloudflare`) **lo borró Cloudflare** («Tunnel not found») y el servicio `crm-meta-tunel` siguió reintentando sobre
> una dirección muerta, sin avisar: Meta enviaba los mensajes a una URL que ya no existía. Se arregló con
> `systemctl --user restart crm-meta-tunel`, que crea otra URL y la registra sola en Meta. Para que la prueba no se
> detenga hace falta una **dirección fija**. Decisión de base: 0010 (webhook directo a la app por un túnel con dominio propio).

---

## Mientras tanto (hoy)

| Qué | Cómo |
|---|---|
| Si el bot deja de responder | Revisar `journalctl --user -u crm-meta-tunel -n 20`: si dice «Tunnel not found», reiniciar el túnel (abajo). Toma 20 s y registra la URL nueva en Meta |
| Reiniciar el túnel | `systemctl --user restart crm-meta-tunel` · URL actual en `herramientas/meta-webhook-prueba/tunel-url.txt` |
| Parche automático | Tarea aparte propuesta: que `tunel.py` detecte «Tunnel not found» y se reinicie solo |

---

## Opción A — Para la prueba, rápida y gratis: Tailscale Funnel (F2·17)

El servidor ya tiene Tailscale (`atlasjm.taile98044.ts.net`, versión 1.102). Funnel publica en internet, con HTTPS, una ruta
del servidor en una **dirección fija**: `https://atlasjm.taile98044.ts.net/webhook`. No necesita dominio ni pago. Hoy Funnel
**no está activado** en el tailnet.

| # | Paso | Quién | Detalle |
|---|---|---|---|
| A1 | Activar HTTPS en el tailnet | **Dueño** | <https://login.tailscale.com/admin/dns> → *HTTPS Certificates* → **Enable HTTPS** (MagicDNS ya está activo) |
| A2 | Permitir Funnel a este equipo | **Dueño** | <https://login.tailscale.com/admin/acls> → en el archivo de políticas agregar en `"nodeAttrs"`: `{"target": ["autogroup:member"], "attr": ["funnel"]}` → **Save**. (O el asistente que ofrece la consola en *Access controls → Funnel*) |
| A3 | Dejar a `atlasjm` manejar Tailscale sin `sudo` | Dueño o Claude con `sudo` | `sudo tailscale set --operator=atlasjm` (una vez) |
| A4 | Publicar **solo** `/webhook` del receptor | Claude | `tailscale funnel --bg --set-path /webhook http://127.0.0.1:8095/webhook` · revisar con `tailscale funnel status`. Las rutas internas (`/interno/…`, simulador y Chat InventarIA) quedan sin publicar |
| A5 | Probar desde fuera | Claude | `curl -i "https://atlasjm.taile98044.ts.net/webhook?hub.mode=prueba"` debe dar **403** (llega al receptor, sin token) |
| A6 | Registrar la URL fija en Meta | Claude | Con la misma función de `tunel.py` (`registrar_en_meta`): `callback_url = https://atlasjm.taile98044.ts.net/webhook`, `verify_token = META_VERIFY_TOKEN`, campo `messages`. Una sola vez |
| A7 | Apagar el túnel rápido | Claude | `systemctl --user disable --now crm-meta-tunel`: si siguiera vivo, al reiniciar volvería a cambiar la URL en Meta |
| A8 | Prueba de ida y vuelta | Dueño + Claude | Escribir «hola» desde un número verificado; ver la entrada en `eventos.log` y la respuesta del bot |
| A9 | Documentar | Claude | Decisión nueva (Funnel para la prueba hasta tener dominio), `PENDIENTES.md`, Notion; cerrar F2·17 |

**Cuidados.** Funnel usa los puertos 443, 8443 o 10000 y solo publica lo que se configure; aquí, solo `/webhook`, que exige la
firma de Meta (`X-Hub-Signature-256`) y descarta lo demás. Si se reinicia el servidor, `--bg` deja la configuración guardada.
Volver atrás: `tailscale funnel --set-path /webhook off` y `systemctl --user enable --now crm-meta-tunel`.

---

## Opción B — Definitiva, para el número real: Cloudflare con dominio propio (F2·10)

Un **túnel con nombre** de Cloudflare apunta a `bot.<dominio>` y no se borra ni cambia. Es lo decidido en la 0010 y lo que se
necesita antes de pasar el número real del negocio a Meta (F5·3).

| # | Paso | Quién | Detalle |
|---|---|---|---|
| B1 | Comprar un dominio | **Dueño** | Unos USD 10 al año (por ejemplo `ventasvirtuales.co`), o usar uno que ya tenga. Cloudflare Registrar vende `.com` a precio de costo |
| B2 | Cuenta de Cloudflare y dominio en Cloudflare | **Dueño** | Crear cuenta gratis → *Add a domain* → plan **Free** → cambiar los **nameservers** donde se compró por los que da Cloudflare → esperar a que diga **Active** (minutos a horas) |
| B3 | Autorizar el servidor | Dueño + Claude | En el servidor: `~/.local/bin/cloudflared tunnel login` → abre un enlace; el dueño elige el dominio y aprueba. Deja `~/.cloudflared/cert.pem` (no se commitea) |
| B4 | Crear el túnel con nombre | Claude | `cloudflared tunnel create crm-inventaria` → guarda sus credenciales en `~/.cloudflared/<id>.json` |
| B5 | Dirección del bot | Claude | `cloudflared tunnel route dns crm-inventaria bot.<dominio>` (crea el registro DNS) |
| B6 | Configuración | Claude | `~/.cloudflared/config.yml`: `tunnel: <id>`, `credentials-file: …/<id>.json`, `ingress:` → `hostname: bot.<dominio>`, `path: ^/webhook$`, `service: http://127.0.0.1:8095`; y al final `service: http_status:404` (nada más queda publicado) |
| B7 | Servicio que arranca solo | Claude | Unidad de usuario `crm-meta-tunel-fijo` con `cloudflared tunnel --no-autoupdate run crm-inventaria`, copia en `herramientas/meta-webhook-prueba/systemd/` |
| B8 | Probar desde fuera | Claude | `curl -i "https://bot.<dominio>/webhook?hub.mode=prueba"` → **403** |
| B9 | Registrar la URL fija en Meta | Claude | `https://bot.<dominio>/webhook` con `META_VERIFY_TOKEN`, campo `messages` (igual que A6). Una sola vez |
| B10 | Apagar lo provisional | Claude | `crm-meta-tunel` (túnel rápido) o Funnel (opción A), según lo que esté corriendo |
| B11 | Prueba de ida y vuelta y cierre | Dueño + Claude | «hola» desde un número verificado; documentar y **cerrar F2·10** |

**Después (opcional):** el mismo túnel puede publicar la app (`crm.<dominio>` → 8096) con Cloudflare Access para entrar desde
fuera de la oficina sin Tailscale. No es parte de esta tarea.

---

## Orden recomendado

1. **Opción A ya**, para que la prueba no se detenga (lo único del dueño: A1 y A2, unos minutos en la consola de Tailscale).
2. **Opción B** cuando esté el dominio, antes del corte (F5·1) y del número real (F5·3).

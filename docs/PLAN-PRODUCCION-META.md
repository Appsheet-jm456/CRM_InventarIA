# Plan: salida a producción en Meta con dominio propio

> **Fecha:** 1 oct 2026 · **Tareas:** F1·5 (trámites en Meta), F2·10 (webhook fijo), F5·3 (número real).
> **Por qué:** el CRM hoy responde con la app de prueba *Futur Green bot* (portafolio Futur Green, número
> +1 555 190 4296) y un túnel rápido que cambia de URL. Para producción hacen falta la app propia, el número real,
> el negocio verificado y una dirección fija. El dueño ya tiene dominio y número nuevo.

## Datos de partida

| Qué | Valor |
|---|---|
| App de Meta para producción | **CRM InventarIA** (caso de uso «Conectar en WhatsApp», creada el 1 oct 2026). Reemplaza a *Futur Green bot* |
| Número real | **+57 320 521 1803**, nuevo: **no se instala WhatsApp con él** en ningún celular |
| Dominio | Comprado en **Hostinger** · nombre: `<dominio>` (pendiente de anotar) |
| Página web | Repositorio en GitHub del dueño: `<repo>` (pendiente de anotar). Falta desplegarla y asociar el dominio |
| Documentos del negocio | **RUT** y **Certificado de Cámara de Comercio** (menos de 30 días de expedido al subirlo) |

**Lo que no cambia:** `META_VERIFY_TOKEN` y `CRM_INTERNO_TOKEN`, el receptor (`crm-meta-receptor`, puerto 8095) y la app (8096).
Secretos (token y clave de la app) **nunca** por el chat ni en git: se escriben en el servidor con un comando que no los muestra.

---

## Orden y por qué

El dominio va primero porque de él dependen tres cosas: la **web** que pide la verificación, el **correo del dominio**
que la acelera y la **dirección fija del webhook** (F2·10). El número real se puede ir agregando en paralelo (fase 4).

| Fase | Qué | Depende de |
|---|---|---|
| 1 | Dominio en Cloudflare | — |
| 2 | Web en GitHub Pages con el dominio y política de privacidad | 1 |
| 3 | Correo del dominio (reenvío a Gmail) | 1 |
| 4 | Número real en la app CRM InventarIA, pago y token permanente | — (en paralelo) |
| 5 | Webhook fijo `bot.<dominio>` y CRM conectado a la app nueva | 1 y 4 |
| 6 | Verificación del negocio | 2 y 3 |
| 7 | Publicar la app, nombre visible y plantillas en español | 2, 5 y 6 |

---

## Fase 1 — Dominio en Cloudflare

Se deja el dominio en Hostinger (allá se renueva) pero el **DNS lo maneja Cloudflare** (gratis), que es lo que exige el
túnel con nombre de F2·10.

| # | Paso | Quién | Detalle |
|---|---|---|---|
| 1.1 | Cuenta de Cloudflare | **Dueño** | dash.cloudflare.com → crear cuenta gratis → **Add a domain** → escribir `<dominio>` → plan **Free** |
| 1.2 | Revisar los registros que importa | **Dueño** | Cloudflare copia los DNS actuales; seguir con **Continue** |
| 1.3 | Cambiar los nameservers en Hostinger | **Dueño** | Hostinger → Dominios → `<dominio>` → **DNS / Nameservers** → **Cambiar nameservers** → pegar los 2 que da Cloudflare (tipo `xxx.ns.cloudflare.com`) |
| 1.4 | Esperar «Active» | **Dueño** | Cloudflare manda un correo cuando el dominio queda **Active** (minutos a 24 h) |

## Fase 2 — Página web con el dominio (GitHub Pages)

| # | Paso | Quién | Detalle |
|---|---|---|---|
| 2.1 | Revisar el contenido | Claude + dueño | La página debe tener el **nombre legal exacto** (igual a Cámara de Comercio y RUT), **NIT**, **dirección y teléfono** iguales al certificado, qué vende el negocio y enlace a la política de privacidad |
| 2.2 | Política de privacidad | Claude | Página `/privacidad` en el mismo repositorio: qué datos recibe el bot (nombre, teléfono, mensajes), para qué, dónde se guardan, cómo pedir que se borren. Meta la exige para publicar la app |
| 2.3 | Activar GitHub Pages | **Dueño** | Repositorio → **Settings → Pages** → *Source*: rama `main`, carpeta `/` (o `/docs`) → **Save** |
| 2.4 | Dominio en GitHub | **Dueño** | En la misma pantalla, **Custom domain**: `www.<dominio>` → **Save** (crea el archivo `CNAME`) |
| 2.5 | DNS de la web en Cloudflare | **Dueño** o Claude | `CNAME www → <usuario>.github.io` y, para el dominio sin `www`, los 4 `A` de GitHub: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`. **Nube gris (DNS only)** mientras GitHub emite el certificado |
| 2.6 | HTTPS | **Dueño** | GitHub → Pages → marcar **Enforce HTTPS** cuando se habilite (hasta 24 h) |
| 2.7 | Probar | Claude | `https://<dominio>` y `https://<dominio>/privacidad` abren con candado |

Si el repositorio es privado, GitHub Pages pide plan pago: en ese caso hacerlo público (solo tiene la web) o publicarla
con **Cloudflare Pages** (gratis, conecta el mismo repositorio).

## Fase 3 — Correo del dominio

| # | Paso | Quién | Detalle |
|---|---|---|---|
| 3.1 | Reenvío gratis | **Dueño** | Cloudflare → `<dominio>` → **Email → Email Routing** → activar → crear `contacto@<dominio>` que reenvíe al Gmail del dueño (Cloudflare agrega los MX solo) |
| 3.2 | Probar | **Dueño** | Escribir a `contacto@<dominio>` y ver que llegue al Gmail |

Si Hostinger incluyó buzón de correo con la compra, se puede usar ese en vez del reenvío (sus MX van en Cloudflare).

## Fase 4 — Número real en la app CRM InventarIA

Se hace en developers.facebook.com → app **CRM InventarIA** → **Paso 2: Configuración de producción**.

| # | Paso | Quién | Detalle |
|---|---|---|---|
| 4.1 | Agregar el número | **Dueño** | Portafolio **Ventas Virtuales Colombia** · nombre visible igual a la marca del negocio · zona horaria Bogotá · categoría Electrónica |
| 4.2 | Verificar | **Dueño** | +57 · `3205211803` · código por **SMS** (o llamada). Queda «Conectado» o «Pendiente» mientras aprueban el nombre |
| 4.3 | Método de pago | **Dueño** | WhatsApp Manager → Configuración de pagos · país Colombia, moneda **COP** (no se puede cambiar después) |
| 4.4 | Usuario del sistema | **Dueño** | business.facebook.com → Ventas Virtuales Colombia → Configuración → Usuarios del sistema → **Agregar** `crm-bot`, rol Administrador |
| 4.5 | Asignar activos | **Dueño** | App **CRM InventarIA** y la **cuenta de WhatsApp**, las dos con **control total** (sin la cuenta de WhatsApp sale «object does not exist») |
| 4.6 | Token permanente | **Dueño** | **Generar token** · app CRM InventarIA · caducidad **Nunca** · `whatsapp_business_messaging` y `whatsapp_business_management`. No pegarlo en el chat |
| 4.7 | Datos que se pasan por el chat | **Dueño** | **App ID**, **Phone Number ID** del número real y **WABA ID** (no son secretos) |

## Fase 5 — Webhook fijo y CRM conectado a la app nueva

Pasos B3 a B11 de [TUNEL-WEBHOOK.md](TUNEL-WEBHOOK.md) con la dirección `bot.<dominio>`, más el cambio de app:

| # | Paso | Quién | Detalle |
|---|---|---|---|
| 5.1 | Autorizar el servidor en Cloudflare | Dueño + Claude | `cloudflared tunnel login` → el dueño abre el enlace y aprueba `<dominio>` (B3) |
| 5.2 | Túnel con nombre | Claude | `crm-inventaria` → `bot.<dominio>`, publica **solo** `/webhook` → 8095; servicio `crm-meta-tunel-fijo` (B4–B8) |
| 5.3 | Respaldo | Claude | Desde F4·16 la conexión vive en la base: antes de cambiarla, anotar la actual (App ID, WABA y número; el token no se puede leer, pero sigue en Meta). `.env.meta.bak` y `crm/.env.local.bak` (fuera de git) guardan las claves de la app *Futur Green bot* por si hay que volver |
| 5.4 | Cambiar a la app nueva | Dueño + Claude | El dueño, en **Configuración → Meta** (por Tailscale), escribe App ID, WABA ID, Phone Number ID, token y App Secret de la app nueva y pulsa «Probar y guardar»: ya no se tocan archivos ni se reinicia nada (F4·16) |
| 5.5 | Registrar el webhook | Dueño | En Configuración → Meta, «Registrar webhook en Meta» con `https://bot.<dominio>/webhook` (envía el token de verificación guardado, campo `messages`) (B9) |
| 5.6 | Suscribir la app a la WABA | Dueño | En Configuración → Meta, «Suscribir la app a la WABA» (sin esto no llegan mensajes) |
| 5.7 | Apagar lo provisional | Claude | `systemctl --user disable --now crm-meta-tunel` (el túnel rápido registraría otra URL) |
| 5.8 | Reiniciar y probar | Dueño + Claude | Reiniciar `crm-meta-receptor` y `crm-inventaria-app`; el dueño escribe «hola» al +57 320 521 1803; revisar `eventos.log`, la respuesta del bot y la Bandeja |

**Volver atrás:** restaurar los `.bak-futurgreen`, `systemctl --user enable --now crm-meta-tunel` y reiniciar los servicios.

## Fase 6 — Verificación del negocio

business.facebook.com → Ventas Virtuales Colombia → **Centro de seguridad → Verificación del negocio → Iniciar verificación**.

| # | Paso | Quién | Detalle |
|---|---|---|---|
| 6.1 | Datos del negocio | **Dueño** | Nombre legal **letra por letra** como en Cámara de Comercio (con «S.A.S.» si lo tiene), dirección, teléfono y sitio `https://<dominio>` |
| 6.2 | Documentos | **Dueño** | **Certificado de Cámara de Comercio** (menos de 30 días) y **RUT**, en el **PDF original** descargado, sin recortar ni tapar sellos o QR |
| 6.3 | Método de confirmación | **Dueño** | Elegir **correo** `contacto@<dominio>` (el más rápido); si no, SMS o llamada al teléfono del certificado |
| 6.4 | Esperar | Meta | De 1 a 5 días hábiles; llega aviso en Business Suite |

## Fase 7 — Publicar la app y cerrar

| # | Paso | Quién | Detalle |
|---|---|---|---|
| 7.1 | Configuración básica de la app | **Dueño** | Developers → ⚙️ Configuración de la app → Básica: **URL de política de privacidad** (`https://<dominio>/privacidad`), ícono 1024×1024, categoría |
| 7.2 | Publicar | **Dueño** | Cambiar el modo de la app a **Activo / Publicado** |
| 7.3 | Nombre visible aprobado | Meta | Revisar en WhatsApp Manager que el nombre esté **Aprobado** |
| 7.4 | Plantillas en español | Dueño + Claude | Las 3 plantillas del CRM (F3·6) se envían a Meta desde Configuración → Canal WhatsApp, ya sobre la cuenta nueva |
| 7.5 | Documentar y cerrar | Claude | Decisión nueva (app CRM InventarIA y dominio propio), `PENDIENTES.md`, Notion; cerrar F1·5, F2·10 y F5·3 |

---

## Lo que el dueño hace ya (sin esperar a nada)

1. **Fase 1:** cuenta de Cloudflare y cambio de nameservers en Hostinger.
2. **Fase 4:** agregar y verificar el +57 320 521 1803, método de pago, usuario del sistema y token.
3. Anotar aquí el **dominio** y el **repositorio** de la web.

# Plan: WhatsApp Cloud API de Meta para Ventas Virtuales Colombia

> **Objetivo:** poner el bot de InventarIA a funcionar sobre la **API oficial de Meta**,
> empezando con el **número de pruebas gratuito**, sin arriesgar el número real del local.
>
> **Fecha:** 12 de agosto de 2026 · **Proyecto:** InventarIA (`~/chat_bot-inventario`)

---

## Por qué migrar (el problema de hoy)

La instancia actual de WhatsApp está **caída**:

```
Instancia "ventas" · integración WHATSAPP-BAILEYS
state = "close"  ·  ownerJid: null  ·  Mensajes: 0  ·  Contactos: 0  ·  Chats: 0
```

Baileys es WhatsApp Web no oficial: la sesión se cae sola, hay que re-escanear el QR cada
tanto y **existe riesgo real de que Meta banee el número del local**. Ahora mismo ningún
cliente que escriba está siendo atendido, y no hay forma de saber desde cuándo.

La API oficial elimina las tres cosas: no hay QR, no hay sesión que se caiga, y el número
está bendecido por Meta.

### La buena noticia

**Evolution API 2.3.7 ya soporta la integración oficial de Meta.** Verificado en el build:

```
integration: "WHATSAPP-BUSINESS"   ← además de "WHATSAPP-BAILEYS"
campos: token · number · businessId
```

Eso significa que **el código del CRM no se toca**. Se crea una instancia nueva con
integración Meta y todas las rutas (`/api/crm/*`, `/api/whatsapp-flow`, `lib/evolution.js`)
siguen funcionando igual. Solo cambia una variable de entorno.

---

## Antes de empezar: los 4 consoles de Meta

El 80% del dolor de cabeza viene de aquí. Meta tiene **cuatro paneles distintos** y la
documentación salta entre ellos sin avisar. Ten claro cuál es cuál:

| Panel | URL | Para qué sirve |
|---|---|---|
| **Meta Business Suite** | business.facebook.com | Tu negocio, páginas, Instagram, usuarios del sistema, **tokens permanentes** |
| **Meta for Developers** | developers.facebook.com | Tu **app**, el producto WhatsApp, el **número de pruebas**, los **webhooks** |
| **WhatsApp Manager** | business.facebook.com/wa/manage | Números reales, **plantillas**, calidad, límites de envío |
| **Graph API Explorer** | developers.facebook.com/tools/explorer | Probar llamadas sueltas. Útil para depurar. |

**Regla mental:** *Developers* = configuración técnica. *Business Suite* = identidad y permisos.

---

## Datos del negocio (completar antes de la Fase 1)

Meta cruza la identidad de la app con la del negocio. Si los nombres no coinciden, la
aprobación del nombre para mostrar se cae y la verificación se complica. Llena esto primero:

| Dato | Valor |
|---|---|
| Nombre legal / comercial | **Ventas Virtuales Colombia** |
| Página oficial de Facebook | `⬜ facebook.com/________________` |
| Cuenta oficial de Instagram | `⬜ @________________` |
| Sitio web (si hay) | `⬜ ________________` |
| Correo del negocio | `⬜ ________________` |
| Número real del local (destino final) | `⬜ ________________` |
| Nombre para mostrar en WhatsApp | `Ventas Virtuales Colombia` |

> **Importante sobre el nombre para mostrar:** Meta exige que se parezca al nombre real del
> negocio y a lo que dicen tus redes. `Ventas Virtuales Colombia` funciona. `VVC Ofertas 🔥`
> o `Portátiles Baratos` te lo rechazan. Si la página de Facebook y el Instagram usan el mismo
> nombre, la aprobación es casi automática.

---

# FASE 1 — Identidad del negocio en Meta

**Quién:** tú · **Tiempo:** 20-30 min · **Costo:** $0

| # | Paso | Detalle |
|---|---|---|
| 1.1 | Entrar a business.facebook.com | Con la cuenta personal que administra las redes del local |
| 1.2 | Crear/confirmar el negocio | Nombre exacto: **Ventas Virtuales Colombia** |
| 1.3 | Vincular la página de Facebook | *Configuración → Cuentas → Páginas → Agregar* |
| 1.4 | Vincular el Instagram | *Configuración → Cuentas → Cuentas de Instagram* |
| 1.5 | Anotar el **Business ID** | Sale en *Configuración → Información del negocio* |

⚠️ **No inicies la verificación del negocio todavía.** No hace falta para el número de
pruebas y te frena. Se hace en la Fase 8.

---

# FASE 2 — Crear la app y sacar el número de pruebas

**Quién:** tú · **Tiempo:** 15 min · **Costo:** $0

| # | Paso | Detalle |
|---|---|---|
| 2.1 | developers.facebook.com/apps → **Crear app** | Tipo: **Empresa / Business** |
| 2.2 | Nombre de la app | `Ventas Virtuales Colombia - WhatsApp` |
| 2.3 | Vincularla al negocio | Selecciona el negocio de la Fase 1 |
| 2.4 | *Agregar producto* → **WhatsApp** → *Configurar* | Meta crea sola una **WABA de prueba** y un **número de prueba** |
| 2.5 | Ir a *WhatsApp → Configuración de la API* | Aquí están los datos que necesitas |

### Los 4 datos que hay que anotar

Esta es la tabla que te salva de la confusión de IDs. **Son cuatro cosas distintas y todas
se parecen:**

| Dato | Pinta | Dónde sale | Para qué |
|---|---|---|---|
| **Phone number ID** | 15 dígitos | *Configuración de la API*, bajo el número de prueba | Identifica el número. **NO es el teléfono.** |
| **WABA ID** | 15 dígitos | Justo debajo | Identifica la cuenta de WhatsApp Business |
| **App ID** | 15 dígitos | Cabecera del panel | Identifica la app |
| **Access token** | `EAAG...` largo | Botón azul *Generar* | La llave. **Dura 24 h.** |

> 🔴 **Trampa #1 — la más común de todas:** ese token dura **24 horas**. Es el clásico
> "ayer funcionaba y hoy no". Sirve para probar hoy; el permanente se saca en la Fase 3.

### Agregar tu celular como destinatario de prueba

En la misma pantalla, campo **"Para:"** → *Administrar lista de números* → agrega tu celular
→ te llega un código → confirmas.

| Lo que puede el número de prueba | Lo que NO puede |
|---|---|
| Enviar y recibir gratis | Escribirle a alguien fuera de la lista |
| Hasta **5 destinatarios** verificados | Usarse con clientes reales |
| 1.000 conversaciones/mes | Cambiarse por el número del local |

### Primer mensaje de prueba

La propia página te muestra un `curl` listo. Pruébalo — si llega el mensaje "hello_world"
a tu celular, la Fase 2 está lista y ya tienes API de Meta funcionando.

✅ **Checkpoint 1:** recibiste el mensaje de prueba en tu celular.

---

# FASE 3 — Token permanente

**Quién:** tú · **Tiempo:** 10 min · **Costo:** $0

Sin esto, todo se rompe cada 24 horas.

| # | Paso | Detalle |
|---|---|---|
| 3.1 | business.facebook.com → *Configuración del negocio* | |
| 3.2 | *Usuarios → Usuarios del sistema* → **Agregar** | Nombre: `bot-whatsapp` · Rol: **Administrador** |
| 3.3 | *Agregar activos* → tu app + la WABA | Con permiso de **control total** |
| 3.4 | **Generar nuevo token** | Selecciona la app |
| 3.5 | Marcar exactamente estos permisos | `whatsapp_business_messaging`<br>`whatsapp_business_management` |
| 3.6 | Copiar el token | **Se muestra una sola vez.** Guárdalo en tu gestor de contraseñas. |

> 🔴 **Trampa #2:** si el usuario del sistema no tiene la WABA asignada como activo, el token
> se genera pero devuelve error 200 sin permisos al usarlo. Si algo falla aquí, revisa el 3.3.

> 🔒 **No pegues este token en el chat.** Lo pones tú directo en el `.env.local` del servidor.

✅ **Checkpoint 2:** repetiste el `curl` de la Fase 2 con el token permanente y funcionó.

---

# FASE 4 — URL pública HTTPS (el bloqueo técnico)

**Quién:** yo, en el servidor · **Tiempo:** 30-45 min · **Costo:** $0 (o ~10 USD/año si compras dominio)

Meta **exige HTTPS con certificado válido** para entregarte los mensajes. Hoy Evolution está
en `127.0.0.1:8088`: solo accesible desde el propio servidor y por Tailscale. Meta no llega ahí.

### Opción recomendada: Cloudflare Tunnel

| Ventaja | Detalle |
|---|---|
| Gratis | Sin costo mensual |
| No abre puertos | El router del local se queda como está |
| HTTPS válido | Certificado automático, que es lo que Meta pide |
| Expone solo Evolution | El resto del servidor (Supabase, Nextcloud, n8n) sigue privado |

Necesita un dominio gestionado en Cloudflare. Si no tienes, hay dos caminos:

| Camino | Costo | Cuándo |
|---|---|---|
| Túnel rápido (`trycloudflare.com`) | $0 | Solo pruebas — la URL **cambia en cada reinicio** |
| Dominio propio + túnel con nombre | ~10 USD/año | Producción — URL fija, es lo que hay que tener |

> 🔴 **Trampa #3:** no uses el túnel rápido para producción. Cuando la URL cambie, Meta deja
> de entregar mensajes y no te avisa: simplemente dejan de llegar clientes.

⚠️ **Decisión tuya:** ¿compramos dominio ahora, o arrancamos con el túnel rápido para validar
que todo funciona y compramos después? Mi recomendación: **túnel rápido para las Fases 5-7, y
dominio antes de la Fase 8.**

---

# FASE 5 — Conectar Meta al CRM existente

**Quién:** yo · **Tiempo:** 15 min

Aquí es donde se nota que Evolution ya soporta Meta: es **una sola llamada** y el CRM ni se entera.

```bash
curl -X POST http://127.0.0.1:8088/instance/create -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" -d '{"instanceName":"ventas-meta","integration":"WHATSAPP-BUSINESS","token":"<TOKEN_PERMANENTE>","number":"<PHONE_NUMBER_ID>","businessId":"<WABA_ID>"}'
```

Luego en `.env.local`, un solo cambio:

```
EVOLUTION_INSTANCE=ventas-meta
```

Y reiniciar la app. **Eso es todo.** Las 14 rutas de API, el kanban, el envío de fotos y el
motor de menús siguen igual porque todos hablan con Evolution, no con WhatsApp directamente.

> 💡 La instancia vieja `ventas` se queda ahí sin estorbar. No la borres hasta que Meta esté
> validado — es tu plan de vuelta atrás.

---

# FASE 6 — Webhook

**Quién:** yo el servidor, tú los clics en Meta · **Tiempo:** 20 min

| # | Paso | Dónde |
|---|---|---|
| 6.1 | Copiar la URL pública del túnel | Te la paso yo |
| 6.2 | *WhatsApp → Configuración → Webhooks* → **Editar** | Meta for Developers |
| 6.3 | **Callback URL**: la URL del túnel | |
| 6.4 | **Verify token**: una frase que inventes | La misma que yo ponga en Evolution |
| 6.5 | *Verificar y guardar* | Meta hace un GET de comprobación al instante |
| 6.6 | **Suscribirse al campo `messages`** | ⬅️ El paso que todo el mundo olvida |

> 🔴 **Trampa #4:** guardar el webhook **no** te suscribe a nada. Hay que marcar aparte la
> casilla del campo `messages`. Si no, Meta acepta la URL, no da ningún error, y **nunca te
> llega un solo mensaje**. Si algo no funciona, revisa esto primero.

✅ **Checkpoint 3:** le escribes al número de prueba desde tu celular y aparece una tarjeta
nueva en el CRM.

---

# FASE 7 — Pruebas de extremo a extremo

**Quién:** los dos · **Tiempo:** 1 hora

Recorrer el árbol completo del bot con el número de pruebas:

| # | Prueba | Resultado esperado |
|---|---|---|
| 7.1 | Escribir "hola" | Menú de bienvenida `B-00` + lead nuevo en la primera etapa |
| 7.2 | Responder `1` | Menú de portátiles `B-01` |
| 7.3 | Responder `1` otra vez | Llega el **catálogo en PDF** |
| 7.4 | Enviar un código (`100-102-1013-6`) | Ficha con **fotos y video** + etapa → *En Conversación* |
| 7.5 | Enviar "info del 100-102-1013-3" | Reconoce el código dentro de la frase |
| 7.6 | Recorrer la cotización `C-00`→`C-03` | Guarda nombre, producto y cantidad en el lead |
| 7.7 | Escribir `9` | Bot pausado (`Pausar bot = true`) + etapa → *Negociación* |
| 7.8 | Responder desde el CRM | Le llega al celular |
| 7.9 | Adjuntar una foto desde el CRM | Le llega la imagen |
| 7.10 | Arrastrar la tarjeta a *Vendido* | Se guarda en Baserow |

> 🔴 **Trampa #5 — `APP_PUBLIC_URL`:** el motor de flujo la usa para servir el catálogo y las
> fotos, pero **no está definida en `.env.local`**: cae al valor por defecto
> `http://192.168.20.50:3000`, que es una IP de red local. Meta **no puede descargar de ahí**.
> Hay que apuntarla al túnel o el PDF y las fotos no llegarán (pasos 7.3 y 7.4).
> **Es el fallo más probable de toda la migración** — ya lo tengo fichado.

---

# FASE 8 — Producción con el número real

**Quién:** tú · **Tiempo:** 1-3 días (depende de Meta) · **Costo:** dominio + conversaciones

Solo cuando la Fase 7 pase completa.

| # | Paso | Ojo con |
|---|---|---|
| 8.1 | **Verificación del negocio** | Meta pide documento de cámara de comercio o RUT + recibo con la dirección. Tarda 1-3 días. |
| 8.2 | **Liberar el número del local** | 🔴 **Trampa #6:** el número **no puede estar registrado en la app de WhatsApp ni WhatsApp Business.** Hay que **borrar la cuenta desde la app** (no solo desinstalarla). Esto **borra el historial de chats** — avisa al equipo antes. |
| 8.3 | *WhatsApp Manager → Agregar número* | Verificación por SMS o llamada |
| 8.4 | **Nombre para mostrar** | `Ventas Virtuales Colombia`, igual que las redes. Aprobación: minutos a 48 h. |
| 8.5 | **PIN de dos pasos** | 6 dígitos. Guárdalo — sin él no puedes re-registrar el número. |
| 8.6 | Cambiar `number` a la nueva Phone number ID | Yo, en el servidor |
| 8.7 | Túnel con dominio propio | Yo. **No dejes `trycloudflare` en producción.** |

### Lo que cambia respecto a Baileys

| | Baileys (hoy) | Meta oficial |
|---|---|---|
| Escribirle primero a un cliente | Libre | **Solo con plantilla aprobada** |
| Responder dentro de 24 h del último mensaje del cliente | Libre | **Libre** ✅ |
| Riesgo de baneo | Alto | Ninguno |
| Sesión se cae | Sí, seguido | Nunca |
| Costo | $0 | Gratis los primeros 1.000 chats/mes |

> ✅ **Para tu caso esto no cambia nada**: en InventarIA el cliente **siempre escribe primero**
> (llega por catálogo o por las redes), así que toda la conversación cae dentro de la ventana
> libre de 24 horas. Las plantillas solo harían falta si algún día quieres hacer campañas
> saliendo tú a buscar al cliente.

---

## Resumen: quién hace qué

| Fase | Quién | Tiempo | Bloqueante |
|---|---|---|---|
| 1. Identidad en Meta | **Tú** | 30 min | — |
| 2. App + número de pruebas | **Tú** | 15 min | Fase 1 |
| 3. Token permanente | **Tú** | 10 min | Fase 2 |
| 4. Túnel HTTPS | **Yo** | 45 min | Decidir dominio |
| 5. Instancia Meta en Evolution | **Yo** | 15 min | Fases 3 y 4 |
| 6. Webhook | **Los dos** | 20 min | Fase 5 |
| 7. Pruebas end-to-end | **Los dos** | 1 h | Fase 6 |
| 8. Número real | **Tú** | 1-3 días | Fase 7 completa |

**Camino crítico:** Fases 1→2→3 son todas tuyas y suman ~1 hora. Ese es el arranque.
Mientras las haces, yo puedo dejar el túnel listo.

---

## Las 6 trampas, en una sola lista

Cuando algo falle, revisa en este orden:

1. 🔴 **Token de 24 h** — "ayer funcionaba". Usa el permanente de la Fase 3.
2. 🔴 **Usuario del sistema sin la WABA asignada** — token válido pero sin permisos.
3. 🔴 **Túnel rápido en producción** — la URL cambia y los mensajes dejan de llegar en silencio.
4. 🔴 **No suscribirse al campo `messages`** — webhook "guardado" pero nunca entra nada.
5. 🔴 **`APP_PUBLIC_URL` apuntando a IP local** — el catálogo y las fotos no salen.
6. 🔴 **Número ya registrado en la app de WhatsApp** — hay que borrar la cuenta primero, y eso borra el historial.

---

## Qué hago yo ahora mismo

- [x] Commitear el proyecto (43 días sin versionar) — **hecho**
- [x] Endurecer `.gitignore` (credenciales, `.bak`, fotos de clientes) — **hecho**
- [x] README completo con CRM y las tres tablas — **hecho**
- [ ] Definir `APP_PUBLIC_URL` en `.env.local` (trampa #5)
- [ ] Montar el túnel de Cloudflare (Fase 4) — **esperando tu decisión sobre el dominio**
- [ ] Crear la instancia `ventas-meta` — esperando tus datos de la Fase 3

## Qué necesito de ti

1. Los **handles oficiales** de Facebook e Instagram del negocio (para la tabla de datos).
2. La decisión de **dominio propio vs túnel rápido** para arrancar.
3. Cuando termines la Fase 3: avísame y yo sigo con la 4 y 5. **No me pegues el token en el
   chat** — lo pones tú en el `.env.local` o me dices y te doy el comando exacto.

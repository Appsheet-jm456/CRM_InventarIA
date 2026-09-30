# Pendientes y dónde retomar

**Última sesión:** 30 sep 2026 · **Fase actual:** Fase 3 (Implementación) empezando por **F3·1**, con pendientes
de las Fases 1 y 2 abajo. **Código nuevo:** el bot de prueba sobre Supabase (`herramientas/`) y las migraciones
0001–0004. La app nueva **CRM InventarIA** corre en **http://100.114.72.43:8096** (`crm/`, decisión 0017). La v0 sigue viva en el 3000 sin tocar.

## Dónde retomar (en este orden)

1. **F3·1 a F3·10 hechas** (30 sep 2026): la construcción de la Fase 3 está completa. Para cerrarla falta revisar su
   criterio (RLS en todo, `next build` sin errores) y pasar a la Fase 4 (pruebas con el dueño).
2. **Mejoras (F4·4 en adelante), módulo por módulo.** Primero **Bot y horario** (decisión 0026,
   [FLUJO-DEL-BOT.md](FLUJO-DEL-BOT.md)): ✅ F4·4 vista previa real y límites (migración 0010) → ✅ F4·5 flujo en la base (migración 0011) → ✅ F4·6 lienzo (migraciones 0012 y 0013) →
   ✅ F4·7 borrador, publicar e historial (migración 0014) → F4·8 simulador. Los pasos que no son mensajes (inventario, ficha, catálogo, asesor) son cuadros del sistema fijos (supuesto de la
   0026; el dueño siguió con él).
3. **Pendiente del dueño en F3·9:** subir las fotos de los equipos (hoy los 17 están sin foto), los catálogos PDF y el
   enlace de Drive con todos, desde Inventario → Catálogos.
3. **Pendiente del dueño en F3·6:** aprobar los textos de las 3 plantillas del CRM y enviarlas a
   Meta desde Configuración → Canal WhatsApp (hoy solo hay plantillas de ejemplo en inglés).
3. En paralelo, lo que depende del dueño: F1·4 (deploy key), F1·6, F1·7, F1·8, clave de Gemini, PDF y enlace de Drive, hoja Excel.

## Estado de las tareas de la Fase 1

| Tarea | Estado | Qué falta |
|---|---|---|
| F1·1 Flujo de atención · F1·2 Etapas · F1·3 Metas y SLA | ✅ Hechas | — |
| **F1·4** Subir commits a GitHub | 🔴 Bloqueada | El dueño debe pegar la llave pública de abajo en GitHub → `Appsheet-jm456/inventaria` → Settings → Deploy keys, con **write access**. Después: `git push inventaria main` |
| **F1·5** Trámites en Meta | 🔵 En curso | ✅ App *Futur Green bot* (portafolio Futur Green) con número de prueba +1 555 190 4296 · ✅ token permanente en `.env.meta` (no vence) · ✅ envío desde el servidor · ✅ **webhook de prueba de ida y vuelta** (recibe, responde, firma validada, estados de entrega). Falta: verificar el negocio y el número real |
| **F1·6** Confirmar precios de Meta del 1 oct 2026 | Pendiente | Solo hay fuentes de terceros; la documentación oficial no lo muestra. Confirmar en WhatsApp Manager y Billing Hub, y agregar medio de pago |
| **F1·7** Ramas del árbol sin definir | Pendiente | Las define el dueño: Torres Tiny, SFF, Partes, Distribuidores, Servicio al cliente. Mientras tanto van a asesor |
| **F1·8** Qué equipo es Hogar, Ejecutivo o Diseño | Pendiente | El inventario no tiene ese dato: deducirlo (procesador, RAM) o agregar un campo |
| **F1·9** Tipo de chat del MVP (P-11) | Pendiente | Guiado, guiado + agente, o híbrido. Elegir agente o híbrido obliga a revisar la decisión 0005 |

Llave pública de despliegue (`~/.ssh/inventaria_deploy_ed25519.pub`, alias SSH `github-inventaria`):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIONAxvcI3oR3igFtPME4BMX2UWaT1Ju6LFxZQosRf0GN inventaria-deploy@atlasjm
```

## App nueva CRM InventarIA (F3·1, 30 sep 2026)

- **Editor del bot, horario y respuestas rápidas (F3·7, decisión 0023, [BOT-Y-HORARIO.md](BOT-Y-HORARIO.md)):**
  `/bot` edita textos y títulos de botones (no la estructura; restaura el original) y el horario con festivos;
  el bot los lee de la base cada 30 s y, fuera de horario, avisa al pasar a asesor cuándo le responden.
  `/respuestas-rapidas` y el atajo `/` en la Bandeja. Migración 0007. Hay que sembrar los festivos de 2028 (la app avisa).

- **Inventario, catálogos y Chat InventarIA (F3·9, decisión 0025, [INVENTARIO.md](INVENTARIO.md)):** `/inventario`
  con filtros, ficha (con la vista de cómo la ve el cliente), crear y editar con **foto subida** (bucket `productos`; el
  bot la sube a Meta y la envía por id, reutilizado 25 días), **carga del Excel con vista previa** (función
  `cargar_inventario`, que también usa el script de consola) y **Catálogos** (PDF o Drive). `/chat` pregunta al
  inventario con el intérprete del bot por `POST /interno/buscar` del receptor (token `CRM_INTERNO_TOKEN` en
  `.env.meta` y `crm/.env.local`; no responde por el túnel). Escribir pide `administrar_inventario`. Migración 0009.
  **Ojo:** no correr `next dev` en `crm/` con el servicio arriba: comparte `.next` y rompe la app hasta el próximo build.

- **Métricas (F3·8, decisión 0024, [METRICAS.md](METRICAS.md)):** `/metricas` abre en el mes actual con selector de
  período y embudo: conversión por etapa, primera respuesta en SLA, ganadas y perdidas con motivos, sin respuesta ahora,
  entrega de mensajes y tabla por asesor (el asesor ve solo lo suyo). Cada paso a la cola queda en `atenciones`. El
  receptor guarda cada estado de Meta (`estados_meta`) y la Bandeja muestra ✓ / ✓✓ / ✓✓ azul / ✗. Consumo de Meta del mes
  contra los 1.000 gratis, con aviso al 80 % en Métricas e Inicio; **sin pesos hasta F1·6**. Migración 0008, 16 pruebas
  en `supabase/pruebas/` (`supabase/migrar.sh --probar`).

- Código en `crm/` (Next.js 14 + TypeScript, copia del esqueleto de Futur Green). **http://100.114.72.43:8096**
  (Tailscale) o `http://192.168.20.50:8096` (decisión 0017; hasta F3·5 corrió en el 3020).
- **Bandeja, Embudo y Etapas (F3·5, decisión 0020, [BANDEJA-Y-EMBUDO.md](BANDEJA-Y-EMBUDO.md)):** cola, tomar,
  devolver, asignar, cerrar, devolver al bot, responder por Meta (solo dentro de 24 h), media del cliente,
  embudo por arrastre y etapas editables. Tiempo real con Supabase Realtime (el navegador llega a la API por
  `<ip>:8020`). La cookie de sesión tiene nombre fijo (`sb-crm-inventaria-auth-token`).
- **Seguimientos, SLA y plantillas (F3·6, decisión 0021, [SEGUIMIENTOS-Y-SLA.md](SEGUIMIENTOS-Y-SLA.md)):**
  seguimientos que solo recuerdan al asesor; SLA en minutos hábiles (`horario_atencion` y `festivos` 2026–2027,
  hay que sembrar los de 2028); avisos con sonido y notificación (botón 🔔 Avisos en la Bandeja) y contador junto a
  Bandeja; fuera de 24 h se responde con plantilla aprobada. Las fechas que escribe el asesor son hora de Colombia.
- **Varios embudos (F3·10, decisión 0022, [EMBUDOS.md](EMBUDOS.md)):** Cliente Final, Pos Venta y Distribuidor, cada
  uno con sus etapas. Cada cliente tiene una **oportunidad** por embudo (una abierta a la vez). El bot la abre por la
  opción del menú (etiquetas `Interes-Productos`, `Interes-Distribuidor`, `Interes-Soporte`) y solo mueve Cliente
  Final hacia adelante; `leads.etapa` quedó como la etapa del bot. El tablero, la ficha y el Inicio leen `oportunidades`.
- Servicio `crm-inventaria-app` (usuario atlasjm, arranca solo): `systemctl --user status crm-inventaria-app`.
  Copia de la unidad en `crm/systemd/`. Tras cambiar código: `cd crm && npx next build && systemctl --user restart crm-inventaria-app`.
- Secretos en `crm/.env.local` (fuera de git, plantilla en `crm/.env.example`).
- Se entra con **usuario** (se guarda como `<usuario>@inventaria.local`). Primer admin: `supabase/crear-admin.sh`;
  los demás desde Configuración → Usuarios. Roles y permisos: [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md).
- Probado: RLS (anon sin acceso, asesor sin leads/mensajes ni escritura, salvaguardas del admin) y en navegador
  (login, clave mala, panel por rol, Usuarios, Roles, módulos en construcción). Usuarios QA borrados.

## Conexión con Meta (probada el 30 sep 2026)

- **Datos en `.env.meta`** (no se commitea): `META_TOKEN` (usuario del sistema `crm-bot`, no vence),
  `META_APP_ID`, `META_WABA_ID`, `META_PHONE_NUMBER_ID`, `META_APP_SECRET` y `META_VERIFY_TOKEN`.
- **Receptor de prueba:** `herramientas/meta-webhook-prueba/receptor.py` en el puerto 8095, más
  `~/.local/bin/cloudflared tunnel --url http://127.0.0.1:8095`. La URL de `trycloudflare` **cambia en cada
  reinicio**: al levantarlo de nuevo hay que pegarla otra vez en Meta → WhatsApp → Configuración → Webhook.
  El registro (`eventos.log`) tiene teléfonos y mensajes y no se commitea.
- **Lecciones:** (1) al generar un token hay que marcar la cuenta de WhatsApp o sale "object does not exist";
  (2) un texto libre solo se entrega si el cliente escribió en las últimas 24 h, y si no, Meta lo descarta en
  silencio (solo avisa por el webhook); (3) la app debe estar suscrita a la WABA (`POST /{WABA}/subscribed_apps`)
  además de tener el webhook verificado.

## Supabase del CRM (montado el 30 sep 2026, decisión 0013)

- **Instancia `crminventaria-supabase`** en `supabase/` (copia del montaje de Futur Green, claves propias en
  `supabase/.env`, fuera de git). API y **Studio en http://192.168.20.50:8020** (usuario `supabase`, contraseña
  `DASHBOARD_PASSWORD` de `supabase/.env`). Base: `:5434` (sesión) y `:6545` (transacción).
  - Levantar o revisar: `cd supabase && docker compose up -d` · `docker compose ps`
  - Migraciones: `supabase/migrations/NNNN_*.sql`, se aplican con `bash supabase/migrar.sh`.
- **Modelo actual (0001–0003):** `productos`, `etapas`, `leads`, `mensajes`, `catalogos` y usuarios/roles/permisos.
  `leads` y `mensajes` sin políticas (solo el servidor con `SERVICE_ROLE_KEY`) hasta F3·5.
- **Inventario (desde el 30 sep, F3·2):** Supabase manda. **Baserow ya no se copia** (timer `crm-sync-inventario`
  apagado). Se cambia con la hoja [plantillas/inventario.xlsx](plantillas/inventario.xlsx) y `cargar_inventario.py`.
- **Datos de prueba (decisión 0019):** los 17 equipos, los clientes y los mensajes que hay son de prueba. Antes de
  arrancar con lo real: `python3 herramientas/datos-prueba/borrar_datos_prueba.py` (muestra), `--probar` (borra y
  deshace) y `--borrar` (respalda en `respaldos/`, pide escribir BORRAR). Después se carga la hoja real.
  Evolution estaba vacío (0 chats): no hubo historial que migrar.

## Demo del bot por WhatsApp (dejada lista el 30 sep 2026)

El árbol de respuesta corre sobre el **número de prueba de Meta (+1 555 190 4296)** con el inventario en vivo
de Baserow, y refleja cada cliente en el **kanban de la v0 (puerto 3000)**. Es una prueba, no la app nueva.

- **Servicios** (usuario `atlasjm`, arrancan solos con el servidor, `Linger=yes`):
  `crm-meta-receptor` (receptor en 127.0.0.1:8095) y `crm-meta-tunel` (túnel de Cloudflare que **registra solo
  su URL nueva en Meta** cada vez que arranca). Copia de las unidades en `herramientas/meta-webhook-prueba/systemd/`.
  - Estado: `systemctl --user status crm-meta-receptor crm-meta-tunel`
  - Reiniciar: `systemctl --user restart crm-meta-receptor crm-meta-tunel`
  - Conversaciones: `tail -f herramientas/meta-webhook-prueba/eventos.log` · URL actual: `tunel-url.txt`
  - **No apagarlos:** el receptor es hoy el canal de la app (recibe, responde con el bot y guarda los mensajes).
- **Visor de conversaciones:** apagado en F3·5; lo reemplazó la Bandeja de la app en el mismo 8096.
- **Quién puede probar:** solo números verificados en Meta → Tests de la API → paso 3 (máximo 5). Un número
  sin verificar escribe, pero Meta no le entrega las respuestas.
- **Reiniciar una charla:** escribir `reiniciar` (también quita la pausa de asesor). `hola` o `menu` vuelven al inicio.
- **Datos en Supabase (desde el 30 sep, decisión 0014):** el bot lee `productos` y guarda cada cliente en
  `leads` (etapa, datos del árbol, etiquetas, estado del bot) y cada mensaje en `mensajes`. **Un reinicio ya no
  borra dónde iba cada cliente.** El kanban de la v0 (Baserow) dejó de reflejarlos: la Bandeja (8096) los muestra.
- **Texto libre (decisión 0016):** `interprete.py` — reglas (marca, i3–i9, generación, RAM, montos, "palos",
  uso, "quiero comprar") y, si no alcanzan, Gemini (falta clave `AIza…`) o qwen3 local (10–12 s, el bot avisa
  "Estoy buscando…"). La respuesta siempre sale de `productos`.
- **Catálogos (decisión 0015):** tabla `catalogos` y bucket privado `catalogos`; el bot envía el más específico
  para la marca y categoría y el enlace de Drive con todos. **Vacía hasta recibir los PDF y el enlace.**
- **Carga de la lista por Excel (F2·14):** `python3 herramientas/carga-inventario/cargar_inventario.py lista.xlsx`
  (muestra cambios) y `--aplicar` (escribe). Plantilla con las columnas: `docs/plantillas/inventario.xlsx`.
- **Hallazgos de la prueba del 30 sep:** 1) montos escritos en el presupuesto, 2) "quiero comprar" en la ficha y
  3) el contador de errores que no volvía a 0 — **corregidos**. 4) Ningún equipo tiene foto: las fichas salen sin imagen.

## Estado del repositorio

- Rama `main`, **21 commits sin subir** a `inventaria` (más el del bloque F2·5/F2·9). Remoto `inventaria` →
  `git@github-inventaria:Appsheet-jm456/inventaria.git` (el dueño eligió este). El remoto `origin`
  (`chat_bot-inventario`) no se tocó y sigue con el último fetch del 24 jun.
- Autor de los commits: `Appsheet-jm456`. **Push solo con autorización.**
- Los `.bak` (uno con credenciales) se borraron; nunca estuvieron en git.

## Qué se decidió (resumen; el detalle está en `docs/decisiones/`)

| # | Decisión |
|---|---|
| 0003 | **Supabase propio en este servidor**, separado de Futur Green (no Supabase Cloud) |
| 0008 | Reconstruir por fases (SDLC); la v0 sigue viva hasta el corte |
| 0009 | Frontend con la arquitectura de Futur Green: **panel lateral plegable**, una ruta por módulo |
| 0010 | **API oficial de Meta** en el MVP; Evolution solo en la v0. Reemplaza a la 0004. Webhook por túnel de Cloudflare con dominio propio |
| 0011 | Precios de Meta desde el 1 oct 2026: **un mensaje por respuesta**, contador de consumo. Cifras sin confirmar |
| 0012 | Bot guiado **conectado a la base**: catálogo y fichas salen de la tabla de productos; cola compartida; SLA 10 min (alerta a los 15); L–V 8–18, Sáb 9–14, festivos cerrado |

Otras reglas ya fijas: bot sin IA libre hasta que P-11 diga otra cosa (0005); el embudo solo avanza (0006);
7 etapas (Nuevo, En Conversación, Cotización, Negociación, Confirmar transfer, Vendido, Perdido);
presupuesto en 4 rangos según el inventario (<$1 M, $1–1,5 M, $1,5–2 M, >$2 M).

## Documentos clave

| Archivo | Para qué |
|---|---|
| [00-BRIEF.md](00-BRIEF.md) | Alcance, problema, riesgos y stack del CRM nuevo (v1.0) |
| [ARBOL-DE-RESPUESTA.md](ARBOL-DE-RESPUESTA.md) | El árbol del Salesbot adaptado, campos, etapas y puntos P-01 a P-11 |
| [SIMULACION-CHAT.md](SIMULACION-CHAT.md) · [simulacion/](simulacion/simulacion-chat.html) | Prototipo del chat guiado y del tipo agente; aprobado, se va a perfeccionar (F2·12) |
| [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md) | Roles, permisos y RLS de la app nueva (F2·5, decisión 0018) |
| [ARQUITECTURA-FRONTEND.md](ARQUITECTURA-FRONTEND.md) | Carpeta `crm/`, puertos, `Shell` y lista de módulos (F2·9, decisión 0017) |
| [PLAN-META-API.md](PLAN-META-API.md) | Trámites en Meta paso a paso (sección de costos ya corregida) |
| [BRIEF.md](BRIEF.md) | La v0 (referencia de lo que se reutiliza) |
| [sdlc/](sdlc/) | Las 5 fases con su criterio de cierre |

## Notion

- Página **"CRM InventarIA"** bajo la página padre compartida (junto a Futur Green y ClaudePyme):
  <https://app.notion.com/p/CRM-InventarIA-3ea9ea128ea081c9a0d7fd8035fddf18>. Tiene Fases (5), Tareas (40),
  Brief v1.0, Decisiones técnicas (12), Árbol de respuesta y Simulación del chat.
- Token en `.env.notion` de este repo (no se commitea). Sincronizar: `python3 docs/notion/sincronizar.py --todo`
  (solo con cambios estructurales).
- **El sincronizador empareja las tareas por título.** Si se renombra una, primero se renombra en Notion con
  un `PATCH`, o se duplica. Antes de tocar `tareas.csv`, comparar con Notion: el dueño también edita ahí.
- Falta crear **a mano** las vistas de la base de Tareas (Tablero por Estado, Bloqueadas, Por fase): la API
  de Notion no las crea.
- Cerrar una tarea = un `PATCH` a su fila, no el script.

## Cosas que conviene saber

- El bot solo es tan exacto como la base: cuando se vende un equipo hay que descontar el stock en el acto,
  o el bot seguirá ofreciéndolo. Sin registrar como regla del negocio todavía (proponer en F2·1).
- En la v0 cada mensaje lee todos los leads de Baserow; por eso se reconstruye. No invertir en mejorarla.
- El inventario real (17 portátiles, todos Dell, todos usados) tiene códigos de tres formatos:
  `100-102-1041`, `100-102-1007-3` y `PU-23`. El reconocimiento debe validar contra la base, no con un patrón fijo.
- Baserow responde 403 a `urllib` de Python; usar `curl`.
- Puertos ocupados en el servidor: 3000 (v0), 5432/5433/6543/6544/8000/8010/8443 (Supabase de otros proyectos),
  5678 (n8n), 7580 (Nextcloud), 8088 (Evolution). La Supabase del CRM necesita puertos libres (F2·8).

## Forma de trabajo acordada

Documentar primero como tareas, **preguntar las dudas con opciones** y solo después construir; ejecutar en
serie en esta misma sesión, commit por bloque terminado. Responder siempre en español.

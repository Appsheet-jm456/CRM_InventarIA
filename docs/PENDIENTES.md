# Pendientes y dónde retomar

**Última sesión:** 30 sep 2026 · **Fase actual:** Fase 3 (Implementación) empezando por **F3·1**, con pendientes
de las Fases 1 y 2 abajo. **Código nuevo:** el bot de prueba sobre Supabase (`herramientas/`) y las migraciones
0001–0002. La app nueva **CRM InventarIA** nace en `crm/` (decisión 0017). La v0 sigue viva en el 3000 sin tocar.

## Dónde retomar (en este orden)

1. **F3·1 Esqueleto: login, panel, usuarios y roles** — diseño listo en
   [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md) (F2·5) y [ARQUITECTURA-FRONTEND.md](ARQUITECTURA-FRONTEND.md)
   (F2·9). Pasos: migración 0003 → app en `crm/` (puerto 3020) → Usuarios y Roles → `next build` → servicio.
2. Luego F3·2 a F3·9 en orden. En **F3·5** la app pasa al puerto **8096** y el visor de Python se apaga.
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
- **Modelo actual (0001):** `productos`, `etapas` y `leads`, espejo de Baserow con tipos corregidos y RLS sin
  políticas (solo el servidor con `SERVICE_ROLE_KEY`).
- **Inventario:** se edita en Baserow y se copia cada 5 min (`systemctl --user list-timers crm-sync-inventario`,
  registro con `journalctl --user -u crm-sync-inventario`). A mano:
  `python3 herramientas/sync-baserow/sincronizar_inventario.py [--revisar]`.
- **Siguiente:** mover el bot de prueba a leer `productos` y escribir `leads` en Supabase (después de la demo,
  porque el kanban de la v0 lee Baserow) y completar el modelo del diseño (F2·2).

## Demo del bot por WhatsApp (dejada lista el 30 sep 2026)

El árbol de respuesta corre sobre el **número de prueba de Meta (+1 555 190 4296)** con el inventario en vivo
de Baserow, y refleja cada cliente en el **kanban de la v0 (puerto 3000)**. Es una prueba, no la app nueva.

- **Servicios** (usuario `atlasjm`, arrancan solos con el servidor, `Linger=yes`):
  `crm-meta-receptor` (receptor en 127.0.0.1:8095) y `crm-meta-tunel` (túnel de Cloudflare que **registra solo
  su URL nueva en Meta** cada vez que arranca). Copia de las unidades en `herramientas/meta-webhook-prueba/systemd/`.
  - Estado: `systemctl --user status crm-meta-receptor crm-meta-tunel`
  - Reiniciar: `systemctl --user restart crm-meta-receptor crm-meta-tunel`
  - Conversaciones: `tail -f herramientas/meta-webhook-prueba/eventos.log` · URL actual: `tunel-url.txt`
  - Apagar después de la demo: `systemctl --user disable --now crm-meta-tunel crm-meta-receptor`
- **Visor de conversaciones:** `http://192.168.20.50:8096` (red local; usuario cualquiera, contraseña =
  `ACCESS_PASSWORD` de la app). Muestra el chat con burbujas, la etapa, el nodo y los datos guardados, y se
  actualiza solo. Va en otro puerto que el túnel no expone. Las conversaciones quedan en `conversaciones.jsonl`
  (fuera de git). El panel de la v0 no puede mostrarlas: las pide a Evolution.
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
  (muestra cambios) y `--aplicar` (escribe). Al usarla por primera vez hay que apagar la copia desde Baserow:
  `systemctl --user disable --now crm-sync-inventario.timer`.
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

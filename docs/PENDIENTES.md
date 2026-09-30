# Pendientes y dónde retomar

**Última sesión:** 30 sep 2026 · **Fase actual:** 1 de 5 (Planeación) · **Código nuevo escrito:** ninguno
(todo el trabajo fue documentación, decisiones y una simulación). La v0 sigue viva en el puerto 3000
sin tocar.

## Dónde retomar (en este orden)

1. **Registrar la llave de despliegue en GitHub** (la hace el dueño) y subir los commits. Tarea F1·4.
2. **Cerrar la Fase 1**: faltan F1·5 a F1·9 (abajo).
3. **Abrir la Fase 2** (Diseño): empezar por F2·8 (levantar Supabase) y F2·2 (modelo de datos).

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

## Estado del repositorio

- Rama `main`, **11 commits sin subir** (5 de la v0, 6 de esta sesión). Remoto `inventaria` →
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

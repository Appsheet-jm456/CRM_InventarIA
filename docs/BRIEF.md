# InventarIA — Brief del proyecto

> **Última revisión:** 25 de julio de 2026
> **Versión visual:** [`docs/brief.html`](./brief.html) — incluye una demo interactiva del bot.

Inventario, chat con IA y embudo de ventas para **Ventas Virtuales Colombia**
(distribuidores al por mayor y detal de equipos de cómputo, enfocados en portátiles usados).

Next.js 14 sin dependencias fuera de `next`/`react`, que conecta el inventario en Baserow,
un bot de WhatsApp de menú fijo y un CRM tipo kanban donde el equipo toma el control de la
conversación cuando el cliente pide un asesor.

**En números:** ~3.375 líneas · 14 rutas de API · 4 proveedores de IA · 0 dependencias extra.

---

## 1. Cómo llega un cliente

El cliente escribe al WhatsApp del local. Evolution API recibe el mensaje y lo pasa al motor
de flujo, que responde con un **menú numerado — nunca con IA libre**, para que el bot no
improvise precios. Cada mensaje crea o actualiza una tarjeta en el CRM. Cuando el cliente
marca `9`, el bot se pausa solo para ese número y un asesor continúa desde el mismo panel.

---

## 2. Arquitectura

Dos caminos de entrada, una sola base de datos. El personal entra por el navegador; el cliente
entra por WhatsApp. Ambos leen y escriben en las mismas tablas de Baserow, así que el stock que
ve el bot es el mismo que ve el vendedor.

| Camino | Ruta | Qué hace |
|---|---|---|
| Cliente → WhatsApp | Evolution API → n8n → `/api/whatsapp-flow` | Evolution corre el número y guarda el historial en su propio Postgres. n8n reenvía cada mensaje entrante al motor de flujo con la clave de acceso en la cabecera. |
| Personal → Navegador | `app/page.js` (3 pestañas) | Dashboard de inventario, chat con IA y CRM. Una clave para leer, otra distinta para escribir. |
| Datos → Baserow | 3 tablas, API por token | `Inventario` (código, specs, precio, stock, fotos, video), `CRM_Etapas` (columnas del kanban), `CRM_Leads` (cliente, etapa, paso del menú). |

### La IA es opcional y reemplazable

El chat interno acepta cuatro proveedores tras una sola función (`lib/gemini.js`):
**Ollama** local (sin costo por token), **Gemini**, cualquier API **compatible con OpenAI**
(incluida DeepSeek) y **Anthropic**. El modelo elegido en la interfaz manda sobre `AI_PROVIDER`,
así que se puede probar uno en la nube sin tocar la configuración.

El bot de WhatsApp, en cambio, **no usa IA a propósito**: responde por menú fijo.

---

## 3. Módulos

| Módulo | Archivo | Líneas | Qué hace |
|---|---|---:|---|
| CRM | `app/components/CRM.js` | 835 | Kanban con arrastre entre etapas, vista de lista, búsqueda y filtro por atención (bot/humano). Al abrir una tarjeta se ve la conversación real de WhatsApp traída desde Evolution, con botón para tomar el control, responder y adjuntar fotos. |
| Motor de flujo | `lib/whatsappFlow.js` | 256 | Árbol de menús numerados con estado por cliente. Reconoce un código de producto dentro de una frase, devuelve la ficha con fotos y video, y arma cotizaciones en cuatro preguntas. |
| Dashboard | `app/components/Dashboard.js` | 344 | Tabla de inventario con filtros por categoría, marca y procesador, paginación y modal de detalle. |
| Acciones | `app/components/Actions.js` | 315 | Agregar producto, cambiar precio, ajustar stock, registrar venta. Protegido con `ACTION_PASSWORD`, separada de la de lectura. |
| Chat InventarIA | `app/components/Chat.js` | 117 | Consulta el stock en lenguaje natural, con selector de modelo. Tiene camino rápido sin IA para consultas por código. |
| Capa de datos CRM | `lib/crm.js` | 311 | Etapas creables desde la app sin tocar el esquema de Baserow. Renombrar una etapa arrastra a sus leads; borrarla obliga a reasignarlos antes. |
| Evolution | `lib/evolution.js` | 129 | Lee y envía mensajes/media de WhatsApp. Maneja el detalle de Baileys: el bot usa `remoteJid`, el cliente usa `remoteJidAlt`. |
| Media | `lib/media.js` | 52 | Parsea los campos de foto y video del inventario. |

---

## 4. Embudo de ventas

Un lead nuevo entra siempre en la primera etapa. El flujo lo empuja solo cuando el cliente hace
algo que lo merece. **El embudo solo avanza: nunca retrocede a una etapa anterior por sí solo.**

| Etapa | Color | Se llega cuando |
|---|---|---|
| Nuevo | Gris | Escribió por primera vez |
| En Conversación | Azul | Pidió catálogo o vio una ficha |
| Cotización | Amarillo | Está llenando el formulario |
| Negociación | Naranja | Quiere comprar → pasa a asesor |
| Confirmar transfer | Morado | Esperando el pago |
| Vendido | Verde | Cerrado |
| Perdido | Rojo | Con motivo registrado |

Motivos de pérdida: precio, sin respuesta, no calificado, compró en otro lado, solo preguntaba, otro.
Las etapas se crean y renombran desde la app.

### Árbol del bot (estados guardados por cliente en `Paso menu`)

| Estado | Qué es |
|---|---|
| `B-00` | Bienvenida. Solo una opción real: portátiles. |
| `B-01` | Menú de portátiles. |
| `B-01B` | Envía el catálogo en PDF y espera un código. |
| `P-01` | Ya vio una ficha. Menú de cinco salidas. |
| `C-00` → `C-03` | Cotización: nombre, código, cantidad, presupuesto. |
| `9` / "asesor" | Pausa el bot para ese número, desde cualquier punto. |

Atajo global: si el mensaje contiene un código válido (aunque venga dentro de una frase,
"info del 100-102-1013-3"), muestra la ficha sin importar en qué paso esté el cliente.

---

## 5. Estado al 25 de julio de 2026

### ⚠️ La última actualización real no está en git

El último commit es del **30 de junio** (`67025b5`). Todo el CRM y toda la integración con
WhatsApp se escribieron después, el **14 de julio**, y siguen sin commitear:
**11 archivos o carpetas nuevos** y **3 modificados**.

**Sin commitear:**

```
app/components/CRM.js             nuevo
app/api/crm/ (8 rutas)            nuevo
app/api/whatsapp-flow/route.js    nuevo
app/api/uploads/[name]/route.js   nuevo
lib/crm.js                        nuevo
lib/whatsappFlow.js               nuevo
lib/evolution.js                  nuevo
lib/media.js                      nuevo
public/ · uploads/                nuevo
app/page.js                       modificado
app/globals.css                   modificado
lib/gemini.js                     modificado
```

### Línea de tiempo

| Fecha | Hito |
|---|---|
| 24 jun 2026 | Base del proyecto: chat de inventario + camino rápido sin IA. |
| 29–30 jun 2026 | **Último commit.** Dashboard con filtros, selector de modelos, acciones de escritura, tema claro/oscuro. |
| 14 jul 2026 | **CRM completo + bot de WhatsApp — sin commitear.** Kanban de leads, conversación embebida, envío de fotos, motor de menús, catálogo en PDF, handoff a humano. |

### Otros puntos

- **Configuración:** las 21 variables de `.env.local` están puestas (Baserow, las dos tablas del CRM, Evolution, las dos claves de acceso y los cuatro proveedores de IA).
- **Servidor:** 16 núcleos, 32 GB de RAM, 42 GB libres. Carga en 0,14 — sobra máquina para Ollama local y Evolution al tiempo.
- **Despliegue:** el `README.md` todavía apunta a Vercel, pero el flujo real usa una URL de red local (`APP_PUBLIC_URL`) para servir el catálogo y las fotos. Esa parte de la documentación quedó vieja.

---

## 6. Por dónde seguir

1. **Commitear el CRM y el bot.** Es lo único urgente. Antes, revisar que `.gitignore` deje fuera `uploads/` (fotos de clientes) y confirmar que `.env.local` no entre al repositorio.
2. **Borrar los `.bak`.** Quedaron `lib/crm.js.bak`, `lib/gemini.js.bak` y `.env.local.bak` de las últimas ediciones. Con el historial en git dejan de hacer falta — y el `.env.local.bak` tiene credenciales.
3. **Actualizar el `README.md`.** Hoy describe solo el chat de inventario. No menciona el CRM, el bot de WhatsApp, Evolution ni las dos tablas nuevas, que son más de la mitad del proyecto.
4. **Ampliar el árbol del menú.** El bot solo ofrece portátiles usados. La estructura ya está lista para colgar más categorías del nodo `B-00` sin tocar el motor.

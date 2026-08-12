# InventarIA

Inventario, chat con IA y **CRM de WhatsApp** para **Ventas Virtuales Colombia** —
distribuidores al por mayor y detal de equipos de cómputo, enfocados en portátiles usados.

Una sola app Next.js 14 que junta tres cosas:

1. **Panel del personal** (navegador): dashboard de inventario, chat con IA y CRM kanban.
2. **Bot de WhatsApp** (clientes): menú numerado fijo que atiende, envía catálogo y fichas.
3. **Base de datos compartida** en Baserow: el stock que ve el bot es el mismo que ve el vendedor.

~3.400 líneas, 14 rutas de API, 4 proveedores de IA y **cero dependencias fuera de `next`/`react`**.

> 📄 Para entender el proyecto a fondo lee **[docs/BRIEF.md](docs/BRIEF.md)** (o `docs/brief.html`,
> con demo interactiva del bot). Este README explica cómo instalarlo y configurarlo.

---

## 1. Cómo funciona

### El cliente llega por WhatsApp

```
Cliente → WhatsApp → Evolution API → n8n → /api/whatsapp-flow → Baserow
                                                  ↓
                                        respuesta por menú fijo
```

El bot responde con un **menú numerado, nunca con IA libre** — así no improvisa precios.
Cada mensaje crea o actualiza una tarjeta en el CRM. Cuando el cliente marca `9` o escribe
"asesor", el bot **se pausa solo para ese número** y un asesor sigue la conversación desde
el mismo panel.

### El personal entra por el navegador

`app/page.js` monta cuatro pestañas tras una pantalla de acceso: **Dashboard**, **Chat IA**,
**Acciones** y **CRM**. Hay **dos claves distintas**: `ACCESS_PASSWORD` para leer y
`ACTION_PASSWORD` para escribir (agregar producto, cambiar precio, ajustar stock, registrar venta).

### La IA es opcional y reemplazable

El chat interno acepta cuatro proveedores detrás de una sola función (`lib/gemini.js`):
**Ollama** local (sin costo por token), **Gemini**, cualquier API **compatible con OpenAI**
(incluida DeepSeek o un `llama-server` propio) y **Anthropic**. El modelo elegido en la interfaz
manda sobre `AI_PROVIDER`, así que puedes probar uno en la nube sin tocar la configuración.
El chat también tiene un **camino rápido sin IA** para consultas por código.

El bot de WhatsApp, en cambio, **no usa IA a propósito**.

---

## 2. Las tres tablas de Baserow

Todo vive en Baserow, accedido por *database token*. Los IDs de tabla van en `.env.local`.

### `Inventario` → `BASEROW_TABLE_ID`

| Columna | Tipo | Notas |
|---|---|---|
| `Código` | Texto | Identificador del equipo (ej. `100-102-1013-6`). El bot lo reconoce dentro de una frase. |
| `Categoría`, `Marca`, `Modelo` | Texto | Filtros del dashboard |
| `Procesador`, `Generación`, `RAM`, `Almacenamiento` | Texto | Specs |
| `Estado` | Texto | Grado del equipo usado |
| `Precio` | Número | Sin puntos ni símbolos — la app lo formatea |
| `Stock` | Número | |
| `Descripción` | Texto | |
| `Foto`, `Video` | Texto | Una o varias URLs separadas por coma. `lib/media.js` convierte links de Google Drive a formato descargable directo; cualquier otro hosting pasa tal cual. |

### `CRM_Etapas` → `CRM_ETAPAS_TABLE_ID`

Las columnas del kanban. **Se crean, renombran y reordenan desde la app**, sin tocar Baserow.

| Columna | Tipo | Notas |
|---|---|---|
| `Nombre` | Texto | Nombre de la etapa |
| `Orden` | Número | Posición en el tablero. La de menor orden es donde entran los leads nuevos. |
| `Color` | Single select | `Gris`, `Azul`, `Amarillo`, `Naranja`, `Morado`, `Verde`, `Rojo` |

Renombrar una etapa **arrastra a todos sus leads**. Borrarla obliga a reasignarlos antes.

### `CRM_Leads` → `CRM_LEADS_TABLE_ID`

Una fila por número de WhatsApp.

| Columna | Tipo | Notas |
|---|---|---|
| `Telefono` | Texto | Clave del lead |
| `Nombre` | Texto | Lo captura el flujo de cotización |
| `Etapa` | **Texto** | Deliberadamente texto, no single select: permite crear etapas nuevas desde la app sin modificar el esquema (los database tokens no pueden alterar campos). |
| `Ultimo mensaje` | Texto | |
| `Fecha ultimo contacto` | Fecha | |
| `Notas` | Texto | |
| `Valor estimado` | Número | |
| `Pausar bot` | Booleano | `true` = un humano tomó el control; el bot no responde a ese número |
| `Paso menu` | Texto | Nodo del árbol donde está el cliente (`B-00`, `B-01B`, `C-02`…) |
| `Cotiz producto`, `Cotiz cantidad` | Texto / Número | Cotización en progreso |
| `Motivo perdido` | Single select | `Precio`, `Sin respuesta`, `No calificado`, `Compró en otro lado`, `Solo preguntaba`, `Otro` |

---

## 3. El embudo de ventas

Un lead nuevo entra siempre en la primera etapa. **El embudo solo avanza: nunca retrocede a una
etapa anterior por sí solo** (un asesor sí puede moverlo a mano).

| Etapa | Color | Se llega cuando |
|---|---|---|
| Nuevo | Gris | Escribió por primera vez |
| En Conversación | Azul | Pidió catálogo o vio una ficha |
| Cotización | Amarillo | Está llenando el formulario |
| Negociación | Naranja | Quiere comprar → pasa a asesor |
| Confirmar transfer | Morado | Esperando el pago |
| Vendido | Verde | Cerrado |
| Perdido | Rojo | Con motivo registrado |

### Árbol del bot

| Estado | Qué es |
|---|---|
| `B-00` | Bienvenida. Una sola opción real: portátiles. |
| `B-01` | Menú de portátiles |
| `B-01B` | Envía el catálogo en PDF y espera un código |
| `P-01` | Ya vio una ficha. Menú de cinco salidas. |
| `C-00` → `C-03` | Cotización: nombre, código, cantidad, presupuesto |
| `9` / "asesor" | Pausa el bot para ese número, desde cualquier punto |

**Atajo global:** si el mensaje contiene un código válido —aunque venga dentro de una frase,
como "info del 100-102-1013-3"— muestra la ficha sin importar en qué paso esté el cliente.

---

## 4. Instalación

Necesitas **Node.js 18+**.

```bash
npm install
```

Luego crea `.env.local` con las variables de la sección 5 y arranca:

```bash
npm run dev
```

Abre `http://localhost:3000`. Sin configurar Baserow arranca en **modo demo** con inventario
de ejemplo; la IA solo responde de verdad cuando pongas una clave.

Para producción:

```bash
npm run build && npm run start
```

---

## 5. Variables de entorno

Todas van en `.env.local` (que **nunca** se commitea).

### Acceso

| Variable | Para qué |
|---|---|
| `ACCESS_PASSWORD` | Clave de **lectura**. La usa el personal para entrar y n8n en la cabecera `x-access-password`. |
| `ACTION_PASSWORD` | Clave **aparte** de escritura (agregar/precio/stock/venta). No mezclarlas. |

### Baserow

| Variable | Para qué |
|---|---|
| `BASEROW_API_TOKEN` | Database token con permiso sobre las tres tablas |
| `BASEROW_TABLE_ID` | ID de `Inventario` |
| `CRM_ETAPAS_TABLE_ID` | ID de `CRM_Etapas` |
| `CRM_LEADS_TABLE_ID` | ID de `CRM_Leads` |
| `BASEROW_API_URL` | Opcional. Por defecto `https://api.baserow.io` |

> El ID de una tabla se ve en su URL: `.../table/123456/...` → `123456`.
> El token se saca en Baserow → tu cuenta → *Database tokens*.

### WhatsApp (Evolution API)

| Variable | Para qué |
|---|---|
| `EVOLUTION_API_URL` | URL de Evolution (ej. `http://127.0.0.1:8088`) |
| `EVOLUTION_API_KEY` | API key global de Evolution |
| `EVOLUTION_INSTANCE` | Nombre de la instancia (ej. `ventas`) |

### App

| Variable | Para qué |
|---|---|
| `APP_PUBLIC_URL` | URL con la que **WhatsApp** descarga el catálogo y las fotos. Debe ser alcanzable desde Evolution. Si no se define, cae a `http://192.168.20.50:3000`. |

### IA (todas opcionales)

| Variable | Para qué |
|---|---|
| `AI_PROVIDER` | Proveedor por defecto: `ollama`, `gemini`, `openai` o `anthropic` |
| `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_NUM_CTX`, `OLLAMA_MAX_PRODUCTS` | Ollama local |
| `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MAX_PRODUCTS` | Cualquier API compatible con OpenAI (incluye un `llama-server` propio y DeepSeek) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Google AI Studio. Si está vacía, Gemini no aparece en el selector y todo sigue con los modelos locales. |

`*_MAX_PRODUCTS` limita cuántos productos se mandan como contexto: menos productos =
respuesta más rápida en hardware modesto.

---

## 6. Estructura

```
app/
  page.js                        pantalla de acceso + 4 pestañas
  layout.js · globals.css        estilos (tema claro/oscuro)
  components/
    Dashboard.js    (344)        inventario con filtros, paginación y modal
    CRM.js          (835)        kanban, conversación embebida, envío de fotos
    Actions.js      (315)        agregar/precio/stock/venta (ACTION_PASSWORD)
    Chat.js         (117)        consulta en lenguaje natural, selector de modelo
  api/
    inventory/                   inventario para el dashboard
    chat/                        chat con IA
    action/                      escrituras protegidas
    models/                      modelos de IA disponibles
    whatsapp-flow/               <- entrada del bot (la llama n8n)
    uploads/[name]/              sirve las fotos que adjunta el asesor
    crm/
      leads/ · leads/[id]/       listar y actualizar leads
      stages/ · stages/[id]/     crear, renombrar, reordenar y borrar etapas
      messages/[numero]/         conversación real desde Evolution
      send/ · send-media/        responder por WhatsApp desde el CRM
      upsert/                    crear/actualizar lead al llegar un mensaje
lib/
  inventory.js    (185)          inventario desde Baserow (o demo)
  gemini.js       (205)          capa única sobre los 4 proveedores de IA
  crm.js          (311)          etapas y leads en Baserow
  whatsappFlow.js (256)          motor del árbol de menús
  evolution.js    (129)          leer/enviar mensajes y media de WhatsApp
  media.js        (52)           normaliza URLs de fotos y video
public/
  catalogo-portatiles-usados.pdf catálogo que envía el bot
uploads/                         fotos enviadas por el asesor (NO se commitea)
docs/
  BRIEF.md · brief.html          punto de retomada del proyecto
```

---

## 7. Despliegue

Hoy la app corre en el **servidor propio** (`atlasjm`) junto a Evolution API, n8n y Ollama,
servida en el puerto `3000` de la red local:

```bash
npm run build && npm run start
```

Evolution y n8n corren en Docker en la misma máquina y llegan a la app por la red interna.

> **Nota:** este proyecto **ya no se despliega en Vercel**. El bot necesita servir el catálogo
> en PDF y las fotos por una URL que WhatsApp pueda descargar (`APP_PUBLIC_URL`), y el CRM lee
> la conversación directamente del Postgres de Evolution — ambas cosas viven en el servidor.

### Conectar el bot

1. Crear la instancia en Evolution y vincular el número.
2. Configurar el webhook de Evolution al workflow de n8n (evento `MESSAGES_UPSERT`).
3. En n8n, reenviar cada mensaje entrante a `POST /api/whatsapp-flow` con la cabecera
   `x-access-password: <ACCESS_PASSWORD>` y cuerpo `{ "numero": "...", "texto": "..." }`.

---

## 8. Seguridad

- **Dos claves separadas**: `ACCESS_PASSWORD` (leer) y `ACTION_PASSWORD` (escribir). No mezclarlas.
- El acceso es por clave compartida, suficiente para uso interno. Si más adelante hace falta
  saber quién consulta, se puede ampliar a usuarios individuales.
- **Nunca commitear** `.env.local`, ningún `.bak` ni `uploads/` (fotos de clientes: son datos
  personales). El `.gitignore` ya los cubre — no lo aflojes.
- La ruta `/api/whatsapp-flow` valida `x-access-password` en cada llamada.

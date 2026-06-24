# InventarIA — Chat de consulta de inventario

Chat web privado (estilo WhatsApp/Telegram) para que el personal del local consulte el inventario
por código, categoría, marca, procesador o generación. Hecho con Next.js, listo para Vercel.

- **Frontend + backend** en un solo proyecto Next.js.
- **IA**: Google Gemini (interpreta lenguaje natural y responde según el stock).
- **Base de datos**: Baserow (o modo demo con datos de ejemplo si aún no lo configuras).
- **Acceso privado** con una clave para el personal.

---

## 1. Probarlo en tu computador (opcional pero recomendado)

Necesitas tener instalado **Node.js 18 o superior**.

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Abre http://localhost:3000. Sin configurar nada, entra con la clave `cambia-esta-clave`
y el chat funcionará en **modo demo** con inventario de ejemplo (la IA solo responde de verdad
cuando agregues tu clave de Gemini).

---

## 2. Conseguir la clave de Gemini (gratis)

1. Entra a Google AI Studio: https://aistudio.google.com/apikey
2. Crea una API key y cópiala.
3. Pégala en `.env.local` en `GEMINI_API_KEY`.

El modelo por defecto es `gemini-2.5-flash`. Si quieres otro, cambia `GEMINI_MODEL`.

---

## 3. Crear el inventario en Baserow

1. Crea una cuenta en https://baserow.io y una tabla llamada, por ejemplo, **Inventario**.
2. Crea estas columnas (los nombres deben coincidir):
   `Código`, `Categoría`, `Marca`, `Modelo`, `Procesador`, `Generación`, `RAM`,
   `Almacenamiento`, `Estado`, `Precio` (número), `Stock` (número), `Descripción`.
3. Carga algunos productos reales.
4. Consigue el **token de la API**: en Baserow ve a tu cuenta → *Database tokens* → crea uno con permiso de lectura sobre esa base.
5. Consigue el **ID de la tabla**: ábrela y míralo en la URL (`.../table/123456/...` → el número es el ID).
6. Pon ambos en `.env.local`:

```
BASEROW_API_TOKEN=tu_token
BASEROW_TABLE_ID=123456
```

> Nota: los precios deben ir como número (sin puntos ni símbolos). La app los formatea sola.

---

## 4. Definir la clave de acceso del personal

En `.env.local`, cambia `ACCESS_PASSWORD` por una clave tuya. Esa es la que escribirá el personal
para entrar al chat.

---

## 5. Desplegar en Vercel

1. Sube este proyecto a un repositorio en GitHub.
2. Entra a https://vercel.com, conéctalo a tu cuenta de GitHub e **importa el repositorio**.
3. En la configuración del proyecto, agrega las **Environment Variables** (las mismas de tu `.env.local`):
   - `ACCESS_PASSWORD`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (opcional)
   - `BASEROW_API_TOKEN`
   - `BASEROW_TABLE_ID`
   - `BASEROW_API_URL` (opcional, por defecto `https://api.baserow.io`)
4. Haz **Deploy**. Vercel te dará un link tipo `https://tu-proyecto.vercel.app`.

Cada vez que cambies algo y lo subas a GitHub, Vercel vuelve a desplegar solo.

---

## Cómo está organizado

```
app/
  page.js            → pantalla de acceso + chat (lo que ve el personal)
  api/chat/route.js  → función serverless: valida la clave, consulta inventario y llama a la IA
  globals.css        → estilos del chat
lib/
  inventory.js       → trae el inventario de Baserow (o usa el de ejemplo) y filtra lo relevante
  gemini.js          → arma la consulta a la IA con el inventario como contexto
```

## Notas de seguridad

El acceso usa una sola clave compartida, suficiente para uso interno. Si más adelante quieres
usuarios individuales, registro de quién consulta o sesiones, se puede ampliar.

# Enlace a la tienda web en las fichas (F4·75)

> **Estado:** 🔵 construida el 13 nov 2026 por pedido del dueño (migración 0085). Falta la prueba del dueño por WhatsApp.

**Pedido del dueño (13 nov 2026):** ya existe la tienda **ventasvirtualcolombia.com**, con páginas de producto, y ahí se van a subir todos
los equipos para ayudar a las ventas. Agregar el enlace de la página web:

1. en la **ficha del equipo** del CRM (Inventario → un equipo);
2. en la **ficha que envía la IA / el bot** por WhatsApp.

Enlace de referencia que dio el dueño: `https://ventasvirtualcolombia.com/productos?categoria=portatil`.

---

## 1. Cómo está la tienda (revisado el 13 nov 2026)

- Cada equipo tiene su página en **`https://ventasvirtualcolombia.com/producto/{código}`** con el **mismo código** del CRM
  (formato `100-102-1141`). Un código que no está publicado responde «Producto no encontrado» (con código 200, no 404).
- La página **`/productos`** lista **todos** los publicados, sin paginar, con enlaces `/producto/{código}`. Hoy hay **1 publicado**
  (`100-102-1141`, que ya no está en el CRM).
- La tienda vive en otro proyecto (`~/ventas-virtuales-web`, otra base de Supabase). El CRM **no** lee su base: solo su página pública.

## 2. Reglas

| # | Regla |
|---|---|
| RTW-01 | Si el equipo **está publicado** en la tienda, la ficha termina con **«🌐 Ver en la web: https://ventasvirtualcolombia.com/producto/{código}»** |
| RTW-02 | Si **no está publicado**, la ficha de un solo equipo termina con **«🛒 Mira más equipos en la web: {catálogo web}»** (por defecto el enlace del dueño, `…/productos?categoria=portatil`). Nunca se envía un enlace a una página que no existe |
| RTW-03 | En una **lista de varios equipos** (Avi), solo los publicados llevan su enlace; los demás no llevan nada (el catálogo de Drive ya va al final) |
| RTW-04 | La lista de publicados se lee de `{tienda}/productos` y se guarda **5 minutos** (bot y CRM). Subir un equipo a la tienda hace que el enlace salga solo, sin tocar el CRM |
| RTW-05 | Un interruptor apaga todos los enlaces de la tienda |
| RTW-06 | Si la tienda no responde, el bot usa la última lista leída; si nunca la leyó, manda el catálogo web. La ficha sale siempre |
| RTW-07 | El renglón va **después de «📷 Más fotos»** y solo si cabe en los 1.024 caracteres del mensaje con botones de WhatsApp |
| RTW-08 | Los textos («🌐 Ver en la web: {enlace}», «🛒 Mira más equipos en la web: {enlace}»), la dirección de la tienda y el catálogo se cambian en **Inventario → Catálogos → 🌐 Tienda web** (permiso `administrar_inventario`) |

## 3. Qué ve el cliente por WhatsApp

```
💻 *LENOVO X1 CARBON GEN 6* · Código 100-102-10352
Core i7-8550U · 16GB · 512GB SSD · Usado
💰 $1.600.000 · ✅ Disponible
📷 Más fotos: https://drive.google.com/drive/folders/…
🌐 Ver en la web: https://ventasvirtualcolombia.com/producto/100-102-10352      ← si está publicado
🛒 Mira más equipos en la web: https://ventasvirtualcolombia.com/productos?categoria=portatil   ← si no
```

Aplica a las tres fichas de un equipo que usan `flujo.con_drive`: la del **menú** (`flujo.r11`), la de la acción **«Pregunta por un equipo»**
(`acciones.py`, la que usa Avi con un solo equipo) y la que envía el **asesor** desde el chat (`receptor.ficha_del_asesor`, F4·71).
En la **lista de Avi** (`agente.textos_con_equipos`) cada equipo publicado suma su renglón (RTW-03).

## 4. Qué ve el equipo en el CRM

- **Inventario → un equipo:** debajo de la foto, el botón **«🌐 Ver en la tienda web»** si está publicado; si no, el aviso «Aún no está publicado
  en la tienda web: el bot envía el catálogo web» con el enlace al catálogo. La vista «Así la ve el cliente por WhatsApp» incluye el renglón.
- **Inventario → Catálogos → 🌐 Tienda web:** interruptor, dirección de la tienda, catálogo web, los dos textos y cuántos equipos hay publicados
  (o «La tienda no respondió»).

## 5. Cómo está construida

- **Migración 0085** (`tienda_web`, una sola fila, 3 pruebas SQL): `activa`, `url` (solo https, sin ruta), `catalogo_url`, `texto_equipo` y
  `texto_catalogo` (deben llevar `{enlace}`). Lectura para usuarios del CRM; cambio con `administrar_inventario`; anon no la ve.
- **Bot:** `flujo.tienda()` (caché 60 s), `flujo.publicados()` (lee `{url}/productos` cada 5 min, 4 s de espera máxima) y
  `flujo.renglon_web(p, respaldo)`. `flujo.con_drive` agrega «📷 Más fotos» y el renglón web. `prueba_tienda_web.py` 11/11;
  `prueba_fotos_equipo.py` aísla el renglón web y sigue 11/11.
- **CRM:** `lib/tiendaWeb.ts` (mismas reglas, `fetch` con `revalidate: 300`), `inventario/[id]/page.tsx`, `catalogos/FormTiendaWeb.tsx`,
  acción `guardarTiendaWeb`.
- **Dependencia de la tienda:** si la tienda cambia el formato de sus enlaces (`/producto/{código}`) o pagina `/productos`, hay que ajustar
  `publicados`. Está anotado aquí y en el código.

## 6. Para probarlo (dueño)

1. Inventario → Catálogos: ver la tarjeta **🌐 Tienda web** con «1 equipo publicado».
2. Inventario → un equipo (por ejemplo 100-102-10352): ver el aviso «Aún no está publicado…» y, en la vista de WhatsApp, el renglón 🛒.
3. Subir ese equipo a la tienda con el **mismo código**; a los 5 minutos la ficha del CRM muestra «🌐 Ver en la tienda web».
4. Por WhatsApp pedir ese código: la ficha llega con «🌐 Ver en la web: …/producto/100-102-10352».

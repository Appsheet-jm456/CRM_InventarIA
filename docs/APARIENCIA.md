# Apariencia: colores, modo oscuro y fuente (F4·19)

**Estado:** 🔵 Construida el 31 oct 2026, falta probarla con sesión · migración 0023 (7 pruebas SQL) · Decisión [0031](decisiones/0031-apariencia-y-marca.md)
Prototipo para revisar con el dueño: artefacto «Apariencia CRM InventarIA» (MVP visual, no es código de la app).

## Qué pidió el dueño (31 oct 2026)

1. **Quitar el verde** de la marca actual. Hoy toda la app es verde (panel `#14352D`, principal `#2E8C6A`).
2. **Módulo Apariencia** en Configuración, como el de Futur Green.
3. **Interruptor de modo oscuro / modo claro** (sí / no).
4. **Branding de tres colores** (panel lateral, principal y acento), con **paletas listas** para elegir con un clic y
   **personalizable** color por color.
5. **Una fuente más amigable y clara** que la actual (Archivo + IBM Plex Sans).
6. **Logo personalizable** desde Apariencia (pedido el mismo día como mejora pequeña).
7. **No cambiar la estructura:** el panel izquierdo de módulos se sigue abriendo y plegando como hoy.

## Alcance

| Incluye | No incluye (por ahora) |
|---|---|
| Módulo **Configuración → Apariencia** (`/apariencia`) | Logo ancho aparte del ícono (un solo logo cuadrado basta) |
| **Logo propio** (PNG, JPG o WebP) con Quitar para volver al «VV» | Recortar o editar la imagen dentro de la app |
| Tres colores de marca con selector y código hex | Cambiar el tamaño de letra o la densidad |
| 4 paletas listas + **Restaurar colores de la marca** | Temas por asesor (los colores son de toda la app) |
| Interruptor **Modo oscuro** por usuario | Modo oscuro programado por hora |
| Selector de **fuente** entre 3 opciones probadas | Fuentes subidas por el usuario |
| Vista previa en vivo antes de guardar | Cambiar los colores del chat estilo WhatsApp (siguen siendo los de WhatsApp) |

## Cómo funciona

### Colores de marca (toda la app)

Tres colores, igual que Futur Green (su decisión 0027):

| Color | Dónde se usa |
|---|---|
| **Panel lateral** | Fondo del menú de módulos y del login |
| **Principal** | Botones, enlaces, módulo activo, foco del teclado |
| **Acento** | Indicador del módulo activo, contadores (Bandeja), detalles de marca |

Los demás tonos (fondos suaves, bordes, hover) **se derivan** de esos tres; el administrador no los toca. Los colores de
estado (verde = bien, ámbar = aviso, rojo = error) **no cambian** con la marca: significan lo mismo en cualquier paleta.

**Paletas listas** (la primera es la nueva marca por defecto):

| Paleta | Panel | Principal | Acento | Idea |
|---|---|---|---|---|
| **Azul Ventas Virtuales** (por defecto) | `#0F1E33` | `#2563C9` | `#F2A23A` | Azul de confianza con acento ámbar de oferta |
| **Grafito** | `#1D2026` | `#3D5A80` | `#E2703A` | Sobria, gris con acento naranja |
| **Petróleo** | `#0D2B33` | `#0E7C86` | `#F4C04E` | Azul verdoso oscuro, sin el verde actual |
| **Anterior (verde)** | `#14352D` | `#2E8C6A` | `#2E8C6A` | La marca de hoy, para volver si se quiere |

Los valores finales los aprueba el dueño con el prototipo.

**Reglas:**
- RA-01. Solo quien tenga el permiso **`administrar_apariencia`** (nuevo, del administrador por defecto) cambia los colores y la fuente.
- RA-02. Mientras se elige, la app se ve con los colores nuevos (vista previa); **nada queda hasta Guardar**. Salir sin guardar vuelve a los guardados.
- RA-03. **Restaurar colores de la marca** deja los tres en la paleta por defecto (en la base: vacío = marca por defecto, como Futur Green).
- RA-04. Se valida el **contraste**: si el texto blanco sobre el color Principal o del Panel queda por debajo de 4,5:1, la pantalla avisa y sugiere un tono más oscuro (no bloquea).
- RA-05. Solo códigos hex de 6 dígitos (`#RRGGBB`).

### Logo

- RA-12. El administrador sube **un logo** (PNG, JPG o WebP, hasta **1 MB**; mejor cuadrado y con fondo transparente). Reemplaza el
  monograma «VV» en el panel lateral (abierto y plegado), en el login y en el ícono de la pestaña del navegador.
- RA-13. Sin logo propio se ve el monograma «VV» sobre el color Principal, con el punto del color Acento.
- RA-14. **Quitar logo** vuelve al «VV» y borra el archivo. Subir uno nuevo borra el anterior.
- RA-15. El logo vive en un bucket privado `marca` (como las fotos de productos); sin SVG, porque un SVG puede llevar código. El login
  lo muestra sin sesión, así que la app lo sirve leyendo con la llave de servicio solo ese archivo.
- RA-16. Se muestra completo dentro de su caja (`object-fit: contain`): un logo ancho se ve pequeño pero no se recorta.

### Modo oscuro (por usuario)

- RA-06. Interruptor **Modo oscuro** (sí / no). Cada usuario elige el suyo: el asesor que trabaja de noche no le cambia la pantalla al resto.
- RA-07. Por defecto sigue al equipo (como hoy, `prefers-color-scheme`) hasta que el usuario toque el interruptor; desde ahí manda su elección.
- RA-08. El interruptor está en Apariencia y también como atajo en el pie del panel lateral (junto a Salir), para no entrar a Configuración.
  El módulo Apariencia lo ve **cualquier usuario** (por su modo oscuro); la parte de logo, colores y fuente solo aparece con `administrar_apariencia`.
- RA-09. La elección se guarda en el usuario (base) y se recuerda en el navegador para que la página no "parpadee" al cargar.

### Fuente

Se cambia **Archivo + IBM Plex Sans** por una sola familia más redonda y legible. Opciones para el prototipo:

| Fuente | Por qué |
|---|---|
| **Figtree** (recomendada) | Redonda y amable, muy clara en tamaños pequeños (tablas, tarjetas del embudo) |
| **Nunito Sans** | Más suave, letras anchas |
| **Atkinson Hyperlegible** | Hecha para máxima legibilidad (distingue 1/l/I y 0/O) |

- RA-10. Los números (precios, códigos `100-10X-NNNN-S`, tiempos de SLA) siguen en **monoespaciada** con cifras tabulares, para que alineen.
- RA-11. La fuente la elige el administrador para toda la app. Si el servidor no tiene internet, cae a la fuente del sistema (como hoy).

## Qué hay que tocar al construir

1. **Base (migración 0023; la 0022 está reservada para F4·14):** tabla `apariencia` de una sola fila (`color_panel`, `color_principal`,
   `color_acento`, `fuente`, `logo`; vacío = marca por defecto), bucket privado `marca` con sus políticas, columna `usuarios.modo_oscuro` (null = sigue al equipo), permiso
   `administrar_apariencia` y sus políticas RLS. Lectura de la fila con la llave de servicio para el login (no hay sesión).
2. **Tema por atributo, no por media query:** `globals.css` pasa de `@media (prefers-color-scheme: dark)` a `:root[data-theme="dark"]`
   (+ la media query solo cuando no hay elección). Hay que revisar los **6 bloques** que hoy fijan colores de modo oscuro aparte:
   chat estilo WhatsApp (`.wa`), simulador, gráficos de Métricas (`.viz-*`), burbujas cliente/bot/asesor y el lienzo.
3. **Colores derivados:** `--accent-soft`, `--side-hover`, `--side-active`, etc. se calculan desde los tres colores (con `color-mix`).
4. **Layout:** el `layout.tsx` raíz lee la apariencia y escribe las variables CSS y `data-theme` en `<html>` antes de pintar.
5. **Módulo nuevo** en `lib/modulos.ts` (grupo Configuración, ícono propio) y su pantalla `/apariencia`, copiando la forma de Futur Green.
6. **Shell:** atajo de modo oscuro en `.side-foot`. El panel plegable **no cambia**.

## Criterio de terminado

- [x] El dueño dio la orden de construir con Azul Ventas Virtuales y Figtree (31 oct 2026); igual se cambian desde el módulo.
- [x] Migración 0023 con 7 pruebas en verde; `next build` sin errores; login con la marca nueva comprobado en el navegador.
- [ ] Cambiar una paleta se ve en vivo y solo queda al Guardar; Restaurar vuelve a la marca.
- [ ] El modo oscuro de un usuario no cambia el de otro y no parpadea al recargar.
- [ ] Ninguna pantalla queda con verde fijo (revisar Bandeja, Embudo, Bot/lienzo, Métricas, Inventario, login).
- [ ] Contraste AA en las 4 paletas, claro y oscuro.
- [ ] Subir, cambiar y quitar el logo se ve en el panel (abierto y plegado), el login y la pestaña.
- [ ] Un asesor sin permiso no ve el módulo y la base le niega el cambio (prueba SQL).
- [ ] Prueba en el navegador con sesión (módulo, vista previa, logo, modo oscuro): pendiente, hace falta un usuario para entrar.

## Pendientes y preguntas al dueño

- ¿Los colores de las etapas del embudo siguen la marca o se quedan como están?

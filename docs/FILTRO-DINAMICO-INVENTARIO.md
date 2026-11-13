# Filtro dinámico de Inventario → Equipos (F4·74)

> **Estado:** 📝 documentada el 13 nov 2026 por pedido del dueño. **Sin construir:** el dueño avisa cuándo implementarla.
> Decisiones pendientes del dueño en la sección 7.

**Pedido del dueño (13 nov 2026):** en Inventario → Equipos, un **filtro dinámico** para encontrar equipos por **tipo, marca, modelo,
generación, procesador, RAM, disco y táctil (sí/no)**. Referencia visual: el panel «Filtros» de la tienda web
(ventasvirtualcolombia.com): listas desplegables, contadores entre paréntesis, Táctil «Todos / Sí / No», «Solo disponibles» y un botón
que dice «Aplicar · N productos».

---

## 1. Cómo está hoy (revisado en el código y en la base el 13 nov 2026)

`crm/src/app/(app)/inventario/page.tsx` filtra **en el servidor** con un formulario de 4 controles:

| Control | Qué hace hoy |
|---|---|
| Buscar | Texto libre sobre código, marca, modelo, procesador, RAM, disco, descripción y atributos |
| Todas las marcas | Una marca exacta |
| Todos los procesadores | Familia del procesador (i3, i5, i7, Ryzen 5…) sacada del texto con una expresión regular |
| Con stock / Todos | Oculta o muestra los de stock 0 |

Hay que apretar «Filtrar» y la página se recarga. Las listas siempre muestran **todas** las opciones, aunque con la marca elegida ya no
haya equipos de ese procesador. No existen filtros de **tipo, modelo, generación, RAM, disco ni táctil**.

**Los datos que ya existen en `productos` (65 equipos, 54 con stock):**

| Filtro pedido | Columna | Valores reales hoy | Observación |
|---|---|---|---|
| Tipo | `categoria` | Un solo valor: «Portatil» (65) | Hoy el filtro tendría una sola opción; sirve cuando entren torres, SFF, accesorios (árbol de categorías) |
| Marca | `marca` | LENOVO 31, DELL 23, HP 9, ACER 1, GIGABYTE 1 | Limpia |
| Modelo | `modelo` | Texto libre («X1 YOGA GEN 5», «PROBOOK FORTIS G10»…) | Muchos modelos con una o dos unidades |
| Generación | `generacion` | 6, 7, 8, 10, 11, 12, 13, 14 y 2 vacíos | Es texto; ordenar como número |
| Procesador | `procesador` | «Core i5-8250U», «Core i7-1185G7»… | Hay que agrupar por familia (i3/i5/i7/i9, Ryzen…) |
| RAM | `ram` | 8GB, 12GB, 16GB, 32GB | Limpia |
| Disco | `almacenamiento` | «256GB SSD», «256GB NVMe», «512GB», «512GB SSD», «1TB», «1TB SSD», «1TB NVMe», «500GB» | **Desordenada:** mezcla capacidad y tipo, y a veces falta el tipo |
| Táctil | **no existe** | — | **Hay que crearla** (ver 3.4) |

## 2. Qué ve el usuario

**«Dinámico» significa:** cada lista solo ofrece lo que **sí existe** con los demás filtros ya elegidos, con su **contador**, y el número de
equipos se actualiza **al instante**, sin recargar la página. Ejemplo: elijo Marca LENOVO y en Generación solo salen las que tiene Lenovo,
cada una con su cantidad: `10 (9) · 11 (7) · 8 (4)`.

```
Equipos con stock 54 · Valor $119.688.700 · Sin foto 51

🔍 Buscar código, modelo, procesador…                         [ 🎚 Filtros (3) ]  54 de 65

Activos:  [LENOVO ✕]  [Generación 10 ✕]  [RAM 16GB ✕]                         Limpiar todo
```

Al tocar **🎚 Filtros** se abre el panel (a un lado en pantalla grande; hoja completa en el celular, como la tienda web):

```
Filtros (3)                                              ✕
TIPO         [ Portátiles (65)            ⌄ ]
MARCA        [ ☑ LENOVO (31) ☐ DELL (23) ☐ HP (9) …  ⌄ ]
MODELO       [ Todos                       ⌄ ]   ← solo modelos de las marcas elegidas
GENERACIÓN   [ ☑ 10 (9) ☐ 11 (7) ☐ 8 (4) …  ⌄ ]
PROCESADOR   [ Core i5 (12) · Core i7 (8) …  ⌄ ]
RAM          [ 8GB (10) · 16GB (14) · 32GB (3) ⌄ ]
DISCO        [ 256GB (11) · 512GB (9) · 1TB (3) ⌄ ]      Tipo: ( ) SSD  ( ) NVMe
TÁCTIL       [ Todos (31) | Sí (3) | No (28) ]
PRECIO       [ Mínimo ] – [ Máximo ]                      ← opcional (la tienda web lo tiene)
[x] Solo disponibles (con stock)

[ Aplicar · 14 equipos ]     [ Limpiar ]
```

- Las listas permiten **marcar varias opciones** (LENOVO y DELL a la vez). Táctil es una sola elección: Todos, Sí o No.
- Una opción que daría **0 resultados** aparece apagada con `(0)`, no desaparece de golpe (se entiende por qué no hay).
- El panel muestra el número de resultados **mientras se eligen** los filtros; «Aplicar» solo cierra el panel.
- Cada filtro activo es una **pastilla con ✕** sobre la tabla; «Limpiar todo» las quita.
- Los filtros viajan en la **dirección de la página** (`?marca=LENOVO,DELL&gen=10,11`): se puede copiar el enlace, recargar sin perderlos o volver
  con «atrás». Los parámetros de hoy (`q`, `marca`, `cpu`, `stock`) siguen funcionando.
- Por defecto queda «Solo disponibles» **marcado** (igual que hoy: «Con stock»); desmarcarlo equivale a «Todos, también en 0».
- Las tarjetas de arriba (equipos con stock, valor, sin foto) **siguen siendo de todo el inventario**; no cambian con los filtros.
  La línea «54 de 65» pasa a «14 de 65» y agrega el valor de lo filtrado.

## 3. Reglas de cada filtro

### 3.1 Tipo
`productos.categoria`. Hoy una sola opción («Portátiles»); queda listo para cuando se carguen otras categorías. Si hay una sola, la lista
se muestra pero **no estorba** (preseleccionada).

### 3.2 Marca, modelo, RAM
Valores tal cual están en la base, sin tildes ni mayúsculas para comparar. Modelo depende de Marca (solo los modelos de las marcas elegidas).
RAM se ordena por número (8, 12, 16, 32).

### 3.3 Generación, procesador y disco (se normalizan al leer, **sin cambiar la base**)
- **Generación:** el número de `generacion`; vacío → opción «Sin dato» (hoy 2 equipos).
- **Procesador:** familia sacada de `procesador` (Core i3, i5, i7, i9, Ryzen 3/5/7/9, Celeron, Pentium, Apple M1–M4), igual que `cpuDe` de hoy.
  Con la familia elegida se puede afinar por el modelo exacto (opcional, ver 7).
- **Disco:** dos listas que salen del texto de `almacenamiento`: **capacidad** (256GB, 512GB, 1TB; «500GB» se muestra tal cual) y **tipo**
  (SSD, NVMe, HDD; si el texto no dice el tipo → «Sin dato»). Así «512GB» y «512GB SSD» no se cuentan como cosas distintas.

### 3.4 Táctil (campo nuevo)
No hay dónde guardarlo. Se crea como **atributo del producto** (F4·41, Inventario → Atributos): `tactil`, nombre «Táctil», tipo **Sí / No**
(`producto_atributos`; el valor queda en `productos.atributos.tactil`). Sin columna nueva ni cambio de tablas.
- El atributo se crea por una **migración de datos** (como `uso_recomendado` en F4·73) o a mano en la pantalla Atributos.
- **El dueño (o el equipo) tiene que marcar cuáles son táctiles** en cada equipo; hasta entonces todos están «sin dato». Candidatos que veo
  en la base por el modelo: los **X1 Yoga Gen 5, 6 y 7**.
- «Sin dato» **no cuenta como No**: el filtro ofrece Todos / Sí / No y un cuarto botón **«Sin dato (n)»** que solo aparece si hay equipos sin marcar.
  Así el «No» es confiable.

## 4. Cómo se construye (para cuando el dueño avise)

- **Archivos:** `inventario/page.tsx` sigue trayendo los productos del servidor (ya trae hasta 2.000 con una consulta) y pasa la lista a un
  componente de cliente nuevo `FiltroEquipos.tsx` (estado de los filtros, cálculo de contadores y tabla). Funciones puras de normalización
  en `lib/inventario.ts` (`generacionDe`, `familiaCpu`, `capacidadDisco`, `tipoDisco`) para poder probarlas.
- **Contadores:** búsqueda por facetas, en memoria: el contador de cada lista se calcula **aplicando todos los filtros menos el suyo**.
  Con 65 equipos es instantáneo; con 2.000 sigue siendo inmediato. No hay consulta nueva ni cambio en la base.
- **Sin cambios en:** tablas, permisos (ve el inventario quien ya lo ve), bot, Avi, Cerebro ni catálogos.
- **Migración:** ninguna de tablas. Solo la de datos del atributo Táctil si el dueño la prefiere a crearlo a mano; usa el siguiente número libre
  al construir (revisar `ls supabase/migrations` y `schema_migrations`; la 0083 está reservada a F4·69).
- **Móvil:** el panel se abre como hoja completa (la pantalla desde la que el dueño trabaja es el iPhone); la tabla conserva su desplazamiento
  horizontal.

## 5. Criterios de aceptación

| # | Dado / cuando | Entonces |
|---|---|---|
| RFI-01 | Entro a Inventario → Equipos | Veo el buscador, el botón «🎚 Filtros» y «54 de 65», como hoy; todo cargado sin recargar la página al filtrar |
| RFI-02 | Marco la marca LENOVO | La tabla muestra solo Lenovo y el contador dice cuántos son; las pastillas muestran «LENOVO ✕» |
| RFI-03 | Con LENOVO marcado abro Generación | Solo salen las generaciones que tiene Lenovo, cada una con su cantidad |
| RFI-04 | Marco LENOVO y DELL a la vez | Veo los de las dos marcas (selección múltiple) |
| RFI-05 | Elijo Procesador Core i5, RAM 16GB y Disco 512GB | Se cumplen **todos** a la vez; el botón dice «Aplicar · N equipos» con N correcto antes de cerrar el panel |
| RFI-06 | Elijo Disco 512GB | Aparecen juntos los de «512GB» y «512GB SSD» |
| RFI-07 | Elijo Táctil → Sí | Solo los equipos con el atributo Táctil en Sí; los «sin dato» no aparecen ni cuentan como No |
| RFI-08 | Hay equipos sin Táctil marcado | Aparece «Sin dato (n)»; si todos están marcados, ese botón no se muestra |
| RFI-09 | Combino filtros que no dan ningún equipo | Veo «Ningún equipo con esos filtros» y la opción para «Limpiar todo» |
| RFI-10 | Toco ✕ en una pastilla o «Limpiar todo» | Se quita ese filtro (o todos) y la tabla se actualiza |
| RFI-11 | Aplico filtros y recargo la página o copio el enlace | Los mismos filtros siguen puestos |
| RFI-12 | Dejo «Solo disponibles» sin marcar | También salen los equipos con stock 0 |
| RFI-13 | Aplico cualquier filtro | Las tarjetas de arriba (con stock, valor, sin foto) no cambian |
| RFI-14 | Abro el panel desde el celular | Se abre a pantalla completa, se puede desplazar y el botón «Aplicar» queda a la vista |
| RFI-15 | Un equipo con generación vacía | Aparece bajo «Sin dato» en Generación, no desaparece del listado sin filtros |

## 6. Pruebas previstas

- Pruebas de las funciones puras (normalización de generación, familia del procesador, capacidad y tipo de disco) con los 65 equipos reales
  y casos raros («500GB», «1TB», sin tipo, sin generación).
- Prueba del cálculo de contadores por facetas (cada contador excluye su propio filtro; todos los filtros se combinan con «y» entre listas y «o» dentro de una lista).
- `npm run build`, revisión visual en computador y en celular, y comprobación de la dirección con filtros.

## 7. Decisiones pendientes del dueño

1. **Precio mínimo / máximo:** no está en tu lista pero sí en la tienda web. ¿Lo incluimos? *(recomiendo que sí)*.
2. **Procesador:** ¿solo por familia (i5, i7…) o también el modelo exacto (i5-8250U)? *(recomiendo familia, y modelo exacto como segundo nivel opcional)*.
3. **Táctil:** ¿creamos el atributo por migración y tú marcas los táctiles, o prefieres darme la lista de códigos para marcarlos yo? *(recomiendo la lista de códigos, para que quede lleno desde el primer día)*.
4. **Disco:** ¿una sola lista («256GB SSD», «512GB NVMe»…) o dos (capacidad y tipo)? *(recomiendo dos: es más flexible y limpia el desorden de los datos)*.
5. **Selección múltiple** (varias marcas a la vez) en lugar de elegir una sola: ¿está bien? *(recomiendo múltiple)*.
6. ¿El filtro nuevo **reemplaza** al de arriba (marca, procesador, stock) o conviven? *(recomiendo reemplazarlo: el buscador se queda, los demás pasan al panel)*.

## 8. Fuera de alcance (posibles siguientes pasos)

- Que **Avi / el buscador del bot** también filtre por táctil, generación, RAM o disco (hoy usa su propio intérprete de filtros, `interprete.py`).
- Guardar filtros favoritos por usuario.
- Exportar a Excel lo que quedó filtrado.

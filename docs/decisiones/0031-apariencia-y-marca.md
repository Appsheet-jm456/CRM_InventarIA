# 0031 · Apariencia configurable: logo, tres colores, modo oscuro por usuario y fuente nueva

**Estado:** Aceptada · 31 oct 2026 (el dueño pidió construirla) · Diseño de F4·19 · Detalle en [APARIENCIA.md](../APARIENCIA.md)

## Contexto

La app nació con la paleta verde copiada del esqueleto de Futur Green (decisión 0009). El dueño quiere quitar el verde,
elegir y personalizar los colores desde la app, tener un interruptor de modo oscuro y una fuente más amigable y clara.
Futur Green ya resolvió lo mismo con su módulo Apariencia (allá decisión 0027, migración 0020).

## Decisión (dueño, 31 oct 2026)

- **Tres colores de marca** (panel lateral, principal, acento) guardados en una tabla `apariencia` de una fila; vacío = marca por
  defecto, así «Restaurar» no copia valores. El resto de tonos se deriva. Los colores de estado no cambian.
- **Nueva marca por defecto sin verde:** «Azul Ventas Virtuales» (panel `#0F1E33`, principal `#2563C9`, acento `#F2A23A`), más las paletas
  Grafito, Petróleo y Anterior (verde).
- **Modo oscuro por usuario** (`usuarios.modo_oscuro`, null = sigue al equipo), no global: cada asesor elige el suyo.
- **Fuente:** una familia redonda (Figtree recomendada) en lugar de Archivo + IBM Plex Sans; los números siguen en monoespaciada.
- **Logo propio** (un solo logo, PNG/JPG/WebP hasta 1 MB) en un bucket privado `marca`; sin logo se ve el monograma «VV».
- **Permiso nuevo** `administrar_apariencia`, del administrador por defecto.
- **La estructura no cambia:** panel lateral plegable, rutas y módulos quedan igual.

## Alternativas descartadas

- **Modo oscuro global:** un asesor nocturno se lo cambiaría a todos.
- **Editar todos los tonos (fondos, bordes):** más control pero fácil de romper el contraste; con tres colores basta y se derivan los demás.
- **Solo cambiar la paleta en `globals.css` sin módulo:** quita el verde pero cada cambio futuro pide código y build.
- **Mantener Archivo + Plex:** el dueño la siente técnica y poco amigable.

## Consecuencias

- `globals.css` pasa a tema por atributo (`data-theme`) y hay que limpiar los bloques con colores de modo oscuro fijos.
- Migración 0023 (la 0022 queda para F4·14). Prueba SQL de permisos.
- El login lee la apariencia sin sesión, con la llave de servicio y solo esas columnas.

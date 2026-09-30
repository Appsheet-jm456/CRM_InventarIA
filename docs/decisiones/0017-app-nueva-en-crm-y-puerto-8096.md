# 0017 · La app nueva vive en `crm/` y termina en el puerto 8096

**Estado:** Aceptada · 30 sep 2026 · Aplica la 0008 y la 0009 · Cumplida en F3·5 (la app corre en el 8096)

## Contexto

En el servidor corren tres cosas: la **v0** (Next.js en la raíz del repo, puerto 3000), el **bot de
prueba** (Python, 8095) y el **visor de la demo** (Python, 8096), que el dueño ya usa como "la app"
en `http://100.114.72.43:8096`. La app nueva CRM InventarIA tiene que nacer sin romper ninguna.

## Decisión

- El código de la app nueva va en la carpeta **`crm/`**, con su propio `package.json`. La v0 sigue en
  la raíz hasta el corte (F5·1) y los scripts de prueba en `herramientas/`.
- Mientras se construye (F3·1 a F3·4) corre en el **3020**.
- En **F3·5**, cuando su Bandeja reemplace al visor de Python, la app pasa al **8096** y el visor se
  apaga. El dueño conserva la dirección que ya conoce.

## Consecuencias

- La demo no se toca mientras se construye el esqueleto.
- Hay dos Next.js en el mismo repo hasta el corte; cada uno con sus dependencias.
- El 3020 queda ocupado solo durante la construcción.

# 0004 · Capa de canal: Evolution hoy, Meta después

**Estado:** Aceptada · 29 sep 2026

## Contexto

Evolution API usa Baileys, que no es oficial: Meta puede bloquear el número. La migración a la
Cloud API ya está planeada (`docs/PLAN-META-API.md`), pero exige verificar el negocio, un HTTPS
público y plantillas.

## Decisión

El bot y el CRM hablan con una **interfaz de canal** (`normalizarEntrada`, `enviarTexto` y
`enviarMedia`). Hoy se implementa el adaptador de Evolution; el de Meta se agrega después sin
tocar el motor ni la bandeja. El webhook llega **directo a la app**: n8n sale del camino del
mensaje.

## Consecuencias

- Cada mensaje guarda el id externo del canal: un reintento del webhook no lo duplica.
- Los seguimientos fuera de la ventana de 24 h de Meta usarán plantillas aprobadas.

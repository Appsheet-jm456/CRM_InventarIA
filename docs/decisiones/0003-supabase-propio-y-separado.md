# 0003 · Supabase propio y separado

**Estado:** Aceptada · 29 sep 2026

## Contexto

Baserow no tiene índices ni transacciones, y el token de base de datos no puede cambiar el
esquema. Por eso `Etapa` es texto y cada mensaje recorre **todas** las filas de `CRM_Leads` dos
veces (`findRawLeadByPhone` → `fetchAllRows`). El panel además sondea cada 5 s.

## Decisión

Una **instancia de Supabase propia para el CRM**, separada de las de Futur Green y ClaudePyme,
en el mismo servidor: Postgres con índices y restricciones, Auth para los usuarios, Realtime para
la bandeja y Storage privado para la media.

## Alternativas descartadas

- **Seguir en Baserow:** mantiene todos los límites de arriba.
- **Compartir la instancia de Futur Green:** mezcla negocios distintos y sus respaldos.

## Consecuencias

- Se migra el inventario, las etapas y los leads (F3·2).
- Hay que elegir puertos libres para la instancia (Fase 2).

# 0008 · Reconstruir por fases, con la v0 viva

**Estado:** Aceptada · 29 sep 2026

## Decisión

La app se **reconstruye** siguiendo el SDLC, reutilizando las piezas buenas de la v0 (motor de
menús, adaptador de Evolution, `lib/media.js` y estilos). La v0 sigue atendiendo en el puerto
3000 hasta el corte de la Fase 5; la nueva se desarrolla en paralelo en otro puerto.

## Alternativa descartada

**Refactorizar en sitio:** el cambio de Baserow a Supabase y de clave compartida a usuarios toca
todas las capas; parchar deja la app a medio camino durante semanas.

# 0007 · Los mensajes se guardan en la base propia

**Estado:** Aceptada · 29 sep 2026

## Contexto

En la v0 el CRM consulta el historial al Postgres de Evolution en cada apertura y cada 5 s, y
descarta todo lo que no es texto.

## Decisión

Todo mensaje entrante y saliente se guarda en la tabla `mensajes`, con su media en Storage. El
CRM es dueño del historial: lo busca, lo mide y lo respalda, y no depende de qué canal esté
detrás.

## Consecuencias

- Las métricas (tiempo de respuesta, chats sin contestar) salen de una sola tabla.
- Hay que importar el historial existente de Evolution en la migración (F3·2).

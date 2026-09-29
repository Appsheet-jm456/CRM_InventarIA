# 0002 · Secretos fuera del repositorio

**Estado:** Aceptada · 29 sep 2026

## Decisión

Las credenciales viven en `.env.local` (app) y `.env.notion` (Notion), ambos ignorados por
`.gitignore` (`.env.*`). Las copias `.bak` se borran: una tenía las credenciales completas.
Las fotos de clientes (`uploads/`, y después el bucket) nunca entran a git: son datos personales.

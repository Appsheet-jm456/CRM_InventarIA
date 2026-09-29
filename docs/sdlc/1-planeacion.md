# Fase 1 · Planeación

**Estado:** 🔵 En curso · **Abierta:** 29 sep 2026

> Define **qué** se construye y **para quién**. No entra en cómo.

## Criterio de cierre

- [x] Problema y usuarios definidos: [00-BRIEF.md](../00-BRIEF.md)
- [x] Base de datos decidida: Supabase propio (decisión 0003)
- [x] Canal decidido: capa de canal, Evolution hoy y Meta después (decisión 0004)
- [x] Enfoque decidido: reconstruir por fases con la v0 viva (decisión 0008)
- [x] Alcance del MVP: bandeja multiasesor, seguimientos/SLA, bot configurable y métricas
- [ ] Flujo de atención real del local: quién responde, en qué horario y con cuántos asesores
- [ ] Etapas del embudo y motivos de pérdida validados con el dueño
- [ ] Metas medibles confirmadas: SLA de primera respuesta, horario y tiempos de recontacto
- [ ] Riesgos revisados con el dueño

---

## Por qué se replantea

La v0 (jun–jul 2026) nació como un chat de inventario y se le fueron sumando el CRM y el bot sin
un diseño común. Funciona, pero cada mensaje recorre todos los leads de Baserow, el historial vive
fuera del CRM y no hay usuarios. Antes de agregar funciones se define el alcance completo, para no
repetir el problema.

## Problema, usuarios y alcance

Ver [00-BRIEF.md](../00-BRIEF.md).

## Qué se reutiliza de la v0

| Pieza | Archivo v0 | Cómo se reutiliza |
|---|---|---|
| Lógica del árbol de menús (códigos en frase, fichas, cotización) | `lib/whatsappFlow.js` | Se vuelve el intérprete de `bot_nodos` |
| Envío por Evolution (texto y media, `remoteJid`/`remoteJidAlt`) | `lib/evolution.js` | Primer adaptador de la interfaz de canal |
| Normalización de fotos y video (Google Drive) | `lib/media.js` | Tal cual |
| Estilos claro/oscuro | `app/globals.css` | Base visual |
| Etapas, colores y motivos de pérdida | `lib/crm.js` | Datos iniciales de la migración |

# 0010 · API oficial de Meta en el MVP, Evolution hasta el corte

**Estado:** Aceptada · 29 sep 2026 · Reemplaza a la 0004

## Contexto

La 0004 dejaba la Cloud API de Meta para después del MVP. El dueño decide usar la **API oficial**
desde la app nueva: Evolution usa Baileys, no es oficial y el número puede ser bloqueado.

## Decisión

- La app nueva nace sobre la **WhatsApp Cloud API**. Se conserva la **interfaz de canal**
  (`normalizarEntrada`, `enviarTexto`, `enviarMedia` y `enviarPlantilla`), y el adaptador de
  Meta es el primero.
- La **v0 sigue con Evolution** mientras Meta verifica el negocio y aprueba las plantillas. En
  el corte (Fase 5) el número pasa a Meta y Evolution se apaga.
- El webhook de Meta llega **directo a la app**, por un **túnel de Cloudflare con dominio
  propio** (la URL de `trycloudflare` cambia al reiniciar y rompe el webhook), y se valida la
  firma `X-Hub-Signature-256`.
- Los trámites en Meta (Fases 1 a 3 de [PLAN-META-API.md](../PLAN-META-API.md)) **arrancan ya**,
  porque dependen de Meta y no de nosotros.

## Consecuencias

- Escribirle primero a un cliente, o después de 24 h, exige una **plantilla aprobada**. Los
  seguimientos (F3·6) se diseñan con plantillas.
- Los precios de Meta cambian el 1 de octubre de 2026 y cada mensaje del bot cuesta. Ver la 0011.

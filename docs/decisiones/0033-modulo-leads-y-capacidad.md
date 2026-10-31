# 0033 · Módulo Leads con atributos personalizados, y capacidad para 1.000 clientes al día

**Estado:** Propuesta · 31 oct 2026 · Diseño de F4·30 y F4·31 · Detalle en [LEADS.md](../LEADS.md)

## Contexto

La app tiene Bandeja (atender ahora) y Embudo (oportunidades por etapa), pero no una **base de clientes** donde buscar, filtrar, editar
en grupo, archivar o limpiar. El dueño quiere un módulo como «Todos los leads» de Kommo, con ficha del lead, atributos personalizados,
tareas y chat. Además pregunta si la app aguanta 600–1.000 clientes al día.

## Decisión (por confirmar con el dueño)

- **Módulo Leads** nuevo, con lista paginada en el servidor y la **misma ficha** del lead para Bandeja, Embudo y Leads.
- **Atributos personalizados** definidos en una tabla (`lead_atributos`) y guardados en `leads.atributos` (jsonb con índice), en lugar de
  agregar columnas por cada campo: el dueño los crea desde la app sin migraciones.
- **Tareas sobre `seguimientos`** (F3·6), con tipo y resultado; no se crea un modelo paralelo.
- **Archivar ≠ eliminar:** archivar conserva y se deshace solo si el cliente escribe; eliminar va a una papelera de 30 días; borrado
  inmediato solo por solicitud del cliente (Ley 1581).
- El usuario **puede devolver una etapa a mano**; la regla «el embudo solo avanza» sigue para el bot y las automatizaciones.
- **Capacidad:** el servidor y Postgres aguantan el volumen; F4·31 ajusta la carga de la app (Bandeja, Embudo, tiempo real, búsqueda) y es
  requisito, junto con el webhook fijo, los precios de Meta (F1·6) y los respaldos (F5·2), **antes de unificar Kommo** en el CRM propio.

## Alternativas descartadas

- **Una columna por atributo:** cada campo nuevo pediría una migración y un build.
- **Tabla EAV (una fila por valor):** más flexible, pero consultas y filtros más lentos y complejos que jsonb con índice.
- **Cargar todos los leads al navegador y filtrar ahí:** con 30.000 al mes se vuelve lento y pesado.
- **Eliminar de una vez sin papelera:** un error en una acción en grupo borraría clientes sin vuelta atrás.

## Consecuencias

- Migración nueva con atributos, eventos, archivo/papelera, índices de búsqueda y permisos (`administrar_atributos`, `eliminar_leads`,
  `exportar_leads`).
- La Bandeja y el Embudo cambian su forma de cargar (F4·31).
- Matiza la regla «el embudo solo avanza»: aplica a lo automático; el cambio manual queda en el historial.

# Pedidos: ficha ordenada por el proceso y módulo de seguimiento de envíos (F4·54 y F4·55)

> **Estado:** 📝 documentada el 9 nov 2026 por pedido del dueño. **No está construida; se construye cuando el dueño dé la orden.**
> Es una mejora de [F4·50 Alistamiento](ALISTAMIENTO-Y-VIDEO-TECNICO.md) (bloques A a D ya construidos y a la espera de su prueba).
> **Sin embudo ni etapas nuevas** (RAL-01 sigue igual): *Alistamiento → Despachado → Vendido → Perdido*. Esto solo reordena lo que se ve y
> suma una pantalla para consultar lo que ya se guarda.

## 1. Qué pidió el dueño (9 nov 2026)

1. **Organizar mejor el diseño** de *Ficha completa → Oportunidades*.
2. **Un módulo de Pedidos** donde aparezcan **todos los pedidos enviados** y se lleve la **trazabilidad**: alistamiento del servicio técnico,
   envío, y la **factura o el documento de garantía** (FVE u OP).

## 2. Cómo está hoy (revisado en el código el 9 nov 2026)

La pestaña **Oportunidades** apila tres bloques:

| Orden | Bloque | Qué tiene |
|---|---|---|
| 1 | Comprobante de pago (si el rol valida pagos) | Validar o rechazar el pago |
| 2 | **🛠 Alistamiento · servicio técnico** (`AlistamientoCliente.tsx`, una sola tarjeta de unas 180 líneas) | Estado, equipos con sus videos, técnico, checklist, formulario del documento, cuatro botones de envío, guía (transportadora, número, foto) y entrega en tienda |
| 3 | Oportunidades (`OportunidadesCliente.tsx`) | La etapa del embudo, para moverla a mano, y las cerradas |

Lo que incomoda:

- **La etapa del embudo queda al final**, debajo de todo el alistamiento, aunque es lo primero que el asesor quiere ver.
- **La tarjeta mezcla cosas de distinto momento** (revisión del técnico, documento, envíos al cliente y cierre) en una lista vertical sin pasos.
  El asesor tiene que adivinar **cuál es el siguiente paso** (los botones desactivados dan la pista solo al pasar el mouse).
- **Cuatro botones de envío con la misma jerarquía** (video, documento, guía, aviso de recogida), aunque se usan en orden.
- **No hay vista de todos los pedidos:** para saber cuáles están por enviar hay que abrir cliente por cliente (o ir a Servicio técnico, que es del técnico).

## 3. Mejora A · Ficha → Oportunidades por pasos (F4·54)

**RPD-01 · El pedido se lee de arriba abajo en el orden del proceso.** La pestaña queda así:

```
┌ Oportunidad: Cliente Final · [ Alistamiento ▾ ]   Pedido PED-0007   Total $1.930.000 ┐
│  ① Pago ✓ ── ② Alistamiento ● ── ③ Listo ○ ── ④ Enviado ○ ── ⑤ Entregado ○           │
│  ► Siguiente paso: «Falta el documento: escribe el OP o la FVE»              [ Ir ]  │
└───────────────────────────────────────────────────────────────────────────────────────┘
▸ Pago                  comprobante validado por Ana · 8 nov 10:42        (se abre para ver la imagen)
▾ Servicio técnico      Josep · tomó 9 nov 8:10 · 2 de 2 videos            (abierto mientras esté en curso)
     💻 Lenovo T14 · 100-102     🎥 video (12 MB)  ▶ Ver
     ✔ Revisión · ✔ Mantenimiento · ✔ Pasta térmica · ✔ Prueba funcional
▾ Documento             [OP ▾] [ 123456 ] [Guardar]                        (chip verde cuando está)
▾ Enviar al cliente     ① 🎥 Video  ② 🧾 Documento  ③ 📦 Guía / 🔔 Recoger     cada uno con su hora de envío
▸ Historial del pedido  (línea de tiempo plegada)
─ Otras oportunidades del cliente ─ (Pos Venta, Distribuidor, cerradas)
```

- **RPD-02 · Cabecera con la oportunidad.** Primero la etapa del embudo y el selector para moverla (lo que hoy está al final), el total y el
  número de pedido (RPD-08). Debajo, una **barra de 5 pasos**: *Pago → Alistamiento → Listo → Enviado → Entregado*. Es un **indicador**, no
  etapas nuevas: se deduce de campos que ya existen (`alistamientos.estado`, `listo_en`, `guia_enviada_en`, `entregado_en`). Si la entrega es
  en tienda, el cuarto paso se llama «Aviso de recogida».
- **RPD-03 · «Siguiente paso» siempre visible**, con una sola acción sugerida y un botón que lleva a la sección (por ejemplo «Falta el documento»,
  «Esperando que el técnico marque listo», «Listo: sube la foto de la guía», «Enviada: esperando entrega»). Reemplaza los avisos en gris de
  cada botón.
- **RPD-04 · Secciones plegables.** Las que ya terminaron (pago, servicio técnico) quedan **cerradas con un resumen de una línea**; la sección que
  toca ahora queda **abierta**. Una oportunidad nueva no muestra el alistamiento hasta que entra a esa etapa.
- **RPD-05 · «Enviar al cliente» agrupa los envíos** en orden de uso (video → documento → guía o aviso de recogida), con la hora de cada envío y
  el botón de reenvío. Un botón sin su requisito se ve apagado **con el motivo escrito debajo**, no solo en el tooltip.
- **RPD-06 · Las demás oportunidades** (otro embudo o cerradas) pasan a una lista compacta al final, plegada.
- **RPD-07 · Teléfono: una columna.** En pantallas angostas las secciones van una debajo de otra; en anchas, la cabecera queda fija arriba.
  El texto y los colores siguen el tema actual (Apariencia).

Sin migración: solo `Ficha.tsx`, `AlistamientoCliente.tsx` y `OportunidadesCliente.tsx` (se reorganizan en componentes más chicos).

## 4. Mejora B · Módulo «Pedidos» (F4·55)

Nueva pantalla **Pedidos** (`/pedidos`, grupo **Atención**, junto a Embudo y Servicio técnico). **Solo consulta y filtra**; las acciones
(enviar, subir guía) se siguen haciendo en la ficha, a un clic.

**RPD-08 · Qué es un pedido.** Una venta con pago validado que entró a Alistamiento: es una fila de `alistamientos`, con su oportunidad, su
cliente y su cotización (total, equipos, consecutivo). **Número de pedido consecutivo** (`PED-0001`…), que se asigna al entrar a Alistamiento;
los que ya existen se numeran por fecha al migrar.

**RPD-09 · Lista.** Una fila por pedido, la más reciente primero:

| Columna | De dónde sale |
|---|---|
| Pedido y fecha | número y `creado_en` |
| Cliente y teléfono | `leads` (el teléfono solo para quien ve la Bandeja) |
| Equipos | códigos y nombres |
| Total | de la cotización con pago validado |
| Entrega | envío o tienda |
| **Servicio técnico** | técnico, videos (n de n), listo sí/no, horas en revisión |
| **Documento** | OP o FVE con su número, o «Falta» |
| **Envío** | transportadora, guía y hora; enviada al cliente sí/no |
| Estado | *En alistamiento · Listo para despachar · Enviado · Entregado · Cancelado* |

**RPD-10 · Filtros y búsqueda.** Estado, rango de fechas, entrega, técnico, transportadora, «sin documento», «sin enviar la guía», y búsqueda por
cliente, teléfono, código del equipo, número de pedido, de guía o de documento. Atajos arriba con contador: *Por enviar · Enviados hoy ·
Sin documento · Sin entregar hace más de X días*.

**RPD-11 · Detalle del pedido** (`/pedidos/[id]`, o panel lateral): la trazabilidad completa en una **línea de tiempo** y las piezas a la vista.

1. Pago validado (quién, cuándo) y comprobante.
2. Entró a Alistamiento · el técnico lo tomó · cada video subido (técnico, hora, peso) · checklist · marcado listo (quién, cuándo).
3. Documento puesto por el asesor (OP o FVE, número, archivo si lo hay) · se envió al cliente.
4. Video enviado al cliente · guía enviada (transportadora, número y la **foto**) · pasó a Despachado y Vendido · entregado.
5. Enlaces: «Abrir ficha del cliente» y «Abrir chat».

Sale de lo que ya se guarda (`alistamientos`, `alistamiento_videos`, `lead_eventos` tipo `alistamiento`, `historial_etapas`); no hay que registrar nada nuevo.

**RPD-12 · Alertas del módulo (solo marcas en la lista, sin mensajes al cliente):**
- Listo para despachar hace más de X horas sin guía.
- Pedido sin documento (FVE/OP) hace más de X horas.
- Guía puesta pero no enviada al cliente.
- Enviado hace más de X días sin marcar entrega.
- Fuera de las 24 h de Meta (el envío saldría solo con plantilla; ver F4·46).

**RPD-13 · Exportar a CSV/Excel** lo que muestra el filtro (para contabilidad: pedidos con su FVE u OP y su guía).

**RPD-14 · Permisos.** Permiso nuevo `ver_pedidos`: administrador y asesores. **El técnico no lo recibe** (solo ve Servicio técnico, RAL-08). El
total y el comprobante de pago solo los ve quien tiene `validar_pagos` o `ver_metricas`.

**RPD-15 · Embudo.** La tarjeta de una oportunidad en Alistamiento muestra una pastilla con el paso (*Por revisar · En revisión · Listo*), tal como
prometía RAL-01 y todavía no existe, con un enlace al pedido.

## 5. Modelo (para construir)

- **Migración 0058** (la siguiente libre): `alistamientos.numero` (consecutivo, único) con su secuencia; permiso `ver_pedidos` y su asignación a roles.
- Función `pedidos_lista(filtros, pagina)` (SQL, `security definer`, respeta permisos) que une `alistamientos`, `oportunidades`, `leads`,
  `cotizaciones` y `alistamiento_videos` y devuelve el estado calculado; y `pedido_detalle(id)` con la línea de tiempo.
- Índices en `alistamientos (estado)`, `(guia_en)`, `(creado_en desc)`; paginado de 50 en 50.
- Pantallas: `crm/src/app/(app)/pedidos/` (lista y detalle), y los componentes nuevos de la ficha (`PedidoCabecera`, `PedidoPasos`, etc.).
- Menú: entrada **Pedidos** en `crm/src/lib/modulos.ts`, grupo Atención.
- Pruebas: SQL (`supabase/pruebas/0058_pedidos.sql`: numeración, estado calculado, permisos, que el técnico no vea la lista) y `next build`.

## 6. Plan por bloques (cada uno se prueba y se aprueba)

1. **A. Ficha por pasos** (RPD-01 a RPD-07): solo pantalla. Se puede probar con el pedido que ya existe en la base.
2. **B. Lista y detalle de Pedidos** (RPD-08 a RPD-11, RPD-14): migración 0058, lista, filtros, detalle y línea de tiempo.
3. **C. Alertas, exportar y Embudo** (RPD-12, RPD-13, RPD-15).

## 7. Por decidir con el dueño antes de construir

| # | Pregunta | Propuesta |
|---|---|---|
| 1 | ¿«Todos los pedidos enviados» es solo los que ya tienen guía o también los que están en alistamiento? | Mostrar **todos** los pedidos con filtro de estado; por defecto, *Enviados* |
| 2 | ¿El número de pedido `PED-0001` sirve o prefieres usar el consecutivo de la cotización? | Número propio de pedido |
| 3 | ¿Quién ve la lista? | Administrador y asesores; contabilidad con un rol de solo lectura si lo quieres |
| 4 | ¿Cuántas horas y días son los umbrales de las alertas (RPD-12)? | Guía: 24 h · documento: 24 h · entrega: 7 días |
| 5 | ¿Una venta cancelada después del pago aparece en Pedidos? | Sí, con estado *Cancelado* |
| 6 | ¿«Documento de garantía» es el OP (POS) o hay otro? | El OP; si hay otro, se agrega el tipo |

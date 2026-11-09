# Pedidos: ficha ordenada por el proceso y módulo de seguimiento de envíos (F4·54 y F4·55)

> **Estado:** 🔵 **bloque A construido el 9 nov 2026 (falta la prueba del dueño)**; B y C sin construir. Documentada el 9 nov 2026 por pedido del dueño y **ajustada con sus respuestas el mismo día** (regla de cierre único, vista Kanban,
> cancelación y diseño más profesional). **No está construida; se construye cuando el dueño dé la orden.**
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

### Reglas del cierre: un pedido se envía una sola vez (pedido del dueño, 9 nov 2026)

Ejemplo del dueño: un cliente compra, se cierra el pedido por WhatsApp y **no se le puede mandar dos veces la guía ni el video**. Si compra otra
vez es **otro pedido** (otra oportunidad, RE-03), con sus propios envíos.

- **RPD-16 · Guía: se envía una sola vez.** Al enviarla, el pedido pasa a Despachado y Vendido y **desaparece «Reenviar guía»**. Solo se puede
  reintentar si el envío **falló** (Meta no lo aceptó: queda «no se le envió al cliente» y el botón sigue). Corregir una guía equivocada lo hace
  solo un administrador, con motivo, y queda en el historial.
- **RPD-17 · Video y documento: 24 horas para enviarlos o reenviarlos.** Pasadas 24 h desde el primer envío, o con el pedido cerrado, los botones
  desaparecen y queda la marca **✓ Video enviado · 8 nov 6:18 p. m.** y **✓ FVE enviada · 7 nov 6:57 p. m.** (check verde y hora, sin botón).
  *(Entendí así el «24 horas»; confirmar la cuenta en la sección 7.)*
- **RPD-18 · La base lo hace cumplir**, no solo la pantalla: `alistamiento_para_enviar` rechaza el envío repetido (y la prueba SQL lo comprueba),
  para que ni un doble clic ni dos asesores a la vez lo manden dos veces. Cada envío queda en la línea de tiempo.
- **RPD-19 · Cancelar un pedido** (el cliente dice «ya no compro» o hay una novedad): botón **Cancelar pedido** con motivo obligatorio, antes de
  enviar la guía. El pedido queda **Cancelado** (se ve en la lista y el Kanban), la oportunidad pasa a **Perdida** con ese motivo y el técnico deja
  de verlo. Si ya salió la guía no se cancela: es una devolución y se atiende como caso de **Pos Venta**.

### Diseño: más ordenado y profesional (pedido del dueño, 9 nov 2026)

Lo que se ve hoy en la ficha (captura del dueño): textos en mayúsculas pequeñas, chips sueltos sin jerarquía, una lista larga de datos sin separar
y botones sueltos. La propuesta, para el panel angosto de la ficha y para la pantalla ancha:

- **RPD-20 · Tarjetas con encabezado y pie fijos:** cada sección (Servicio técnico, Documento, Enviar al cliente) es una tarjeta con título,
  icono de línea (no emoji), estado a la derecha y una línea de resumen; márgenes de 12 px y separación uniforme.
- **RPD-21 · Una sola escala de texto:** título 15 px, texto 14 px, datos secundarios 12 px **sin mayúsculas forzadas**, etiquetas en gris y
  valores en el color normal. Los datos clave (técnico, FVE, guía) como pares «etiqueta · valor» alineados en dos columnas.
- **RPD-22 · Estados con un solo lenguaje de colores:** verde = hecho (con ✓), azul = en curso, ámbar = falta algo, gris = no aplica o cerrado, rojo = problema.
  Las mismas pastillas en la ficha, en Pedidos, en el Kanban y en el Embudo.
- **RPD-23 · La barra de 5 pasos** (RPD-02) con círculos y línea, el paso actual resaltado y la fecha debajo de cada paso hecho.
- **RPD-24 · Acciones con jerarquía:** un solo botón principal por sección (el siguiente paso); los demás secundarios. Los envíos hechos pasan a
  **✓ enviado + hora**, sin botón (RPD-16 y RPD-17). Los botones apagados explican por qué, escrito debajo.
- **RPD-25 · Videos y fotos con miniatura** (no un enlace «Ver»), con peso y quién lo subió en una línea.
- **RPD-26 · Se respeta el tema de Apariencia** (claro/oscuro y colores de marca) y funciona en celular, tablet y computador.
- **Maqueta de la ficha y del Kanban aprobada por el dueño el 9 nov 2026** (pasos, tarjetas, ✓ enviado, Kanban de 5 columnas). Falta la orden de construir.

### Cambiar el video o el documento: abierto en la ficha, cerrado solo con «Corregir» (pedido del dueño, 9 nov 2026, **construido el 9 nov, falta la prueba del dueño**)

**Cómo está hoy (bloque A):** en la ficha el asesor **puede cambiar el FVE/OP en cualquier momento**, incluso con el pedido ya Vendido o
entregado (nada lo frena). El **video no se cambia desde la ficha**: solo lo sube el técnico en Servicio técnico mientras tiene el pedido
**en revisión**; si ya lo marcó listo, debe pulsar «Volver a revisión» y subir otro. Cuando el pedido sale de la etapa Alistamiento
(Despachado, Vendido, Perdido) **desaparece de Servicio técnico** y el video ya no se puede cambiar por ningún lado.

**Lo que pidió el dueño:** mientras el flujo está abierto se puede cambiar; cuando el pedido se entrega y se cierra, **la ficha queda bloqueada**,
pero desde una tabla de **Servicio técnico** o de **Pedidos** se debe poder **corregir** el video o la factura.

- **RPD-27 · Abierto = editable donde se trabaja.** Mientras la oportunidad está abierta y el pedido no está cancelado: el asesor cambia el
  FVE/OP en la ficha (como hoy) y el técnico reemplaza el video en Servicio técnico con un botón **«Reemplazar video»** que no obliga a «Volver a
  revisión» (el video anterior queda en el historial, no se borra).
- **RPD-28 · Cerrado = la ficha solo muestra.** Con el pedido **Vendido, Entregado o Cancelado**, la sección Documento muestra el número sin
  formulario y el servicio técnico solo se ve. La base lo hace cumplir: `alistamiento_documento` y `alistamiento_video_registrar` se niegan con
  el pedido cerrado.
- **RPD-29 · «Corregir» en las tablas.** En **Pedidos** (detalle del pedido) y en **Servicio técnico** (pestaña nueva **«Cerrados»**, últimos 6
  meses, que es lo que se guardan los videos) hay un botón **«Corregir»** para cambiar el FVE/OP o subir otro video a un pedido cerrado.
  Pide **motivo** («factura anulada y reemplazada», «video equivocado»…), deja el valor anterior y el nuevo en la línea de tiempo y **no mueve
  el embudo** (el pedido sigue Vendido o Entregado).
- **RPD-30 · Quién corrige.** Permiso nuevo `corregir_pedidos`: el documento lo corrige el administrador (propuesta: también el asesor con ese
  permiso) y el video lo sube el técnico (con «¿Quién eres?»), pero el «Corregir» de un pedido cerrado lo **autoriza** quien tenga el permiso.
- **RPD-31 · ¿Se le envía la corrección al cliente?** Propuesta: tras corregir, se habilita **un** envío del documento o del video corregido
  (con la misma regla de 24 h de WhatsApp), con el texto «Te enviamos tu FVE corregida»; si no, la corrección queda solo interna.

**Decidido (9 nov 2026, con las propuestas):** corrige quien tenga `corregir_pedidos` (de entrada solo el **administrador**; se le puede dar
a un rol de asesor en Roles), la corrección **se puede enviar una vez** al cliente y un pedido **cancelado queda congelado**.

**Cómo quedó construido (migración 0059, `supabase/pruebas/0059_pedido_cerrado_y_corregir.sql`, 17 pruebas; 0054 a 0058 siguen en verde):**
- `alistamiento_cerrado()` (cancelado u oportunidad no abierta). `alistamiento_documento` se niega con el pedido cerrado.
- `alistamiento_video_registrar`: en revisión (quien lo tiene), **listo = reemplazar** (cualquier técnico, sin «Volver a revisión») y cerrado
  solo con la corrección autorizada (se gasta al subir el video). Cancelado: nunca.
- `alistamiento_corregir_documento` y `alistamiento_corregir_video` (permiso `corregir_pedidos`, motivo, solo cerrado y no cancelado), con el
  antes, el después y el motivo en la línea de tiempo; el embudo no se mueve.
- `alistamiento_para_enviar`: la corrección pendiente habilita **un** envío aunque el pedido esté cerrado o pasaran las 24 h; el video corregido
  espera a estar comprimido. El receptor manda **solo lo corregido** con su texto («Te enviamos tu FVE corregida…», «…el video corregido…»).
  `prueba_envios_alistamiento.py` 15/15.
- `servicio_tecnico_cerrados()` y pestaña **Cerrados** en Servicio técnico (últimos 6 meses, sin cancelados): videos de cada equipo,
  «Autorizar video corregido» para quien tenga el permiso y, ya autorizado, «Subir video» para el técnico. La lista muestra el número PED.
- Ficha: con el pedido cerrado, Documento sin formulario; con el permiso, **«Corregir documento»** (número nuevo y motivo) y **«Autorizar video
  corregido»**; en Enviar al cliente, **«Enviar corregido»**; el «Siguiente paso» lo recuerda.
- **Mientras no exista el módulo Pedidos (bloque B)**, corregir el documento se hace desde la ficha (solo con el permiso); el video, desde
  la ficha o Servicio técnico → Cerrados.

## 4. Mejora B · Módulo «Pedidos» (F4·55)

Nueva pantalla **Pedidos** (`/pedidos`, grupo **Atención**, junto a Embudo y Servicio técnico). **Solo consulta y filtra**; las acciones
(enviar, subir guía) se siguen haciendo en la ficha, a un clic.

**RPD-08 · Qué es un pedido.** Una venta con pago validado que entró a Alistamiento: es una fila de `alistamientos`, con su oportunidad, su
cliente y su cotización (total, equipos, consecutivo). **Número interno consecutivo** (`PED-0001`…, decidido por el dueño), que se asigna al entrar a Alistamiento;
los que ya existen se numeran por fecha al migrar. El **número de la FVE o del OP no es este**: lo da contabilidad y se escribe en el pedido; el **video lo sube el servicio técnico**.

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
| Estado | *Por revisar · En revisión · Listo para despachar · Enviado · Entregado · Cancelado* |

**RPD-10 · Dos vistas: Lista y Kanban** (respuesta del dueño: filtrar y ver en qué estado está cada pedido). El mismo filtro vale para las dos. El **Kanban** tiene una
columna por estado: *Por revisar · En revisión · Listo para despachar · Enviado · Entregado · Cancelado*; la tarjeta muestra pedido, cliente, equipos,
técnico, documento (✓ o «falta»), días en el estado y alertas, y al abrirla va al detalle. **Solo se mira**: no se arrastra para mover (el estado
lo mueven las acciones de la ficha y de Servicio técnico, y el embudo solo avanza).

**RPD-10b · Filtros y búsqueda.** Estado, rango de fechas, entrega, técnico, transportadora, «sin documento», «sin enviar la guía», y búsqueda por
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

- **Migración 0058** (la siguiente libre): `alistamientos.numero` (consecutivo, único) con su secuencia; permiso `ver_pedidos` y su asignación a roles;
  estado `cancelado` con motivo y quién; envío único de guía y 24 h para video y documento dentro de `alistamiento_para_enviar` (RPD-16 a RPD-18).
- Función `pedidos_lista(filtros, pagina)` (SQL, `security definer`, respeta permisos) que une `alistamientos`, `oportunidades`, `leads`,
  `cotizaciones` y `alistamiento_videos` y devuelve el estado calculado; y `pedido_detalle(id)` con la línea de tiempo.
- Índices en `alistamientos (estado)`, `(guia_en)`, `(creado_en desc)`; paginado de 50 en 50.
- Pantallas: `crm/src/app/(app)/pedidos/` (lista y detalle), y los componentes nuevos de la ficha (`PedidoCabecera`, `PedidoPasos`, etc.).
- Menú: entrada **Pedidos** en `crm/src/lib/modulos.ts`, grupo Atención.
- Pruebas: SQL (`supabase/pruebas/0058_pedidos.sql`: numeración, estado calculado, permisos, que el técnico no vea la lista) y `next build`.

## 6. Plan por bloques (cada uno se prueba y se aprueba)

1. **A. Ficha por pasos y diseño** (RPD-01 a RPD-07, RPD-20 a RPD-26), con la **regla de envío único** (RPD-16 a RPD-18, que sí toca la base): previa **maqueta aprobada**. Se puede probar con el pedido que ya existe en la base.
2. **B. Lista, Kanban y detalle de Pedidos** (RPD-08 a RPD-11, RPD-14): migración 0058, lista, filtros, detalle y línea de tiempo.
3. **C. Alertas, exportar y Embudo** (RPD-12, RPD-13, RPD-15) y la cancelación (RPD-19).

## 6b. Cómo quedó construido el bloque A (9 nov 2026)

- **Migración 0058** (`supabase/pruebas/0058_pedido_numero_envio_unico_y_cancelar.sql`, 19 pruebas; las de 0054, 0056 y 0057 siguen en verde):
  - `alistamientos.numero` consecutivo y único (PED-0001…; el pedido que ya existía quedó PED-0001) y `primer_video_en` / `primer_documento_en`
    (un disparador guarda la hora del **primer** envío; de ahí se cuentan las 24 h).
  - `alistamiento_para_enviar` aplica RPD-16 a RPD-18: **guía y aviso de recogida una sola vez**, **video y documento 24 h desde el primer envío y
    con el pedido abierto**, y cada envío **reserva su lugar 90 s** (`envios_en_curso`) para que un doble clic o dos asesores no lo manden dos
    veces. `alistamiento_guia` y `alistamiento_entregado` también se niegan a repetirse.
  - `alistamiento_cancelar` (RPD-19): motivo obligatorio, solo antes de que se registre la guía; deja el pedido **Cancelado**, la oportunidad
    **Perdida** con el motivo, y el evento en la línea de tiempo.
  - Arreglo: la columna nueva `numero` chocaba con una variable de `alistamiento_documento`; se renombró la variable.
- **Receptor** (`resolver_alistamiento`): pase lo que pase al enviar, suelta la reserva (`prueba_envios_alistamiento.py` 12/12).
- **Ficha → Oportunidades** (`leads/[id]/pedido/PedidoCliente.tsx` y `pedido.ts`, reemplazan a `AlistamientoCliente.tsx`):
  - Tarjeta de cabecera: pedido, estado, equipos, total, **la etapa del embudo arriba** (con su selector), **barra de pasos** y **«Siguiente
    paso»** con botón «Ir» que abre y lleva a la sección.
  - Secciones plegables: Pago, Servicio técnico (miniatura del video), Documento, **Enviar al cliente** (✓ y hora; Reenviar solo dentro de las
    24 h; el motivo escrito cuando un botón no aplica; **Cancelar pedido**), Historial del pedido y, al final, Otras oportunidades del cliente.
  - Estilos `.ped-*` en `globals.css`, con los colores del tema (claro y oscuro).
- **Desviación de la maqueta:** la barra tiene **4 pasos en envío** (Pago, Alistamiento, Listo, Enviado: la guía deja el pedido en Vendido y no hay
  dato de entrega por transportadora) y **5 en tienda** (con Aviso de recogida y Entregado).
- **Verificado:** pruebas SQL y de Python, `tsc`, lint y `next build`; app y receptor reiniciados. **No se vio en el navegador**: falta que el dueño
  revise el diseño con el pedido de Jhonatan Marin (PED-0001; su video y su FVE ya pasaron las 24 h, así que solo conservan el ✓).
- **Falta (bloque B y C):** módulo `/pedidos` con lista y Kanban, detalle, permiso `ver_pedidos`, alertas, exportar y pastilla en el Embudo.

## 7. Decisiones del dueño (9 nov 2026) y lo que falta

| # | Tema | Decisión |
|---|---|---|
| 1 | Qué pedidos se ven | **Todos**, con filtros **y vista Kanban** para ver en qué estado está cada uno (RPD-10) |
| 2 | Número | **Consecutivo interno** (`PED-0001`). El número de la FVE o del OP lo pone contabilidad (vía el asesor) y el video lo sube el servicio técnico |
| 3 | Para qué | **Controlar los procesos de pedidos**: lo ven administrador y asesores (la lista no la ve el técnico) |
| 4 | Alertas | **Sí, con plazos** (RPD-12) |
| 5 | Cancelación | **Sí**: el cliente puede decir «no compro» u otra novedad (RPD-19) |
| 6 | Envío único | **Guía y video no se mandan dos veces**; video y documento se pueden enviar 24 h y luego quedan con ✓ (RPD-16 a RPD-18) |
| 7 | Diseño | **Más ordenado y profesional** en la ficha (RPD-20 a RPD-26) |

**Quedan por confirmar (propuestas mías):**

1. **Las 24 horas de RPD-17**: ¿se cuentan desde el primer envío del video, o desde que el técnico lo marca listo? ¿Y si pasan sin haberlo enviado, se
   envía con plantilla de Meta?
2. **Plazos de las alertas** (RPD-12): guía 24 h después de «listo», documento 24 h, entrega 7 días. ¿Te sirven?
3. **Quién escribe el FVE/OP:** hoy lo escribe el asesor con el dato de contabilidad. ¿Quieres un rol **Contabilidad** que lo escriba y vea Pedidos en solo lectura?
4. **Cancelar con la guía ya enviada:** propongo que sea una devolución por Pos Venta (RPD-19). ¿De acuerdo?
5. **«Documento de garantía»:** ¿es siempre el OP (POS)?

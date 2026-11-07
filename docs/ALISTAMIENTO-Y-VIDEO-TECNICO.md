# Embudo de alistamiento: servicio técnico, video de soporte y guía (F4·50)

> **Estado:** documentada el 7 nov 2026 y **con las respuestas del dueño incorporadas** (sección 6); **sin construir**. Parte de F4·33 (etapas
> Alistamiento y Despachado, [LEADS.md §C](LEADS.md)) y de F4·46/F4·47 (el cliente ya recibe la política de despacho que promete el video).
> **¿Es posible? Sí.** Lo difícil no es el embudo, es el **video**: peso, límite de WhatsApp y espacio en disco (ver «Veredicto»).

## 1. Qué se quiere

Hoy, tras validar el pago, la oportunidad pasa a **Alistamiento** (revisión del técnico) y el asesor sigue todo a mano. El dueño quiere que el
**servicio técnico** tenga su propio recorrido, con trazabilidad de cada pedido y de su **video de soporte técnico**:

- **Quiénes:** servicio técnico: Camilo Osorio, Sebastián Melenje y Josep, **con un solo usuario compartido** (RAL-08).
- **Qué hacen:** revisión, inspección, mantenimiento, cambio de pasta térmica y prueba de que la máquina queda funcional. Graban un **video de
  soporte técnico** que muestra lo necesario. **El técnico solo sube el video de confirmación**; no escribe al cliente.
- **Qué se agrega al proceso:**
  1. Campo **Número de OP de garantía (POS) o FVE (factura electrónica)**, que **pone el asesor** con el dato que le da contabilidad.
  2. **Subir el video MP4** grabado con el celular, directo al servidor, **uno por equipo**.
  3. Botón **✅ Revisado, listo para despachar**: control interno del servicio técnico.
- **Objetivo:** trazabilidad de los pedidos y de sus videos de soporte; el video lo sube el técnico y **el asesor lo envía al cliente**.
- **Después:** **despacho por transportadora**: el equipo sale de inmediato con la transportadora; al **enviar la guía** (botón o foto de la guía) la
  oportunidad pasa sola a **Despachado** y **Vendido**. **Recojo en tienda:** se avisa al cliente cuando está listo.

## 2. Reglas (con las decisiones del dueño del 7 nov 2026)

**RAL-01 · Un embudo propio «Alistamiento».** Como Pos Venta o Distribuidor, un embudo nuevo para el servicio técnico. Cuando el asesor valida el
pago (F4·46), además de que la oportunidad de **Cliente Final** quede en *Alistamiento*, se crea la oportunidad del embudo **Alistamiento**
(una por pedido, con todos sus equipos). Ventas ve su embudo limpio y el técnico ve solo lo suyo. Etapas:

| Etapa | Qué significa | Quién la mueve |
|---|---|---|
| **Por alistar** | Pedido pagado, esperando al servicio técnico | Sistema (al validar el pago) |
| **En revisión** | El técnico lo tomó (queda quién) | Técnico |
| **Listo para despachar** | Revisado, con video por equipo (botón de RAL-06) | Técnico, con el botón |
| **Entregado** | Salió con la transportadora o lo recogieron | Sistema (al enviar la guía) o asesor (tienda) |

**RAL-02 · Ficha del pedido** (sección «Alistamiento» en la ficha y en la tarjeta): cliente, equipos con código, método de entrega (envío o
tienda), técnico que lo atendió, documento, videos y checklist. El asesor la ve completa desde la ficha del cliente.

**RAL-03 · Documento del pedido: lo pone el asesor.** Selector **OP de garantía (POS)** o **FVE (factura electrónica)** y su número, que le da
contabilidad. El asesor lo escribe en la sección Alistamiento de la ficha (el sistema se lo recuerda al validar el pago). El técnico lo **ve**,
no lo escribe. Mientras falte, la tarjeta dice «Falta el documento (lo pone el asesor)» y el botón del técnico no se activa (por confirmar, §6).

**RAL-04 · Checklist opcional** con lo que hace el técnico: revisión, inspección, mantenimiento, cambio de pasta térmica y prueba funcional.
Casillas que no bloquean, para que quede registrado qué se le hizo a cada equipo.

**RAL-05 · Un video MP4 por equipo.** El técnico sube desde el celular o el computador **un video por cada equipo** del pedido. Se ve en la ficha
(reproductor) con quién lo subió, cuándo, peso y a qué equipo pertenece. Un equipo puede tener varios intentos; se conserva el historial. El
técnico **no envía nada al cliente**.

**RAL-06 · Botón «✅ Revisado, listo para despachar» (control interno).** Solo se activa con el documento (RAL-03) y **un video por cada equipo**
(RAL-05). Queda en el historial (quién, cuándo) y la oportunidad pasa a *Listo para despachar*. **No** avisa al cliente ni mueve el embudo de
Cliente Final: es un control interno entre el servicio técnico y el asesor. El asesor recibe el aviso de que el pedido está listo.

**RAL-07 · Lo que hace el asesor** (el cliente solo recibe mensajes que el asesor manda con un clic):
- **«🎥 Enviar video al cliente»:** envía por WhatsApp el video de cada equipo (con el texto de la política de despacho) después de revisarlo.
- **Envío por transportadora:** el asesor registra la **guía** con **«📦 Enviar guía»**: sube la **foto de la guía** (y, si quiere, transportadora y
  número, que ya existen como datos de la ficha) y se manda al cliente. **Al enviarla**, la oportunidad de Cliente Final pasa **sola** a
  **Despachado** y **Vendido** y la de Alistamiento a *Entregado*. Despachado no tiene botón propio.
- **Recojo en tienda:** **«🔔 Avisar: listo para recoger»** manda «Tu equipo está listo, te esperamos en CC La Pasarela, local 2-107». Al entregarlo,
  el asesor marca *Entregado* y la oportunidad de Cliente Final pasa a **Vendido**.
- El embudo solo avanza: nunca se mueve hacia atrás de forma automática.

**RAL-08 · Rol y usuario: uno solo para el servicio técnico.** Rol **Técnico** con permiso nuevo `gestionar_alistamiento`: ve el embudo
Alistamiento y la ficha de sus pedidos, sube videos y marca el botón. **No** ve la Bandeja de chats, las métricas ni los datos de pago. Se crea
**un usuario «Servicio técnico»** y su correo en la política `Equipo` de Cloudflare Access ([decisión 0037](decisiones/0037-crm-por-internet-con-cloudflare-access.md)).
Como el usuario es compartido, el sistema pregunta **«¿Quién eres?»** (Camilo, Sebastián o Josep) al tomar un pedido y al subir un video, para no
perder la trazabilidad por persona. El código de acceso de Cloudflare llega a ese correo: debe ser uno al que los tres puedan entrar.

**RAL-09 · Trazabilidad.** Todo queda en la línea de tiempo del cliente y en un historial del pedido: quién tomó, quién subió cada video, qué
documento puso el asesor, cuándo se marcó listo, cuándo se envió el video, la guía y la entrega. Un reporte simple: pedidos por técnico y tiempo de
alistamiento por pedido.

**RAL-10 · Videos: se guardan 6 meses** (por garantía) y luego se borran solos. Solo se conserva la copia comprimida.

## 3. Veredicto: es posible, con tres límites que hay que decidir

| Límite | Hoy | Qué implica |
|---|---|---|
| **Subida al servidor** | El almacenamiento acepta archivos de hasta **50 MB** (`FILE_SIZE_LIMIT`); las acciones de la app, **21 MB**; Cloudflare, **100 MB** por envío | Los videos suben **directo al almacenamiento** (con reanudación), no por la app. Hay que subir el límite del almacenamiento a 100 MB y crear un bucket privado para videos. |
| **WhatsApp** | La API de Meta acepta **video hasta 16 MB**; como documento, hasta 100 MB | Un video de celular de 1 minuto suele pesar 60–130 MB. Se **comprime en el servidor** a 720p con `ffmpeg` (≈ 2 Mbps, unos 15 MB por minuto: caben hasta ~1 minuto en los 16 MB), que **no está instalado** (se instala con `apt`, ya autorizado). Si aun así pasa de 16 MB, se envía como documento. |
| **Espacio** | 93 GB libres en el disco principal; respaldos aún sin hacer (F5·2) | A 20 videos al día de 60 MB son 1,2 GB/día. Se guarda **solo la copia comprimida**, 6 meses, y entra al plan de respaldos. |

**Tamaño recomendado para el técnico:** grabar en **720p o 1080p, de 1 a 2 minutos por equipo**. El sistema acepta hasta **100 MB** por video y lo
comprime a ≈ 15 MB por minuto; para que entre como video en WhatsApp (16 MB) conviene que dure **hasta 1 minuto**; uno más largo se envía como
documento. Un iPhone graba en formato MOV/HEVC: también se acepta y el servidor lo convierte a MP4.

**Otros riesgos:** (1) la ventana de 24 h de Meta: si el cliente no escribió en las últimas 24 h, el video, el aviso y la guía solo salen con
plantilla aprobada (la misma pendiente de F4·46, `crm_pago_confirmado`); (2) la compresión consume procesador: se hace en segundo plano, de uno en
uno; (3) los videos son privados: se ven con enlace firmado y solo para quien tenga permiso; (4) un usuario compartido pierde la identidad de
quien hace cada cosa: por eso el «¿Quién eres?» de RAL-08.

## 4. Modelo propuesto (para construir)

- `alistamientos`: un pedido (oportunidad de Alistamiento, lead, entrega envío/tienda, documento tipo y número puesto por el asesor, técnico,
  `listo_en`, `listo_por`, `entregado_en`).
- `alistamiento_equipos`: cada equipo del pedido (código) con su checklist.
- `alistamiento_videos`: equipo, ruta en el bucket privado `videos-tecnicos`, peso, técnico (de «¿Quién eres?»), cuándo, `enviado_al_cliente_en`,
  `vence_en` (6 meses).
- Embudo y etapas nuevos; `gestionar_alistamiento` en `permisos`; el rol Técnico.
- Receptor: tarea de fondo que comprime el video (`ffmpeg`) y borra los vencidos, y rutas para enviar el video, el aviso de «listo» y la guía.
- Pantallas: embudo y ficha del técnico (carga con barra de avance, reproductor, botón), sección en la ficha del lead para el asesor con
  «Enviar video», «Enviar guía» y «Avisar: listo para recoger».

## 5. Plan por bloques (cada uno se prueba y se aprueba)

1. **A. Embudo, rol y documento:** embudo Alistamiento, rol Técnico y su usuario con «¿Quién eres?», documento OP/FVE que pone el asesor, checklist y botón (sin video aún).
2. **B. Video:** bucket privado, subida directa con avance, reproductor, compresión con `ffmpeg`, un video por equipo obligatorio para el botón, vencimiento a 6 meses.
3. **C. Envío al cliente y cierre:** «Enviar video», «Enviar guía» con Despachado y Vendido automáticos, «Avisar: listo para recoger».
4. **D. Reportes:** pedidos por técnico y tiempos.

## 6. Respuestas del dueño (7 nov 2026)

| Pregunta | Respuesta |
|---|---|
| Botón del técnico | **«Revisado, listo para despachar»**, control interno; Despachado pasa solo al enviar la guía |
| Cuándo pasa a Vendido | Al **enviar la guía**, junto con Despachado; la guía se manda con un botón o enviando la foto de la guía |
| Quién registra la guía | El **asesor** |
| Video al cliente | Lo **sube el técnico y lo envía el asesor**; el técnico solo manda el video de confirmación |
| Retención | **6 meses** |
| Varios equipos | **Un video por equipo** |
| Usuarios | **Un solo usuario** para los técnicos |
| OP o FVE | Lo **pone el asesor**, con el dato de contabilidad |

**Cómo lo interpreté (por confirmar al construir):** (a) «enviar la foto de la guía» es un botón **«📦 Enviar guía»** donde el asesor sube la foto; no se
detecta sola una foto cualquiera del chat; (b) con un solo usuario se agrega «¿Quién eres?» para saber qué técnico hizo cada cosa; (c) la falta del
OP/FVE detiene el botón del técnico.

# Alistamiento con servicio técnico, video de soporte y guía: campos que disparan el embudo (F4·50)

> **Estado:** documentada el 7 nov 2026 con las respuestas y correcciones del dueño; **bloque A construido el 7 nov 2026** (falta la prueba del dueño); B, C y D por construir. Parte de F4·33 (etapas Alistamiento y
> Despachado, [LEADS.md §C](LEADS.md)) y de F4·46/F4·47 (el cliente ya recibe la política de despacho que promete el video).
> **Corrección del dueño (7 nov 2026):** **no se crea otro embudo ni otras etapas.** El embudo de Cliente Final queda como está:
> **Alistamiento → Despachado → Vendido → Perdido**. Lo nuevo son **campos y botones que actúan como disparadores** dentro de esas etapas.
> **¿Es posible? Sí.** Lo difícil no es el embudo, es el **video**: peso, límite de WhatsApp y espacio en disco (ver «Veredicto»).

## 1. Qué se quiere

Hoy, tras validar el pago, la oportunidad pasa a **Alistamiento** (revisión del técnico) y el asesor sigue todo a mano. El dueño quiere que el
**servicio técnico** deje trazabilidad de cada pedido y de su **video de soporte técnico**, y que los campos que se llenen **muevan solos** la
oportunidad:

- **Quiénes:** servicio técnico: Camilo Osorio, Sebastián Melenje y Josep, **con un solo usuario compartido** y un «¿Quién eres?» (RAL-08).
- **Qué hacen:** revisión, inspección, mantenimiento, cambio de pasta térmica y prueba de que la máquina queda funcional. Graban un **video de
  soporte técnico**. **El técnico solo sube el video de confirmación**; no escribe al cliente.
- **Campos nuevos:**
  1. **Número de OP de garantía (POS) o FVE (factura electrónica)**: lo pone el **asesor** con el dato de contabilidad y **se puede enviar al cliente**.
  2. **Video MP4** del celular, **uno por equipo**, subido directo al servidor.
  3. **✅ Revisado, listo para despachar**: control interno del servicio técnico.
  4. **Guía**: foto de la guía que entrega la transportadora (más transportadora y número, si se quiere).
- **Disparadores:** al enviar la guía, la oportunidad pasa **sola** a **Despachado** y **Vendido** (no hay botón de Despachado). El resto de campos
  son control y trazabilidad.

## 2. Reglas (con las decisiones del dueño del 7 nov 2026)

**RAL-01 · Sin embudo nuevo.** Se usan las etapas de **Cliente Final** que ya existen: *Alistamiento → Despachado → Vendido → Perdido*. El proceso
interno del técnico no son etapas: son **campos y marcas dentro de Alistamiento**, que se muestran como un indicador en la tarjeta:
*Por revisar → En revisión → Listo para despachar*. Solo la guía (o la entrega en tienda) mueve la etapa.

**RAL-02 · Sección «Alistamiento» en la ficha del cliente y en la tarjeta de la oportunidad:** equipos con código, método de entrega (envío o
tienda), quién lo atendió, documento, videos, checklist y guía. El asesor la ve completa; el técnico ve lo que necesita (RAL-08).

**RAL-03 · Documento del pedido: lo pone el asesor y se puede enviar al cliente.** Selector **OP de garantía (POS)** o **FVE (factura
electrónica)** y su número, que le da contabilidad. El asesor lo escribe en la sección Alistamiento (el sistema se lo recuerda al validar el
pago). El técnico lo **ve**, no lo escribe. El asesor puede **enviarlo al cliente** (el número y, si lo tiene, el archivo) y el mensaje de la guía
(RAL-07) lo incluye. Mientras falte, la tarjeta dice «Falta el documento (lo pone el asesor)» y el botón del técnico no se activa.

**RAL-04 · Checklist opcional** con lo que hace el técnico: revisión, inspección, mantenimiento, cambio de pasta térmica y prueba funcional.
Casillas que no bloquean, para que quede registrado qué se le hizo a cada equipo.

**RAL-05 · Un video MP4 por equipo.** El técnico sube desde el celular o el computador **un video por cada equipo** del pedido. Se ve en la ficha
(reproductor) con quién lo subió, cuándo, peso y a qué equipo pertenece. Un equipo puede tener varios intentos; se conserva el historial. El
técnico **no envía nada al cliente**.

**RAL-06 · Botón «✅ Revisado, listo para despachar» (control interno).** Solo se activa con el documento (RAL-03) y **un video por cada equipo**
(RAL-05). Queda en el historial (quién, cuándo) y el indicador pasa a *Listo para despachar*. **No** avisa al cliente ni cambia la etapa del
embudo: es un control interno entre el servicio técnico y el asesor. El asesor recibe el aviso de que el pedido está listo.

**RAL-07 · Lo que hace el asesor** (el cliente solo recibe mensajes que el asesor manda con un clic):
- **«🎥 Enviar video al cliente»:** envía por WhatsApp el video de cada equipo (con la política de despacho) después de revisarlo.
- **Envío por transportadora, «📦 Enviar guía»:** el asesor sube la **foto de la guía que entrega la transportadora** (y, si quiere, transportadora y
  número, que ya existen como datos de la ficha) y se manda al cliente junto con el OP o FVE. **Al enviarla**, la oportunidad pasa **sola** a
  **Despachado** y **Vendido**. Despachado no tiene botón propio.
- **Recojo en tienda, «🔔 Avisar: listo para recoger»:** manda «Tu equipo está listo, te esperamos en CC La Pasarela, local 2-107». Al
  entregarlo, el asesor marca *Entregado* y la oportunidad pasa a **Vendido**.
- El embudo solo avanza: nunca se mueve hacia atrás de forma automática. **Perdido** sigue igual (motivo obligatorio, como hoy).

**RAL-08 · Rol y usuario: uno solo para el servicio técnico.** Rol **Técnico** con permiso nuevo `gestionar_alistamiento`: ve una pantalla
**«Servicio técnico»** con los pedidos que están en la etapa Alistamiento, sube videos y marca el botón. **No** ve la Bandeja de chats, las
métricas ni los datos de pago. Se crea **un usuario «Servicio técnico»** y su correo en la política `Equipo` de Cloudflare Access
([decisión 0037](decisiones/0037-crm-por-internet-con-cloudflare-access.md)). Como el usuario es compartido, el sistema pregunta **«¿Quién eres?»**
(Camilo, Sebastián o Josep) al tomar un pedido y al subir un video, y **ese registro queda** (RAL-09). El código de acceso de Cloudflare llega a
ese correo: debe ser uno al que los tres puedan entrar.

**RAL-09 · Trazabilidad.** Todo queda en la línea de tiempo del cliente y en un historial del pedido: qué técnico tomó el pedido y subió cada
video, qué documento puso el asesor, cuándo se marcó listo, cuándo se envió el video, la guía y la entrega. Un reporte simple: pedidos por técnico y
tiempo de alistamiento por pedido.

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

- `alistamientos`: un registro por oportunidad de Cliente Final que entra a Alistamiento: entrega (envío/tienda), documento (tipo y número, puesto
  por el asesor), estado interno (`por_revisar`, `en_revision`, `listo`), quién (técnico elegido), `listo_en`, `enviado_video_en`,
  `guia_enviada_en`, transportadora, número de guía y ruta de la foto de la guía.
- `alistamiento_equipos`: cada equipo del pedido (código) con su checklist.
- `alistamiento_videos`: equipo, ruta en el bucket privado `videos-tecnicos`, peso, técnico (de «¿Quién eres?»), cuándo, `enviado_al_cliente_en`,
  `vence_en` (6 meses).
- **Sin etapas nuevas.** Disparadores en la base: al guardar la guía (enviada) la oportunidad pasa a Despachado y luego a Vendido, como hoy lo
  hace un asesor, con su historial y sin saltarse las reglas del embudo. `gestionar_alistamiento` en `permisos`; el rol Técnico.
- Receptor: tarea de fondo que comprime el video (`ffmpeg`) y borra los vencidos, y rutas para enviar el video, el documento, el aviso de «listo» y
  la guía.
- Pantallas: «Servicio técnico» (pedidos en Alistamiento, carga con barra de avance, reproductor, botón) y, en la ficha del cliente, la sección
  Alistamiento del asesor con «Enviar video», «Enviar OP o FVE», «Enviar guía» y «Avisar: listo para recoger».

## 5. Plan por bloques (cada uno se prueba y se aprueba)

1. **A. Campos, rol y documento:** sección Alistamiento con documento OP/FVE que pone el asesor, checklist y botón «Revisado, listo para despachar»;
   rol Técnico, su usuario, la pantalla «Servicio técnico» y el «¿Quién eres?» (sin video aún).
2. **B. Video:** bucket privado, subida directa con avance, reproductor, compresión con `ffmpeg`, un video por equipo obligatorio para el botón,
   vencimiento a 6 meses.
3. **C. Envío al cliente y cierre:** «Enviar video», «Enviar OP o FVE», «Enviar guía» con Despachado y Vendido automáticos, «Avisar: listo para recoger».
4. **D. Reportes:** pedidos por técnico y tiempos.

## 5b. Cómo quedó construido el bloque A (7 nov 2026)

- **Migración 0054** (`supabase/pruebas/0054_alistamiento_servicio_tecnico.sql`, 17 pruebas): permiso `gestionar_alistamiento` (administrador y
  rol nuevo **Técnico**, que no tiene nada más), lista `alistamiento_tecnicos` (Camilo Osorio, Sebastián Melenje, Josep) y tabla `alistamientos`.
  Un disparador crea el registro cuando la oportunidad **llega a la etapa Alistamiento** (con sus equipos tomados de la oportunidad); los
  pedidos que ya estaban en Alistamiento se crearon al migrar. **No hay etapas nuevas.**
- Funciones: `alistamiento_documento` (asesor, `gestionar_oportunidades`), `alistamiento_tomar`, `alistamiento_checklist`, `alistamiento_listo`
  y `alistamiento_reabrir` (técnico, con el nombre de «¿Quién eres?» validado por la base), y `servicio_tecnico_pedidos` (lo que ve el técnico:
  nombre del cliente, entrega, equipos, documento y estado; **sin teléfono, chat ni pagos**). «Listo» exige el documento, pone la etiqueta
  `Listo-Para-Despachar` (el aviso para el asesor) y **no cambia la etapa**. Todo queda en la línea de tiempo (tipo `alistamiento`).
- Pantallas: módulo **Servicio técnico** (`/servicio-tecnico`, menú Atención) con «¿Quién eres?» (se recuerda en el navegador), pedidos «Por
  hacer» y «Listos», Tomar pedido, checklist, «✅ Revisado, listo para despachar» y «Volver a revisión»; el usuario técnico entra directo ahí.
  En la ficha del cliente, pestaña **Oportunidades**: tarjeta **🛠 Alistamiento** con estado, técnico, checklist y el formulario del documento
  (OP o FVE) para el asesor.
- **Falta para usarlo:** compilar y reiniciar la app; crear en Usuarios el usuario **«Servicio técnico»** con el rol **Técnico** y agregar su
  correo a la política `Equipo` de Cloudflare Access.

## 6. Decisiones del dueño (7 nov 2026)

| Tema | Decisión |
|---|---|
| Embudo | **No se crea otro.** Queda *Alistamiento → Despachado → Vendido → Perdido*; los campos son disparadores |
| Botón del técnico | **«Revisado, listo para despachar»**, control interno; Despachado pasa solo al enviar la guía |
| Vendido | Al **enviar la guía**, junto con Despachado |
| Guía | La registra el **asesor** subiendo la **foto de la guía que dan en la transportadora** |
| OP o FVE | Lo **pone el asesor** (se lo da contabilidad) y **se puede enviar al cliente** |
| Video al cliente | Lo **sube el técnico y lo envía el asesor**; el técnico solo manda el video de confirmación |
| Un video por | **Equipo** |
| Retención | **6 meses** |
| Usuarios | **Un solo usuario** para los técnicos, con **«¿Quién eres?»**, y **ese registro queda** |

**Por confirmar al construir:** (a) si «enviar el OP o FVE al cliente» es solo el número o también el archivo (se prevén ambos); (b) que la falta del
OP o FVE detenga el botón del técnico (lo dejé así); (c) que la pantalla «Servicio técnico» sea una vista aparte y no el embudo completo.

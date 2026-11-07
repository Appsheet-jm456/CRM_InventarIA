# Embudo de alistamiento: servicio técnico, video de soporte y guía (F4·50)

> **Estado:** documentada el 7 nov 2026, **sin construir**. Pedido del dueño. Parte de F4·33 (etapas Alistamiento y Despachado, [LEADS.md §C](LEADS.md))
> y de F4·46/F4·47 (el cliente ya recibe la política de despacho que promete el video).
> **¿Es posible? Sí.** Lo difícil no es el embudo, es el **video**: peso, límite de WhatsApp y espacio en disco (ver «Veredicto»).

## 1. Qué se quiere

Hoy, tras validar el pago, la oportunidad pasa a **Alistamiento** (revisión del técnico) y el asesor sigue todo a mano. El dueño quiere que el
**servicio técnico** tenga su propio recorrido, con trazabilidad de cada pedido y de su **video de soporte técnico**:

- **Quiénes:** servicio técnico: Camilo Osorio, Sebastián Melenje y Josep (el apellido de Josep, por confirmar).
- **Qué hacen:** revisión, inspección, mantenimiento, cambio de pasta térmica y prueba de que la máquina queda funcional. Graban un **video de
  soporte técnico** que muestra lo necesario.
- **Qué se agrega al proceso:**
  1. Campo **Número de OP de garantía (POS) o FVE (factura electrónica)**.
  2. **Subir el video MP4** grabado con el celular, directo al servidor.
  3. Botón **✅ Equipo revisado y enviado a servicio** (nombre exacto por confirmar, ver preguntas).
- **Objetivo:** que el servicio técnico deje **trazabilidad de los pedidos y de sus videos** y que ellos mismos envíen el video dentro del embudo.
- **Después:** si el pedido es **despacho por transportadora**, el equipo se entrega de inmediato a la transportadora; al **enviar la guía**
  la oportunidad pasa a **Despachado** y **Vendido**. Si es **recojo en tienda**, se avisa al cliente cuando está listo.

## 2. Cómo se propone (el dueño confirma o corrige)

**RAL-01 · Un embudo propio «Alistamiento».** Como Pos Venta o Distribuidor, un embudo nuevo para el servicio técnico. Cuando el asesor valida el
pago (F4·46), además de que la oportunidad de **Cliente Final** quede en *Alistamiento*, se crea la oportunidad del embudo **Alistamiento**
(una por pedido, con todos sus equipos). Ventas ve su embudo limpio y el técnico ve solo lo suyo. Etapas propuestas:

| Etapa | Qué significa | Quién la mueve |
|---|---|---|
| **Por alistar** | Pedido pagado, esperando técnico | Sistema (al validar el pago) |
| **En revisión** | El técnico lo tomó (queda su nombre) | Técnico |
| **Video por subir** | Terminó la revisión; falta el video y el documento | Técnico |
| **Revisado y enviado** | Con video, documento y casilla marcada (RAL-06) | Técnico, con el botón |
| **Entregado** | Se fue con la transportadora o lo recogieron | Asesor (guía) o asesor (tienda) |

**RAL-02 · Ficha del pedido para el técnico** (sección «Alistamiento» en la ficha y en la tarjeta): cliente, equipos del pedido con código,
método de entrega (envío o tienda), técnico responsable, documento, videos y checklist.

**RAL-03 · Documento del pedido.** Un selector **OP de garantía (POS)** o **FVE (factura electrónica)** y su número. Es **obligatorio** para
marcar «Revisado y enviado». Se guarda con quién y cuándo lo escribió.

**RAL-04 · Checklist opcional** con lo que hace el técnico: revisión, inspección, mantenimiento, cambio de pasta térmica y prueba funcional. Son
casillas (no bloquean) para que quede registrado qué se le hizo a cada equipo.

**RAL-05 · Video(s) de soporte técnico.** El técnico sube desde el celular o el computador un **MP4 por equipo** del pedido. Se ve en la ficha
(reproductor), con quién lo subió, cuándo, peso y a qué equipo pertenece. Un equipo puede tener varios intentos; se conserva el historial.

**RAL-06 · Botón «✅ Equipo revisado y enviado a servicio».** Solo se activa con: documento (RAL-03) y **al menos un video por equipo** (RAL-05). Al
pulsarlo queda en el historial (quién, cuándo) y la oportunidad pasa a *Revisado y enviado*.

**RAL-07 · Qué pasa al pulsarlo, según la entrega** (lo que ya prometen las políticas de F4·47):
- **Envío por transportadora:** el chat recibe **el video del equipo** y el aviso «🎥 Tu equipo fue revisado…». El asesor o el técnico registra
  **Transportadora** y **Número de guía** (ya existen como datos de la ficha). **Al guardar la guía** se manda al cliente (guía y transportadora) y
  la oportunidad de **Cliente Final** pasa a **Despachado** y **Vendido**, y la de Alistamiento a *Entregado*.
- **Recojo en tienda:** el chat recibe «🔔 Tu equipo está listo, te esperamos en CC La Pasarela, local 2-107». Al **entregarlo**, el asesor marca
  *Entregado* y la oportunidad de Cliente Final pasa a **Vendido**.
- El embudo solo avanza: nunca se mueve hacia atrás de forma automática.

**RAL-08 · Rol y usuarios.** Rol nuevo **Técnico** con permiso nuevo `gestionar_alistamiento`: ve el embudo Alistamiento y la ficha de sus pedidos,
sube videos y marca el botón. **No** ve la Bandeja de chats ni las métricas de ventas. Se crean tres usuarios (y su correo en la política
`Equipo` de Cloudflare Access, [decisión 0037](decisiones/0037-crm-por-internet-con-cloudflare-access.md)).

**RAL-09 · Trazabilidad.** Todo queda en la línea de tiempo del cliente y en un historial del pedido: quién tomó, quién subió cada video, qué
documento, cuándo se marcó revisado y cuándo se entregó. Un reporte simple: pedidos por técnico y tiempo de alistamiento por pedido.

## 3. Veredicto: es posible, con tres límites que hay que decidir

| Límite | Hoy | Qué implica |
|---|---|---|
| **Subida al servidor** | El almacenamiento acepta archivos de hasta **50 MB** (`FILE_SIZE_LIMIT`); las acciones de la app, **21 MB**; Cloudflare, **100 MB** por envío | Los videos suben **directo al almacenamiento** (con reanudación), no por la app. Hay que subir el límite del almacenamiento a 100 MB y crear un bucket privado para videos. |
| **WhatsApp** | La API de Meta acepta **video hasta 16 MB**; como documento, hasta 100 MB | Un video de celular de 1 minuto suele pesar 60–130 MB. Se **comprime en el servidor** a 720p con `ffmpeg` (≈ 2 Mbps, unos 15 MB por minuto: caben hasta ~1 minuto en los 16 MB), que **no está instalado** (se instala con `apt`, ya autorizado). Si aun así pasa de 16 MB, se envía como documento. |
| **Espacio** | 93 GB libres en el disco principal; respaldos aún sin hacer (F5·2) | A 20 videos al día de 60 MB son 1,2 GB/día. Se guarda **solo la copia comprimida** y se borra el original; con retención definida (preguntas) y entrando al plan de respaldos. |

**Tamaño recomendado para el técnico:** grabar en **720p o 1080p, de 1 a 2 minutos por equipo**. El sistema acepta hasta **100 MB** por video y lo
comprime a ≈ 15 MB por minuto; para que entre como video en WhatsApp (16 MB) conviene que dure **hasta 1 minuto**; uno más largo se envía como documento. Un iPhone graba en formato MOV/HEVC: también se acepta y el servidor lo convierte a MP4.

**Otros riesgos:** (1) la ventana de 24 h de Meta: si el cliente no escribió en las últimas 24 h, el video y la guía solo salen con plantilla
aprobada (la misma pendiente de F4·46, `crm_pago_confirmado`); (2) la compresión consume procesador: se hace en segundo plano, de uno en uno;
(3) los videos son privados: se ven con enlace firmado y solo para quien tenga permiso.

## 4. Modelo propuesto (para construir después de aprobar)

- `alistamientos`: un pedido (oportunidad de Alistamiento, lead, entrega envío/tienda, documento tipo y número, técnico, `revisado_en`,
  `revisado_por`, `entregado_en`).
- `alistamiento_equipos`: cada equipo del pedido (código) con su checklist.
- `alistamiento_videos`: equipo, ruta en el bucket privado `videos-tecnicos`, peso, quién, cuándo, `enviado_al_cliente_en`.
- Embudo y etapas nuevos; tipo de tarea automática «Alistar equipo» ligado al técnico; `gestionar_alistamiento` en `permisos`.
- Receptor: tarea de fondo que comprime el video (`ffmpeg`), y rutas para enviar el video, el aviso de «listo» y la guía.
- Pantallas: embudo y ficha del técnico (carga de video con barra de avance, reproductor, botón), sección en la ficha del lead para ventas.

## 5. Plan por bloques (cada uno se prueba y se aprueba)

1. **A. Embudo, rol y documento:** embudo Alistamiento, rol Técnico y sus 3 usuarios, documento OP/FVE, checklist, botón (sin video aún).
2. **B. Video:** bucket privado, subida directa con avance, reproductor, compresión con `ffmpeg`, obligatoriedad del video para el botón.
3. **C. Envío al cliente y cierre:** video, aviso de listo para recoger, guía, y los pases a Despachado y Vendido.
4. **D. Reportes:** pedidos por técnico y tiempos.

## 6. Preguntas abiertas para el dueño

1. **«Equipo check: Revisado y enviado servicio»:** ¿el botón significa *«revisado y listo para despachar o entregar»* (como lo planteé) o *«enviado a servicio técnico»* (que va de ventas hacia el técnico)?
2. **Vendido:** ¿pasa a **Vendido** al enviar la guía (como lo escribiste) o cuando el cliente confirme que le llegó?
3. **Quién registra la guía:** ¿el técnico, o el asesor?
4. **Video al cliente:** ¿se envía **automático** al pulsar el botón, o el asesor lo revisa antes de mandarlo?
5. **Retención de videos:** ¿cuánto tiempo se guardan (propuesta: 6 meses, por garantía, y luego se borran)?
6. **Un pedido con varios equipos:** ¿un video por equipo (propuesta) o uno solo del pedido?
7. **Josep:** apellido y correo de los tres técnicos para crear sus usuarios y el acceso por Cloudflare.
8. **OP/FVE:** ¿lo escribe el técnico o ya viene del pedido (lo pone el asesor al validar el pago)?

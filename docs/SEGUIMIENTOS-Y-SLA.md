# Seguimientos, alertas de SLA y plantillas de Meta (F3·6)

> Cierra F2·6 (diseño de seguimientos y SLA). Decisión 0021. Se apoya en la Bandeja (0020) y en el
> horario y el SLA de la 0012: primera respuesta en **10 min**, alerta a los **15**, solo en horario
> (L–V 8:00–18:00, Sáb 9:00–14:00, festivos cerrado).

---

## Reglas

**RS-01 · Un seguimiento recuerda, no envía.** Es una tarea para una persona ("llamar a Juan el jueves
por la cotización"): cuando vence, aparece como vencido en Seguimientos, en Inicio y en la ficha de la
Bandeja. Ningún mensaje sale solo hacia el cliente (dueño, 30 sep 2026). **Modificada por la
[0035](decisiones/0035-retorno-del-bot-y-mensaje-automatico.md) (6 nov 2026):** sigue valiendo para los seguimientos manuales, pero
el bot sí puede escribir solo en los dos casos de F4·45 (abajo), una vez y dentro de las 24 h.

**RS-02 · Todo seguimiento tiene cliente, responsable y fecha.** Lo crea quien tiene
`gestionar_oportunidades` sobre una conversación que puede ver; queda a su nombre. Asignárselo a otro pide
`ver_todas_conversaciones`.

**RS-03 · Un seguimiento se cierra como hecho o cancelado**, con nota opcional. No se borra.

**RS-04 · El SLA cuenta minutos hábiles.** El reloj arranca cuando el cliente pasa a la cola y se detiene
con el primer mensaje de un asesor. Fuera del horario y en festivos no corre: un cliente que escribe el
sábado a las 3 p. m. empieza a contar el lunes a las 8 a. m.

**RS-05 · Se alerta tres veces:** cuando alguien entra a la cola, a los 10 min hábiles sin respuesta
(se venció el SLA) y a los 15 (alerta). Con la app abierta suena un aviso corto y sale una notificación del
navegador; siempre se ve el número junto a *Bandeja* en el panel.

**RS-06 · Fuera de la ventana de 24 h solo se escribe con plantilla aprobada** (RB-02). La plantilla sale
de Meta con sus variables llenas, queda en `mensajes` como tipo `template` y cuenta como respuesta del
asesor. Si su categoría es *Marketing* o *Utilidad*, la app avisa que es cobrable.

## Modelo (migración 0005)

| Tabla / función | Para qué |
|---|---|
| `horario_atencion` | Día de la semana (0 = domingo), hora de apertura y cierre. Lo edita F3·7 |
| `festivos` | Fecha y nombre; sembrados los de Colombia de 2026 y 2027 |
| `seguimientos` | Cliente, responsable, qué hacer, cuándo vence, estado (`pendiente`, `hecho`, `cancelado`), quién lo creó, cuándo se cerró y nota |
| `minutos_habiles(desde, hasta)` | Minutos dentro del horario entre dos momentos |
| `minutos_espera(leads)` | Campo calculado: minutos hábiles sin respuesta de un asesor (null si ya respondió o no está en cola/asignada) |
| `crear_seguimiento`, `cerrar_seguimiento`, `reprogramar_seguimiento` | Escrituras con permiso (RS-02, RS-03) |

`registrar_mensaje_asesor` recibe el tipo (`text` o `template`).

**Leer seguimientos:** el responsable, o quien tiene `ver_todas_conversaciones`.

## Plantillas

- La app **lee las plantillas de la cuenta** desde Meta (nombre, idioma, categoría, estado y texto) y solo
  ofrece las aprobadas.
- **Canal WhatsApp** (`/canal`, permiso `administrar_canal`) las lista con su estado y permite **enviar a
  aprobación** las plantillas propuestas del CRM, después de que el dueño apruebe sus textos:

| Nombre | Categoría | Texto |
|---|---|---|
| `crm_retomar_conversacion` | Utilidad | Hola {{1}}, te escribimos de Ventas Virtuales Colombia. Quedó pendiente tu consulta sobre equipos. Responde este mensaje y te atendemos. |
| `crm_seguimiento_cotizacion` | Utilidad | Hola {{1}}, te escribimos de Ventas Virtuales Colombia sobre la cotización del equipo {{2}}. Si tienes preguntas o quieres continuar con la compra, responde este mensaje. |
| `crm_equipo_apartado` | Utilidad | Hola {{1}}, tu equipo {{2}} sigue apartado hasta el {{3}}. Responde este mensaje para coordinar el pago y la entrega. |

Meta puede recategorizar una plantilla de Utilidad como Marketing si la ve promocional.

## Pantallas

- **Seguimientos** (`/seguimientos`): vencidos, de hoy, próximos y cerrados recientes; los míos o los de
  todos (con permiso). Acciones: hecho, cancelar, reprogramar.
- **Bandeja:** en la ficha, *Agendar seguimiento* (mañana 9 a. m., en 3 días, o fecha y hora) y los
  pendientes del cliente. Fuera de 24 h, la caja de respuesta se cambia por *Enviar plantilla*. El tiempo
  de espera usa minutos hábiles.
- **Inicio:** "Sin respuesta fuera de SLA" y "Seguimientos vencidos".
- **Panel lateral:** número de conversaciones esperando respuesta junto a *Bandeja*, en rojo si alguna
  pasó el SLA.

---

## Retorno del bot y seguimiento automático (F4·45)

> Decisión [0035](decisiones/0035-retorno-del-bot-y-mensaje-automatico.md), aceptada el 6 nov 2026. Origen: mejora 1 de
> [MEJORAS-FLUJO.md](MEJORAS-FLUJO.md). **Estado: construida el 6 nov 2026, falta la prueba del dueño** (migración 0049, nace apagada).
>
> **Para probarlo (dueño):** Configuración → Bot → **Retorno y seguimiento** → encender, bajar las horas de la Regla A a 1 y apagar
> «Solo en horario» → Guardar. Escribir al bot desde el celular, dejar que conteste y no responder: a la hora (±1 min) llega
> «¿Sigues necesitando ayuda?». Probar los tres botones. Para la Regla B: escribir «asesor», no contestar desde la Bandeja y esperar las
> horas hábiles. Al terminar, volver a dejar los valores (5 h y «Solo en horario»).

### Historia de usuario

**Como** dueño de Ventas Virtuales Colombia, **quiero** que el bot le escriba una vez a un cliente que dejó de responder o al que
el asesor no le contestó, y que vuelva a atender el chat cuando el asesor termina, **para** no perder clientes por chats callados y
que el cliente sepa que seguimos interesados antes de que se cierren las 24 h de Meta. **Todo** (tiempos, textos, botones,
disparadores y destino) se cambia desde el CRM, sin tocar código.

### Reglas

**RT-01 · Regla A: el cliente quedó callado.** Si el cliente escribió, el último mensaje del chat es nuestro (del bot o de un
asesor) y el cliente no responde en **N horas** (5 por defecto, de 1 a 23), el bot le envía el *mensaje de seguimiento* (por
defecto «¿Sigues necesitando ayuda? 🙌») con hasta 3 botones (por defecto *Sí, continuar* · *Hablar con asesor* · *Ya no,
gracias*). Aplica tanto si el chat está con el bot como con un asesor.

**RT-02 · Regla B: el asesor no respondió.** Si el chat está en cola o asignado, el cliente escribió y ninguna persona le contesta en
**M horas hábiles** (2 por defecto, de 0,5 a 23, con el horario y los festivos del SLA), el bot le envía el *mensaje de demora*
(por defecto «Disculpa la demora 🙏 ¿Te sigo ayudando yo mientras un asesor se desocupa?») con botones *Sí, sigue tú* · *Espero al
asesor*. *Sí, sigue tú* devuelve el chat al bot (RT-05); *Espero al asesor* lo deja en la cola y no vuelve a preguntar.

**RT-03 · Una sola vez por silencio.** Cada regla envía como máximo **un** mensaje entre dos mensajes del cliente. Si el cliente no
responde, no se insiste. Cuando el cliente vuelve a escribir, el contador empieza de nuevo.

**RT-04 · Siempre dentro de las 24 h de Meta.** Solo se envía si faltan al menos **30 min** para que se cumplan 24 h desde el último
mensaje del cliente. Si no, no se envía y el cliente queda con la etiqueta *Recordatorio-no-enviado* (igual que RF-15). Así no hace
falta plantilla ni tiene costo.

**RT-05 · Volver al bot (disparadores configurables).** Un chat que está con asesor vuelve al bot (se quita la pausa y el chat pasa
a «bot») por cualquiera de estos disparadores, cada uno con su casilla:
1. El cliente toca *Sí, continuar* o *Sí, sigue tú* (o escribe la palabra configurada, por defecto «continuar»).
2. El asesor pulsa **«Devolver al bot»** en la Bandeja (siempre disponible; no depende de las casillas).
3. El asesor **cierra** el chat en la Bandeja (siempre, como antes de F4·45: no tiene casilla).
4. **Sin actividad**: nadie escribe en el chat (ni cliente ni asesor) en **P horas** (24 por defecto). Vuelve en silencio, sin
   enviar nada; el próximo mensaje del cliente lo atiende el bot.
`reiniciar` sigue funcionando como hoy.

**RT-06 · A dónde vuelve.** Se elige el destino al volver al bot: *el inicio del bot principal* (por defecto) u *otro bot* (su
inicio). Al construirla se dejó fuera «un cuadro»: el cliente entra siempre por el inicio de un bot. Para clientes en etapa de cierre ganada (**Vendido**) hay un destino aparte (por defecto: *se queda con
el asesor*; puede ser un bot de postventa).

**RT-07 · Cuándo no se envía nada.** Ningún mensaje automático sale si: el chat está **cerrado** o archivado; la oportunidad está en
etapa de cierre (**Vendido** o **Perdido**); hay una compra en **pago por confirmar**; hay una **Pausa** del lienzo o el recordatorio
de pago de la compra esperando (ya tienen su propio mensaje); el cliente tiene una **etiqueta excluida** (por defecto
*No-Molestar*); el **chatbot está apagado** (Interruptores); el asesor escribió en los últimos **15 min** (no se le interrumpe); o el
último mensaje del cliente fue *Ya no, gracias* (queda con la etiqueta *No-Interesado*).

**RT-08 · Horario.** Con la casilla *Solo en horario de atención* (encendida por defecto), un mensaje que vence fuera de horario o en
festivo se envía al abrir, si todavía cumple RT-04; si no, no se envía (RT-04).

**RT-09 · Todo queda registrado.** Cada mensaje automático queda en el chat como del bot, con la marca *🤖 automático*, en el
historial del cliente (`lead_eventos`) y con la etiqueta *Seguimiento-Enviado* o *Demora-Enviado*. Volver al bot queda en el historial
con el disparador. El mensaje automático **no** cuenta como respuesta de un asesor en el SLA ni en las métricas.

**RT-10 · Parametrización.** Pantalla **Configuración → Bot → Retorno y seguimiento** (permiso `administrar_bot`): interruptor
general (**apagado** al instalar), Regla A (casilla, horas, texto ≤ 1.024, botones ≤ 20 caracteres), Regla B (casilla, horas
hábiles, texto, botones), disparadores de RT-05 (casillas, palabra, horas de inactividad), destinos de RT-06, *Solo en horario*,
etiquetas excluidas. Con vista previa como WhatsApp y marca `{nombre}`. Los textos de las respuestas («espero al asesor», «ya no») también
se editan. Toma efecto en menos de 30 s, como el resto del bot.

### Criterios de aceptación

1. Con la Regla A encendida en 5 h, un cliente que no responde recibe el mensaje a las 5 h (±1 min) **una sola vez**.
2. Con la Regla B en 2 h hábiles, un cliente que escribe a las 5:30 p. m. de un viernes y nadie le contesta recibe el mensaje de
   demora el sábado a las 10:30 a. m. (la hora y media restante cuenta desde que abren a las 9:00), si sigue dentro de RT-04.
3. «Devolver al bot» deja el chat en «bot», sin asignar, y el siguiente mensaje del cliente lo atiende el bot en el destino de RT-06.
4. A un cliente en Vendido, en pago por confirmar, con el chat cerrado o con *No-Molestar* **no** le llega nada (RT-07).
5. Si pasaron más de 23 h 30 min desde el último mensaje del cliente, no sale nada y queda *Recordatorio-no-enviado*.
6. Con el interruptor general apagado, todo funciona como hoy.
7. Cambiar tiempos o textos en la pantalla se refleja en el siguiente envío sin reiniciar nada.

### Cómo está construida (6 nov 2026)

- **Migración 0049:** tabla `retorno_config` (una fila, apagada; se cambia solo con `retorno_config_cambiar`, que exige
  `administrar_bot`); columnas `leads.seguimiento_enviado_en`, `demora_enviada_en` y `retorno_pendiente` (RT-03) y
  `mensajes.automatico` (RT-09); tipo `retorno` en `lead_eventos`. Funciones del receptor (solo `service_role`):
  `retorno_candidatos(lead)` decide quién recibe la regla A o B con todas las exclusiones de RT-04, RT-07 y RT-08;
  `retorno_marcar`, `retorno_evento`, `retorno_destino(etapa)`, `retorno_devolver(lead, motivo)` y `retorno_inactivos()` (RT-05.4).
  `reanudar_bot` («Devolver al bot» de la Bandeja, que ya existía) ahora usa el destino y deja el historial.
  Pruebas: `supabase/pruebas/0049_retorno_del_bot.sql` (14).
- **Receptor:** `retorno.py` arma los mensajes y atiende los botones `ret-si`, `ret-asesor`, `ret-no` y `ret-espera`, antes que la
  compra y el menú y aun con el chat en asesor. `reloj()` llama a `revisar_retorno()` cada minuto: primero los inactivos, luego los
  candidatos; cada envío se revisa otra vez con el candado del cliente y se marca aunque Meta lo rechace (nunca insiste). Pruebas:
  `prueba_retorno.py` (18).
- **CRM:** Configuración → Bot → pestaña **Retorno y seguimiento** (`bot/Retorno.tsx`); marca *🤖 automático* en el chat de la
  Bandeja y de la ficha del cliente.

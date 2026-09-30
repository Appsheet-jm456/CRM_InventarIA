# Seguimientos, alertas de SLA y plantillas de Meta (F3·6)

> Cierra F2·6 (diseño de seguimientos y SLA). Decisión 0021. Se apoya en la Bandeja (0020) y en el
> horario y el SLA de la 0012: primera respuesta en **10 min**, alerta a los **15**, solo en horario
> (L–V 8:00–18:00, Sáb 9:00–14:00, festivos cerrado).

---

## Reglas

**RS-01 · Un seguimiento recuerda, no envía.** Es una tarea para una persona ("llamar a Juan el jueves
por la cotización"): cuando vence, aparece como vencido en Seguimientos, en Inicio y en la ficha de la
Bandeja. Ningún mensaje sale solo hacia el cliente (dueño, 30 sep 2026).

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

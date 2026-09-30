# Bandeja multiasesor, embudo y etapas (F3·5)

> Cómo atienden los asesores desde CRM InventarIA. Decisión 0020. Permisos en
> [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md). Al terminar, la app pasa al puerto 8096 y el visor de la
> demo se apaga (0017).

---

## Modelo: se amplía `leads` (migración 0004)

Una fila por cliente, como hoy. El bot no cambia: sigue escribiendo `pausar_bot`, `paso_menu` y la etapa.

| Campo nuevo en `leads` | Para qué |
|---|---|
| `estado_chat` | `bot` (lo atiende el bot) · `cola` (pidió asesor, nadie lo tomó) · `asignada` (la atiende un asesor) · `cerrada` |
| `asignado_a` | El asesor que la atiende (`usuarios.id`) |
| `en_cola_desde` | Cuándo pasó a la cola: base del SLA de 10 min (F3·6) |
| `primera_respuesta_en` | Primer mensaje de un asesor después de entrar a la cola (F3·6 y F3·8) |

| En `mensajes` | Para qué |
|---|---|
| `usuario_id` | Qué asesor lo envió (lado `asesor`) |
| `media_ruta`, `media_mime`, `media_nombre` | Audio, imagen, video o documento del cliente, guardado en el bucket privado `media` |

Tabla nueva **`historial_etapas`** (lead, de, a, quién, cuándo): cada cambio de etapa, del bot o de una
persona. Es la base de las métricas (F3·8).

## Estados de la conversación

```
          cliente pide asesor (el bot se pausa)            un asesor la toma
  bot ──────────────────────────────────────────► cola ─────────────────────► asignada
   ▲                                                ▲  ◄──── liberar ─────────  │
   │                                                └──── reasignar (supervisor)│
   │  reanudar bot                                                              │ cerrar
   └──────────────────────────────────── cerrada ◄──────────────────────────────┘
          el cliente vuelve a escribir → bot (menú de inicio)
```

- **La base deriva el estado** con un trigger sobre `leads`: si el bot se pausa, la conversación pasa a
  `cola`; si se reanuda, vuelve a `bot` sin asesor. Así el bot no tiene que saber de estados.
- Un mensaje del cliente en una conversación **cerrada** la reabre con el bot, desde el menú de inicio.
- Si el cliente escribe `reiniciar` mientras lo atiende un asesor, vuelve al bot (comportamiento actual).

## Reglas

**RB-01 · Responder toma la conversación.** Si un asesor responde una conversación de la cola, queda
asignada a él. No puede responder una asignada a otro asesor, salvo con `ver_todas_conversaciones`.

**RB-02 · Ventana de 24 horas de Meta.** Solo se puede escribir texto libre si el cliente escribió en las
últimas 24 h. Fuera de la ventana, la caja de respuesta se bloquea y avisa: se necesita una plantilla (F3·6).

**RB-03 · Nada se envía sin quedar registrado, y nada se registra sin enviarse.** El mensaje se envía a
Meta y, solo si Meta lo acepta, se guarda con su `wamid` y el asesor que lo escribió.

**RB-04 · Perdido pide motivo.** Mover a *Perdido* exige uno de los motivos (Precio, Sin respuesta, No
calificado, Compró en otro lado, Solo preguntaba, Otro).

**RB-05 · El embudo solo avanza solo** (0006). El bot nunca retrocede una etapa; una persona con
`gestionar_oportunidades` sí puede moverla a cualquier etapa, y queda en el historial.

**RB-06 · Una etapa con clientes no se borra**: primero se mueven. Renombrarla arrastra a sus clientes.

## Quién hace qué (funciones de la base, `security definer`)

| Función | Permiso | Qué hace |
|---|---|---|
| `tomar_conversacion(lead)` | `atender_bandeja` | La asigna a quien la toma y pausa el bot |
| `liberar_conversacion(lead)` | el asignado o `ver_todas_conversaciones` | La devuelve a la cola |
| `asignar_conversacion(lead, usuario)` | `ver_todas_conversaciones` | Se la pasa a otro asesor activo con `atender_bandeja` |
| `cerrar_conversacion(lead)` | el asignado o `ver_todas_conversaciones` | La cierra; el próximo mensaje del cliente lo atiende el bot |
| `reanudar_bot(lead)` | el asignado o `ver_todas_conversaciones` | Suelta al cliente y el bot vuelve al menú de inicio |
| `registrar_mensaje_asesor(lead, texto, wamid)` | `atender_bandeja` | Guarda lo enviado (RB-01, RB-03) y la primera respuesta |
| `mover_etapa(lead, etapa, motivo)` | `gestionar_oportunidades` | Cambia la etapa (RB-04) |

**Leer:** un asesor ve las conversaciones asignadas a él y las que no tienen asesor (RU-08); con
`ver_todas_conversaciones` las ve todas. Los mensajes se ven si se ve su conversación.
**Etapas:** las edita quien tiene `administrar_embudo` (RB-06).

## Envío y media

- **La app envía** por la Cloud API con `META_TOKEN` y `META_PHONE_NUMBER_ID` en `crm/.env.local` (solo
  servidor). Por ahora solo texto; adjuntos del asesor en un paso siguiente.
- **Media del cliente:** el receptor la descarga de Meta y la sube al bucket privado `media`
  (`<lead>/<wamid>.<ext>`). La app la muestra por la ruta `/media/...`, que primero comprueba que el usuario
  puede ver esa conversación.

## Tiempo real

Supabase Realtime sobre `leads` y `mensajes`, desde el navegador con la sesión del usuario: el RLS decide
qué eventos le llegan. El navegador llega a la API por el mismo equipo por donde abrió la app
(`http://<ip>:8020`), así sirve por Tailscale y por la red local.

## Pantallas

- **Bandeja** (`/bandeja`): lista con filtros (*Cola*, *Mías*, *Bot*, *Todas* con permiso, *Cerradas*),
  chat con burbujas (cliente, bot, asesor con su nombre) y media, caja de respuesta, y a la derecha los datos
  del cliente (lo que preguntó el bot, etapa, etiquetas) con las acciones.
- **Embudo** (`/embudo`): una columna por etapa con sus clientes; se mueven arrastrando o con el menú de
  la tarjeta. *Perdido* pide el motivo.
- **Etapas** (`/etapas`): crear, renombrar, color, orden y borrar (si no tiene clientes).

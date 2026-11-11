# Segunda línea de venta con otro número de WhatsApp (F4·69)

> **Estado:** 📝 documentada el 11 nov 2026 por pedido del dueño, con sus respuestas del mismo día (Cliente Final y Distribuidor).
> **Sin construir.** Falta: confirmar el número, la pregunta 1 de la sección 7 y la orden del dueño. Migración prevista: **0081** (revisar `ls supabase/migrations` antes de numerar).

**Pedido del dueño (11 nov 2026):** «Otra línea de venta con otro número. ¿Sería el mismo bot o se revisaría qué flujo tendría?»

**Respuesta corta:** las dos cosas son posibles. **Cada número elige su bot** en Configuración → Meta: puede ser el mismo
«Avi Ventas» o un bot propio (por ejemplo, uno solo para equipos nuevos o para distribuidores). Inventario, asesores,
embudos, pedidos y respaldos siguen siendo **uno solo** para las dos líneas.

### Respuestas del dueño (11 nov 2026)

| Pregunta | Respuesta |
|---|---|
| ¿Qué es cada línea? | **Línea 1 · Cliente Final** (el 318 de hoy) y **Línea 2 · Distribuidor** |
| ¿Mismo bot? | **Flujos diferentes**: cada línea con su bot |
| ¿Mismos asesores? | **Sí, los mismos** (*«son los mismos»*; confirmar que se refería a los asesores) |
| ¿Portafolio de Meta? | **El mismo**, «Ventas Virtual Colombia» (misma WABA, mismo token: el caso sencillo) |
| ¿Qué número? | **Por confirmar** |
| Mismo cliente en las dos líneas | **Sin responder**; se propone la opción A (dos chats), ver RLN-07 |

**Lo que ya existe y se aprovecha** (revisado en la base el 11 nov 2026): el embudo **Distribuidor** (id 3), el bot **Distribuidor**
(id 78, versión 1 publicada, sin uso desde que «Avi Ventas» es el principal; **revisarlo antes**, porque apuntaba al catálogo 39, que ya no existe),
y el dato **Tipo de cliente** de la ficha (F4·48: «Cliente final» o «Distribuidor», que ya decide si se cobra la configuración).

Con eso, la línea define el tipo de cliente:

| | Línea 1 · Cliente Final | Línea 2 · Distribuidor |
|---|---|---|
| Bot | «Avi Ventas» (el principal de hoy) | «Distribuidor» (por revisar o rehacer) |
| Tipo de cliente | Cliente final (como hoy, con la pregunta si hace falta) | **Distribuidor automático**, sin preguntar |
| Embudo de la oportunidad | Cliente Final | **Distribuidor** |
| Configuración $80.000 | Una vez por pedido, en usados (F4·48) | Nunca (F4·48) |
| Asesores | Los mismos | Los mismos |
| Inventario, catálogos, cuentas | Compartidos | Compartidos (catálogos propios si el bot lo pide) |

- **RLN-13 · La línea fija el tipo de cliente.** Un cliente nuevo de la línea Distribuidor nace con «Tipo de cliente: Distribuidor» y su
  oportunidad en el embudo Distribuidor. El bot no pregunta «¿distribuidor o cliente final?». El asesor puede corregirlo en la ficha, como hoy.
- **RLN-14 · Antes de encender la línea 2**, el bot «Distribuidor» se revisa en el lienzo: catálogos vigentes, compra, cotización y paso al asesor.
  Es trabajo de configuración, no de código, y se puede hacer mientras se construye F4·69.

---

## 1. Cómo está hoy (revisado en el código el 11 nov 2026)

- **Un solo número.** `meta_conexion` es una fila única (`check (id = 1)`) con `phone_number_id`, `waba_id` y los secretos
  (token, App Secret, token de verificación) en Vault. Pantalla: Configuración → Meta.
- **El receptor no mira a qué número escribió el cliente.** Meta manda en cada evento `metadata.phone_number_id`, pero hoy se ignora:
  todo se responde desde el único número configurado.
- **El CRM envía siempre desde ese número** (`crm/src/lib/meta.ts`: texto, media y plantillas).
- **El cliente es único por teléfono** (`leads_telefono_activo`): un mismo celular es un solo cliente, un solo chat.
- **El bot se elige así:** si el cliente tiene `leads.bot_id`, ese bot; si no, el **bot principal** (hoy «Avi Ventas», id 511, decisión 0028).

## 2. Lo que permite Meta

- Varios números en **la misma cuenta de WhatsApp Business (WABA)** de «Ventas Virtual Colombia»: **mismo token, misma app, mismo
  App Secret y mismo webhook** (`bot.ventasvirtualcolombia.shop/webhook`). Cada evento dice a qué número llegó.
- El número nuevo **no puede estar en la app de WhatsApp del celular** (o se usa en *coexistencia*, como el 322 con Kommo). Se registra
  en el portafolio con su código SMS y un **nombre visible** que Meta aprueba.
- Límite: con el negocio **sin verificar**, hasta 2 números; verificado, más. **El nuestro está sin verificar**: alcanza justo.
- **Calidad y límite de mensajes van por número**: si una línea baja de calidad, la otra no se afecta.
- **Las plantillas son de la WABA**: sirven para los dos números (no hay que crearlas otra vez).
- **Costo:** Meta cobra por conversación iniciada por la empresa (plantillas), no por número. Responder dentro de las 24 h sigue gratis.
- Si el segundo número estuviera en **otro portafolio u otra WABA**, necesita su propio token y App Secret: más trabajo (ver pregunta 6).

## 3. Cómo quedaría

```
Cliente → número 1 (Usados)   ─┐                         ┌─ bot de la línea 1 (p. ej. Avi Ventas)
                               ├─ mismo webhook → receptor┤
Cliente → número 2 (Nuevos)   ─┘   (lee phone_number_id)  └─ bot de la línea 2 (el mismo u otro)
                                         │
                                         └─ misma base: un solo inventario, Bandeja, Embudo y Pedidos,
                                            con la etiqueta de la línea en cada chat
```

### Configuración → Meta → Líneas

| Línea | Número | Nombre en el CRM | Color | Bot que atiende | Estado |
|---|---|---|---|---|---|
| 1 | +57 318 751 4195 | Ventas Usados | Azul | Avi Ventas (principal) | Conectada |
| 2 | +57 3xx xxx xxxx | Ventas Nuevos | Naranja | *elegir: el mismo u otro* | Por conectar |

Botones por línea: **Probar conexión**, **Desactivar** (deja de responder, conserva los chats) y **Bot que atiende**.
La conexión de la app (token, App Secret, verificación, webhook) sigue siendo **una sola** arriba de la tabla.

### En la Bandeja, la Ficha y los Pedidos

- Cada chat lleva una **pastilla con la línea** («Usados» azul, «Nuevos» naranja) y la Bandeja filtra por línea.
- El asesor responde **siempre desde el número por el que escribió el cliente**: no tiene que elegir.
- Pedidos, Embudo y Métricas filtran por línea («¿cuánto vendió la línea de Nuevos este mes?»).

## 4. Reglas (RLN)

- **RLN-01 · Varias líneas.** Configuración → Meta tiene una lista de líneas: número visible, `phone_number_id`, nombre, color, bot y activa.
  La línea actual (318) pasa a ser la **línea 1** sin cambiar nada para los clientes.
- **RLN-02 · Una sola conexión de app.** Token, App Secret y token de verificación siguen en Vault, una vez, para todas las líneas de la WABA.
- **RLN-03 · El receptor identifica la línea** por `metadata.phone_number_id` de cada evento. Un evento de un número que no está en la
  lista (o de una línea desactivada) se guarda en el registro y **no se responde**.
- **RLN-04 · Se responde desde la misma línea.** Bot, Avi, acciones, asesor (Bandeja y Ficha), retorno, seguimientos y alistamiento
  envían desde el número de la línea del chat. Nunca desde la otra.
- **RLN-05 · Bot por línea.** Cada línea elige su bot publicado. Vacío = el bot principal. Un cliente que ya tiene `bot_id`
  (porque el asesor lo pasó a otro bot o por el retorno) sigue en ese bot, como hoy.
- **RLN-06 · Avi por línea.** El interruptor «Avi en todo el bot» y la lista blanca siguen siendo generales; para tener Avi en una línea y
  no en la otra se usa un bot con cuadro 🤖 Agente en una y uno sin Agente en la otra (no hace falta un interruptor nuevo).
- **RLN-07 · Mismo cliente en las dos líneas.** Según la respuesta del dueño a la pregunta 1:
  *Opción A (recomendada):* **un chat por línea**, dos fichas enlazadas («también escribe por Nuevos»), cada una con su bot y su embudo.
  *Opción B:* un solo cliente y un solo chat; los mensajes llevan la pastilla de su línea y se responde por la última línea usada.
- **RLN-08 · Pastilla y filtro de línea** en Bandeja, Ficha, Embudo, Pedidos y Métricas. Con una sola línea activa la pastilla no aparece.
- **RLN-09 · Asesores por línea (opcional).** Cada usuario puede tener las líneas que atiende; sin marcar = todas. El aviso de cola y
  la Bandeja muestran solo sus líneas (quien tiene `ver_todas_conversaciones` ve todo).
- **RLN-10 · Plantillas fuera de 24 h** salen por la línea del chat (las plantillas son de la WABA y valen para las dos).
- **RLN-11 · Estados de Meta y costos por línea**: entregado / leído / fallido y la calidad del número se guardan con su línea
  (Métricas de atención, decisión 0024).
- **RLN-12 · Inventario, catálogos, cuentas de pago, Conocimiento y políticas son compartidos.** Si una línea necesita textos propios
  (otras cuentas, otro horario), se hace con un bot propio para esa línea; no se duplican tablas.

## 5. Qué cambia por dentro

| Pieza | Cambio |
|---|---|
| Base (0076) | Tabla `lineas_whatsapp` (`id`, `phone_number_id` único, `numero_visible`, `nombre`, `color`, `bot_id`, `activa`, `orden`); se siembra la línea 1 con los datos de `meta_conexion`. `leads.linea_id` (los clientes de hoy → línea 1). `mensajes.linea_id`. Si es opción A: el índice único de teléfono pasa a ser **(teléfono, línea)**. `usuario_lineas` si se pide RLN-09. RLS y `revoke` como las demás tablas. |
| Receptor | Leer `metadata.phone_number_id` → línea; buscar o crear el cliente con su línea; bot de la línea si el cliente no tiene `bot_id`; `enviar()` y `escribiendo()` con el `phone_number_id` de la línea. `retorno.py`, `alistamiento.py`, `videos.py` y las rutas `/interno/*` igual. |
| CRM | `crm/src/lib/meta.ts` y `metaConexion.ts` reciben la línea del chat; Configuración → Meta con la tabla de líneas; pastilla y filtro en Bandeja, Ficha, Embudo, Pedidos y Métricas. |
| Pruebas | SQL de la 0076 (siembra, unicidad, RLS); `prueba_lineas.py` (dos números falsos, cada uno con su bot, respuesta por la línea correcta, número desconocido sin respuesta); `prueba_carga.py` con dos líneas. |
| Fuera de código | El dueño registra el número nuevo en el portafolio, Meta aprueba el nombre visible, se agrega en Configuración → Meta y se prueba. |

**Riesgo principal:** que algún envío quede «pegado» al número 1 (hoy hay 3 funciones de envío en el CRM y varias en el receptor).
Por eso la prueba revisa **cada camino de envío** con dos líneas (bot, Avi, asesor, acción, catálogo, plantilla, retorno, alistamiento).

**Tamaño:** mediano-grande (una F4 de 3 o 4 bloques): A) base + receptor + Configuración → Meta; B) envíos del CRM por línea;
C) pastilla y filtros; D) asesores por línea (si se pide).

## 6. Lo que hace el dueño

1. Decidir qué número será la segunda línea y para qué (sección 7).
2. Si ese número está en el celular con WhatsApp normal o Business, decidir si se pasa a la API (deja de usarse en el celular) o va en coexistencia.
3. Registrarlo en el portafolio «Ventas Virtual Colombia» (Meta Business → WhatsApp → Números → Agregar), con el código SMS y el nombre visible.
4. Decidir el bot de la línea: el mismo «Avi Ventas» o uno nuevo. Si es nuevo, se arma en Configuración → Bot (duplicar «Avi Ventas» y ajustar).

## 7. Preguntas para el dueño

1. **El mismo cliente escribe a las dos líneas:** ¿dos chats separados (opción A, recomendada) o uno solo (opción B)?
2. **¿Qué vende la línea 2?** (equipos nuevos, distribuidores, otra ciudad, servicio técnico…). De eso sale si usa el mismo bot o uno propio.
3. **¿Qué bot atiende la línea 2 al empezar?** El mismo «Avi Ventas», o uno nuevo con su menú propio.
4. **¿Los mismos asesores atienden las dos líneas** o cada línea tiene los suyos (RLN-09)?
5. **¿Qué número es** y en qué está hoy (celular, Kommo, nuevo)?
6. **¿Va en el mismo portafolio de Meta** «Ventas Virtual Colombia»? (Si es de otra empresa o portafolio, el trabajo crece.)

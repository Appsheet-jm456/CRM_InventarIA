# Pendientes y dónde retomar

**Última sesión:** 6 nov 2026 · **Fase actual:** Fase 3 (Implementación) empezando por **F3·1**, con pendientes
de las Fases 1 y 2 abajo. **Código nuevo:** el bot de prueba sobre Supabase (`herramientas/`) y las migraciones
0001–0004. La app nueva **CRM InventarIA** corre en **http://100.114.72.43:8096** (`crm/`, decisión 0017). La v0 sigue viva en el 3000 sin tocar.

## Dónde retomar (en este orden)

0. **7 nov 2026 · Plan de respaldos y del disco de 256 GB anotado, sin ejecutar ([RESPALDOS.md](RESPALDOS.md), F5·2, F5·4 a F5·6).** El SSD `sdc` (Micron, 238 GB, con Windows 10 sin uso) pasará a ser el disco de respaldos (`/mnt/respaldos`, ext4) tras confirmar el dueño que no necesita nada de él; el dueño corre los comandos con `sudo`. Script diario de la base, Storage, fotos, llaves (Vault y `~/.cloudflared`), 14 diarias y una semanal, restauración probada y copia cifrada fuera del servidor. El dueño apaga el servidor esta noche: **al encender, todo el CRM arranca solo** (verificado). **Retomar:** formatear `sdc` con el dueño y montar el script.

0. **7 nov 2026 · CRM por internet con Cloudflare Access ✅ (F2·18, [decisión 0037](decisiones/0037-crm-por-internet-con-cloudflare-access.md)).** `https://crm.ventasvirtualcolombia.shop` pide primero un código por correo (Access, política `Equipo`) y después el usuario del CRM; el mismo túnel fijo lleva la pantalla y la base. Sin sesión todo redirige al login de Access; el webhook de `bot.` sigue abierto a propósito. **Falta:** que el dueño pruebe la Bandeja (tiempo real) y que las 3 o 4 personas entren; alta nueva = correo en la política `Equipo` (Zero Trust → Access controls → Policies) **y** usuario en el CRM. Por red local y Tailscale se sigue entrando igual. También hoy: el buscador del menú ya no se cae cuando la IA devuelve listas («alto rendimiento»), el Registro de IA muestra hora de Colombia y las llamadas del buscador, y el resumen de memoria de Avi pide 4000 tokens y no espera al respaldo. **Push hecho hasta `cff5925`.** **Lo más urgente ahora: respaldos del CRM (F5·2).**

0. **7 nov 2026 · Webhook fijo ✅ (F2·10 hecha; F2·17 reemplazada).** `https://bot.ventasvirtualcolombia.shop/webhook` (dominio `.shop` en Hostinger con el DNS en Cloudflare; túnel con nombre `crm-inventaria`, servicio `crm-meta-tunel-fijo`, config en `~/.cloudflared/`, fuera de git). Solo publica `/webhook`; lo demás da 404. Registrado en Meta y probado con un «hola» real; el túnel rápido `crm-meta-tunel` quedó apagado y deshabilitado (si el bot deja de responder: `systemctl --user status crm-meta-tunel-fijo`; la vuelta atrás es `enable --now crm-meta-tunel`). **Siguen para producción:** respaldos del CRM (F5·2), pantalla del CRM para el equipo de 3 o 4 personas (Tailscale hoy; `crm.<dominio>` con Cloudflare Access pide un cambio de código), tarjeta de pago y verificación del negocio en Meta, plantilla `crm_pago_confirmado`. Renovación del `.shop`: revisar su precio de 2027.

0. **7 nov 2026 · F4·46 El asesor valida el comprobante antes de confirmar el pago, construida 🔵 y encendida, falta la prueba del dueño ([AGENTE.md](AGENTE.md#4g-validación-del-comprobante-por-el-asesor-f446), decisión [0036](decisiones/0036-validacion-del-comprobante.md), RAG-63 a RAG-70):** el bot solo acusa recibo del soporte; en la Bandeja «✅ Comprobante validado» envía «Recibimos tu comprobante» y arranca Datos de despacho; «❌ No es válido» con motivo. Permiso `validar_pagos` (darlo en Roles a quien valide). Migración 0050, prueba_validacion.py 15/15. Falta crear la plantilla `crm_pago_confirmado` (fuera de 24 h).

0. **6 nov 2026 · Revisión crítica del flujo Menú + Agente + Asesor: 8 mejoras propuestas, sin construir ([MEJORAS-FLUJO.md](MEJORAS-FLUJO.md)).** Prioridad: 1) retorno tras la pausa del asesor, 3) seguimiento tras la cotización, 2) alarma de cola. Cada una se documenta como HU con la orden del dueño.

0. **6 nov 2026 · F4·45 Retorno del bot y «¿Sigues necesitando ayuda?» construida 🔵, falta la prueba del dueño ([SEGUIMIENTOS-Y-SLA.md](SEGUIMIENTOS-Y-SLA.md#retorno-del-bot-y-seguimiento-automático-f445), decisión [0035](decisiones/0035-retorno-del-bot-y-mensaje-automatico.md), RT-01 a RT-10):** Regla A (cliente callado 5 h) y Regla B (asesor sin responder 2 h hábiles), una vez y dentro de las 24 h; botón «Devolver al bot»; todo en Configuración → Bot → Retorno y seguimiento (nace apagado). Migración 0049, `retorno.py`, prueba_retorno.py 18/18. Pruebas SQL en rojo ajenas a esto: 0012 (depende del bot principal) y 0048 prueba 1 (el dueño encendió el carrito).

0. **6 nov 2026 · F4·44 Carrito de varios equipos construida 🔵 (migración 0048, falta la prueba del dueño, [AGENTE.md](AGENTE.md#4f-carrito-comprar-varios-equipos-en-un-pedido-f444), RAG-54 a RAG-62):** Agente → Compra → Carrito (casilla apagada por defecto, máximo y textos) y cuadro 🛒 Carrito en el lienzo; «¿otro equipo?», resumen en lista con Quitar y Cotizar (un PDF), cuentas y nota del asesor con todos. Pregunta abierta: la pausa del asesor no se levanta sola.

0. **6 nov 2026 · F4·43 Acciones: enviar catálogos y archivos PDF construida 🔵 (migración 0047, falta la prueba del dueño, [AGENTE.md](AGENTE.md), RAG-49 a RAG-53):** pasos «Enviar catálogo» (uno de la lista, el de la marca del equipo o el Unificado) y «Enviar archivo» (PDF o imagen subido en la acción), y casilla «catálogo de la marca al final» en la ficha de F4·42.

0. **6 nov 2026 · F4·42 Acción «Pregunta por un equipo» construida 🔵 ([AGENTE.md](AGENTE.md), migración 0046):** ficha del equipo con plantilla, precio de la base y foto, lista si son varios y aviso si está agotado. **Nace apagada:** el dueño la revisa, la activa y la prueba por WhatsApp.

0. **6 nov 2026 · F4·41 Atributos del producto construida 🔵 ([INVENTARIO.md](INVENTARIO.md#atributos-del-producto-f441), migración 0045):** Inventario → Atributos, ficha del equipo, Excel con columnas por atributo y `{clave}` en la plantilla de Avi. **Falta la prueba del dueño** (pasos al final de la sección). Sigue F4·42. En `migrar.sh --probar` siguen en rojo pruebas ajenas a esto que dependen de datos vivos: 0010, 0011, 0012, 0014, 0015, 0024 y 0041.

0. **6 nov 2026 · Pedido del cliente Ventas Tech: ficha al preguntar por un equipo (documentadas, por construir):** **F4·41** atributos del producto (gráfica, pantalla, teclado, estado estético; [INVENTARIO.md](INVENTARIO.md#atributos-del-producto-f441), RI-07 a RI-10) y después **F4·42** acción «Pregunta por un equipo» en Agente → Acciones: «¿cuánto vale el Lenovo Legion 7?» → ficha con emojis, precio de la base y cierre editables, sin IA ([AGENTE.md](AGENTE.md), RAG-43 a RAG-48). Decisiones del dueño del 6 nov: disparador en Acciones, con precio, atributos como HU aparte y lista si coinciden varios. El mismo día el dueño aprobó F4·34, F4·35 y F4·36.

0. **3 nov 2026 · F4·40 Hasta 10 fichas de Avi con catálogo al final construida 🔵 ([FLUJO-DEL-BOT.md](FLUJO-DEL-BOT.md), migración 0044):** falta la prueba del dueño por WhatsApp. Los equipos no tienen foto: Avi ofrece «ficha con foto» y sale sin imagen hasta subirlas en Inventario.

0. **3 nov 2026 · Avi con DeepSeek (`deepseek-flash`) como principal**, el modelo local `crm-llama` de respaldo y Gemini descartado por ahora. Responde en 1 a 7 s y cada pregunta cuesta entre US$ 0,0005 y 0,003. Se subió `tokens_max` de 500 a 1.000 porque una respuesta de garantía salía cortada, y `interpretar()` ya no manda al cliente un JSON a medias (`prueba_json.py`). **Sin cargar las fichas de Envíos y Pagos, Avi pasa esas preguntas a un asesor.** El presupuesto mensual sigue en US$ 5: el dueño compró US$ 2 en DeepSeek.

0. **3 nov 2026 · Respaldo de Avi activo:** si Gemini falla, responde `crm-llama` (llama3.1, local, sin costo; Configuración → Agente → Cerebro). Se configuró porque Gemini dejó de responder desde las 17:03 UTC. Con Gemini caído cada paso espera 30 s antes de pasar al respaldo (31 a 77 s por respuesta en la prueba), y las respuestas del modelo local son más flojas: es un respaldo, no un reemplazo.

0. **3 nov 2026 · F4·39 Bot «Avi Ventas» construido 🔵 ([FLUJO-DEL-BOT.md](FLUJO-DEL-BOT.md#bot-avi-ventas-el-salesbot-de-kommo-en-el-crm-f439-migración-0043), migración 0043):** Bienvenida → Productos → Portátiles Usados → Marcas → Catálogo → Avi → compra o asesor. Queda en **borrador**, sin tocar el principal. Catálogos Lenovo, Dell, HP y Unificado cargados y públicos; **Gaming se quitó** hasta tener su catálogo. **Publicado y principal desde el 3 nov 2026** (el bot «Bienvenida» queda como no principal, con su versión 3). Avi sigue solo en números de prueba. **Inventario real cargado el 3 nov 2026:** 53 equipos con stock (30 Lenovo, 12 Dell, 9 HP, 1 Acer, 1 Gigabyte); 11 Dell anteriores quedaron en stock 0. **Faltan 6 sin código o precio** (filas 10, 17, 31, 35, 36 y 63 de la hoja) y las fotos. **Falta:** la prueba del dueño por WhatsApp.

0. **3 nov 2026 · F4·38 Bandeja más amplia construida 🔵:** la Bandeja ocupa todo el espacio libre (sin márgenes ni el tope de 1280 px), con el chat más ancho, burbujas sin borde, un color por cliente en la lista y el cliente arriba en el panel derecho. Solo CSS y presentación: los estilos nuevos van dentro de `.bandeja` porque `.m`, `.chat` y `.col-h` también los usan la ficha del lead, Chat e Inventario. Detalle en [BANDEJA-Y-EMBUDO.md](BANDEJA-Y-EMBUDO.md#bandeja-a-toda-la-pantalla-f438-3-nov-2026). **Falta la prueba del dueño** (recargar la página).

0. **3 nov 2026 · Cambio de Meta a Ventas Virtual ✅ conectado y probado:** portafolio Ventas Virtual Colombia, app *Aiutomatizacion Chatbot Ventas*, número **+57 318 7514195** (CONNECTED, calidad GREEN). Conexión guardada en `/meta` (App Secret y token permanente en Vault), app suscrita a la WABA y webhook registrado en el túnel de prueba. **Prueba real de ida y vuelta:** el «Hola» llegó, el bot respondió con el menú B00 y el botón «1» llegó (estados enviado, entregado y leído). Quedan: tarjeta de pago (sin ella no hay plantillas fuera de 24 h), webhook fijo (F2·17), verificación del negocio y publicar la app, y decidir si Kommo vuelve a usar el 322 8586382.

0. **1 nov 2026 · F4·37 construida 🔵** ([AGENTE.md](AGENTE.md#4c-lista-de-equipos-con-plantilla-f437), migración 0042): Avi elige los equipos y el sistema
   arma la lista con la plantilla de Agente → Avi → «Cómo muestra los equipos» (renglones por atributo: modificar, agregar, quitar y ordenar; máximo
   de equipos; uno o varios mensajes). **Falta probarlo por WhatsApp.**

0. **1 nov 2026 · F4·36 construida 🔵** ([AGENTE.md](AGENTE.md), migración 0041): «escribiendo…» en WhatsApp, espera antes de responder (1,5 s) y
   pausa entre mensajes (1 s), en Configuración → Agente → Avi → Respuesta. Marca el mensaje del cliente como leído. **Falta probarlo por WhatsApp.**

0. **1 nov 2026 · F4·35 construida 🔵** ([FLUJO-DEL-BOT.md](FLUJO-DEL-BOT.md#interruptores-del-bot-y-cuadro-agente-f435), decisión 0034, migración 0040):
   Bot → **Interruptores** (Chatbot, Menú guiado, Avi en todo el bot, mensaje con el chatbot apagado e historial), aviso «🤖 Chatbot apagado» en toda
   la app y cuadro **🤖 Agente** en el lienzo. Se retiró el modo por bot: «Avi en todo» quedó **encendido** porque «Bienvenida» estaba en modo Agente.
   **Para probarlo (dueño):** recargar, revisar Bot → Interruptores; en un bot de prueba agregar un cuadro 🤖 y ▶ Probar (gasta poco de Gemini).

0. **1 nov 2026 · F4·34 construida 🔵** ([FLUJO-DEL-BOT.md](FLUJO-DEL-BOT.md#cuadro-pregunta-y-datos-de-despacho-tras-el-pago-f434), migraciones 0038 y 0039):
   cuadro ❓ Pregunta, «Insertar dato», «🏷 Marca un dato» y bot de ejemplo **«Datos de despacho»** publicado. **Para probarlo (dueño):** abrir el bot
   en el lienzo y ▶ Probar; luego Configuración → Agente → Compra → «Después del comprobante, ir al bot: Datos de despacho» y hacer una compra
   de prueba por WhatsApp. Sigue **F4·35** (interruptores y cuadro Agente).

0. **1 nov 2026 · F4·33 construida 🔵** ([LEADS.md](LEADS.md), migración 0036): método de pago Efectivo en tienda / Transferencia, sin Descuento ni
   Número de serie, Nota del asesor, interruptor **Venta online / Venta tienda**, sección **Datos de despacho**, etapas **Alistamiento** y **Despachado**
   con tareas automáticas, **+ Tarea** en la ficha y botón **Guardar cambios**. El bot de compra no cambió. **Falta la prueba del dueño** (recargar la página).

0. **1 nov 2026 · Balance y cierre de tareas.** El dueño dio por **hechas** F4·25 (compra), F4·26 (cotización), F4·27 (Cerebro), F4·28 (Avi), F4·30 (Leads) y F4·32 (documentos); quedan así en `tareas.csv` y Notion. **F4·29 (piloto Distribuidores) sigue pendiente:** no está construido y necesita webhook fijo (F2·17). Brief a **v1.3**. Siguen, por prioridad: 1) **respaldos automáticos de la base (F5·2)**, hoy no hay; 2) webhook fijo (F2·17); 3) aislar las pruebas frágiles `0012`, `0014`, `0015` y 4 y 6 de `0024` (hoy 4 en rojo en `migrar.sh --probar`); 4) que el receptor espere a la base al arrancar tras un reinicio (el 31 oct se reinició en bucle ~1 min); 5) F4·31 capacidad y F1·6 costo de Meta; 6) F4·14 arranques del bot. 18 commits sin subir a GitHub (push solo con autorización).

0. **31 oct 2026 · F4·30 Módulo Leads construido 🔵 (A a E, migraciones 0032 a 0035, [LEADS.md](LEADS.md)):** atributos personalizados
   (Configuración → Atributos del lead), lista de Leads (búsqueda, filtros, columnas, vistas, acciones en grupo, exportar CSV), ficha del lead (datos,
   atributos, oportunidades, tareas, cotizaciones, archivos, estadísticas y línea de tiempo con chat, notas y tareas), archivar y papelera (30 días,
   borrar ya por Ley 1581). **Falta la prueba del dueño.** Sigue F4·31 (capacidad) antes de unificar Kommo.

0. **31 oct 2026 · F4·28 Avi construido 🔵** (`agente.py`, pestañas Avi, Probar y Registro; AGENTE.md): conversa con herramientas, verifica precios y pasa a asesor. **Para probarlo
   (dueño):** 1) llave y presupuesto en Cerebro, 2) en la pestaña Avi poner un bot en modo *Agente* (mejor uno de prueba) y encender para *Números de prueba* con su número, 3) usar
   **Probar** y luego escribir por WhatsApp. Completo el mismo día: buffer, resumen, catálogo/etapa/seguimiento, 3 sin avance, chips en la Bandeja y métricas.

0. **31 oct 2026 · F4·27 Cerebro construida 🔵** (migración 0030, `/agente/cerebro`, `cerebro.py`; AGENTE.md, RAG-34): cualquier proveedor de IA o local, llave en Vault,
   Probar conexión, respaldo y presupuesto. **Falta del dueño:** conseguir la llave de DeepSeek (con saldo), pegarla en Configuración → Agente → Cerebro, poner el
   presupuesto (propuesta US$ 5 al mes) y pulsar Probar conexión. Todavía no responde a clientes: sigue F4·28 (agente Avi). Las pruebas 4 y 6 de `0024` dependen de lo
   que el dueño ya activó (Devoluciones y fichas): hay que aislarlas como las de 0014/0015.

0. **31 oct 2026 · F4·30 Módulo Leads y F4·31 Capacidad (documentados, por construir):** lista de leads, ficha como Kommo con atributos
   personalizados, tareas y chat, archivar y papelera ([LEADS.md](LEADS.md), decisión 0033 propuesta). Capacidad: el servidor aguanta
   1.000 clientes/día; hay que ajustar Bandeja, Embudo, tiempo real y búsqueda, y **confirmar el costo de Meta (F1·6)**, que es el
   punto crítico con ese volumen. F4·31 es requisito antes de unificar Kommo. El dueño elige si va primero F4·22 (Agente) o F4·30 (Leads).

0. **31 oct 2026 · Módulo Agente documentado y dividido en F4·22 a F4·29** ([AGENTE.md](AGENTE.md), decisión 0032 aceptada):
   F4·22 base · F4·23 conocimiento · F4·24 acciones «Cuando → Hacer» · F4·25 flujo de compra · F4·26 cotización con PDF (todas sin IA) →
   F4·27 cerebro DeepSeek · F4·28 agente Avi · F4·29 piloto en Distribuidores. El dueño eligió el Agente primero.
   ✅ **F4·22, F4·23 y F4·24 hechas y probadas** (la ficha y la acción «Devoluciones» respondieron por WhatsApp, 31 oct). Faltan por probar
   por WhatsApp Compra (F4·25) y Cotización (F4·26). Antes, F4·23 (Configuración → Agente):
   falta que el dueño la pruebe y llene las fichas (ubicación, garantía, devoluciones, envíos, pagos). 🔵 **F4·24 Acciones construida** (motor en el receptor + pestaña Acciones): falta que el dueño
   la pruebe; hoy solo «Pasar a asesor» está activa. 🔵 **F4·25 Flujo de compra construida** (pestaña Compra): falta que el
   dueño pegue el texto de cuentas, active «Quiero comprar» y lo pruebe por WhatsApp. 🔵 **F4·26 Cotización construida**
   (pestaña Cotización, PDF con logo): falta que el dueño active «Cotización» y la pruebe. Con esto, menú + acciones + compra + cotización
   + asesor cierran ventas sin IA. 🔵 **F4·32 Documentos construida** (Conocimiento → Documentos y Probar búsqueda): falta que el dueño suba un documento y
   lo pruebe. Sigue F4·27 Cerebro (llave de DeepSeek y presupuesto).
   📝 **F4·32 Documentos de conocimiento** (subir texto, PDF o Excel para el agente) documentada; va antes de F4·28.
   **Pruebas del bot frágiles:** `0012_borrador`, `0014_publicar` y `0015_varios_bots` dependen de los borradores y versiones vivos (fallan
   cuando el dueño tiene un borrador abierto); hay que aislarlas con datos propios dentro de cada prueba.
   Pendiente del dueño: textos de ubicación, garantía, devoluciones, envíos y pagos, y confirmar el texto de cuentas del Salesbot «Compra».
   **Webhook fijo (F2·17 / F2·10):** ✅ hecho el 7 nov 2026 (ver arriba).
0. **31 oct 2026 · F4·19 Apariencia (✅ probada por el dueño) y F4·20 panel lateral como Futur Green (✅ aprobado, [APARIENCIA.md](APARIENCIA.md#panel-lateral-como-futur-green-f420)):** quitar el verde, módulo Configuración → Apariencia con tres
   colores y paletas, modo oscuro por usuario y fuente más amigable ([APARIENCIA.md](APARIENCIA.md), decisión 0031, migración 0023).
   Incluye **logo personalizable** (bucket `marca`). El dueño probó todo con sesión y quedó OK. F4·20 y F4·21 (lienzo del bot con los colores de la app) aprobados el mismo día. Lo que sigue en la lista: F4·14
   (arranques del bot, migración 0022) y las pruebas en rojo de 0014/0015.
   **Ojo:** `supabase/migrar.sh --probar` tiene en rojo pruebas de `0014_publicar` y `0015_varios_bots` (versión publicada del bot con
   problemas); no son de F4·19, hay que revisarlas aparte.
   El mismo día se validó el **número de prueba**: estaba en PENDING en Meta; se activó enviando el mensaje de prueba desde
   Tests de la API (token temporal de 60 min) y el bot respondió de ida y vuelta.

1. **F3·1 a F3·10 hechas** (30 sep 2026): la construcción de la Fase 3 está completa. Para cerrarla falta revisar su
   criterio (RLS en todo, `next build` sin errores) y pasar a la Fase 4 (pruebas con el dueño).
2. **Mejoras (F4·4 en adelante), módulo por módulo.** Primero **Bot y horario** (decisión 0026,
   [FLUJO-DEL-BOT.md](FLUJO-DEL-BOT.md)): ✅ F4·4 vista previa real y límites (migración 0010) → ✅ F4·5 flujo en la base (migración 0011) → ✅ F4·6 lienzo (migraciones 0012 y 0013) →
   ✅ F4·7 borrador, publicar e historial (migración 0014) → ✅ F4·8 simulador → **Lienzo con más acciones (1 oct, decisiones 0027 y 0028):**
   ✅ F4·9 varios bots (migración 0015) → ✅ F4·10 «+ Agregar», mensaje sin botones e «Ir a otro bot» (migración 0016) → ✅ F4·11 Condiciones (migración 0017) → ✅ F4·12 Catálogos (migración 0018) → ✅ F4·13 Pausa (migración 0019) → ✅ F4·16 Configuración Meta (0020) → ✅ F4·17 lienzo a pantalla completa → ✅ F4·18 salidas del Mensaje: Otra respuesta, Sin respuesta y Error al enviar (0021, decisión 0030) → **F4·14 arranques (siguiente, migración 0022)** →
   arranque por palabra clave y por etapa (el asesor tiene la última palabra; fuera de 24 h, plantilla de Meta) → F4·15 simulador y pruebas.
   Los pasos que no son mensajes (inventario, ficha, catálogo, asesor) son cuadros del sistema fijos (0026).
3. **Pendiente del dueño en F3·9:** subir las fotos de los equipos (hoy los 17 están sin foto), los catálogos PDF y el
   enlace de Drive con todos, desde Inventario → Catálogos.
3. **Pendiente del dueño en F3·6:** aprobar los textos de las 3 plantillas del CRM y enviarlas a
   Meta desde Configuración → Canal WhatsApp (hoy solo hay plantillas de ejemplo en inglés).
3. **Webhook con dirección fija ([TUNEL-WEBHOOK.md](TUNEL-WEBHOOK.md)).** El 1 oct el túnel rápido lo borró Cloudflare y el bot
   dejó de responder horas (se arregló con `systemctl --user restart crm-meta-tunel`). Opción A ya (F2·17, Tailscale Funnel:
   el dueño activa HTTPS y Funnel en la consola de Tailscale) y opción B al tener dominio (F2·10, Cloudflare con dominio propio).
   **Estudio del 5 nov 2026: [PUBLICAR-CRM-EMPRESA.md](PUBLICAR-CRM-EMPRESA.md)** (poner el CRM a trabajar para la empresa desde el
   servidor mientras se despliega; opciones, riesgos y decisiones del dueño). Sin decisión todavía.
3. **Salida a producción en Meta ([PLAN-PRODUCCION-META.md](PLAN-PRODUCCION-META.md), 1 oct 2026).** App nueva **CRM InventarIA**
   (reemplaza a *Futur Green bot*), número real **+57 320 521 1803**, dominio comprado en Hostinger y web en GitHub. Fases 1 a 7:
   dominio en Cloudflare → web y política de privacidad → correo del dominio → número real y token → webhook fijo y cambio de app
   → verificación del negocio (RUT y Cámara de Comercio) → publicar la app. Del dueño ya: fases 1 y 4.
3. En paralelo, lo que depende del dueño: F1·6, F1·7, F1·8, clave de Gemini, PDF y enlace de Drive, hoja Excel.

## Estado de las tareas de la Fase 1

| Tarea | Estado | Qué falta |
|---|---|---|
| F1·1 Flujo de atención · F1·2 Etapas · F1·3 Metas y SLA | ✅ Hechas | — |
| **F1·4** Subir commits a GitHub | ✅ Hecha | 1 oct 2026: 47 commits subidos a `Appsheet-jm456/CRM_InventarIA` (privado). Los siguientes: `git push` (solo con autorización) |
| **F1·5** Trámites en Meta | 🔵 En curso | ✅ App *Futur Green bot* (portafolio Futur Green) con número de prueba +1 555 190 4296 · ✅ token permanente en `.env.meta` (no vence) · ✅ envío desde el servidor · ✅ **webhook de prueba de ida y vuelta** (recibe, responde, firma validada, estados de entrega). Falta: verificar el negocio y el número real |
| **F1·6** Confirmar precios de Meta del 1 oct 2026 | Pendiente | Solo hay fuentes de terceros; la documentación oficial no lo muestra. Confirmar en WhatsApp Manager y Billing Hub, y agregar medio de pago |
| **F1·7** Ramas del árbol sin definir | Pendiente | Las define el dueño: Torres Tiny, SFF, Partes, Distribuidores, Servicio al cliente. Mientras tanto van a asesor |
| **F1·8** Qué equipo es Hogar, Ejecutivo o Diseño | Pendiente | El inventario no tiene ese dato: deducirlo (procesador, RAM) o agregar un campo |
| **F1·9** Tipo de chat del MVP (P-11) | ✅ Hecha | Híbrido (decisión 0016), confirmado por el dueño el 1 oct 2026 |

## App nueva CRM InventarIA (F3·1, 30 sep 2026)

- **Editor del bot, horario y respuestas rápidas (F3·7, decisión 0023, [BOT-Y-HORARIO.md](BOT-Y-HORARIO.md)):**
  `/bot` edita textos y títulos de botones (no la estructura; restaura el original) y el horario con festivos;
  el bot los lee de la base cada 30 s y, fuera de horario, avisa al pasar a asesor cuándo le responden.
  `/respuestas-rapidas` y el atajo `/` en la Bandeja. Migración 0007. Hay que sembrar los festivos de 2028 (la app avisa).

- **Inventario, catálogos y Chat InventarIA (F3·9, decisión 0025, [INVENTARIO.md](INVENTARIO.md)):** `/inventario`
  con filtros, ficha (con la vista de cómo la ve el cliente), crear y editar con **foto subida** (bucket `productos`; el
  bot la sube a Meta y la envía por id, reutilizado 25 días), **carga del Excel con vista previa** (función
  `cargar_inventario`, que también usa el script de consola) y **Catálogos** (PDF o Drive). `/chat` pregunta al
  inventario con el intérprete del bot por `POST /interno/buscar` del receptor (token `CRM_INTERNO_TOKEN` en
  `.env.meta` y `crm/.env.local`; no responde por el túnel). Escribir pide `administrar_inventario`. Migración 0009.
  **Ojo:** no correr `next dev` en `crm/` con el servicio arriba: comparte `.next` y rompe la app hasta el próximo build.

- **Métricas (F3·8, decisión 0024, [METRICAS.md](METRICAS.md)):** `/metricas` abre en el mes actual con selector de
  período y embudo: conversión por etapa, primera respuesta en SLA, ganadas y perdidas con motivos, sin respuesta ahora,
  entrega de mensajes y tabla por asesor (el asesor ve solo lo suyo). Cada paso a la cola queda en `atenciones`. El
  receptor guarda cada estado de Meta (`estados_meta`) y la Bandeja muestra ✓ / ✓✓ / ✓✓ azul / ✗. Consumo de Meta del mes
  contra los 1.000 gratis, con aviso al 80 % en Métricas e Inicio; **sin pesos hasta F1·6**. Migración 0008, 16 pruebas
  en `supabase/pruebas/` (`supabase/migrar.sh --probar`).

- Código en `crm/` (Next.js 14 + TypeScript, copia del esqueleto de Futur Green). **http://100.114.72.43:8096**
  (Tailscale) o `http://192.168.20.50:8096` (decisión 0017; hasta F3·5 corrió en el 3020).
- **Bandeja, Embudo y Etapas (F3·5, decisión 0020, [BANDEJA-Y-EMBUDO.md](BANDEJA-Y-EMBUDO.md)):** cola, tomar,
  devolver, asignar, cerrar, devolver al bot, responder por Meta (solo dentro de 24 h), media del cliente,
  embudo por arrastre y etapas editables. Tiempo real con Supabase Realtime (el navegador llega a la API por
  `<ip>:8020`). La cookie de sesión tiene nombre fijo (`sb-crm-inventaria-auth-token`).
- **Seguimientos, SLA y plantillas (F3·6, decisión 0021, [SEGUIMIENTOS-Y-SLA.md](SEGUIMIENTOS-Y-SLA.md)):**
  seguimientos que solo recuerdan al asesor; SLA en minutos hábiles (`horario_atencion` y `festivos` 2026–2027,
  hay que sembrar los de 2028); avisos con sonido y notificación (botón 🔔 Avisos en la Bandeja) y contador junto a
  Bandeja; fuera de 24 h se responde con plantilla aprobada. Las fechas que escribe el asesor son hora de Colombia.
- **Varios embudos (F3·10, decisión 0022, [EMBUDOS.md](EMBUDOS.md)):** Cliente Final, Pos Venta y Distribuidor, cada
  uno con sus etapas. Cada cliente tiene una **oportunidad** por embudo (una abierta a la vez). El bot la abre por la
  opción del menú (etiquetas `Interes-Productos`, `Interes-Distribuidor`, `Interes-Soporte`) y solo mueve Cliente
  Final hacia adelante; `leads.etapa` quedó como la etapa del bot. El tablero, la ficha y el Inicio leen `oportunidades`.
- Servicio `crm-inventaria-app` (usuario atlasjm, arranca solo): `systemctl --user status crm-inventaria-app`.
  Copia de la unidad en `crm/systemd/`. Tras cambiar código: `cd crm && npx next build && systemctl --user restart crm-inventaria-app`.
- Secretos en `crm/.env.local` (fuera de git, plantilla en `crm/.env.example`).
- Se entra con **usuario** (se guarda como `<usuario>@inventaria.local`). Primer admin: `supabase/crear-admin.sh`;
  los demás desde Configuración → Usuarios. Roles y permisos: [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md).
- Probado: RLS (anon sin acceso, asesor sin leads/mensajes ni escritura, salvaguardas del admin) y en navegador
  (login, clave mala, panel por rol, Usuarios, Roles, módulos en construcción). Usuarios QA borrados.

## Conexión con Meta (probada el 30 sep 2026)

- **Datos de la conexión (desde el 3 oct 2026, F4·16):** viven en la base, en **Configuración → Meta** (`/meta`): identificadores a la vista
  y token, App Secret y token de verificación cifrados en Vault, que nadie puede leer. Se cambian desde la pantalla, sin reiniciar. Los
  secretos salieron de `.env.meta` (queda solo `CRM_INTERNO_TOKEN`) y de `crm/.env.local`; copias en `.env.meta.bak` y `crm/.env.local.bak`
  (fuera de git, borrar cuando el dueño lo decida). Si se pierde `VAULT_ENC_KEY` de `supabase/.env`, hay que volver a escribir los secretos.
- **Receptor de prueba:** `herramientas/meta-webhook-prueba/receptor.py` en el puerto 8095, más
  `~/.local/bin/cloudflared tunnel --url http://127.0.0.1:8095`. La URL de `trycloudflare` **cambia en cada
  reinicio**: al levantarlo de nuevo hay que pegarla otra vez en Meta → WhatsApp → Configuración → Webhook.
  El registro (`eventos.log`) tiene teléfonos y mensajes y no se commitea.
- **Lecciones:** (1) al generar un token hay que marcar la cuenta de WhatsApp o sale "object does not exist";
  (2) un texto libre solo se entrega si el cliente escribió en las últimas 24 h, y si no, Meta lo descarta en
  silencio (solo avisa por el webhook); (3) la app debe estar suscrita a la WABA (`POST /{WABA}/subscribed_apps`)
  además de tener el webhook verificado.

## Supabase del CRM (montado el 30 sep 2026, decisión 0013)

- **Instancia `crminventaria-supabase`** en `supabase/` (copia del montaje de Futur Green, claves propias en
  `supabase/.env`, fuera de git). API y **Studio en http://192.168.20.50:8020** (usuario `supabase`, contraseña
  `DASHBOARD_PASSWORD` de `supabase/.env`). Base: `:5434` (sesión) y `:6545` (transacción).
  - Levantar o revisar: `cd supabase && docker compose up -d` · `docker compose ps`
  - Migraciones: `supabase/migrations/NNNN_*.sql`, se aplican con `bash supabase/migrar.sh`.
- **Modelo actual (0001–0003):** `productos`, `etapas`, `leads`, `mensajes`, `catalogos` y usuarios/roles/permisos.
  `leads` y `mensajes` sin políticas (solo el servidor con `SERVICE_ROLE_KEY`) hasta F3·5.
- **Inventario (desde el 30 sep, F3·2):** Supabase manda. **Baserow ya no se copia** (timer `crm-sync-inventario`
  apagado). Se cambia con la hoja [plantillas/inventario.xlsx](plantillas/inventario.xlsx) y `cargar_inventario.py`.
- **Datos de prueba (decisión 0019):** los 17 equipos, los clientes y los mensajes que hay son de prueba. Antes de
  arrancar con lo real: `python3 herramientas/datos-prueba/borrar_datos_prueba.py` (muestra), `--probar` (borra y
  deshace) y `--borrar` (respalda en `respaldos/`, pide escribir BORRAR). Después se carga la hoja real.
  Evolution estaba vacío (0 chats): no hubo historial que migrar.

## Demo del bot por WhatsApp (dejada lista el 30 sep 2026)

El árbol de respuesta corre sobre el **número de prueba de Meta (+1 555 190 4296)** con el inventario en vivo
de Baserow, y refleja cada cliente en el **kanban de la v0 (puerto 3000)**. Es una prueba, no la app nueva.

- **Servicios** (usuario `atlasjm`, arrancan solos con el servidor, `Linger=yes`):
  `crm-meta-receptor` (receptor en 127.0.0.1:8095) y `crm-meta-tunel` (túnel de Cloudflare que **registra solo
  su URL nueva en Meta** cada vez que arranca). Copia de las unidades en `herramientas/meta-webhook-prueba/systemd/`.
  - Estado: `systemctl --user status crm-meta-receptor crm-meta-tunel`
  - Reiniciar: `systemctl --user restart crm-meta-receptor crm-meta-tunel`
  - Conversaciones: `tail -f herramientas/meta-webhook-prueba/eventos.log` · URL actual: `tunel-url.txt`
  - **No apagarlos:** el receptor es hoy el canal de la app (recibe, responde con el bot y guarda los mensajes).
- **Visor de conversaciones:** apagado en F3·5; lo reemplazó la Bandeja de la app en el mismo 8096.
- **Quién puede probar:** solo números verificados en Meta → Tests de la API → paso 3 (máximo 5). Un número
  sin verificar escribe, pero Meta no le entrega las respuestas.
- **Reiniciar una charla:** escribir `reiniciar` (también quita la pausa de asesor). `hola` o `menu` vuelven al inicio.
- **Datos en Supabase (desde el 30 sep, decisión 0014):** el bot lee `productos` y guarda cada cliente en
  `leads` (etapa, datos del árbol, etiquetas, estado del bot) y cada mensaje en `mensajes`. **Un reinicio ya no
  borra dónde iba cada cliente.** El kanban de la v0 (Baserow) dejó de reflejarlos: la Bandeja (8096) los muestra.
- **Texto libre (decisión 0016):** `interprete.py` — reglas (marca, i3–i9, generación, RAM, montos, "palos",
  uso, "quiero comprar") y, si no alcanzan, Gemini (falta clave `AIza…`) o qwen3 local (10–12 s, el bot avisa
  "Estoy buscando…"). La respuesta siempre sale de `productos`.
- **Catálogos (decisión 0015):** tabla `catalogos` y bucket privado `catalogos`; el bot envía el más específico
  para la marca y categoría y el enlace de Drive con todos. **Vacía hasta recibir los PDF y el enlace.**
- **Carga de la lista por Excel (F2·14):** `python3 herramientas/carga-inventario/cargar_inventario.py lista.xlsx`
  (muestra cambios) y `--aplicar` (escribe). Plantilla con las columnas: `docs/plantillas/inventario.xlsx`.
- **Hallazgos de la prueba del 30 sep:** 1) montos escritos en el presupuesto, 2) "quiero comprar" en la ficha y
  3) el contador de errores que no volvía a 0 — **corregidos**. 4) Ningún equipo tiene foto: las fichas salen sin imagen.

## Estado del repositorio

- Rama `main`, subida el 1 oct 2026 al remoto `inventaria` → `git@github-crm-inventaria:Appsheet-jm456/CRM_InventarIA.git` (privado,
  deploy key `~/.ssh/crm_inventaria_deploy_ed25519`, con escritura). El remoto `origin`
  (`chat_bot-inventario`) no se tocó y sigue con el último fetch del 24 jun.
- Autor de los commits: `Appsheet-jm456`. **Push solo con autorización.**
- Los `.bak` (uno con credenciales) se borraron; nunca estuvieron en git.

## Qué se decidió (resumen; el detalle está en `docs/decisiones/`)

| # | Decisión |
|---|---|
| 0003 | **Supabase propio en este servidor**, separado de Futur Green (no Supabase Cloud) |
| 0008 | Reconstruir por fases (SDLC); la v0 sigue viva hasta el corte |
| 0009 | Frontend con la arquitectura de Futur Green: **panel lateral plegable**, una ruta por módulo |
| 0010 | **API oficial de Meta** en el MVP; Evolution solo en la v0. Reemplaza a la 0004. Webhook por túnel de Cloudflare con dominio propio |
| 0011 | Precios de Meta desde el 1 oct 2026: **un mensaje por respuesta**, contador de consumo. Cifras sin confirmar |
| 0012 | Bot guiado **conectado a la base**: catálogo y fichas salen de la tabla de productos; cola compartida; SLA 10 min (alerta a los 15); L–V 8–18, Sáb 9–14, festivos cerrado |

Otras reglas ya fijas: bot híbrido: la IA solo extrae filtros y la respuesta sale de la base (0016, modifica la 0005); el embudo solo avanza (0006);
7 etapas (Nuevo, En Conversación, Cotización, Negociación, Confirmar transfer, Vendido, Perdido);
presupuesto en 4 rangos según el inventario (<$1 M, $1–1,5 M, $1,5–2 M, >$2 M).

## Documentos clave

| Archivo | Para qué |
|---|---|
| [00-BRIEF.md](00-BRIEF.md) | Alcance, problema, riesgos y stack del CRM nuevo (v1.2) |
| [ARBOL-DE-RESPUESTA.md](ARBOL-DE-RESPUESTA.md) | El árbol del Salesbot adaptado, campos, etapas y puntos P-01 a P-11 |
| [SIMULACION-CHAT.md](SIMULACION-CHAT.md) · [simulacion/](simulacion/simulacion-chat.html) | Prototipo del chat guiado y del tipo agente; aprobado, se va a perfeccionar (F2·12) |
| [USUARIOS-Y-PERMISOS.md](USUARIOS-Y-PERMISOS.md) | Roles, permisos y RLS de la app nueva (F2·5, decisión 0018) |
| [ARQUITECTURA-FRONTEND.md](ARQUITECTURA-FRONTEND.md) | Carpeta `crm/`, puertos, `Shell` y lista de módulos (F2·9, decisión 0017) |
| [TUNEL-WEBHOOK.md](TUNEL-WEBHOOK.md) | Webhook con dirección fija: opción A (Tailscale Funnel) y B (Cloudflare con dominio), paso a paso |
| [PLAN-PRODUCCION-META.md](PLAN-PRODUCCION-META.md) | Salida a producción: dominio, web, número real, webhook fijo, verificación y publicar la app |
| [PLAN-META-API.md](PLAN-META-API.md) | Trámites en Meta paso a paso (sección de costos ya corregida) |
| [BRIEF.md](BRIEF.md) | La v0 (referencia de lo que se reutiliza) |
| [sdlc/](sdlc/) | Las 5 fases con su criterio de cierre |

## Notion

- Página **"CRM InventarIA"** bajo la página padre compartida (junto a Futur Green y ClaudePyme):
  <https://app.notion.com/p/CRM-InventarIA-3ea9ea128ea081c9a0d7fd8035fddf18>. Tiene Fases (5), Tareas (50),
  Brief v1.0, Decisiones técnicas (26), Árbol de respuesta y Simulación del chat.
- Token en `.env.notion` de este repo (no se commitea). Sincronizar: `python3 docs/notion/sincronizar.py --todo` (solo toca los bloques que cambian; `--revisar` ensaya)
  (solo con cambios estructurales).
- **El sincronizador empareja las tareas por título.** Si se renombra una, primero se renombra en Notion con
  un `PATCH`, o se duplica. Antes de tocar `tareas.csv`, comparar con Notion: el dueño también edita ahí.
- Falta crear **a mano** las vistas de la base de Tareas (Tablero por Estado, Bloqueadas, Por fase): la API
  de Notion no las crea.
- Cerrar una tarea = un `PATCH` a su fila, no el script.

## Cosas que conviene saber

- El bot solo es tan exacto como la base: cuando se vende un equipo hay que descontar el stock en el acto,
  o el bot seguirá ofreciéndolo. Sin registrar como regla del negocio todavía (proponer en F2·1).
- En la v0 cada mensaje lee todos los leads de Baserow; por eso se reconstruye. No invertir en mejorarla.
- El inventario real (17 portátiles, todos Dell, todos usados) tiene códigos de tres formatos:
  `100-102-1041`, `100-102-1007-3` y `PU-23`. El reconocimiento debe validar contra la base, no con un patrón fijo.
- Baserow responde 403 a `urllib` de Python; usar `curl`.
- Puertos ocupados en el servidor: 3000 (v0), 5432/5433/6543/6544/8000/8010/8443 (Supabase de otros proyectos),
  5678 (n8n), 7580 (Nextcloud), 8088 (Evolution). La Supabase del CRM necesita puertos libres (F2·8).

## Forma de trabajo acordada

Documentar primero como tareas, **preguntar las dudas con opciones** y solo después construir; ejecutar en
serie en esta misma sesión, commit por bloque terminado. Responder siempre en español.

# Módulo Leads: lista, ficha del cliente, atributos y tareas (F4·30) · Capacidad para 1.000 clientes al día (F4·31)

**Estado:** 🔵 En construcción · F4·30 A (base) hecha el 31 oct 2026 · Decisión [0033](decisiones/0033-modulo-leads-y-capacidad.md) aceptada
Referencia que trajo el dueño: la lista «Todos los leads» y la ficha del lead de Kommo (panel de datos a la izquierda, chat a la derecha).

## Qué pidió el dueño (31 oct 2026)

- Un **módulo Leads** con la **lista** de todos los clientes para **revisar, modificar, eliminar o archivar**.
- Una **ficha del lead** donde se pueda **cambiar la etapa** del embudo, **cambiar el responsable**, **crear tareas** y ver y editar sus **atributos**.
- **Crear, editar y eliminar atributos** (campos personalizados, como en Kommo: número de serie, dirección de entrega, método de pago, descuento…).
- Una **vista de chat** dentro de la ficha para **responder** como en Kommo.
- Y una pregunta: con **600 a 800 clientes al día** (un día llegaron 1.000), ¿la app se satura? → sección [Capacidad](#capacidad-1000-clientes-al-día-f431).

## Bandeja, Embudo y Leads: para qué sirve cada uno

| Módulo | Para qué | Pregunta que responde |
|---|---|---|
| **Bandeja** (existe) | Atender **ahora**: la cola de chats esperando respuesta | ¿A quién le respondo ya? |
| **Embudo** (existe) | Ver las oportunidades **por etapa** y moverlas arrastrando | ¿Cómo va el negocio? |
| **Leads** (nuevo) | La **base de clientes** completa: buscar, filtrar, revisar, editar en grupo, archivar, limpiar | ¿Quiénes son mis clientes y qué sé de ellos? |

La **ficha del lead** es la misma desde los tres: se abre desde la Bandeja, desde una tarjeta del Embudo o desde la lista de Leads.

## 1. Lista de leads

- **Columnas** (el usuario elige cuáles ve y en qué orden): nombre, teléfono, embudo y etapa, responsable, etiquetas, valor/presupuesto,
  último mensaje, último contacto, creado, origen (bot, agente, asesor) y cualquier **atributo personalizado**.
- **Búsqueda** por nombre, teléfono, código de equipo o texto de los mensajes.
- **Filtros**: embudo, etapa, responsable (incluido «sin asignar»), etiquetas, fechas (creado, último contacto), estado (activos, ganados,
  perdidos, **archivados**, **papelera**), con o sin tareas vencidas, y por atributo.
- **Vistas guardadas** («Leads activos», «Sin responsable», «Cotizados esta semana»…), una por defecto para cada usuario.
- **Encabezado** con el total y la suma del valor de lo filtrado (como Kommo: «1018 leads: $0»).
- **Selección múltiple y acciones en grupo**: cambiar etapa, cambiar responsable, poner o quitar etiqueta, crear tarea, **archivar**,
  **eliminar** (a la papelera) y **exportar a Excel/CSV**.
- RL-01. La lista **pagina en el servidor** (50 por página, hasta 200) y cuenta el total en la base: nunca carga todos los leads al navegador.
- RL-02. Cada acción en grupo pide confirmación con el número de leads afectados y queda en el historial de cada lead.

## 2. Ficha del lead (como Kommo)

**Panel izquierdo — datos**

- Encabezado: nombre (editable), teléfono, **etiquetas** (agregar/quitar).
- **Embudo y etapa** con barra de avance: se cambia con un selector. RL-03. El usuario **sí puede devolver** una etapa a mano (la regla «solo
  avanza» es para el bot y las automatizaciones); al pasar a **Perdido** pide el motivo, como hoy.
- **Responsable**: selector de asesores activos; RL-04. reasignar deja evento en el historial y avisa al nuevo responsable.
- **Valor / presupuesto**.
- **Atributos** del lead agrupados por sección (Datos del cliente, Compra, Envío, Distribuidor…), editables en el sitio.
- Pestañas: **Principal** (datos y atributos) · **Oportunidades** (una por embudo) · **Cotizaciones** (F4·26) · **Archivos** (fotos,
  comprobantes y PDF que mandó o recibió el cliente) · **Estadísticas** (primer contacto, mensajes, tiempo de respuesta, días en cada etapa).

**Panel derecho — línea de tiempo y chat**

- Una sola línea de tiempo con los **mensajes de WhatsApp** (cliente, bot, agente, asesor, con ✓/✓✓) y los **eventos**: cambio de etapa,
  reasignación, nota interna, tarea creada o cumplida, cotización enviada, comprobante recibido.
- **Caja para responder** igual que la Bandeja: texto, respuestas rápidas con `/`, adjuntos, y **plantilla de Meta** cuando pasaron más de 24 h.
  Pestañas en la caja: **Chat** (le llega al cliente) · **Nota** (solo el equipo) · **Tarea**.
- Botones del chat: **Tomar**, **Devolver al bot**, **Pausar bot**, **Cerrar** (los de la Bandeja).
- RL-05. Responder desde la ficha **es** responder desde la Bandeja: mismos permisos, mismo SLA, mismo registro (`mensajes`).

**Pie**: **Archivar** · **Eliminar** (a la papelera) · **Fusionar** con otro lead (después; ver Fuera de alcance).

## 3. Tareas

- Se crean desde la ficha, desde la lista (en grupo) o las crea el sistema (compra, cotización, agente).
- Campos: **tipo** (Llamar, Seguimiento, Enviar cotización, Verificar pago, Despachar… configurables), **para cuándo** (fecha y hora de
  Colombia), **responsable**, texto. Se marcan **cumplidas** con un resultado.
- Se ven en la ficha, en **Seguimientos** (que ya existe) y en el contador de vencidas del panel.
- RL-06. Se construyen **sobre la tabla `seguimientos`** de F3·6 (se le agregan tipo y resultado), no se duplica el modelo.

## 4. Atributos personalizados (Configuración → Atributos del lead)

- **Crear, editar, ordenar (arrastrando), agrupar en secciones y eliminar** atributos.
- **Tipos**: texto, texto largo, número, moneda (COP), fecha, lista (una opción), multiselección, sí/no, teléfono, correo, dirección, enlace.
- Opciones por atributo: **obligatorio** (siempre o **al pasar a una etapa**: por ejemplo Dirección de entrega y Método de pago obligatorios para
  *Despachado*), **visible en la lista**, **lo puede llenar el bot/agente** (ej. Cédula y Ciudad en el flujo de cotización).
- Ejemplos iniciales tomados de la ficha de Kommo: Número de serie, Dirección de entrega, Método de pago (lista), Descuento (lista), Número de
  contrato, Fecha de contrato, Cédula, Ciudad, Tipo de cliente (Distribuidor / Cliente final).
- RL-07. **Atributos del sistema** (nombre, teléfono, etapa, responsable, valor, etiquetas) no se pueden borrar ni cambiar de tipo.
- RL-08. **Eliminar un atributo lo archiva**: deja de verse pero sus datos se conservan y se puede restaurar. El borrado definitivo pide escribir
  su nombre y solo lo hace el administrador.
- RL-09. Cambiar el tipo de un atributo con datos solo se permite entre tipos compatibles (texto ↔ texto largo, lista → multiselección); si no,
  se crea uno nuevo.
- RL-10. Permiso nuevo **`administrar_atributos`** (administrador).

## 5. Archivar y eliminar

| Acción | Qué pasa | Quién |
|---|---|---|
| **Archivar** | Sale de las listas y del Embudo; conserva todo; si el cliente vuelve a escribir, **se desarchiva solo** y llega a la Bandeja | Asesor (sus leads) y administrador |
| **Eliminar** | Va a la **papelera** 30 días (se puede restaurar); después se borra con sus mensajes y archivos | Permiso nuevo `eliminar_leads` |
| **Borrar ya (datos personales)** | Borrado definitivo inmediato cuando el **cliente lo pide** (Ley 1581 de protección de datos); queda constancia sin datos personales | Solo administrador |

- RL-11. Un lead eliminado que vuelve a escribir se crea como **nuevo** (no revive datos de la papelera).

## 6. Historial

- RL-12. Cada cambio de etapa, responsable, atributo, etiqueta, archivo/eliminación queda en `lead_eventos` (quién, cuándo, antes → después).
  Es lo que alimenta la línea de tiempo de la ficha.

## Permisos

El asesor ve sus leads y los sin asignar (regla de F3·5); el administrador ve todos. Nuevos: `administrar_atributos`, `eliminar_leads` y
`exportar_leads` (exportar datos personales es sensible).

---

## Capacidad: 1.000 clientes al día (F4·31)

**Respuesta corta:** el servidor y la base **aguantan** ese volumen sin problema. Lo que hay que ajustar está en **cómo carga la app**, en el
**túnel** y, sobre todo, en el **costo de Meta**.

### Números

| Concepto | Cálculo | Resultado |
|---|---|---|
| Clientes nuevos | 600–1.000 al día | **~20.000–30.000 leads al mes** |
| Mensajes | ~15 por cliente (cliente + bot) | **~10.000–15.000 al día**, ~400.000 al mes |
| Base de datos | ~1 KB por mensaje | ~0,4 GB al mes en texto; fotos y comprobantes aparte |
| Servidor | Xeon de 16 hilos, 31 GB de RAM (22 libres), 97 GB de disco libre | Sobra para Postgres y la app |

Postgres maneja millones de filas con los índices correctos; 400.000 mensajes al mes no lo cansan.

### Dónde sí se saturaría hoy (y qué hacer)

| # | Punto | Qué pasa hoy | Riesgo con 1.000/día | Arreglo (F4·31) |
|---|---|---|---|---|
| 1 | **Costo de Meta** | 1.000 mensajes de servicio gratis al mes (decisión 0011, por confirmar en F1·6) | **Se agotan en 1–2 días**; después cada mensaje se cobra y **sin medio de pago Meta deja de entregar** | Confirmar precios (F1·6) y medio de pago antes del volumen; bot de un mensaje por respuesta; las Acciones y el menú ya ahorran mensajes |
| 2 | **Bandeja** | Carga 300 leads y **recarga la lista entera** con cada cambio en `leads` | Con cientos de cambios por hora, cada asesor con la Bandeja abierta recarga sin parar | Actualizar solo la fila que cambió; paginar; filtrar el tiempo real por lo que el asesor ve |
| 3 | **Embudo** | Carga hasta 1.000 oportunidades | Con 30.000 leads al mes **corta en silencio** | Columnas paginadas por etapa («ver más») y conteos en la base; ocultar ganadas/perdidas viejas |
| 4 | **Tiempo real** | Cada navegador recibe **todos** los mensajes nuevos | ~10.000 eventos al día por navegador | Suscribirse solo a los chats abiertos y a un contador |
| 5 | **Túnel temporal** | `trycloudflare` es de pruebas, sin garantía | Con volumen real puede limitar o caerse | **Webhook fijo** (F2·17 / F2·10) antes de pasar volumen |
| 6 | **IA local** | qwen3 en la GPU responde uno a la vez (10–12 s) | En picos, cola de minutos para el texto libre | Proveedor en la nube (DeepSeek, F4·27) para el texto libre; la local solo de respaldo |
| 7 | **Búsqueda** | Sin índice para buscar por nombre o mensaje | La lista de Leads se volvería lenta | Índices de texto (trigramas) en nombre, teléfono y mensajes |
| 8 | **Archivos** | Fotos y comprobantes en el disco del servidor | ~Varios GB al mes | Medir; mover a almacenamiento aparte cuando pase del 70 % del disco |
| 9 | **Respaldos** | Pendientes (F5·2) | Más datos que perder | Respaldo diario probado antes del volumen |

### Contexto que baja el riesgo hoy

- El volumen de 600–1.000 diarios es del **cliente final, que hoy atiende Kommo**. El CRM propio atiende **Distribuidores**, con mucho menos
  tráfico. F4·31 es **requisito antes de unificar** Kommo en el CRM propio, no antes de seguir con las mejoras.

### Prueba de carga (parte de F4·31)

- Simular **1.500 clientes en un día** (pico 3× la hora más cargada) contra el receptor con un número falso, con 3 asesores con la Bandeja
  abierta, y medir: tiempo de respuesta del bot (meta < 2 s), CPU y memoria, y que ningún mensaje se pierda ni se duplique.

---

## Plan de construcción

| # | Tarea | Qué entrega |
|---|---|---|
| **F4·30 A** ✅ | Base (migración 0032, 19 pruebas SQL) | `lead_atributos` (definiciones), `leads.atributos` (jsonb con índice), `leads.archivado_en` y `eliminado_en`, `lead_eventos`, tipo y resultado en `seguimientos`, permisos nuevos, índices de búsqueda; pruebas SQL |
| **F4·30 B** | Atributos | Configuración → Atributos del lead: crear, editar, ordenar, secciones, archivar |
| **F4·30 C** | Lista | Módulo Leads: columnas, búsqueda, filtros, vistas guardadas, paginación en servidor, acciones en grupo, exportar |
| **F4·30 D** | Ficha | Ficha a pantalla completa: datos y atributos, etapa, responsable, tareas, línea de tiempo con chat, notas y respuesta (reutiliza la Bandeja) |
| **F4·30 E** | Archivar y papelera | Archivar, papelera de 30 días, restaurar, borrado por solicitud del cliente |
| **F4·31** | Capacidad | Arreglos 2 a 4 y 7 (Bandeja, Embudo, tiempo real, búsqueda), prueba de carga; coordina 1, 5, 6 y 9 con sus tareas |

Orden sugerido: **F4·30 A → B → C → D → E**, y **F4·31 antes de unificar Kommo**. F4·30 y el Agente (F4·22–F4·29) son independientes; el dueño
elige cuál va primero.

## Fuera de alcance (por ahora)

- **Fusionar** dos leads del mismo cliente con números distintos.
- **Empresas/contactos** separados del lead (Kommo distingue contacto, compañía y lead); aquí un lead = un cliente con su teléfono. Se puede
  agregar «Compañía» como atributo para distribuidores.
- Importar leads desde Excel o desde Kommo (útil para unificar: tarea aparte cuando se decida cerrar Kommo).

## Criterio de terminado

- [ ] Crear un atributo de cada tipo, usarlo en la ficha y en la lista, filtrarlo y archivarlo sin perder datos.
- [ ] Cambiar etapa y responsable desde la ficha y en grupo, con historial.
- [ ] Responder desde la ficha y que el mensaje aparezca igual en la Bandeja.
- [ ] Archivar, eliminar, restaurar y que un lead archivado se desarchive al escribir.
- [ ] La lista responde en menos de 1 s con 50.000 leads de prueba; la prueba de carga de F4·31 pasa.
- [ ] Un asesor no ve leads de otros ni puede eliminar sin permiso (pruebas SQL).

## Notas de construcción

- **F4·30 A (31 oct 2026), migración 0032:** permisos `administrar_atributos`, `eliminar_leads` y `exportar_leads` (administrador);
  `leads.atributos` (jsonb, validado contra `lead_atributos`: llave conocida y valor del tipo correcto), `archivado_en`, `eliminado_en` y `origen`;
  `lead_atributos` con los 9 de Kommo (la clave y el tipo no cambian; archivar conserva los datos); `lead_atributos_faltantes(lead, etapa)` para los
  obligatorios por etapa (los consulta la ficha: el bot nunca se bloquea); `lead_eventos` llenado por disparadores en leads (etapa, responsable,
  nombre, valor, etiquetas, cada atributo, archivar, papelera), oportunidades (etapa del embudo) y seguimientos (tarea creada y cumplida), con quién lo
  hizo o el sistema; lo que el bot cambia en cada mensaje no deja rastro; `seguimientos.tipo` y `resultado` con `lead_tarea_tipos`; `leads_archivar`
  (asesor, solo sus leads) y `leads_eliminar` (papelera y restaurar, con permiso); índices de búsqueda con trigramas (nombre, teléfono, mensajes) y
  GIN en atributos. Falta para E: que un lead archivado se desarchive al escribir, que el bot ignore los de la papelera (el teléfono es único) y que
  Bandeja y Embudo los oculten.

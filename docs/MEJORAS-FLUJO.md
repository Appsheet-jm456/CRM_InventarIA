# Mejoras del flujo Menú guiado + Agente + Asesor (revisión del 6 nov 2026)

> Revisión crítica hecha el 6 nov 2026 sobre el diseño del flujo y los datos de la base (solo lectura). Volumen real
> muy bajo (5 clientes, ~260 mensajes, casi todo pruebas): las críticas salen del diseño, no de producción.
> **Nada de esto está construido.** Cada mejora se documenta como HU antes de construirse, con la orden del dueño.
> Espejo en Google Drive: carpeta «CRM InventarIA».

## Prioridad recomendada

| # | Mejora | Gravedad | Estado |
|---|---|---|---|
| 1 | Retorno automático tras la pausa del asesor | 🔴 Alta: el cliente queda sin respuesta | **Construida como F4·45** (decisión 0035, migración 0049), falta la prueba del dueño |
| 3 | Seguimiento automático después de la cotización | 🔴 Alta: ventas que se pierden | Propuesta |
| 2 | Alarma de cola sin asesor | 🟠 Media | Propuesta |
| 4 | Errores del Agente (Avi) y piloto | 🟠 Media | Propuesta |
| 7 | Contexto completo al pasar a asesor | 🟠 Media | Propuesta |
| 6 | Ver qué capa respondió (acción, lienzo o Avi) | 🟡 Orden | Propuesta |
| 5 | Unificar los bots duplicados | 🟡 Orden | Propuesta |
| 8 | Domingos y festivos | 🟡 Orden | Propuesta |

Orden sugerido para construir: **1 → 3 → 2**, después el resto.

---

## Lo más grave

### 1. La pausa del asesor nunca se levanta
- **Evidencia (6 nov):** el cliente 86 llevaba 6 días con el bot callado y el 2037 tres días, los dos «asignados»
  (`leads.pausar_bot = true`). Ya estaba anotada como pregunta abierta en F4·44.
- **Riesgo:** si el asesor olvida el chat o termina sin cerrarlo, el cliente vuelve a escribir y nadie contesta.
- **Propuesta:** regla de retorno configurable: si el asesor no escribe en X horas, o el chat lleva Y horas sin
  actividad, el bot retoma con «¿Sigues necesitando ayuda?». Botón «Devolver al bot» para el asesor.
- **A decidir por el dueño:** las horas X e Y, el texto, y si aplica fuera del horario.

### 2. La cola no tiene alarma
- **Evidencia:** el cliente 2339 pasó a asesor y quedó en `estado_chat = cola` sin asignar. `primera_respuesta_en`
  existe, pero nada lo vigila.
- **Propuesta:** aviso interno (notificación del CRM o WhatsApp al asesor) cuando alguien lleva más de N minutos en
  cola dentro del horario. Al cliente, un mensaje honesto: «Un asesor te atiende en ~X min».
- **A decidir:** N minutos, a quién avisar y por qué canal.

### 3. No hay seguimiento automático
- **Evidencia:** la tabla `seguimientos` tiene 0 filas. Un cliente que cotiza y no responde queda en «Cotización».
- **Propuesta:** al enviar una cotización, programar recordatorios a las 24 h y a las 72 h. Pasadas 24 h desde el
  último mensaje del cliente, solo con **plantilla aprobada por Meta**. La Pausa del lienzo hace algo parecido, pero no
  cubre cotizaciones.
- **A decidir:** tiempos, textos y la plantilla para Meta.

## Agente (Avi)

### 4. Errores del Agente y piloto
- **Evidencia:** de 206 turnos en `agente_turnos`, 23 terminan en `error` (11 %), 99 respondidos, 6 a asesor,
  77 del simulador. Costo total $0,13. Avi sigue en **lista blanca**: no ha atendido tráfico real.
- **Propuesta:** revisar la columna `detalle` de los errores; si el modelo falla, el cliente recibe un mensaje claro
  con el menú, nunca silencio. Hacer un piloto acotado (un horario o una campaña) antes de abrirlo a todos.

### 5. Dos bots con contenido duplicado
- **Evidencia:** «Bienvenida» (v3) y «Avi Ventas» (v1, principal) tienen casi los mismos cuadros (asesor, avisos,
  catálogo, ficha).
- **Propuesta:** dejar uno como principal y archivar el otro, o repartir roles claros (Bienvenida = menú, Avi = texto
  libre). Dos copias obligan a arreglar cada cambio dos veces.

### 6. Tres capas que compiten sin que se vea quién gana
- Las acciones «Cuando → Hacer», el lienzo y Avi responden en ese orden, pero el dueño no lo ve en ningún lado.
- **Evidencia:** «Pregunta por un equipo» (id 43) está apagada y «Linea P Lenovo» (prioridad 80) activa.
- **Propuesta:** en cada chat, una marca «¿Qué respondió y por qué?» con la capa que atendió (acción, cuadro o Avi).

## Asesor y operación

### 7. Contexto al pasar a asesor
- Ya existe `leads.resumen_agente` con el motivo y los equipos.
- **Propuesta:** mostrarlo como primera nota visible al abrir el chat. En cotización o compra: equipos, total, tipo de
  cliente y último paso (por ejemplo «esperando comprobante»), para que el asesor no repita preguntas.

### 8. Domingos y festivos
- **Evidencia:** `horario_atencion` no tiene domingo.
- **Propuesta:** definir qué dice el bot en domingo y festivo para que el cliente sepa cuándo lo atienden.

## Antes de producción
- Pruebas rojas previas: `supabase/migrar.sh --probar` (0010, 0011, 0014, 0015, 0024, 0041) y `prueba_buffer.py` (3/5).
- Pruebas del dueño pendientes: F4·34 a F4·44, sobre todo el carrito.
- Commits locales sin push (necesitan la autorización del dueño).

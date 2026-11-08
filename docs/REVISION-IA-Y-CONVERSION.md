# Revisión de punta a punta: IA actual, features que faltan y embudo (8 nov 2026)

> Revisión hecha a pedido del dueño, sobre el código, los documentos y la base (solo lectura).
> **Nada de esto está construido.** Cada punto se documenta como HU antes de construirse, con la orden del dueño.
> Complementa [MEJORAS-FLUJO.md](MEJORAS-FLUJO.md) (6 nov) y [CAPACIDAD.md](CAPACIDAD.md) (7 nov).

## Respuesta corta

**Sí, el CRM puede cerrar ventas:** el recorrido completo existe (menú → ficha → «quiero comprar» → carrito → datos de pago →
comprobante → asesor valida → alistamiento → despacho). Lo que hoy frena la conversión **no es que falte el embudo**, sino:

1. **No hay tráfico para medirlo:** 10 clientes y 266 mensajes desde el 31 oct, casi todo pruebas; 1 venta. Sin volumen no se sabe qué etapa pierde.
2. **El cierre depende de una persona** (validar la transferencia) y de que el cliente mande el comprobante. Fuera de horario la venta se enfría.
3. **Lo que el cliente hace mucho y el bot no entiende:** notas de voz (hoy pasan directo al asesor) y fotos.
4. **Nadie persigue la cotización:** quien cotiza y se calla se pierde (mejora 3 de MEJORAS-FLUJO, todavía propuesta).

## Datos de la base (8 nov 2026)

| Dato | Valor |
|---|---|
| Clientes / mensajes | 10 / 266 (123 del cliente, 133 del bot, 10 del asesor en 30 días) |
| Oportunidades Cliente Final | Nuevo 1 · En Conversación 1 · Cotización 1 · Alistamiento 1 · Vendido 1 · Perdido 2 |
| Avi (`agente_turnos`) | 136 respondidos, 27 errores (11 %), 7 a asesor, 83 del simulador; US$ 0,18 en total |
| Errores de Avi | Casi todos en el **resumen**: «deepseek devolvió una respuesta vacía» o «local no respondió». OpenRouter con respaldo lo corrige |
| Seguimientos | 5 en total (4 pendientes) |
| Chats con el bot pausado | 5 de 10 |

**Ojo con el orden de etapas:** en la base, **Vendido** quedó en la posición 9, **después** de Alistamiento (7) y Despachado (8).
EMBUDOS.md dice que la venta se cuenta al llegar a Vendido, antes del despacho. Si el orden es este, las Métricas cuentan la venta tarde
(o nunca, si el asesor no la mueve). **A decidir por el dueño:** ¿la venta se cuenta al confirmar el pago o al entregar?

## Mejoras con IA actual (ordenadas por impacto en ventas)

| # | Mejora | Qué gana | IA / costo aprox. |
|---|---|---|---|
| IA-1 | **Notas de voz a texto**: el audio del cliente se transcribe y sigue por el bot/Avi como si lo hubiera escrito; el asesor ve el texto en la Bandeja | En Colombia se escribe mucho por audio; hoy cada audio para el bot y espera un asesor | Gemini Flash-Lite por OpenRouter (acepta audio). Centavos por mes |
| IA-2 | **Seguimiento automático de la cotización** (24 h y 72 h; después de 24 h con plantilla de Meta) con texto personalizado por IA a partir del chat | La etapa donde más se pierde | Plantilla de Meta + IA solo para el texto |
| IA-3 | **Lector del comprobante** (visión): anota «Bancolombia, $1.930.000, 8 nov 10:42, coincide con el total ✅ / no coincide ⚠» | El asesor valida en segundos; nunca confirma solo (RAG-21) | Gemini Flash-Lite, ~US$ 0,0005 por foto |
| IA-4 | **Copiloto del asesor en la Bandeja**: resumen del cliente al abrir el chat y **respuesta sugerida** que el asesor edita y envía | Asesor más rápido y sin repetir preguntas (mejora 7) | DeepSeek; solo cuando el asesor lo pide |
| IA-5 | **Alerta de equipo**: guarda lo que el cliente buscó («Lenovo i5, 16 GB, hasta 2 M»); cuando entra un equipo que coincide, le avisa con plantilla | Inventario de usados cambia cada día: recupera clientes que no encontraron | IA ya extrae filtros (0016); sin costo nuevo |
| IA-6 | **Por qué no compraron**: cada semana la IA lee los chats perdidos o sin respuesta y entrega un informe (precio, stock, demora, desconfianza…) y llena el motivo de pérdida | Saber qué arreglar en el embudo, con datos | DeepSeek, una vez por semana |
| IA-7 | **Calificación del cliente** (caliente / tibio / frío) y «próximo paso» en la ficha y el Embudo | El asesor atiende primero a quien va a comprar | DeepSeek en el resumen que Avi ya hace |
| IA-8 | **Pruebas de Avi** (conversaciones de ejemplo que se corren antes de cambiar el prompt o el modelo) | Cambiar de modelo sin miedo a que venda mal | Simulador que ya existe |

## Features de CRM que faltan (sin IA o casi)

| # | Feature | Por qué |
|---|---|---|
| F-1 | **Origen del cliente** (anuncio de Facebook/Instagram «clic a WhatsApp»: Meta manda `referral` en el primer mensaje) | Saber qué anuncio vende. Hoy no se guarda |
| F-2 | **Enviar la venta de vuelta a Meta** (Conversions API) | Meta optimiza los anuncios hacia quien compra, no hacia quien escribe |
| F-3 | **Link de pago** (Wompi, Bold o Mercado Pago) además de la transferencia | Paga con tarjeta/PSE a cualquier hora; la pasarela avisa el pago. **Choca con la regla «una persona confirma el pago»: decisión del dueño** |
| F-4 | **Reserva del equipo** por 20 min al mandar los datos de pago | Los usados son únicos: evita vender el mismo equipo a dos |
| F-5 | **Difusión segmentada** con plantillas (clientes que cotizaron hace 30 días, distribuidores, equipos nuevos) | Reactivar la base sin escribir uno por uno |
| F-6 | **Posventa**: a los 7 días de Entregado, pedir reseña de Google y ofrecer referido | Confianza para el siguiente cliente (venta de usados por internet) |
| F-7 | **Métricas de conversión por etapa** (cuántos pasan de Cotización a Esperando pago, tiempo en cada etapa, por asesor y por origen) | Hoy hay métricas, pero no el paso etapa a etapa |
| F-8 | **App móvil / avisos al celular del asesor** (PWA con notificaciones) | La cola sin alarma (mejora 2) se resuelve también aquí |

## Embudo y flujos: lo que se ve

- **Bien pensado:** el sistema hace los pasos exactos (precio, stock, cuentas, etapas) y la IA solo conversa; costo bajo; el pago lo confirma una persona.
  Esa es la lección de Kommo y está bien aplicada.
- **Demasiadas capas para el volumen:** acciones «Cuando → Hacer», lienzo con **dos bots casi iguales** (Bienvenida y Avi Ventas) y Avi.
  Cada cambio se hace dos veces y no se ve qué capa respondió (mejoras 5 y 6). Recomendado: un solo bot de menú y Avi solo en texto libre y compra.
- **Etapas:** 10 en Cliente Final. «Nuevo» y «En Conversación» casi no se distinguen y «Negociación» no la usa el bot. Con poco tráfico, menos
  etapas = métricas más claras. Revisar el orden de **Vendido** (ver arriba).
- **El cuello real es humano:** 5 de 10 chats con el bot pausado y el retorno automático (F4·45) apagado. Sin asesor, el cliente espera.

## Orden recomendado

1. Configurar OpenRouter (hecho en código, falta la llave) → baja los errores de Avi del 11 % a casi 0.
2. **IA-1 Notas de voz** y **IA-2 Seguimiento de cotización**: lo que más ventas recupera con menos trabajo.
3. **F-1 Origen del anuncio** antes de invertir en pauta, para medir.
4. **IA-3 Lector del comprobante** y **F-4 Reserva**.
5. Abrir Avi a todos (piloto por horario) y medir una o dos semanas con **F-7** antes de lo demás.

# 0032 · Módulo Agente: un tercer modo de atención donde la IA conversa, con datos solo por herramientas

**Estado:** Aceptada · 31 oct 2026 (respuestas del dueño el mismo día) · Modifica la 0016 (no la reemplaza) · Diseño de F4·22 · Detalle en [AGENTE.md](../AGENTE.md)

## Contexto

La 0016 (confirmada por el dueño el 1 oct 2026) dejó el bot **híbrido**: la IA solo extrae filtros y la respuesta la arma siempre una
plantilla con datos de la base. Es seguro y barato, pero no conversa: no responde preguntas abiertas, no lleva al cliente paso a paso
hacia la compra ni usa lo que sabe del negocio.

El dueño pide un módulo **Agente** como el de otros CRM (cerebro, memoria, conocimiento, personalidad y prompt) que entienda, decida,
responda y lleve a la venta. El 30 oct se apagó el Agente IA de Kommo por costo, errores en pasos exactos y por enviar cuentas de banco
a clientes reales.

## Decisión (dueño, 31 oct 2026)

- El CRM tiene **tres modos** de atención, elegidos **por bot**: Menú guiado, Híbrido (0016, sigue siendo el de por defecto) y **Agente**.
- En modo Agente **la IA redacta la respuesta**. Es la excepción a la 0016, y va con reglas fijas:
  - Precios, stock, especificaciones y condiciones salen **solo de herramientas** del sistema (RAG-01), y una **verificación** bloquea
    cualquier precio que no haya salido de una herramienta en ese turno (RAG-02).
  - Los pasos exactos (ficha, catálogo, cotización, mover etapa, pasar a asesor) son **herramientas deterministas**.
  - **Datos de pago solo con el texto exacto aprobado por el dueño**, enviado por la herramienta `enviar_datos_pago`; la IA nunca escribe
    cuentas, titulares ni llaves (RAG-09).
  - **Nadie confirma un pago automáticamente:** con el comprobante (foto, PDF o "ya pagué") el sistema mueve a *Pago por confirmar*, apaga
    el agente y pasa el chat al asesor (RAG-20, RAG-21).
- **Uso recomendado: el tramo de compra** (idea del dueño, 31 oct 2026). Menú guiado hasta la ficha técnica → "quiero comprar <código>"
  (detectado por reglas, sin IA) → agente de compra (total, dudas, cuentas, datos de envío) → comprobante → asesor cierra la venta. La IA
  solo trabaja en las conversaciones que llegaron a comprar, y así el costo queda bajo.
- **Proveedor elegible** (DeepSeek, OpenAI, Gemini, Anthropic o el modelo local), con modelo de respaldo; llaves cifradas en Vault (como la 0029).
- **Costo visible y con tope** mensual que fija la empresa; al tope el agente ofrece asesor y el asesor cierra (RAG-17).
- **Acciones «Cuando → Hacer»** y flujos de **compra** y **cotización** sin IA, que se construyen primero (F4·22 a F4·26); el agente **Avi**
  (DeepSeek, personalidad amigable parametrizable) va encima (F4·27 a F4·29).
- **Canales:** Kommo sigue con el cliente final; el CRM propio atiende Distribuidores y el agente arranca ahí. Si el CRM propio se
  perfecciona, se cierra Kommo y se unifica.
- **Encendido por etapas:** simulador → números de prueba → todos; interruptor general para apagarlo.

## Alternativas descartadas

- **Reemplazar el híbrido por el agente en todo:** más costo y riesgo para todos los clientes; el dueño quiere los tres modos.
- **Agente sin herramientas, con el inventario pegado en el prompt:** se desactualiza, gasta tokens y deja a la IA "recordar" precios.
- **Usar otra vez el agente de Kommo:** ya se probó y se descartó (costo por créditos y fallas en pasos exactos).
- **Dejar que la IA escriba las cuentas o confirme pagos:** en Kommo el agente reenvió cuentas al leer "ya pagué" y cortó el texto; aquí las
  cuentas salen de un texto fijo por herramienta y la confirmación es del asesor.
- **Agente en toda la conversación:** gasta tokens en el menú y la ficha, que el sistema ya hace gratis.

## Consecuencias

- El receptor suma un motor nuevo (`agente.py`) al lado de `flujo.py`; el modo Híbrido no cambia.
- Lo que el cliente escribe viaja al proveedor elegido en los bots en modo Agente (datos personales: avisarlo en la política de privacidad).
- Migración nueva (la siguiente libre; la 0022 sigue reservada para F4·14), permiso `administrar_agente`, etapas *Esperando pago* y
  *Pago por confirmar* y etiquetas de compra (las mismas que se diseñaron para el Salesbot «Compra» de Kommo).
- Hay un costo mensual por uso del modelo que hoy no existe.

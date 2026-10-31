# 0032 · Módulo Agente: un tercer modo de atención donde la IA conversa, con datos solo por herramientas

**Estado:** Propuesta · 31 oct 2026 · Modifica la 0016 (no la reemplaza) · Diseño de F4·22 · Detalle en [AGENTE.md](../AGENTE.md)

## Contexto

La 0016 (confirmada por el dueño el 1 oct 2026) dejó el bot **híbrido**: la IA solo extrae filtros y la respuesta la arma siempre una
plantilla con datos de la base. Es seguro y barato, pero no conversa: no responde preguntas abiertas, no lleva al cliente paso a paso
hacia la compra ni usa lo que sabe del negocio.

El dueño pide un módulo **Agente** como el de otros CRM (cerebro, memoria, conocimiento, personalidad y prompt) que entienda, decida,
responda y lleve a la venta. El 30 oct se apagó el Agente IA de Kommo por costo, errores en pasos exactos y por enviar cuentas de banco
a clientes reales.

## Decisión (por confirmar con el dueño)

- El CRM tiene **tres modos** de atención, elegidos **por bot**: Menú guiado, Híbrido (0016, sigue siendo el de por defecto) y **Agente**.
- En modo Agente **la IA redacta la respuesta**. Es la excepción a la 0016, y va con reglas fijas:
  - Precios, stock, especificaciones y condiciones salen **solo de herramientas** del sistema (RAG-01), y una **verificación** bloquea
    cualquier precio que no haya salido de una herramienta en ese turno (RAG-02).
  - Los pasos exactos (ficha, catálogo, cotización, mover etapa, pasar a asesor) son **herramientas deterministas**.
  - **No envía datos de pago ni confirma pagos** (RAG-09): deja la oportunidad en *Lista para pagar* y pasa al asesor.
- **Proveedor elegible** (DeepSeek, OpenAI, Gemini, Anthropic o el modelo local), con modelo de respaldo; llaves cifradas en Vault (como la 0029).
- **Costo visible y con tope** mensual; al tope vuelve a Híbrido.
- **Encendido por etapas:** simulador → números de prueba → todos; interruptor general para apagarlo.

## Alternativas descartadas

- **Reemplazar el híbrido por el agente en todo:** más costo y riesgo para todos los clientes; el dueño quiere los tres modos.
- **Agente sin herramientas, con el inventario pegado en el prompt:** se desactualiza, gasta tokens y deja a la IA "recordar" precios.
- **Usar otra vez el agente de Kommo:** ya se probó y se descartó (costo por créditos y fallas en pasos exactos).
- **Dejar que el agente envíe cuentas y confirme pagos:** es justo lo que salió mal en Kommo; queda en manos de un asesor.

## Consecuencias

- El receptor suma un motor nuevo (`agente.py`) al lado de `flujo.py`; el modo Híbrido no cambia.
- Lo que el cliente escribe viaja al proveedor elegido en los bots en modo Agente (datos personales: avisarlo en la política de privacidad).
- Migración nueva (la siguiente libre; la 0022 sigue reservada para F4·14), permiso `administrar_agente` y etapa *Lista para pagar*.
- Hay un costo mensual por uso del modelo que hoy no existe.

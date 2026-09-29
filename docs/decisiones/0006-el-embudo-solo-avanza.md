# 0006 · El embudo solo avanza solo

**Estado:** Aceptada · 29 sep 2026

## Decisión

Las reglas automáticas (bot, eventos) **solo mueven una oportunidad a una etapa posterior**,
nunca a una anterior. Un asesor sí puede moverla a mano en cualquier dirección, y cada cambio
queda en `historial_etapas` con quién y cuándo. Pasar a **Perdido exige motivo**.

# 0021 · Los seguimientos recuerdan al asesor, el SLA cuenta horas hábiles y fuera de 24 h se usa plantilla

**Estado:** Aceptada · 30 sep 2026 · Cierra F2·6 · Diseño de F3·6

## Contexto

El brief pide seguimientos y medir la primera respuesta (SLA 10 min, alerta a los 15, solo en horario,
decisión 0012). Meta no deja escribir texto libre a un cliente que no habló en 24 h: hace falta una
plantilla aprobada, y la cuenta solo tiene las de ejemplo de Meta, en inglés.

## Decisión (dueño, 30 sep 2026)

- **Un seguimiento solo le recuerda al asesor**: no envía nada automático al cliente.
- **El SLA cuenta minutos hábiles** según `horario_atencion` y `festivos`, y lo calcula la base.
- **Alertas con sonido y notificación del navegador** (con la app abierta) al entrar a la cola, a los 10 y
  a los 15 min, más el número junto a *Bandeja* en el panel.
- **Plantillas en español creadas desde la app**: tres de Utilidad propuestas por el CRM, que se envían a
  aprobación de Meta solo después de que el dueño apruebe sus textos. La app también usa las que se creen
  en WhatsApp Manager.

Detalle en [SEGUIMIENTOS-Y-SLA.md](../SEGUIMIENTOS-Y-SLA.md).

## Consecuencias

- Sin la app abierta no hay aviso: las alertas fuera de la app (WhatsApp o correo al asesor) quedan para
  después si hacen falta.
- La tabla `horario_atencion` nace aquí; su editor llega en F3·7.
- Los festivos hay que sembrarlos cada año (por ahora 2026 y 2027).

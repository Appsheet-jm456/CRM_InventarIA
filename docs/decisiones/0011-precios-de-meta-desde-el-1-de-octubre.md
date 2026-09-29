# 0011 · Diseñar el bot para los precios de Meta desde el 1 de octubre de 2026

**Estado:** Aceptada · 29 sep 2026 · **Fuente oficial por confirmar** (tarea F1·6)

## Contexto

Según varios proveedores de WhatsApp (Wati, YCloud, Landbot y EngageLab; anuncio de septiembre
de 2026), desde el **1 de octubre de 2026**:

| Qué | Antes | Desde el 1 oct 2026 |
|---|---|---|
| Mensajes de **servicio** (responder dentro de las 24 h) | Gratis | **1.000 gratis al mes por número**; después se cobra **cada mensaje entregado** |
| Plantillas de **utilidad** dentro de la ventana de 24 h | Gratis (desde jul 2025) | **Se cobran** por mensaje |
| Conversaciones que llegan por anuncios Click-to-WhatsApp | Ventana gratis | Ventana gratis (72 h según unas fuentes, 7 días según otras) |
| Medio de pago | Opcional en la práctica | **Obligatorio en Billing Hub**: sin él, Meta deja de entregar mensajes de servicio al llegar a los 1.000 |

La documentación de Meta consultada el 29 sep 2026 no lo muestra todavía. Se verifica en el
WhatsApp Manager y en el Billing Hub antes de diseñar sobre cifras.

## Por qué importa aquí

La v0 manda **varios mensajes por respuesta**: una ficha envía cada foto, el video y luego el
texto, cada uno por separado. Con una ficha de 4 fotos y un video son **6 mensajes cobrables**.
A ese ritmo, unos 170 clientes que piden una ficha agotan los 1.000 gratis del mes.

## Decisión

1. **Menos mensajes por respuesta.** La ficha va como **una sola imagen con el texto en el
   pie**, más un botón o enlace "Ver más fotos y video" (página pública de la ficha o catálogo),
   en lugar de una foto por mensaje.
2. **Usar mensajes interactivos** (botones de respuesta y listas) en lugar de menús de texto
   numerados: un menú es un mensaje, y el cliente toca en vez de escribir `1`.
3. **Medir el consumo.** Cada mensaje saliente guarda su categoría (servicio, utilidad o
   marketing) y si fue cobrable. El panel muestra el contador del mes contra los 1.000 y avisa
   al 80 %.
4. **Seguimientos con criterio.** Recontactar fuera de la ventana usa plantillas pagas: se
   programan con límite por contacto y el asesor los aprueba.
5. **Medio de pago en el Billing Hub** antes de pasar el número real a Meta (corte, Fase 5).

## Consecuencias

- El motor del bot (F2·4 y F3·4) se diseña con respuestas de un mensaje y botones, no con una
  copia de los menús de texto de la v0.
- La v0 con Evolution no paga por mensaje, pero arriesga el número. El costo de Meta entra en
  el presupuesto del negocio desde el corte.

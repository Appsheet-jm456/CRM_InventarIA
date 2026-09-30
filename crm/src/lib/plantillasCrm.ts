// Plantillas propuestas por el CRM (docs/SEGUIMIENTOS-Y-SLA.md). Se envían a aprobación desde Canal
// WhatsApp solo después de que el dueño apruebe los textos.
export const PLANTILLAS_CRM = [
  {
    nombre: 'crm_retomar_conversacion',
    categoria: 'UTILITY',
    cuerpo: 'Hola {{1}}, te escribimos de Ventas Virtuales Colombia. Quedó pendiente tu consulta sobre equipos. Responde este mensaje y te atendemos.',
    ejemplos: ['Juan'],
  },
  {
    nombre: 'crm_seguimiento_cotizacion',
    categoria: 'UTILITY',
    cuerpo: 'Hola {{1}}, te escribimos de Ventas Virtuales Colombia sobre la cotización del equipo {{2}}. Si tienes preguntas o quieres continuar con la compra, responde este mensaje.',
    ejemplos: ['Juan', 'Dell Latitude 5420'],
  },
  {
    nombre: 'crm_equipo_apartado',
    categoria: 'UTILITY',
    cuerpo: 'Hola {{1}}, tu equipo {{2}} sigue apartado hasta el {{3}}. Responde este mensaje para coordinar el pago y la entrega.',
    ejemplos: ['Juan', 'Dell Latitude 5420', '15 de octubre'],
  },
] as const

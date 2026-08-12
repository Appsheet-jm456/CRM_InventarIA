// Motor del bot de WhatsApp por MENÚ FIJO (no IA libre). Lo llama n8n en vez
// de /api/chat. Lee el paso guardado del cliente en CRM_Leads, calcula la
// respuesta con lib/whatsappFlow.js, guarda el siguiente paso y, si el
// cliente pidió un asesor, pausa el bot (mismo campo "Pausar bot" del CRM).
import { processFlowMessage } from "../../../lib/whatsappFlow";
import { getLeadByPhone, setLeadFlowState, updateLead } from "../../../lib/crm";
import { sendWhatsAppMedia } from "../../../lib/evolution";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const accessPassword = process.env.ACCESS_PASSWORD || "cambia-esta-clave";
  const provided = request.headers.get("x-access-password") || "";
  if (provided !== accessPassword) {
    return Response.json({ error: "no-autorizado" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición inválida." }, { status: 400 });
  }

  const numero = (body?.numero ?? "").toString().trim();
  const texto = (body?.texto ?? "").toString();
  if (!numero) {
    return Response.json({ error: "Falta el número." }, { status: 400 });
  }

  try {
    const lead = await getLeadByPhone(numero);
    const pasoActual = lead?.pasoMenu || "B-00";

    const { reply, nextStep, handoff, media = [], moverEtapa, guardar } = await processFlowMessage({ texto, pasoActual, lead: lead || {} });

    // Persiste datos capturados en el flujo (nombre, producto/cantidad de cotización, etc.).
    if (guardar && lead?.id) {
      try { await updateLead(lead.id, guardar); } catch (e) { console.error("guardar lead falló:", String(e?.message || e)); }
    }

    // Envía fotos/video ANTES del texto (Evolution). Un medio que falle no
    // debe romper el flujo: el texto con la ficha se envía igual.
    for (const m of media) {
      try {
        await sendWhatsAppMedia(numero, m.tipo, m.url, m.caption || "", m.fileName || "");
      } catch (e) {
        console.error("sendMedia falló:", m.url, String(e?.message || e));
      }
    }

    await setLeadFlowState(numero, {
      pasoMenu: nextStep,
      ...(handoff ? { pausarBot: true } : {}),
      ...(moverEtapa ? { etapa: moverEtapa } : {}),
    });

    return Response.json({ reply, handoff: !!handoff, mediaCount: media.length });
  } catch (err) {
    return Response.json(
      { reply: "⚠️ Tuvimos un problema técnico. Un asesor te va a contactar pronto.", error: String(err?.message || err) },
      { status: 200 }
    );
  }
}

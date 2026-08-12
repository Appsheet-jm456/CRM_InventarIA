// Envía una respuesta HUMANA manual al cliente por WhatsApp y pausa el bot para
// ese número (handoff bot→humano). Protegido por ACTION_PASSWORD.
import { sendWhatsAppMessage } from "../../../../lib/evolution";
import { markHumanReply } from "../../../../lib/crm";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const actionPassword = process.env.ACTION_PASSWORD || process.env.ACCESS_PASSWORD || "cambia-esta-clave";
  const provided = request.headers.get("x-action-password") || "";
  if (provided !== actionPassword) {
    return Response.json({ error: "Clave de acciones incorrecta." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición inválida." }, { status: 400 });
  }

  const numero = body?.numero;
  const texto = body?.texto;
  if (!numero || !texto?.trim()) {
    return Response.json({ error: "Falta número o texto." }, { status: 400 });
  }

  try {
    // 1) Enviar por WhatsApp. Si falla, no marcamos nada.
    await sendWhatsAppMessage(numero, texto);
    // 2) Auto-pausa el bot y registra el mensaje saliente en el CRM.
    let lead = null;
    try {
      lead = await markHumanReply({ numero, texto });
    } catch {
      // El mensaje ya se envió; que falle el registro no debe romper el envío.
    }
    return Response.json({ ok: true, lead });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 200 });
  }
}

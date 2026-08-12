// Devuelve la conversación real de un cliente (desde Evolution API) para
// mostrarla dentro del CRM. Protegido por ACCESS_PASSWORD.
import { getChatMessages } from "../../../../../lib/evolution";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const accessPassword = process.env.ACCESS_PASSWORD || "cambia-esta-clave";
  const provided = request.headers.get("x-access-password") || "";
  if (provided !== accessPassword) {
    return Response.json({ error: "no-autorizado" }, { status: 401 });
  }
  try {
    const messages = await getChatMessages(params.numero);
    return Response.json({ messages });
  } catch (err) {
    return Response.json({ error: String(err?.message || err), messages: [] }, { status: 200 });
  }
}

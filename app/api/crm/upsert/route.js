// Llamado por n8n con cada mensaje entrante de WhatsApp: crea el lead si es
// un número nuevo (entra en la primera etapa del embudo) o actualiza su
// último mensaje y fecha de contacto si ya existía. No mueve la etapa.
import { upsertLead } from "../../../../lib/crm";

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

  try {
    const lead = await upsertLead({
      telefono: body?.numero,
      texto: body?.texto,
      nombre: body?.nombre,
    });
    return Response.json({ ok: true, lead });
  } catch (err) {
    // No debe romper el flujo de respuesta del bot si el CRM falla.
    return Response.json({ error: String(err?.message || err) }, { status: 200 });
  }
}

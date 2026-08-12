// Edita un lead: mover de etapa (drag&drop), notas, nombre, valor estimado.
// Protegido por ACTION_PASSWORD (misma clave de escritura que usa Acciones).
import { updateLead } from "../../../../../lib/crm";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
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

  try {
    const lead = await updateLead(params.id, body || {});
    return Response.json({ ok: true, lead });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 200 });
  }
}

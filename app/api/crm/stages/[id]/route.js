// Edita o borra una etapa del embudo. Protegido por ACTION_PASSWORD.
// Al borrar, si se indica reassignTo, primero mueve los leads afectados.
import { updateStage, deleteStage, moveLeadsStage, getStages } from "../../../../../lib/crm";

export const dynamic = "force-dynamic";

function checkAuth(request) {
  const actionPassword = process.env.ACTION_PASSWORD || process.env.ACCESS_PASSWORD || "cambia-esta-clave";
  const provided = request.headers.get("x-action-password") || "";
  return provided === actionPassword;
}

export async function PATCH(request, { params }) {
  if (!checkAuth(request)) {
    return Response.json({ error: "Clave de acciones incorrecta." }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición inválida." }, { status: 400 });
  }
  try {
    const stages = await updateStage(params.id, body || {});
    return Response.json({ ok: true, stages });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 200 });
  }
}

export async function DELETE(request, { params }) {
  if (!checkAuth(request)) {
    return Response.json({ error: "Clave de acciones incorrecta." }, { status: 401 });
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    // sin body es válido si la etapa no tiene leads
  }
  try {
    const stages = await getStages();
    const target = stages.find((s) => String(s.id) === String(params.id));
    if (!target) return Response.json({ error: "La etapa ya no existe." }, { status: 200 });

    if (body?.reassignTo) {
      await moveLeadsStage(target.nombre, body.reassignTo);
    }
    const remaining = await deleteStage(params.id);
    return Response.json({ ok: true, stages: remaining });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 200 });
  }
}

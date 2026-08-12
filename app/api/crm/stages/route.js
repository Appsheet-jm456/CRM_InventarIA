// Lista las etapas del embudo (lectura: ACCESS_PASSWORD) y permite crear
// una etapa nueva (escritura: ACTION_PASSWORD).
import { getStages, createStage } from "../../../../lib/crm";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const accessPassword = process.env.ACCESS_PASSWORD || "cambia-esta-clave";
  const provided = request.headers.get("x-access-password") || "";
  if (provided !== accessPassword) {
    return Response.json({ error: "no-autorizado" }, { status: 401 });
  }
  try {
    const stages = await getStages();
    return Response.json({ stages });
  } catch (err) {
    return Response.json({ error: String(err?.message || err), stages: [] }, { status: 200 });
  }
}

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

  try {
    const stages = await createStage(body || {});
    return Response.json({ ok: true, stages });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 200 });
  }
}

// Lista todos los leads del CRM. Protegido por ACCESS_PASSWORD (misma clave
// del personal que ya usa el Dashboard/Chat).
import { getLeads } from "../../../../lib/crm";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const accessPassword = process.env.ACCESS_PASSWORD || "cambia-esta-clave";
  const provided = request.headers.get("x-access-password") || "";
  if (provided !== accessPassword) {
    return Response.json({ error: "no-autorizado" }, { status: 401 });
  }
  try {
    const leads = await getLeads();
    return Response.json({ leads });
  } catch (err) {
    return Response.json({ error: String(err?.message || err), leads: [] }, { status: 200 });
  }
}

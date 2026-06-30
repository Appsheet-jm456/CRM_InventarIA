// Devuelve TODO el inventario en JSON, protegido por ACCESS_PASSWORD.
// Lee directo de Baserow vía getInventory() — sin IA, cero tokens.
// El Dashboard lo consume UNA vez y filtra/pagina en el cliente.
import { getInventory } from "../../../lib/inventory";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const accessPassword = process.env.ACCESS_PASSWORD || "cambia-esta-clave";
  const provided = request.headers.get("x-access-password") || "";
  if (provided !== accessPassword) {
    return Response.json({ error: "no-autorizado" }, { status: 401 });
  }
  try {
    const { rows, demo } = await getInventory();
    return Response.json({ rows, demo, total: rows.length });
  } catch (err) {
    return Response.json(
      { error: "No pude leer el inventario: " + String(err?.message || err), rows: [] },
      { status: 200 }
    );
  }
}

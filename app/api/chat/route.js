import { getInventory, selectForContext, summarize } from "../../../lib/inventory";
import { askGemini } from "../../../lib/gemini";

export const dynamic = "force-dynamic";

// Convierte un link de Google Drive al formato que sí se muestra como imagen.
function driveDirect(url) {
  const m =
    url.match(/drive\.google\.com\/file\/d\/([^/]+)/) ||
    url.match(/drive\.google\.com\/open\?id=([^&]+)/) ||
    url.match(/[?&]id=([^&]+)/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}` : url;
}

// Saca el link de la foto de una fila (sirve para campo de texto o adjunto de Baserow).
function getImageUrl(row) {
  let f = row["Foto"] ?? row["foto"] ?? row["FotoURL"] ?? row["Foto URL"] ?? "";
  if (Array.isArray(f)) f = f[0]?.url || f[0]?.value || "";
  f = (f || "").toString().trim();
  if (!f) return "";
  return f.includes("drive.google.com") ? driveDirect(f) : f;
}

// Si el usuario menciona un código, devuelve la(s) foto(s) de ese producto.
function imagesForQuery(rows, query, max = 3) {
  const q = (query || "").toLowerCase();
  const out = [];
  for (const r of rows) {
    const code = (r["Código"] || r["Codigo"] || "").toString().toLowerCase().trim();
    if (code && q.includes(code)) {
      const url = getImageUrl(r);
      if (url) out.push({ url, nombre: r["Modelo"] || r["Código"] || "Producto" });
    }
    if (out.length >= max) break;
  }
  return out;
}

export async function POST(request) {
  try {
    const accessPassword = process.env.ACCESS_PASSWORD || "cambia-esta-clave";
    const provided = request.headers.get("x-access-password") || "";
    if (provided !== accessPassword) {
      return Response.json({ error: "no-autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) {
      return Response.json({ error: "Sin mensajes" }, { status: 400 });
    }
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const lastText = lastUser?.content || "";

    const { rows, demo } = await getInventory();
    const stats = summarize(rows);
    const context = selectForContext(rows, lastText, 250);

    const reply = await askGemini(messages, context, stats);

    // ¿Pidió foto/imagen? Entonces buscamos la imagen del producto mencionado.
    const wantsPhoto = /\b(foto|fotos|imagen|imagenes|imágenes|image|photo|pic|pics)\b/i.test(lastText);
    const images = wantsPhoto ? imagesForQuery(rows, lastText) : [];

    return Response.json({ reply, images, demo });
  } catch (err) {
    return Response.json({ reply: "⚠️ Error del servidor: " + String(err?.message || err) }, { status: 200 });
  }
}

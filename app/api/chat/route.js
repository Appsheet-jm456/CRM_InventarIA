import { getInventory, selectForContext, summarize } from "../../../lib/inventory";
import { askGemini } from "../../../lib/gemini";

export const dynamic = "force-dynamic";

// ---------- Imágenes ----------
function driveDirect(url) {
  const m =
    url.match(/drive\.google\.com\/file\/d\/([^/]+)/) ||
    url.match(/drive\.google\.com\/open\?id=([^&]+)/) ||
    url.match(/[?&]id=([^&]+)/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}` : url;
}
function getImageUrl(row) {
  let f = row["Foto"] ?? row["foto"] ?? row["FotoURL"] ?? row["Foto URL"] ?? "";
  if (Array.isArray(f)) f = f[0]?.url || f[0]?.value || "";
  f = (f || "").toString().trim();
  if (!f) return "";
  return f.includes("drive.google.com") ? driveDirect(f) : f;
}
function imagesFromRows(matched, max = 3) {
  const out = [];
  for (const r of matched) {
    const url = getImageUrl(r);
    if (url) out.push({ url, nombre: r["Modelo"] || r["Código"] || "Producto" });
    if (out.length >= max) break;
  }
  return out;
}

// ---------- Camino rápido: búsqueda por código (sin IA) ----------
function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Devuelve las filas cuyo código aparece en el mensaje.
function findByCode(rows, message) {
  const m = (message || "").toLowerCase();
  const matched = [];
  for (const r of rows) {
    const code = (r["Código"] || r["Codigo"] || "").toString().toLowerCase().trim();
    if (!code) continue;
    const re = new RegExp(`(^|[^0-9a-z])${escRegex(code)}([^0-9a-z]|$)`, "i");
    if (re.test(m)) matched.push(r);
    if (matched.length >= 5) break;
  }
  return matched;
}

function fmtPrecio(p) {
  const s = (p ?? "").toString().trim();
  if (!s) return "precio por confirmar";
  const n = Number(s);
  return isNaN(n) ? s : `$${n.toLocaleString("es-CO")}`;
}

// Construye la respuesta de un producto, con plantilla fija (sin IA).
function lineFor(r) {
  const f = (k) => (r[k] ?? "").toString().trim();
  const nombre = [f("Marca"), f("Modelo")].filter(Boolean).join(" ") || f("Descripción").slice(0, 50) || "Producto";
  const specs = [f("Procesador"), f("Generación") && `gen ${f("Generación")}`, f("RAM"), f("Almacenamiento")]
    .filter(Boolean).join(", ");
  const specTxt = specs ? ` (${specs})` : "";
  const stock = parseInt(f("Stock") || "0", 10) || 0;
  const precio = fmtPrecio(f("Precio"));
  const cod = f("Código");
  if (stock > 0) {
    const u = stock === 1 ? "unidad" : "unidades";
    return `Disponible (${stock} ${u}). ${nombre}${specTxt} — código ${cod} — ${precio}.`;
  }
  return `AGOTADO. ${nombre}${specTxt} — código ${cod} — ${precio}.`;
}

// Patrón de "código" para detectar códigos escritos que no existen (typos).
const CODE_PATTERN = /\b(?:[A-Za-z]{2,4}-\d{2,5}|\d{3}-\d{3}-\d{3,4}(?:-\d+)?)\b/;

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

    // ====== CAMINO RÁPIDO (sin IA, gratis e instantáneo) ======
    const matched = findByCode(rows, lastText);
    if (matched.length > 0) {
      const reply = matched.map(lineFor).join("\n");
      const images = imagesFromRows(matched);
      return Response.json({ reply, images, demo, fast: true });
    }
    // Código escrito pero inexistente -> también respondemos sin IA.
    const codeLike = lastText.match(CODE_PATTERN);
    if (codeLike) {
      return Response.json({
        reply: `El código ${codeLike[0]} no está en el inventario. Verifica el código o consulta por marca, modelo o generación.`,
        images: [],
        demo,
        fast: true,
      });
    }

    // ====== CAMINO IA (solo para preguntas conversacionales) ======
    const stats = summarize(rows);
    const context = selectForContext(rows, lastText, 250);
    const reply = await askGemini(messages, context, stats);
    return Response.json({ reply, images: [], demo });
  } catch (err) {
    return Response.json({ reply: "⚠️ Error del servidor: " + String(err?.message || err) }, { status: 200 });
  }
}

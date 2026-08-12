// Sirve los archivos que el asesor sube desde el chat del CRM (guardados en
// ./uploads, fuera de public/). Se usa para que Evolution descargue el archivo
// y lo reenvíe al cliente por WhatsApp.
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const DIR = path.join(process.cwd(), "uploads");
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" };

export async function GET(_request, { params }) {
  const name = path.basename(params.name || ""); // basename evita path traversal
  if (!name) return new Response("Not found", { status: 404 });
  try {
    const buf = await readFile(path.join(DIR, name));
    const ext = name.split(".").pop().toLowerCase();
    return new Response(buf, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

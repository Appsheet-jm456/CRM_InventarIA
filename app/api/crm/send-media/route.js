// Recibe un archivo (jpg/png/pdf) subido por el asesor desde el chat del CRM,
// lo guarda en public/uploads/ y lo envía al cliente por WhatsApp. Igual que
// una respuesta manual: pausa el bot y registra el envío en el CRM.
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { sendWhatsAppMedia } from "../../../../lib/evolution";
import { markHumanReply } from "../../../../lib/crm";

export const dynamic = "force-dynamic";

const TIPOS = {
  "image/jpeg": { mediatype: "image", ext: "jpg" },
  "image/png":  { mediatype: "image", ext: "png" },
  "application/pdf": { mediatype: "document", ext: "pdf" },
};
const MAX_BYTES = 16 * 1024 * 1024; // 16 MB (límite práctico de WhatsApp)
// Fuera de public/: Next.js no sirve archivos nuevos de public/ sin reiniciar,
// así que se sirven vía el route handler /api/uploads/[name].
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const APP_URL = process.env.APP_PUBLIC_URL || "http://192.168.20.50:3000";

export async function POST(request) {
  const actionPassword = process.env.ACTION_PASSWORD || process.env.ACCESS_PASSWORD || "cambia-esta-clave";
  if ((request.headers.get("x-action-password") || "") !== actionPassword) {
    return Response.json({ error: "Clave de acciones incorrecta." }, { status: 401 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Petición inválida." }, { status: 400 });
  }

  const numero = (form.get("numero") || "").toString().trim();
  const file = form.get("file");
  if (!numero || !file || typeof file === "string") {
    return Response.json({ error: "Falta número o archivo." }, { status: 400 });
  }

  const tipo = TIPOS[file.type];
  if (!tipo) {
    return Response.json({ error: "Tipo no permitido. Usa JPG, PNG o PDF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "El archivo supera 16 MB." }, { status: 400 });
  }

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const nombreOriginal = (file.name || `archivo.${tipo.ext}`).replace(/[^\w.\-]/g, "_");
    const nombreDisco = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${tipo.ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, nombreDisco), buffer);

    const url = `${APP_URL}/api/uploads/${nombreDisco}`;
    await sendWhatsAppMedia(numero, tipo.mediatype, url, "", nombreOriginal, file.type);

    // Registra el envío en el CRM (pausa el bot, deja rastro en el chat/último msg).
    const etiqueta = tipo.mediatype === "image" ? "📷 Imagen enviada" : `📄 ${nombreOriginal}`;
    try { await markHumanReply({ numero, texto: etiqueta }); } catch {}

    return Response.json({ ok: true, url });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 200 });
  }
}

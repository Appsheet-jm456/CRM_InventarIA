// Lee la conversación real de un cliente desde Evolution API (que guarda todos
// los mensajes en su Postgres). Se usa para mostrar el chat dentro del CRM.
//
// Detalle importante del formato de WhatsApp/Baileys:
//   - Mensajes del BOT (fromMe): key.remoteJid = "<numero>@s.whatsapp.net"
//   - Mensajes del CLIENTE:      key.remoteJid = "<lid>@lid" y el número real
//     va en key.remoteJidAlt = "<numero>@s.whatsapp.net"
// Por eso se consulta por ambos campos y se combinan.

function evoConfig() {
  const base = process.env.EVOLUTION_API_URL || "http://localhost:8088";
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || "ventas";
  const ok = !!(base && key && instance);
  return { base, key, instance, ok };
}

async function findMessages(where) {
  const { base, key, instance } = evoConfig();
  const res = await fetch(`${base}/chat/findMessages/${instance}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ where }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Evolution ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.messages?.records || [];
}

// Extrae el texto de los tipos de mensaje más comunes.
function extractText(msg) {
  if (!msg) return "";
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    ""
  );
}

// Envía un mensaje de texto al cliente por WhatsApp (respuesta humana manual).
export async function sendWhatsAppMessage(numero, texto) {
  const { base, key, instance, ok } = evoConfig();
  if (!ok) throw new Error("Evolution API no está configurado.");
  const tel = (numero ?? "").toString().replace(/\D/g, "");
  if (!tel) throw new Error("Falta el número del cliente.");
  const mensaje = (texto ?? "").toString().trim();
  if (!mensaje) throw new Error("El mensaje está vacío.");

  const res = await fetch(`${base}/message/sendText/${instance}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ number: tel, text: mensaje }),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Evolution ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

// Envía un archivo (imagen/video) al cliente por WhatsApp vía Evolution sendMedia.
// mediatype: "image" | "video" | "document". url debe ser una URL directa.
export async function sendWhatsAppMedia(numero, mediatype, url, caption = "", fileName = "", mimetype = "") {
  const { base, key, instance, ok } = evoConfig();
  if (!ok) throw new Error("Evolution API no está configurado.");
  const tel = (numero ?? "").toString().replace(/\D/g, "");
  if (!tel || !url) return null;

  const body = { number: tel, mediatype, media: url };
  if (caption) body.caption = caption;
  if (mimetype) body.mimetype = mimetype;
  else if (mediatype === "image") body.mimetype = "image/jpeg";
  else if (mediatype === "video") body.mimetype = "video/mp4";
  else if (mediatype === "document") body.mimetype = "application/pdf";
  if (mediatype === "document") body.fileName = fileName || "documento.pdf";

  const res = await fetch(`${base}/message/sendMedia/${instance}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Evolution sendMedia ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

// Devuelve la conversación completa de un número, ordenada cronológicamente.
// Cada item: { fromMe, texto, timestamp (ms), pushName, tipo }.
export async function getChatMessages(numero) {
  const { ok } = evoConfig();
  if (!ok) throw new Error("Evolution API no está configurado.");
  const tel = (numero ?? "").toString().replace(/\D/g, "");
  if (!tel) return [];

  const jid = `${tel}@s.whatsapp.net`;
  const [porJid, porJidAlt] = await Promise.all([
    findMessages({ key: { remoteJid: jid } }),      // mensajes del bot
    findMessages({ key: { remoteJidAlt: jid } }),   // mensajes del cliente
  ]);

  const vistos = new Set();
  const items = [];
  for (const r of [...porJid, ...porJidAlt]) {
    const id = r.key?.id;
    if (id && vistos.has(id)) continue;
    if (id) vistos.add(id);
    const texto = extractText(r.message);
    if (!texto) continue; // ignora stickers/audios/etc sin texto
    items.push({
      fromMe: !!r.key?.fromMe,
      texto,
      timestamp: (Number(r.messageTimestamp) || 0) * 1000,
      pushName: r.pushName || "",
      tipo: r.messageType || "",
    });
  }
  items.sort((a, b) => a.timestamp - b.timestamp);
  return items;
}

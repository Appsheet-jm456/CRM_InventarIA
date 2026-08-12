// Normaliza URLs de fotos/videos para que WhatsApp (Evolution) pueda enviarlas.
//
// Los campos Foto/Video del inventario suelen tener links de Google Drive con
// formato "/file/d/ID/view", que NO sirven como media directa. Aquí:
//   - Extraemos el file ID de cualquier variante de URL de Drive.
//   - Imágenes → formato thumbnail (el más fiable para hotlink directo).
//   - Videos   → formato de descarga directa (uc?export=download).
//   - Si la URL NO es de Drive, se devuelve tal cual (ya sirve: R2, Cloudinary,
//     el propio servidor, etc.) → así migrar de hosting no requiere tocar código.

// Saca el ID de archivo de las variantes comunes de URL de Google Drive.
function driveFileId(url) {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,   // /file/d/ID/view
    /[?&]id=([a-zA-Z0-9_-]+)/,       // ?id=ID / uc?export=...&id=ID
    /\/d\/([a-zA-Z0-9_-]+)/,         // /d/ID
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

function isDrive(url) {
  return /drive\.google\.com|docs\.google\.com/.test(url);
}

// Convierte UNA url al formato que WhatsApp puede descargar.
function toDirectUrl(rawUrl, kind /* "image" | "video" */) {
  const url = (rawUrl || "").trim().replace(/,+$/, ""); // quita comas colgantes
  if (!url) return null;
  if (!isDrive(url)) return url; // ya es una URL directa (otro hosting)

  const id = driveFileId(url);
  if (!id) return url;
  if (kind === "image") {
    // thumbnail de alta resolución: fiable para hotlinking de imágenes.
    return `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;
  }
  // video u otros: descarga directa (Drive puede limitar archivos grandes).
  return `https://drive.google.com/uc?export=download&id=${id}`;
}

// Un campo puede traer VARIAS URLs separadas por coma. Devuelve array limpio.
export function parseMediaField(fieldValue, kind) {
  if (!fieldValue) return [];
  return String(fieldValue)
    .split(",")
    .map((u) => toDirectUrl(u, kind))
    .filter(Boolean);
}

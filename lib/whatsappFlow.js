// Motor del flujo de menús numerados para el bot de WhatsApp ("Atlas asiste
// ventas"). Menú 100% fijo (sin IA libre): cada nodo del árbol tiene un texto
// fijo y opciones numeradas. El único "escape" es pedir un asesor humano, que
// dispara el handoff (reutiliza el mismo mecanismo de "Pausar bot" del CRM).
//
// Árbol v1 (solo portátiles):
//   B-00 (bienvenida) -[1]-> B-01 (portátiles) -[1]-> B-01B (usados: catálogo)
//   En cualquier nodo: "asesor/humano/agente" -> handoff a un asesor humano.

import fs from "fs";
import { getInventory } from "./inventory";
import { parseMediaField } from "./media";

// Catálogo PDF: servido por la app (public/) para que Evolution lo envíe.
const CATALOGO_PDF_PATH = "/home/atlasjm/chat_bot-inventario/public/catalogo-portatiles-usados.pdf";
const CATALOGO_PDF_URL = (process.env.APP_PUBLIC_URL || "http://192.168.20.50:3000") + "/catalogo-portatiles-usados.pdf";

function fechaCatalogo() {
  try {
    return fs.statSync(CATALOGO_PDF_PATH).mtime.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return "la fecha de hoy"; }
}

// Mensaje corto + PDF adjunto (reemplaza el catálogo de texto largo).
function buildCatalogoPDF() {
  const text = `📎 Te envío nuestro *catálogo de Portátiles Usados* de *Ventas Virtuales Colombia*, actualizado al *${fechaCatalogo()}*.

👉 Si un equipo te interesa, envíame su *código* (ej: 100-102-1013-6) y te mando la *ficha completa con fotos y video*. 📸🎥

0️⃣ Volver al menú   ·   9️⃣ Hablar con un asesor`;
  return {
    text,
    media: [{ tipo: "document", url: CATALOGO_PDF_URL, fileName: "Catalogo-Portatiles-Usados-VVC.pdf" }],
  };
}

function normalize(s) {
  return (s ?? "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

const HANDOFF_WORDS = ["asesor", "humano", "agente", "representante", "persona real", "hablar con alguien"];
const HANDOFF_OPTION = "9";

const MSG_BIENVENIDA =
`¡Hola! 👋 Bienvenido a *Ventas Virtuales Colombia*, distribuidores al por mayor y detal de equipos de cómputo.
Soy *Atlas asiste ventas*, tu asistente virtual. 😊 ¿En qué te puedo ayudar hoy?

1️⃣ PORTÁTILES

9️⃣ Hablar con un asesor`;

const MSG_MENU_PORTATILES =
`📦 *PORTÁTILES*

1️⃣ Portátiles Usados

0️⃣ Volver al menú principal
9️⃣ Hablar con un asesor`;

const MSG_HANDOFF =
`👍 Listo, un asesor humano te va a atender en breve. Puedes escribir tu consulta mientras tanto y quedará registrada.`;

function fmtPrecio(v) {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return isNaN(n) || n === 0 ? "precio a confirmar" : `$${n.toLocaleString("es-CO")}`;
}

function stockNum(v) {
  return parseInt(v || "0", 10) || 0;
}

// Filtra portátiles usados con stock disponible.
// OJO: el "Estado" es el GRADO de calidad (Grado A/B/C, "Usado", etc.), NO un
// filtro de inclusión. Filtramos por la CATEGORÍA "Portátil usado" + stock > 0.
function filtrarPortatilesUsados(rows) {
  return rows.filter((r) => {
    const cat = normalize(r["Categoría"] || "");
    return cat.includes("portatil") && cat.includes("usado") && stockNum(r["Stock"]) > 0;
  });
}

const MENU_POST_PRODUCTO =
`¿Qué deseas hacer? 👇

1️⃣ Consultar otro producto
2️⃣ Cotización personalizada 📝
3️⃣ Quiero comprar este equipo 🛒
4️⃣ Hablar con un asesor 👨‍💼
5️⃣ Volver al menú principal`;

// Busca un código de producto DENTRO del texto del cliente (que suele escribir
// frases, no solo el código). Compara "compactando" código y texto (sin espacios
// ni guiones) y devuelve la coincidencia más larga para evitar falsos positivos.
function findProductoEnTexto(texto, disponibles) {
  const compact = (s) => normalize(s).replace(/[\s\-.]/g, "");
  const t = compact(texto);
  if (t.length < 3) return null;
  let best = null, bestLen = 0;
  for (const r of disponibles) {
    const c = compact(r["Código"]);
    if (c && c.length >= 3 && t.includes(c) && c.length > bestLen) {
      best = r; bestLen = c.length;
    }
  }
  return best;
}

// Devuelve la ficha del producto: { text, media:[{tipo,url}] } o null si no existe.
async function buildDetalleProducto(codigo) {
  const { rows } = await getInventory();
  const disponibles = filtrarPortatilesUsados(rows);
  const r = findProductoEnTexto(codigo, disponibles);
  if (!r) return null;

  const specs = [r["Procesador"], r["Generación"] && `gen ${r["Generación"]}`, r["RAM"], r["Almacenamiento"]]
    .filter(Boolean).join(" · ");
  const urgencia = stockNum(r["Stock"]) === 1 ? "\n⚡ *¡Última unidad disponible!*" : "";
  const text = `💻 *${[r["Marca"], r["Modelo"]].filter(Boolean).join(" ")}*
🔖 Código: ${r["Código"]}
⚙️ ${specs}
📦 Estado: ${r["Estado"] || "Usado"}
💵 *Precio: ${fmtPrecio(r["Precio"])}*
✅ Disponible: ${stockNum(r["Stock"])} unidad(es)${urgencia}
${r["Descripción"] ? `\n${r["Descripción"]}\n` : ""}
──────────────
${MENU_POST_PRODUCTO}`;

  const fotos = parseMediaField(r["Foto"], "image").map((url) => ({ tipo: "image", url }));
  const videos = parseMediaField(r["Video"], "video").map((url) => ({ tipo: "video", url }));

  return { text, media: [...fotos, ...videos] };
}

// Busca un producto disponible a partir del texto del cliente. Devuelve datos
// limpios {codigo, nombre, precioNum} o null.
async function lookupProducto(texto) {
  const { rows } = await getInventory();
  const r = findProductoEnTexto(texto, filtrarPortatilesUsados(rows));
  if (!r) return null;
  return {
    codigo: (r["Código"] || "").trim(),
    nombre: [r["Marca"], r["Modelo"]].filter(Boolean).join(" ") || (r["Código"] || ""),
    precioNum: (() => { const n = Number(String(r["Precio"] || "").replace(/[^\d.-]/g, "")); return isNaN(n) ? 0 : n; })(),
  };
}

const fmtCOP = (n) => (n > 0 ? `$${Number(n).toLocaleString("es-CO")}` : "a convenir");

// Procesa un mensaje entrante según el paso guardado del cliente.
// Devuelve { reply, nextStep, handoff, media, moverEtapa, guardar }.
//   media: array de {tipo,url} a enviar ANTES del texto (fotos/video/pdf).
//   moverEtapa: nombre de etapa del CRM a la que mover el lead (o null).
//   guardar: campos del lead a persistir (nombre, cotizProducto, etc.).
//   lead: el lead actual (para leer datos capturados en pasos previos).
export async function processFlowMessage({ texto, pasoActual, lead = {} }) {
  const raw = (texto ?? "").toString().trim();
  const norm = normalize(raw);
  const step = pasoActual || "B-00";
  const base = { media: [], moverEtapa: null, handoff: false, guardar: null };

  // El pedido de asesor funciona desde cualquier nodo del árbol.
  if (norm === HANDOFF_OPTION || HANDOFF_WORDS.some((w) => norm.includes(w))) {
    return { ...base, reply: MSG_HANDOFF, nextStep: step, handoff: true };
  }

  // ═══ FLUJO DE COTIZACIÓN (C-00 nombre → C-01 código → C-02 cantidad → C-03 presupuesto) ═══
  if (step === "C-00") {
    if (raw.length < 3) return { ...base, reply: "✍️ Por favor escribe tu *nombre y apellido* para la cotización.", nextStep: "C-00" };
    return { ...base, reply: `Gracias, *${raw}*. 📋\n\n¿Qué equipo te interesa cotizar? Envíame el *código* del producto (ej: 100-102-1013-6).`, nextStep: "C-01", guardar: { nombre: raw } };
  }
  if (step === "C-01") {
    const prod = await lookupProducto(raw);
    if (!prod) return { ...base, reply: "🤔 No encontré ese código en el catálogo. Revisa el PDF y envíame el *código* tal cual aparece.", nextStep: "C-01" };
    return { ...base, reply: `Perfecto: *${prod.nombre}* (${prod.codigo}) — ${fmtCOP(prod.precioNum)} c/u.\n\n¿Cuántas *unidades* necesitas? (escribe un número: 1, 2, 3...)`, nextStep: "C-02", guardar: { cotizProducto: prod.codigo } };
  }
  if (step === "C-02") {
    const cant = parseInt(norm.replace(/\D/g, ""), 10);
    if (!cant || cant < 1) return { ...base, reply: "🔢 Indícame la *cantidad* con un número (ej: 1, 2, 3).", nextStep: "C-02" };
    return { ...base, reply: `👍 ${cant} unidad(es).\n\n¿Cuál es tu *presupuesto* aproximado? (escribe un valor, ej: 3.000.000)`, nextStep: "C-03", guardar: { cotizCantidad: cant } };
  }
  if (step === "C-03") {
    const presupuesto = parseInt(norm.replace(/\D/g, ""), 10) || 0;
    const prod = await lookupProducto(lead.cotizProducto || "");
    const cant = lead.cotizCantidad || 1;
    const nombre = lead.nombre || "cliente";
    const totalEstimado = prod ? prod.precioNum * cant : 0;
    const resumen = `✅ ¡Listo, *${nombre}*! Hemos registrado tu solicitud de cotización.

📋 *Resumen:*
• Equipo: ${prod ? `${prod.nombre} (${prod.codigo})` : lead.cotizProducto}
• Cantidad: ${cant}
• Precio unitario: ${prod ? fmtCOP(prod.precioNum) : "a confirmar"}
• Total estimado: *${fmtCOP(totalEstimado)}*
• Tu presupuesto: ${fmtCOP(presupuesto)}

Un *asesor* te contactará en breve para afinar el precio final y coordinar el pago. 🙌`;
    return {
      ...base,
      reply: resumen,
      nextStep: "P-01",
      handoff: true,
      moverEtapa: "Negociación",
      guardar: { valorEstimado: presupuesto || totalEstimado },
    };
  }

  // ATAJO GLOBAL: si el mensaje contiene un código de producto válido (aunque
  // venga dentro de una frase: "info del 100-102-1013-3"), muestra la ficha
  // directamente sin importar en qué paso esté el cliente. Se evita en menús
  // de una sola cifra ("1", "0") que no son códigos.
  if (raw.replace(/[\s\-.]/g, "").length >= 3 && !/^[0-9]$/.test(norm)) {
    const detalle = await buildDetalleProducto(raw);
    if (detalle) return { ...base, reply: detalle.text, media: detalle.media, nextStep: "P-01", moverEtapa: "En Conversacion" };
  }

  if (step === "B-01") {
    if (norm === "1") {
      const cat = buildCatalogoPDF();
      return { ...base, reply: cat.text, media: cat.media, nextStep: "B-01B", moverEtapa: "En Conversacion" };
    }
    if (norm === "0") return { ...base, reply: MSG_BIENVENIDA, nextStep: "B-00" };
    return { ...base, reply: `🤔 No entendí esa opción.\n\n${MSG_MENU_PORTATILES}`, nextStep: "B-01" };
  }

  if (step === "B-01B") {
    if (norm === "0") return { ...base, reply: MSG_MENU_PORTATILES, nextStep: "B-01" };
    // ¿Escribió un código de producto? -> muestra ficha con fotos/video (pasa a P-01).
    const detalle = raw ? await buildDetalleProducto(raw) : null;
    if (detalle) return { ...base, reply: detalle.text, media: detalle.media, nextStep: "P-01", moverEtapa: "En Conversacion" };
    return { ...base, reply: `🤔 No encontré ese código en el catálogo. Revisa el PDF que te envié y escríbeme el *código* tal cual aparece (ej: 100-102-1013-6).\n\n0️⃣ Volver   ·   9️⃣ Asesor`, nextStep: "B-01B" };
  }

  // P-01: el cliente ya vio una ficha; menú post-producto (1-5) o nuevo código.
  if (step === "P-01") {
    if (norm === "1") return { ...base, reply: `👍 Perfecto. Escríbeme el *código* del siguiente equipo que quieras ver.`, nextStep: "B-01B" };
    if (norm === "2") return {
      ...base,
      reply: `📝 ¡Con gusto te armo una *cotización personalizada*!\n\nPara empezar, ¿a nombre de quién la hago? (nombre y apellido)`,
      nextStep: "C-00", moverEtapa: "Cotizacion",
    };
    if (norm === "3") return {
      ...base,
      reply: `🛒 ¡Excelente decisión! Un asesor te contactará ya para cerrar la *compra* y coordinar el pago y la entrega. 🙌`,
      nextStep: "P-01", handoff: true, moverEtapa: "Negociación",
    };
    if (norm === "5") return { ...base, reply: MSG_BIENVENIDA, nextStep: "B-00" };
    // ¿Escribió otro código directamente?
    const detalle = raw ? await buildDetalleProducto(raw) : null;
    if (detalle) return { ...base, reply: detalle.text, media: detalle.media, nextStep: "P-01" };
    return { ...base, reply: `🤔 No entendí. \n\n${MENU_POST_PRODUCTO}`, nextStep: "P-01" };
  }

  // B-00 (o paso desconocido/vacío): "1" avanza, cualquier otra cosa muestra bienvenida.
  if (norm === "1") return { ...base, reply: MSG_MENU_PORTATILES, nextStep: "B-01" };
  return { ...base, reply: MSG_BIENVENIDA, nextStep: "B-00" };
}

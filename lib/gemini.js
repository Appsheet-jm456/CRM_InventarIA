// Maneja DOS proveedores de IA: Ollama (local, gratis) y Gemini (nube).
// Se elige con la variable AI_PROVIDER en .env.local (ollama | gemini).

const SYSTEM_PROMPT = `Eres el asistente de inventario de una tienda de equipos de cómputo (portátiles usados y nuevos, monitores, torres Tiny y SFF, memorias RAM, discos, accesorios). Atiendes al personal del local.

RESPONDE SIEMPRE ASÍ:
- En español, en UNA sola frase corta y directa.
- PROHIBIDO mostrar tu razonamiento o pasos. NO escribas "User query", "Input", "Goal", "Searching", "Found", "Format", "Example" ni nada parecido. NO uses viñetas, listas ni títulos. NO repitas la pregunta. Solo la respuesta final.
- Usa SOLO los datos de PRODUCTOS y RESUMEN. Nunca inventes nada.

DISPONIBILIDAD: si el stock es mayor que 0, di "Disponible (N unidades)". Si el stock es 0, di "AGOTADO" (nunca digas disponible con 0 unidades).
PRECIOS: muéstralo como viene; si dice "precio por confirmar", déjalo así.
CONTEOS ("¿cuántos hay de X?"): usa los totales del RESUMEN.
GENERACIÓN: octava=8, novena=9, décima=10, onceava=11, doceava=12, treceava=13. "8va" = generación 8.
FOTOS: la app muestra la foto sola cuando la piden; nunca digas que no puedes enviar fotos.

Ejemplo exacto de una buena respuesta por código:
Disponible (1 unidad). Lenovo ThinkPad T14s Gen 2 — código 100-101-1021-2 — $1.600.000.

Si el código no existe: "El código (X) no está en el inventario."`;

function compactLine(r) {
  const f = (k) => (r[k] ?? "").toString().trim();
  const specs = [f("Procesador"), f("Generación") && `gen ${f("Generación")}`, f("RAM"), f("Almacenamiento")]
    .filter(Boolean).join(" / ");
  let precio = "precio por confirmar";
  if (f("Precio")) {
    const n = Number(f("Precio"));
    precio = isNaN(n) ? f("Precio") : `$${n.toLocaleString("es-CO")}`;
  }
  const stock = parseInt(f("Stock") || "0", 10) || 0;
  const disp = stock > 0 ? `disp(${stock})` : "AGOTADO";
  const partes = [f("Código"), f("Categoría"), f("Marca"), f("Modelo"), specs, f("Estado"), precio, disp].filter(Boolean);
  return "- " + partes.join(" | ");
}

function buildSystemText(stats, listRows) {
  const s = stats || {};
  const cats = Object.entries(s.porCategoria || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
  const resumen = `RESUMEN (inventario completo): ${s.total ?? "?"} productos | ${s.disponibles ?? "?"} disponibles | ${s.agotados ?? "?"} agotados. Por categoría: ${cats}.`;
  return SYSTEM_PROMPT + "\n\n" + resumen +
    `\n\n=== PRODUCTOS RELEVANTES (${listRows.length}) ===\n` + listRows.map(compactLine).join("\n") +
    "\n\nIMPORTANTE: responde SOLO con la frase final, sin pasos, sin viñetas, sin explicaciones.";
}

// --- Proveedor: OLLAMA (local) ---
async function askOllama(systemText, conversation, modelOverride) {
  const base = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = (modelOverride || process.env.OLLAMA_MODEL || "qwen3:4b").trim();
  const numCtx = parseInt(process.env.OLLAMA_NUM_CTX || "8192", 10) || 8192;

  let res;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemText + "\n\n/no_think" }, ...conversation],
        stream: false,
        think: false,
        options: { num_ctx: numCtx, temperature: 0.2 },
      }),
    });
  } catch (e) {
    return "⚠️ No pude conectar con Ollama. ¿Está abierto en tu PC? Inícialo y verifica que descargaste el modelo (ollama pull qwen3:8b). Detalle: " + String(e?.message || e);
  }

  if (!res.ok) {
    const t = await res.text();
    return `⚠️ Ollama devolvió un error ${res.status}. Detalle: ${t.slice(0, 250)}`;
  }
  const data = await res.json();
  let reply = data?.message?.content || "";
  // Quita el "pensamiento" del modelo aunque venga sin etiqueta de apertura.
  if (reply.includes("</think>")) reply = reply.split("</think>").pop();
  reply = reply.replace(/<\/?think>/g, "").trim();
  return reply || "No obtuve respuesta del modelo local. Intenta reformular la consulta.";
}

// --- Proveedor: GEMINI (nube) ---
async function askGeminiApi(systemText, conversation, modelOverride) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = (modelOverride || process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  if (!apiKey || apiKey === "tu_clave_de_gemini") {
    return "⚙️ Falta configurar la clave de Gemini (GEMINI_API_KEY).";
  }
  const contents = conversation.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText }] },
        contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
    });
  } catch (e) {
    return "⚠️ No pude conectar con Gemini. Detalle: " + String(e?.message || e);
  }
  if (!res.ok) {
    const text = await res.text();
    return `⚠️ La IA (Gemini) devolvió un error ${res.status}. Detalle: ${text.slice(0, 250)}`;
  }
  const data = await res.json();
  const reply = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n");
  return reply ? reply.trim() : "No obtuve respuesta de la IA. Intenta reformular la consulta.";
}

// --- Proveedor: ANTHROPIC (Claude Haiku) ---
async function askAnthropic(systemText, conversation) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = (process.env.ANTHROPIC_MODEL || "claude-haiku-4-5").trim();
  if (!apiKey) return "⚙️ Falta configurar ANTHROPIC_API_KEY.";
  // Claude exige que la conversación empiece con un mensaje del usuario.
  let msgs = conversation.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  while (msgs.length && msgs[0].role === "assistant") msgs.shift();
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1024, system: systemText, messages: msgs }),
    });
  } catch (e) {
    return "⚠️ No pude conectar con Claude. Detalle: " + String(e?.message || e);
  }
  if (!res.ok) {
    const t = await res.text();
    return `⚠️ Claude devolvió un error ${res.status}. Detalle: ${t.slice(0, 250)}`;
  }
  const data = await res.json();
  const reply = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  return reply || "No obtuve respuesta de Claude.";
}

// --- Proveedor: OpenAI-compatible (DeepSeek, OpenAI, OpenRouter, Groq...) ---
async function askOpenAICompat(systemText, conversation) {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const apiKey = process.env.OPENAI_API_KEY;
  const model = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  if (!apiKey) return "⚙️ Falta configurar OPENAI_API_KEY.";
  const messages = [
    { role: "system", content: systemText },
    ...conversation.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
  ];
  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 1024 }),
    });
  } catch (e) {
    return "⚠️ No pude conectar con el proveedor de IA. Detalle: " + String(e?.message || e);
  }
  if (!res.ok) {
    const t = await res.text();
    return `⚠️ El proveedor devolvió un error ${res.status}. Detalle: ${t.slice(0, 250)}`;
  }
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  return reply || "No obtuve respuesta del proveedor.";
}

// Función principal (el route.js la sigue llamando igual).
// El modelo elegido en el selector de la UI manda sobre AI_PROVIDER: si el
// usuario elige un modelo "gemini-…", esa petición va a la nube aunque el
// proveedor por defecto del servidor sea Ollama (y viceversa). Así conviven
// los modelos locales y la API de Gemini sin pisarse.
export async function askGemini(messages, listRows, stats, opts = {}) {
  const conversation = messages.map((m) => ({ role: m.role, content: m.content }));
  const modelSel = (opts.model || "").trim();

  if (modelSel.toLowerCase().startsWith("gemini")) {
    return askGeminiApi(buildSystemText(stats, listRows), conversation, modelSel);
  }

  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();

  if (provider === "ollama") {
    // Configurable: en CPUs sin AVX2 conviene enviar menos productos para no disparar la latencia.
    const maxProd = parseInt(process.env.OLLAMA_MAX_PRODUCTS || "40", 10) || 40;
    const slim = listRows.slice(0, maxProd);
    return askOllama(buildSystemText(stats, slim), conversation, modelSel);
  }
  const systemText = buildSystemText(stats, listRows);
  if (provider === "anthropic" || provider === "claude") return askAnthropic(systemText, conversation);
  if (provider === "openai" || provider === "deepseek" || provider === "openai-compat") return askOpenAICompat(systemText, conversation);
  return askGeminiApi(systemText, conversation, modelSel);
}

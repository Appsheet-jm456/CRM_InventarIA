// Lista los modelos disponibles para el selector de la UI: los locales de
// Ollama (si responde) + Gemini en la nube (si hay GEMINI_API_KEY configurada).
// Ambos pueden convivir; el usuario elige cuál usar en cada consulta.
export const dynamic = "force-dynamic";

export async function GET() {
  const ollamaBase = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
  let ollamaModels = [];
  try {
    const res = await fetch(`${ollamaBase}/api/tags`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      ollamaModels = (data.models || [])
        .map((m) => ({ name: m.name, size: m.size, provider: "ollama" }))
        .sort((a, b) => a.size - b.size); // del más ligero (rápido) al más pesado
    }
  } catch {
    // Ollama no responde: seguimos sin sus modelos, no es un error fatal.
  }

  const models = [...ollamaModels];

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== "tu_clave_de_gemini") {
    const geminiModel = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
    models.push({ name: geminiModel, size: null, provider: "gemini" });
  }

  const defaultProvider = (process.env.AI_PROVIDER || "ollama").toLowerCase();
  const current =
    (defaultProvider === "gemini" && models.find((m) => m.provider === "gemini")?.name) ||
    (process.env.OLLAMA_MODEL || "").trim() ||
    models[0]?.name ||
    "";

  return Response.json({ current, models });
}

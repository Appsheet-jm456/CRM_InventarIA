// Lista los modelos locales instalados en Ollama, para poblar el selector de la UI.
export const dynamic = "force-dynamic";

export async function GET() {
  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const current = (process.env.OLLAMA_MODEL || "qwen3:4b").trim();

  // Si no se usa Ollama, no hay selector de modelos locales.
  if (provider !== "ollama") {
    return Response.json({ provider, current, models: [] });
  }

  const base = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/tags`, { cache: "no-store" });
    if (!res.ok) return Response.json({ provider, current, models: [current], error: `Ollama ${res.status}` });
    const data = await res.json();
    const models = (data.models || [])
      .map((m) => ({ name: m.name, size: m.size }))
      .sort((a, b) => a.size - b.size); // del más ligero (rápido) al más pesado
    return Response.json({ provider, current, models });
  } catch (e) {
    return Response.json({ provider, current, models: [current], error: String(e?.message || e) });
  }
}

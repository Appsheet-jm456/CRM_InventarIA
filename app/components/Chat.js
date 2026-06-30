"use client";

import { useEffect, useRef, useState } from "react";

const GREETING =
  "¡Hola! ¿Cómo puedo ayudarte hoy? ¿Qué ítem del inventario quieres consultar?\n\n" +
  "Categorías: Portátil usado, Portátil nuevo, Monitores, Memorias RAM, Discos, Torres Tiny, Torres SFF, Accesorios.\n\n" +
  "También puedes consultar por código, generación, procesador o marca.";

const QUICK = [
  "Portátiles usados",
  "Monitores",
  "Memorias RAM",
  "Discos",
  "Torres Tiny",
  "Torres SFF",
];

// El chat conversa con /api/chat. Mantiene su propio estado (mensajes, input)
// para que cambiar de pestaña a Dashboard y volver NO pierda la conversación,
// porque el componente permanece montado (se oculta con CSS, no se desmonta).
export default function Chat({ password, model, provider, onAuthFail }) {
  const [messages, setMessages] = useState([{ role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [showChips, setShowChips] = useState(true);

  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setShowChips(false);
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);

    const t0 = performance.now();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-password": password },
        body: JSON.stringify({ messages: next, model }),
      });

      if (res.status === 401) {
        onAuthFail?.();
        return;
      }

      const data = await res.json();
      if (data.demo) setDemo(true);
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      const reply = data.reply || data.error || "No pude responder en este momento.";
      const tag = provider === "gemini" ? " ☁️" : provider === "ollama" ? " 💻" : "";
      const meta = data.fast
        ? `⚡ respuesta directa · ${secs}s`
        : (model ? `${model}${tag} · ${secs}s` : `${secs}s`);
      setMessages((m) => [...m, { role: "assistant", content: reply, meta }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Hubo un problema de conexión. Revisa tu internet e inténtalo de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-view">
      {demo && (
        <div className="demo-banner">Modo demo · mostrando inventario de ejemplo (conecta Baserow para datos reales)</div>
      )}

      <div className="messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`row ${m.role}`}>
            <div className="bubble">{m.content}</div>
            {m.meta && <div className="msg-meta">{m.meta}</div>}
          </div>
        ))}

        {showChips && (
          <div className="chips">
            {QUICK.map((q) => (
              <button key={q} className="chip" onClick={() => send(q)}>{q}</button>
            ))}
          </div>
        )}

        {loading && (
          <div className="row assistant">
            <div className="bubble typing"><span /><span /><span /></div>
          </div>
        )}
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe un código, categoría, marca, procesador…"
        />
        <button className="send" type="submit" disabled={loading || !input.trim()}>Enviar</button>
      </form>
    </div>
  );
}

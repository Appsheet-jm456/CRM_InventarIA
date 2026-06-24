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

export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [messages, setMessages] = useState([{ role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [showChips, setShowChips] = useState(true);

  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  function enter(e) {
    e.preventDefault();
    if (!password.trim()) return;
    setAuthError("");
    setAuthed(true);
  }

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setShowChips(false);
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-password": password },
        body: JSON.stringify({ messages: next }),
      });

      if (res.status === 401) {
        setAuthed(false);
        setAuthError("La clave de acceso no es válida. Intenta de nuevo.");
        setMessages([{ role: "assistant", content: GREETING }]);
        setShowChips(true);
        return;
      }

      const data = await res.json();
      if (data.demo) setDemo(true);
      const reply = data.reply || data.error || "No pude responder en este momento.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Hubo un problema de conexión. Revisa tu internet e inténtalo de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!authed) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="brand">
            <div className="brand-mark">iA</div>
            <div className="brand-name">InventarIA</div>
          </div>
          <h1>Acceso del personal</h1>
          <p>Esta consulta de inventario es de uso interno. Ingresa la clave del local para continuar.</p>
          <form onSubmit={enter}>
            <label className="field-label" htmlFor="pw">Clave de acceso</label>
            <input
              id="pw"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
            />
            <button className="btn" type="submit">Entrar</button>
            <div className="gate-error">{authError}</div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="chat">
      <header className="chat-header">
        <div className="brand-mark">iA</div>
        <div>
          <div className="brand-name">InventarIA</div>
          <div className="status"><span className="dot" /> Inventario en línea</div>
        </div>
        <div className="spacer" />
        <button className="linkbtn" onClick={() => { setAuthed(false); setPassword(""); }}>Salir</button>
      </header>

      {demo && (
        <div className="demo-banner">Modo demo · mostrando inventario de ejemplo (conecta Baserow para datos reales)</div>
      )}

      <div className="messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`row ${m.role}`}>
            <div className="bubble">{m.content}</div>
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
          autoFocus
        />
        <button className="send" type="submit" disabled={loading || !input.trim()}>Enviar</button>
      </form>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";
import Chat from "./components/Chat";
import Actions from "./components/Actions";

const EMPTY_CONFIG = { nombre: "", telefono: "", direccion: "", whatsapp: "", nota: "" };

function IconGear() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [view, setView] = useState("dashboard"); // dashboard | chat

  // Acciones de escritura
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionPassword, setActionPassword] = useState(""); // se pide 1 vez por sesión
  const [refreshKey, setRefreshKey] = useState(0); // ++ para refrescar el Dashboard

  const [models, setModels] = useState([]); // [{name, size, provider: "ollama"|"gemini"}]
  const [model, setModel] = useState("");
  const selectedProvider = models.find((m) => m.name === model)?.provider || "";

  // Configuración
  const [theme, setTheme] = useState("dark");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [draft, setDraft] = useState(EMPTY_CONFIG);
  const [saveOk, setSaveOk] = useState(false);

  // Cargar preferencias guardadas al montar
  useEffect(() => {
    const savedTheme = localStorage.getItem("inventaria_theme") || "dark";
    const savedConfig = JSON.parse(localStorage.getItem("inventaria_config") || "{}");
    setTheme(savedTheme);
    const merged = { ...EMPTY_CONFIG, ...savedConfig };
    setConfig(merged);
    setDraft(merged);
  }, []);

  // Aplicar tema al documento
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("inventaria_theme", theme);
  }, [theme]);

  // Al entrar, carga la lista de modelos locales para el selector del chat.
  useEffect(() => {
    if (!authed) return;
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        setModels(d.models || []);
        setModel(d.current || (d.models?.[0]?.name ?? ""));
      })
      .catch(() => {});
  }, [authed]);

  function openSettings() {
    setDraft({ ...config });
    setSaveOk(false);
    setSettingsOpen(true);
  }

  function handleSaveConfig() {
    setConfig({ ...draft });
    localStorage.setItem("inventaria_config", JSON.stringify(draft));
    setSaveOk(true);
    setTimeout(() => setSaveOk(false), 2000);
  }

  function enter(e) {
    e.preventDefault();
    if (!password.trim()) return;
    setAuthError("");
    setAuthed(true);
  }

  function handleAuthFail() {
    setAuthed(false);
    setAuthError("La clave de acceso no es válida. Intenta de nuevo.");
  }

  if (!authed) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="brand">
            <div className="brand-mark">iA</div>
            <div className="brand-name">{config.nombre || "InventarIA"}</div>
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

  const brandName = config.nombre || "InventarIA";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark">iA</div>
          <div>
            <div className="brand-name">{brandName}</div>
            <div className="status"><span className="dot" /> Inventario en línea</div>
          </div>
        </div>

        <nav className="tabs">
          <button
            className={`tab${view === "dashboard" ? " active" : ""}`}
            onClick={() => setView("dashboard")}
          >Dashboard</button>
          <button
            className={`tab${view === "chat" ? " active" : ""}`}
            onClick={() => setView("chat")}
          >Chat InventarIA</button>
        </nav>

        <div className="spacer" />

        {view === "chat" && models.length > 0 && (
          <div className="model-picker">
            <span className="model-label">Modelo</span>
            <select
              className="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              title="Elige el modelo: local (Ollama) o en la nube (Gemini)"
            >
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                  {m.provider === "ollama" && m.size ? ` (${(m.size / 1e9).toFixed(1)} GB)` : ""}
                  {m.provider === "gemini" ? " — Gemini API" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <button className="linkbtn accent" onClick={() => setActionsOpen(true)}>Acciones</button>
        <button className="icon-btn" onClick={openSettings} title="Configuración">
          <IconGear />
        </button>
        <button className="linkbtn" onClick={() => { setAuthed(false); setPassword(""); }}>Salir</button>
      </header>

      {actionsOpen && (
        <Actions
          accessPassword={password}
          actionPassword={actionPassword}
          setActionPassword={setActionPassword}
          onChanged={() => setRefreshKey((k) => k + 1)}
          onClose={() => setActionsOpen(false)}
        />
      )}

      {/* Panel de configuración */}
      {settingsOpen && (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-head">
              <h2>Configuración</h2>
              <button className="close-btn" onClick={() => setSettingsOpen(false)}>✕</button>
            </div>
            <div className="settings-body">

              <div className="settings-section">
                <h3>Apariencia</h3>
                <div className="theme-toggle">
                  <button
                    className={`theme-btn${theme === "light" ? " active" : ""}`}
                    onClick={() => setTheme("light")}
                  >☀️ Claro</button>
                  <button
                    className={`theme-btn${theme === "dark" ? " active" : ""}`}
                    onClick={() => setTheme("dark")}
                  >🌙 Oscuro</button>
                </div>
              </div>

              <div className="settings-section">
                <h3>Datos del local</h3>
                {[
                  { key: "nombre",    label: "Nombre del local",  placeholder: "Ej: JM Computadores" },
                  { key: "telefono",  label: "Teléfono",          placeholder: "Ej: 601 234 5678" },
                  { key: "whatsapp",  label: "WhatsApp",          placeholder: "Ej: 300 123 4567" },
                  { key: "direccion", label: "Dirección",         placeholder: "Ej: Calle 10 # 20-30, Bogotá" },
                  { key: "nota",      label: "Nota / Slogan",     placeholder: "Ej: Atención L–S 9am–6pm" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="config-field" style={{ marginBottom: 10 }}>
                    <label className="config-label">{label}</label>
                    <input
                      className="config-input"
                      value={draft[key]}
                      placeholder={placeholder}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    />
                  </div>
                ))}
                <button className="settings-save" onClick={handleSaveConfig}>Guardar cambios</button>
                <div className="save-ok">{saveOk ? "✓ Guardado" : ""}</div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Vistas — ambas montadas; se ocultan con CSS para no perder estado */}
      <main className="view-area">
        <div className={`view-pane${view === "dashboard" ? " active" : ""}`}>
          <Dashboard password={password} refreshKey={refreshKey} />
        </div>
        <div className={`view-pane${view === "chat" ? " active" : ""}`}>
          <Chat password={password} model={model} provider={selectedProvider} onAuthFail={handleAuthFail} />
        </div>
      </main>
    </div>
  );
}

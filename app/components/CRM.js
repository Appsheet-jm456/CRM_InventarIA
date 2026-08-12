"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const COLOR_NAMES = ["Gris", "Azul", "Amarillo", "Naranja", "Morado", "Verde", "Rojo"];
const MOTIVOS_PERDIDO = ["Precio", "Sin respuesta", "No calificado", "Compró en otro lado", "Solo preguntaba", "Otro"];
const norm = (s) => (s ?? "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const COLOR_HEX = {
  Gris: "#94a3b8", Azul: "#3b82f6", Amarillo: "#eab308",
  Naranja: "#f97316", Morado: "#a855f7", Verde: "#22c55e", Rojo: "#ef4444",
};

function fmtDinero(n) {
  const v = Number(n);
  if (!v || isNaN(v)) return "";
  return `$${v.toLocaleString("es-CO")}`;
}

function timeAgo(iso) {
  if (!iso) return "sin contacto";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

// Pide la clave de acciones una sola vez por sesión, igual que el componente Acciones.
function PasswordGate({ onSubmit, error }) {
  const [pw, setPw] = useState("");
  return (
    <div className="crm-gate">
      <div className="crm-gate-text">🔒 Ingresa la clave de acciones para mover clientes y editar el pipeline.</div>
      <div className="crm-gate-row">
        <input
          className="config-input"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Clave de acciones"
          onKeyDown={(e) => e.key === "Enter" && onSubmit(pw)}
          autoFocus
        />
        <button className="btn-primary" onClick={() => onSubmit(pw)}>Entrar</button>
      </div>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

function LeadCard({ lead, onOpen, onDragStart }) {
  return (
    <div className="crm-card" draggable onDragStart={(e) => onDragStart(e, lead)} onClick={() => onOpen(lead)}>
      <div className="crm-card-top">
        <span className="crm-card-name">{lead.nombre || lead.telefono}</span>
        {lead.valorEstimado ? <span className="crm-card-valor">{fmtDinero(lead.valorEstimado)}</span> : null}
      </div>
      {lead.nombre && <div className="crm-card-phone">{lead.telefono}</div>}
      {lead.ultimoMensaje && <div className="crm-card-msg">{lead.ultimoMensaje}</div>}
      {lead.motivoPerdido && <span className="crm-motivo-badge">✕ {lead.motivoPerdido}</span>}
      <div className="crm-card-time">{timeAgo(lead.fechaUltimoContacto)}</div>
    </div>
  );
}

function Conversacion({ lead, canEdit, accessPassword, actionPassword, onChanged }) {
  const telefono = lead.telefono;
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(!!lead.pausarBot); // true = humano tomó control
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatBoxRef = useRef(null);
  const sendingRef = useRef(false);
  const primerCargaRef = useRef(true); // true hasta el primer render de mensajes de ESTE lead

  // silent=true refresca sin el "Cargando…" (para el auto-refresco en vivo).
  async function cargarMensajes(silent = false) {
    if (!silent) setLoading(true);
    try {
      const r = await fetch(`/api/crm/messages/${encodeURIComponent(telefono)}`, { headers: { "x-access-password": accessPassword } });
      const d = await r.json();
      if (d.error && !silent) setError(d.error);
      else if (!d.error) { setError(""); setMessages(d.messages || []); }
    } catch (e) {
      if (!silent) setError(String(e?.message || e));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { primerCargaRef.current = true; cargarMensajes(); }, [telefono]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresco del chat EN VIVO cada 5 s (silencioso). Se pausa mientras el
  // usuario está enviando un mensaje, para evitar condiciones de carrera.
  useEffect(() => {
    const id = setInterval(() => { if (!sendingRef.current) cargarMensajes(true); }, 5000);
    return () => clearInterval(id);
  }, [telefono]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al abrir un chat, salta INSTANTÁNEO al último mensaje (sin animación).
  // En refrescos posteriores, solo hace scroll suave si el usuario ya estaba
  // cerca del fondo (no interrumpe si está leyendo mensajes anteriores).
  useEffect(() => {
    const box = chatBoxRef.current;
    if (!box || !messages) return;
    if (primerCargaRef.current) {
      box.scrollTop = box.scrollHeight;
      primerCargaRef.current = false;
      return;
    }
    const cerca = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    if (cerca) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function enviar() {
    const msg = texto.trim();
    if (!msg) return;
    setSending(true); sendingRef.current = true; setError("");
    try {
      const res = await fetch("/api/crm/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-action-password": actionPassword },
        body: JSON.stringify({ numero: telefono, texto: msg }),
      });
      const d = await res.json();
      if (d.error) { setError(d.error); return; }
      setTexto("");
      setPaused(true);      // el envío auto-pausa el bot
      await cargarMensajes();
      onChanged?.();        // refresca el board (último mensaje / estado)
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSending(false); sendingRef.current = false;
    }
  }

  async function enviarArchivo(file) {
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { setError("El archivo supera 16 MB."); return; }
    setUploading(true); sendingRef.current = true; setError("");
    try {
      const fd = new FormData();
      fd.append("numero", telefono);
      fd.append("file", file);
      const res = await fetch("/api/crm/send-media", {
        method: "POST",
        headers: { "x-action-password": actionPassword }, // sin Content-Type: el navegador pone el boundary
        body: fd,
      });
      const d = await res.json();
      if (d.error) { setError(d.error); return; }
      setPaused(true);
      await cargarMensajes();
      onChanged?.();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setUploading(false); sendingRef.current = false;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function toggleBot() {
    const nuevoPausar = !paused;
    setTogglingBot(true); setError("");
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-action-password": actionPassword },
        body: JSON.stringify({ pausarBot: nuevoPausar }),
      });
      const d = await res.json();
      if (d.error) { setError(d.error); return; }
      setPaused(nuevoPausar);
      onChanged?.();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setTogglingBot(false);
    }
  }

  return (
    <div className="crm-conv">
      {canEdit && (
        <div className={`crm-handoff${paused ? " human" : ""}`}>
          <div className="crm-handoff-state">
            {paused ? "🧑 Atención humana — el bot está en pausa" : "🤖 Bot activo — responde automáticamente"}
          </div>
          <button className="crm-handoff-btn" onClick={toggleBot} disabled={togglingBot}>
            {togglingBot ? "…" : paused ? "Reactivar bot" : "Tomar control"}
          </button>
        </div>
      )}

      <div className="crm-chat" ref={chatBoxRef}>
        {loading && <div className="dash-msg">Cargando conversación…</div>}
        {error && <div className="dash-msg error">⚠️ {error}</div>}
        {!loading && messages && messages.length === 0 && <div className="dash-msg">Sin mensajes registrados todavía.</div>}
        {messages && messages.map((m, i) => (
          <div key={i} className={`crm-chat-row ${m.fromMe ? "bot" : "cli"}`}>
            <div className="crm-chat-bubble">
              {m.texto}
              <span className="crm-chat-time">
                {m.timestamp ? new Date(m.timestamp).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
              </span>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {canEdit && (
        <div className="crm-composer">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArchivo(f); }}
          />
          <button
            className="crm-attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
            title="Enviar imagen (JPG/PNG) o PDF"
          >{uploading ? "⏳" : "📎"}</button>
          <input
            className="config-input"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !sending && enviar()}
            placeholder={uploading ? "Enviando archivo…" : "Escribe una respuesta al cliente…"}
            disabled={uploading}
          />
          <button className="btn-primary" onClick={enviar} disabled={sending || uploading || !texto.trim()}>
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </div>
      )}
    </div>
  );
}

function LeadDetail({ lead, stages, canEdit, accessPassword, actionPassword, onChanged, onClose, onSave }) {
  const [nombre, setNombre] = useState(lead.nombre || "");
  const [etapa, setEtapa] = useState(lead.etapa || "");
  const [notas, setNotas] = useState(lead.notas || "");
  const [valor, setValor] = useState(lead.valorEstimado ?? "");
  const [motivoPerdido, setMotivoPerdido] = useState(lead.motivoPerdido || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const esPerdido = norm(etapa) === "perdido";

  async function guardar() {
    if (esPerdido && !motivoPerdido) { setErr("Selecciona el motivo por el que se perdió el cliente."); return; }
    setBusy(true); setErr("");
    try {
      await onSave(lead.id, {
        nombre, etapa, notas, valorEstimado: valor === "" ? null : valor,
        motivoPerdido: esPerdido ? motivoPerdido : "",
      });
      onClose();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const iniciales = (lead.nombre || lead.telefono || "?").trim().slice(0, 2).toUpperCase();

  return (
    <div className="lead-page">
      <div className="lead-page-head">
        <button className="lead-back" onClick={onClose}>‹ Volver al pipeline</button>
        <div className="lead-page-id">
          <span className="lead-avatar">{iniciales}</span>
          <div>
            <div className="lead-page-name">{lead.nombre || lead.telefono}</div>
            <div className="lead-page-phone">{lead.telefono}</div>
          </div>
        </div>
      </div>

      <div className="lead-page-body">
        {/* IZQUIERDA — Datos del cliente */}
        <aside className="lead-panel lead-panel-data">
          <h3 className="lead-panel-title">Datos del cliente</h3>
          <div className="action-form">
            <div className="config-field">
              <label className="config-label">Teléfono</label>
              <input className="config-input" value={lead.telefono} disabled />
            </div>
            <div className="config-field">
              <label className="config-label">Nombre</label>
              <input className="config-input" value={nombre} disabled={!canEdit}
                onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del cliente" />
            </div>
            <div className="config-field">
              <label className="config-label">Etapa</label>
              <select className="model-select crm-select-full" value={etapa} disabled={!canEdit}
                onChange={(e) => setEtapa(e.target.value)}>
                {stages.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>
            {esPerdido && (
              <div className="config-field crm-motivo-field">
                <label className="config-label">¿Por qué se perdió? *</label>
                <select className="model-select crm-select-full" value={motivoPerdido} disabled={!canEdit}
                  onChange={(e) => setMotivoPerdido(e.target.value)}>
                  <option value="">Selecciona un motivo…</option>
                  {MOTIVOS_PERDIDO.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            <div className="config-field">
              <label className="config-label">Valor estimado</label>
              <input className="config-input" inputMode="numeric" value={valor} disabled={!canEdit}
                onChange={(e) => setValor(e.target.value)} placeholder="0" />
            </div>
            <div className="config-field">
              <label className="config-label">Notas</label>
              <textarea className="config-input crm-textarea" value={notas} disabled={!canEdit}
                onChange={(e) => setNotas(e.target.value)} placeholder="Contexto del cliente, acuerdos, seguimiento…" />
            </div>
            <div className="config-field">
              <label className="config-label">Último contacto</label>
              <div className="crm-readonly-msg">{timeAgo(lead.fechaUltimoContacto)}</div>
            </div>
          </div>
          {err && <div className="form-error">{err}</div>}
          {canEdit && (
            <button className="btn-primary lead-save" onClick={guardar} disabled={busy}>
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
          )}
        </aside>

        {/* DERECHA — Conversación */}
        <section className="lead-panel lead-panel-chat">
          <h3 className="lead-panel-title">💬 Conversación</h3>
          <Conversacion
            lead={lead}
            canEdit={canEdit}
            accessPassword={accessPassword}
            actionPassword={actionPassword}
            onChanged={onChanged}
          />
        </section>
      </div>
    </div>
  );
}

function StageConfig({ stages, leads, onClose, onCreate, onUpdate, onDelete }) {
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoColor, setNuevoColor] = useState("Gris");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editNombre, setEditNombre] = useState("");
  const [deleting, setDeleting] = useState(null); // stage a borrar
  const [reassignTo, setReassignTo] = useState("");

  const leadCountByStage = useMemo(() => {
    const map = {};
    for (const l of leads) map[l.etapa] = (map[l.etapa] || 0) + 1;
    return map;
  }, [leads]);

  async function agregar() {
    if (!nuevoNombre.trim()) return;
    setBusy(true); setErr("");
    try {
      await onCreate({ nombre: nuevoNombre.trim(), color: nuevoColor });
      setNuevoNombre(""); setNuevoColor("Gris");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function mover(stage, dir) {
    const idx = stages.findIndex((s) => s.id === stage.id);
    const swapWith = stages[idx + dir];
    if (!swapWith) return;
    setBusy(true); setErr("");
    try {
      await onUpdate(stage.id, { orden: swapWith.orden });
      await onUpdate(swapWith.id, { orden: stage.orden });
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function renombrar(stage) {
    if (!editNombre.trim() || editNombre.trim() === stage.nombre) { setEditingId(null); return; }
    setBusy(true); setErr("");
    try {
      await onUpdate(stage.id, { nombre: editNombre.trim() });
      setEditingId(null);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmarBorrado() {
    setBusy(true); setErr("");
    try {
      await onDelete(deleting.id, leadCountByStage[deleting.nombre] ? reassignTo : null);
      setDeleting(null); setReassignTo("");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">Configurar embudo</div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {deleting ? (
            <div className="confirm-box">
              <div className="confirm-summary">
                Vas a borrar la etapa <b>{deleting.nombre}</b>.
                {leadCountByStage[deleting.nombre]
                  ? ` Tiene ${leadCountByStage[deleting.nombre]} cliente(s) — elige a qué etapa se mueven:`
                  : " No tiene clientes asociados."}
              </div>
              {leadCountByStage[deleting.nombre] > 0 && (
                <select className="model-select crm-select-full" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                  <option value="">Elige una etapa…</option>
                  {stages.filter((s) => s.id !== deleting.id).map((s) => (
                    <option key={s.id} value={s.nombre}>{s.nombre}</option>
                  ))}
                </select>
              )}
              {err && <div className="form-error">{err}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => { setDeleting(null); setErr(""); }} disabled={busy}>Cancelar</button>
                <button className="btn-primary" onClick={confirmarBorrado}
                  disabled={busy || (leadCountByStage[deleting.nombre] > 0 && !reassignTo)}>
                  {busy ? "Borrando…" : "Confirmar borrado"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="crm-stage-list">
                {stages.map((s, idx) => (
                  <div className="crm-stage-row" key={s.id}>
                    <span className="crm-color-dot" style={{ background: COLOR_HEX[s.color] || "#94a3b8" }} />
                    {editingId === s.id ? (
                      <input
                        className="config-input crm-stage-edit"
                        value={editNombre}
                        onChange={(e) => setEditNombre(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && renombrar(s)}
                        autoFocus
                      />
                    ) : (
                      <span className="crm-stage-name" onClick={() => { setEditingId(s.id); setEditNombre(s.nombre); }}>
                        {s.nombre} <span className="crm-stage-count">({leadCountByStage[s.nombre] || 0})</span>
                      </span>
                    )}
                    <div className="crm-stage-actions">
                      {editingId === s.id ? (
                        <button className="icon-btn" onClick={() => renombrar(s)} title="Guardar">✓</button>
                      ) : (
                        <>
                          <button className="icon-btn" onClick={() => mover(s, -1)} disabled={idx === 0} title="Subir">↑</button>
                          <button className="icon-btn" onClick={() => mover(s, 1)} disabled={idx === stages.length - 1} title="Bajar">↓</button>
                          <button className="icon-btn" onClick={() => setDeleting(s)} title="Borrar">🗑</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="crm-new-stage">
                <div className="config-field">
                  <label className="config-label">Nueva etapa</label>
                  <input className="config-input" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
                    placeholder="Ej: En espera de pago" />
                </div>
                <div className="crm-color-picker">
                  {COLOR_NAMES.map((c) => (
                    <button key={c} type="button" title={c}
                      className={`crm-color-swatch${nuevoColor === c ? " active" : ""}`}
                      style={{ background: COLOR_HEX[c] }}
                      onClick={() => setNuevoColor(c)} />
                  ))}
                </div>
                {err && !deleting && <div className="form-error">{err}</div>}
                <button className="btn-primary" onClick={agregar} disabled={busy || !nuevoNombre.trim()}>
                  {busy ? "Agregando…" : "+ Agregar etapa"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CRM({ accessPassword, actionPassword, setActionPassword, active = true }) {
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [gateError, setGateError] = useState("");
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [vistaModo, setVistaModo] = useState("kanban"); // "kanban" | "lista"
  const [busqueda, setBusqueda] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("");   // "" = todas
  const [filtroAtencion, setFiltroAtencion] = useState(""); // "" | "bot" | "humano"

  // Recuerda la vista preferida entre sesiones.
  useEffect(() => {
    const v = localStorage.getItem("crm_vista");
    if (v === "lista" || v === "kanban") setVistaModo(v);
  }, []);
  useEffect(() => { localStorage.setItem("crm_vista", vistaModo); }, [vistaModo]);

  // silent=true refresca sin el spinner "Cargando…" (para el auto-refresco).
  async function cargar(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [rLeads, rStages] = await Promise.all([
        fetch("/api/crm/leads", { headers: { "x-access-password": accessPassword } }).then((r) => r.json()),
        fetch("/api/crm/stages", { headers: { "x-access-password": accessPassword } }).then((r) => r.json()),
      ]);
      if (rLeads.error) setError(rLeads.error);
      setLeads(rLeads.leads || []);
      setStages((rStages.stages || []).sort((a, b) => a.orden - b.orden));
    } catch (e) {
      if (!silent) setError(String(e?.message || e));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // Carga al mostrarse la pestaña por primera vez (la vista está siempre montada).
  useEffect(() => {
    if (active && !loadedOnce) { setLoadedOnce(true); cargar(); }
  }, [active, loadedOnce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresco en tiempo real (polling cada 12 s) mientras la pestaña CRM está
  // visible. Se pausa si hay un modal abierto (detalle/config) o el usuario está
  // arrastrando una tarjeta, para no interrumpir la interacción.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (!detail && !configOpen && !dragOverStage) cargar(true);
    }, 12000);
    return () => clearInterval(id);
  }, [active, detail, configOpen, dragOverStage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aplica búsqueda de texto + filtros (etapa, atención) sobre los leads.
  const leadsFiltrados = useMemo(() => {
    const q = norm(busqueda);
    return leads.filter((l) => {
      if (filtroEtapa && norm(l.etapa) !== norm(filtroEtapa)) return false;
      if (filtroAtencion === "bot" && l.pausarBot) return false;
      if (filtroAtencion === "humano" && !l.pausarBot) return false;
      if (q) {
        const hay = norm([l.nombre, l.telefono, l.ultimoMensaje].filter(Boolean).join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, busqueda, filtroEtapa, filtroAtencion]); // eslint-disable-line react-hooks/exhaustive-deps

  const hayFiltros = busqueda || filtroEtapa || filtroAtencion;

  // Agrupa por nombre normalizado (sin tildes/mayúsculas) para que ningún lead
  // quede fuera de su columna por diferencias de acentos entre las dos tablas.
  const leadsByStage = useMemo(() => {
    const map = {};
    const stageByNorm = {};
    for (const s of stages) { map[s.nombre] = []; stageByNorm[norm(s.nombre)] = s.nombre; }
    for (const l of leadsFiltrados) {
      const dest = stageByNorm[norm(l.etapa)];
      if (dest) map[dest].push(l);
    }
    return map;
  }, [leadsFiltrados, stages]); // eslint-disable-line react-hooks/exhaustive-deps

  function authHeaders() {
    return { "Content-Type": "application/json", "x-action-password": actionPassword };
  }

  async function moverLead(leadId, nuevaEtapa) {
    const anterior = leads;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, etapa: nuevaEtapa } : l)));
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ etapa: nuevaEtapa }) });
      const data = await res.json();
      if (data.error) { setLeads(anterior); setError(data.error); }
    } catch (e) {
      setLeads(anterior);
      setError(String(e?.message || e));
    }
  }

  async function guardarLead(leadId, fields) {
    const res = await fetch(`/api/crm/leads/${leadId}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(fields) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    await cargar();
  }

  async function crearEtapa(fields) {
    const res = await fetch("/api/crm/stages", { method: "POST", headers: authHeaders(), body: JSON.stringify(fields) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setStages((data.stages || []).sort((a, b) => a.orden - b.orden));
  }

  async function actualizarEtapa(stageId, fields) {
    const res = await fetch(`/api/crm/stages/${stageId}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(fields) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setStages((data.stages || []).sort((a, b) => a.orden - b.orden));
  }

  async function borrarEtapa(stageId, reassignTo) {
    const res = await fetch(`/api/crm/stages/${stageId}`, { method: "DELETE", headers: authHeaders(), body: JSON.stringify({ reassignTo }) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setStages((data.stages || []).sort((a, b) => a.orden - b.orden));
    await cargar();
  }

  async function onSubmitGate(pw) {
    setGateError("");
    // Se valida en el primer PATCH real; aquí solo la recordamos para la sesión.
    if (!pw) { setGateError("Escribe la clave de acciones."); return; }
    setActionPassword(pw);
  }

  function onDragStart(e, lead) {
    e.dataTransfer.setData("text/plain", String(lead.id));
  }

  const canEdit = !!actionPassword;

  const totalLeads = leads.length;

  // Vista de detalle a PÁGINA COMPLETA (dos paneles: datos + conversación).
  if (detail) {
    return (
      <div className="crm-view">
        <LeadDetail
          lead={detail}
          stages={stages}
          canEdit={canEdit}
          accessPassword={accessPassword}
          actionPassword={actionPassword}
          onChanged={cargar}
          onClose={() => setDetail(null)}
          onSave={guardarLead}
        />
      </div>
    );
  }

  return (
    <div className="crm-view">
      <div className="crm-bar">
        <div className="crm-bar-left">
          <span className="crm-bar-title">Pipeline de clientes</span>
          <span className="crm-bar-count">{totalLeads} {totalLeads === 1 ? "cliente" : "clientes"}</span>
          <span className="crm-live" title="El tablero se actualiza automáticamente cada pocos segundos"><span className="crm-live-dot" /> En vivo</span>
        </div>
        <div className="crm-bar-actions">
          <div className="crm-viewtoggle" role="tablist">
            <button
              className={`crm-vbtn${vistaModo === "kanban" ? " active" : ""}`}
              onClick={() => setVistaModo("kanban")}
              title="Vista de embudo (Kanban)"
            >▦ Kanban</button>
            <button
              className={`crm-vbtn${vistaModo === "lista" ? " active" : ""}`}
              onClick={() => setVistaModo("lista")}
              title="Vista de lista agrupada por etapa"
            >☰ Lista</button>
          </div>
          <button className="linkbtn" onClick={cargar} title="Refrescar" disabled={loading}>
            {loading ? "Cargando…" : "↻ Refrescar"}
          </button>
          <button className="linkbtn" onClick={() => setConfigOpen(true)}>⚙️ Configurar embudo</button>
        </div>
      </div>

      {!canEdit && <PasswordGate onSubmit={onSubmitGate} error={gateError} />}

      <div className="crm-filters">
        <input
          className="crm-search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar por nombre, teléfono o mensaje…"
        />
        <select className="crm-filter-sel" value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)}>
          <option value="">Todas las etapas</option>
          {stages.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
        </select>
        <select className="crm-filter-sel" value={filtroAtencion} onChange={(e) => setFiltroAtencion(e.target.value)}>
          <option value="">Toda atención</option>
          <option value="bot">🤖 Bot activo</option>
          <option value="humano">🧑 Atención humana</option>
        </select>
        <span className="crm-filter-count">{leadsFiltrados.length} de {leads.length}</span>
        {hayFiltros && <button className="crm-filter-clear" onClick={() => { setBusqueda(""); setFiltroEtapa(""); setFiltroAtencion(""); }}>Limpiar</button>}
      </div>

      {loading && <div className="dash-msg">Cargando pipeline…</div>}
      {error && <div className="dash-msg error">⚠️ {error}</div>}

      {/* ===== Vista KANBAN (embudo) ===== */}
      {!loading && !error && vistaModo === "kanban" && (
        <div className="crm-board">
          {stages.map((stage) => {
            const items = leadsByStage[stage.nombre] || [];
            const total = items.reduce((sum, l) => sum + (l.valorEstimado || 0), 0);
            return (
              <div
                key={stage.id}
                className={`crm-column${dragOverStage === stage.nombre ? " drag-over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.nombre); }}
                onDragLeave={() => setDragOverStage((s) => (s === stage.nombre ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStage(null);
                  if (!canEdit) return;
                  const leadId = Number(e.dataTransfer.getData("text/plain"));
                  if (leadId) moverLead(leadId, stage.nombre);
                }}
              >
                <div className="crm-column-head">
                  <span className="crm-color-dot" style={{ background: stage.colorHex }} />
                  <span className="crm-column-title">{stage.nombre}</span>
                  <span className="crm-column-count">{items.length}</span>
                </div>
                {total > 0 && <div className="crm-column-total">{fmtDinero(total)}</div>}
                <div className="crm-column-body">
                  {items.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} onOpen={setDetail} onDragStart={onDragStart} />
                  ))}
                  {items.length === 0 && <div className="crm-empty">Sin clientes</div>}
                </div>
              </div>
            );
          })}
          {stages.length === 0 && <div className="dash-msg">No hay etapas configuradas todavía.</div>}
        </div>
      )}

      {/* ===== Vista LISTA (agrupada por etapa) ===== */}
      {!loading && !error && vistaModo === "lista" && (
        <div className="crm-list">
          {stages.map((stage) => {
            const items = leadsByStage[stage.nombre] || [];
            if (items.length === 0) return null; // en lista solo se muestran etapas con clientes
            const total = items.reduce((sum, l) => sum + (l.valorEstimado || 0), 0);
            return (
              <div className="crm-list-group" key={stage.id}>
                <div className="crm-list-head">
                  <span className="crm-color-dot" style={{ background: stage.colorHex }} />
                  <span className="crm-list-stage">{stage.nombre}</span>
                  <span className="crm-column-count">{items.length}</span>
                  {total > 0 && <span className="crm-list-total">{fmtDinero(total)}</span>}
                </div>
                {items.map((lead) => (
                  <button className="crm-list-row" key={lead.id} onClick={() => setDetail(lead)}>
                    <span className="crm-list-avatar">{(lead.nombre || lead.telefono || "?").trim().slice(0, 2).toUpperCase()}</span>
                    <span className="crm-list-main">
                      <span className="crm-list-name">{lead.nombre || lead.telefono}</span>
                      <span className="crm-list-msg">{lead.ultimoMensaje || lead.telefono}</span>
                    </span>
                    <span className="crm-list-meta">
                      {lead.valorEstimado ? <span className="crm-list-valor">{fmtDinero(lead.valorEstimado)}</span> : null}
                      <span className="crm-list-time">{timeAgo(lead.fechaUltimoContacto)}</span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
          {leadsFiltrados.length === 0 && <div className="dash-msg">{hayFiltros ? "Sin clientes que coincidan con la búsqueda." : "Aún no hay clientes en el pipeline."}</div>}
        </div>
      )}

      {configOpen && (
        <StageConfig
          stages={stages}
          leads={leads}
          onClose={() => setConfigOpen(false)}
          onCreate={crearEtapa}
          onUpdate={actualizarEtapa}
          onDelete={borrarEtapa}
        />
      )}
    </div>
  );
}

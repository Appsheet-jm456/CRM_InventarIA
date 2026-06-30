"use client";

import { useEffect, useMemo, useState } from "react";

const f = (r, k) => (r?.[k] ?? "").toString().trim();
const fmtPrecio = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return isNaN(n) || n === 0 ? "por confirmar" : `$${n.toLocaleString("es-CO")}`;
};

const MENU = [
  { tipo: "agregar", icon: "➕", titulo: "Agregar producto", sub: "Crear un registro nuevo" },
  { tipo: "precio",  icon: "🏷️", titulo: "Cambiar precio",   sub: "Actualizar el precio de un código" },
  { tipo: "stock",   icon: "📦", titulo: "Ajustar stock",     sub: "Fijar la cantidad disponible" },
  { tipo: "venta",   icon: "✅", titulo: "Registrar venta",   sub: "Poner Stock en 0 (sin borrar)" },
];

const NUEVO_VACIO = {
  codigo: "", categoria: "", marca: "", modelo: "", procesador: "",
  generacion: "", ram: "", almacenamiento: "", estado: "", precio: "",
  stock: "", descripcion: "", foto: "",
};

const CAMPOS_AGREGAR = [
  { key: "codigo", label: "Código *", ph: "100-101-1234" },
  { key: "categoria", label: "Categoría", ph: "Portátil usado" },
  { key: "marca", label: "Marca", ph: "Lenovo" },
  { key: "modelo", label: "Modelo", ph: "ThinkPad T480" },
  { key: "procesador", label: "Procesador", ph: "Core i5-8350U" },
  { key: "generacion", label: "Generación", ph: "8" },
  { key: "ram", label: "RAM", ph: "16GB" },
  { key: "almacenamiento", label: "Almacenamiento", ph: "256GB SSD" },
  { key: "estado", label: "Estado", ph: "Usado" },
  { key: "precio", label: "Precio", ph: "1150000", num: true },
  { key: "stock", label: "Stock", ph: "1", num: true },
  { key: "foto", label: "Foto (URL)", ph: "https://…" },
  { key: "descripcion", label: "Descripción", ph: "Detalle del equipo", full: true },
];

export default function Actions({ accessPassword, actionPassword, setActionPassword, onChanged, onClose }) {
  const [screen, setScreen] = useState("menu"); // menu | agregar | precio | stock | venta
  const [rows, setRows] = useState([]);
  const [loadingInv, setLoadingInv] = useState(true);

  // Formularios
  const [nuevo, setNuevo] = useState(NUEVO_VACIO);
  const [codigo, setCodigo] = useState("");
  const [nuevoPrecio, setNuevoPrecio] = useState("");
  const [nuevoStock, setNuevoStock] = useState("");

  // Confirmación / resultado
  const [confirming, setConfirming] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // {ok, mensaje} | {error}
  const [formError, setFormError] = useState("");

  // Carga el inventario una vez (para lookups y sugerencias de código).
  useEffect(() => {
    fetch("/api/inventory", { headers: { "x-access-password": accessPassword } })
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.rows) ? d.rows : []))
      .catch(() => {})
      .finally(() => setLoadingInv(false));
  }, [accessPassword]);

  const codigos = useMemo(() => rows.map((r) => f(r, "Código")).filter(Boolean), [rows]);

  // Fila encontrada por código (case-insensitive) para precio/stock/venta.
  const found = useMemo(() => {
    const t = codigo.trim().toLowerCase();
    if (!t) return null;
    return rows.find((r) => f(r, "Código").toLowerCase() === t) || null;
  }, [rows, codigo]);

  function reset() {
    setScreen("menu");
    setNuevo(NUEVO_VACIO);
    setCodigo(""); setNuevoPrecio(""); setNuevoStock("");
    setConfirming(false); setBusy(false); setResult(null); setFormError(""); setPw("");
  }

  function goMenu() {
    setNuevo(NUEVO_VACIO);
    setCodigo(""); setNuevoPrecio(""); setNuevoStock("");
    setConfirming(false); setResult(null); setFormError(""); setPw("");
    setScreen("menu");
  }

  // Paso 1 → 2: valida y muestra el resumen de confirmación.
  function revisar() {
    setFormError("");
    if (screen === "agregar") {
      if (!nuevo.codigo.trim()) { setFormError("El Código es obligatorio."); return; }
    } else {
      if (!codigo.trim()) { setFormError("Escribe un código."); return; }
      if (!found) { setFormError(`El código ${codigo} no está en el inventario.`); return; }
      if (screen === "precio" && nuevoPrecio.trim() === "") { setFormError("Escribe el nuevo precio."); return; }
      if (screen === "stock" && nuevoStock.trim() === "") { setFormError("Escribe la nueva cantidad."); return; }
    }
    setConfirming(true);
  }

  // Paso 2: envía la escritura.
  async function confirmar() {
    const usePw = actionPassword || pw;
    if (!usePw) { setFormError("Ingresa la clave de acciones."); return; }
    setBusy(true); setFormError("");

    let datos;
    if (screen === "agregar") datos = { ...nuevo };
    else if (screen === "precio") datos = { codigo, precio: nuevoPrecio };
    else if (screen === "stock") datos = { codigo, stock: nuevoStock };
    else datos = { codigo }; // venta

    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-action-password": usePw },
        body: JSON.stringify({ tipo: screen, datos }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setFormError(data.error || "Clave de acciones incorrecta.");
        setBusy(false);
        return;
      }
      if (data.error) {
        setResult({ error: data.error });
      } else {
        if (!actionPassword) setActionPassword(usePw); // recuerda la clave por la sesión
        setResult({ ok: true, mensaje: data.mensaje || "Listo." });
        onChanged?.(); // refresca la tabla del Dashboard
      }
    } catch (e) {
      setResult({ error: "Problema de conexión: " + String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  // Texto del resumen de confirmación.
  function resumen() {
    if (screen === "agregar") {
      return `Se creará el producto ${nuevo.codigo}${nuevo.marca || nuevo.modelo ? ` — ${[nuevo.marca, nuevo.modelo].filter(Boolean).join(" ")}` : ""}` +
        `${nuevo.precio ? ` · ${fmtPrecio(nuevo.precio)}` : ""}${nuevo.stock ? ` · Stock ${nuevo.stock}` : ""}.`;
    }
    const prod = found ? [f(found, "Marca"), f(found, "Modelo")].filter(Boolean).join(" ") : "";
    if (screen === "precio")
      return `${codigo} (${prod})\nPrecio actual ${fmtPrecio(f(found, "Precio"))} → nuevo ${fmtPrecio(nuevoPrecio)}`;
    if (screen === "stock")
      return `${codigo} (${prod})\nStock actual ${f(found, "Stock") || 0} → nuevo ${nuevoStock}`;
    return `${codigo} (${prod})\nSe pondrá Stock en 0 (la fila NO se borra, se conserva el historial).`;
  }

  const titulo = screen === "menu" ? "Acciones"
    : MENU.find((m) => m.tipo === screen)?.titulo || "Acción";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            {screen !== "menu" && !result && (
              <button className="modal-back" onClick={goMenu} title="Volver">‹</button>
            )}
            {titulo}
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* ---------- Resultado (éxito/error) ---------- */}
          {result ? (
            <div className="action-result">
              {result.ok
                ? <div className="result-ok">✅ {result.mensaje}</div>
                : <div className="result-bad">{result.error}</div>}
              <div className="modal-actions">
                {result.ok
                  ? <>
                      <button className="btn-ghost" onClick={() => { reset(); }}>Otra acción</button>
                      <button className="btn-primary" onClick={onClose}>Cerrar</button>
                    </>
                  : <>
                      <button className="btn-ghost" onClick={() => { setResult(null); setConfirming(false); }}>Reintentar</button>
                      <button className="btn-primary" onClick={onClose}>Cerrar</button>
                    </>}
              </div>
            </div>

          /* ---------- Menú ---------- */
          ) : screen === "menu" ? (
            <div className="action-menu">
              {MENU.map((m) => (
                <button key={m.tipo} className="action-item" onClick={() => { setScreen(m.tipo); setFormError(""); }}>
                  <span className="ai-icon">{m.icon}</span>
                  <span className="ai-text">
                    <span className="ai-title">{m.titulo}</span>
                    <span className="ai-sub">{m.sub}</span>
                  </span>
                </button>
              ))}
            </div>

          /* ---------- Confirmación (paso 2) ---------- */
          ) : confirming ? (
            <div className="confirm-box">
              <div className="confirm-summary">{resumen()}</div>
              {!actionPassword && (
                <div className="config-field" style={{ marginTop: 12 }}>
                  <label className="config-label">Clave de acciones</label>
                  <input
                    className="config-input"
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="••••••••"
                    autoFocus
                  />
                </div>
              )}
              {formError && <div className="form-error">{formError}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => { setConfirming(false); setFormError(""); }} disabled={busy}>Cancelar</button>
                <button className="btn-primary" onClick={confirmar} disabled={busy}>
                  {busy ? "Guardando…" : "Confirmar"}
                </button>
              </div>
            </div>

          /* ---------- Formularios (paso 1) ---------- */
          ) : screen === "agregar" ? (
            <div className="action-form">
              <div className="form-grid">
                {CAMPOS_AGREGAR.map((c) => (
                  <div key={c.key} className={`config-field${c.full ? " full" : ""}`}>
                    <label className="config-label">{c.label}</label>
                    <input
                      className="config-input"
                      value={nuevo[c.key]}
                      inputMode={c.num ? "numeric" : undefined}
                      placeholder={c.ph}
                      onChange={(e) => setNuevo((n) => ({ ...n, [c.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              {formError && <div className="form-error">{formError}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={goMenu}>Volver</button>
                <button className="btn-primary" onClick={revisar}>Guardar</button>
              </div>
            </div>

          ) : (
            /* precio / stock / venta comparten el lookup por código */
            <div className="action-form">
              <div className="config-field">
                <label className="config-label">Código del producto</label>
                <input
                  className="config-input"
                  list="codigos-list"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder={loadingInv ? "Cargando inventario…" : "Escribe o elige un código"}
                  autoFocus
                />
                <datalist id="codigos-list">
                  {codigos.slice(0, 300).map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>

              {codigo.trim() && !found && !loadingInv && (
                <div className="lookup-bad">⚠️ El código “{codigo}” no está en el inventario.</div>
              )}

              {found && (
                <div className="lookup-ok">
                  <div className="lo-title">{[f(found, "Marca"), f(found, "Modelo")].filter(Boolean).join(" ") || f(found, "Código")}</div>
                  <div className="lo-row">Precio actual: <b>{fmtPrecio(f(found, "Precio"))}</b></div>
                  <div className="lo-row">Stock actual: <b>{f(found, "Stock") || 0}</b></div>
                </div>
              )}

              {screen === "precio" && found && (
                <div className="config-field">
                  <label className="config-label">Nuevo precio</label>
                  <input className="config-input" inputMode="numeric" value={nuevoPrecio}
                    onChange={(e) => setNuevoPrecio(e.target.value)} placeholder="1500000" />
                </div>
              )}
              {screen === "stock" && found && (
                <div className="config-field">
                  <label className="config-label">Nueva cantidad de stock</label>
                  <input className="config-input" inputMode="numeric" value={nuevoStock}
                    onChange={(e) => setNuevoStock(e.target.value)} placeholder="3" />
                </div>
              )}
              {screen === "venta" && found && (
                <div className="venta-note">Al confirmar, el Stock de este producto quedará en <b>0</b>. La fila NO se borra.</div>
              )}

              {formError && <div className="form-error">{formError}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={goMenu}>Volver</button>
                <button className="btn-primary" onClick={revisar} disabled={!found}>Guardar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

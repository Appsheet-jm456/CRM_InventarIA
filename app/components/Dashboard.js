"use client";

import { useEffect, useMemo, useState } from "react";

// --- Helpers ---
const f = (r, k) => (r?.[k] ?? "").toString().trim();

function stockNum(r) {
  return parseInt(f(r, "Stock") || "0", 10) || 0;
}

function fmtPrecio(r) {
  const s = f(r, "Precio");
  if (!s) return "por confirmar";
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return isNaN(n) || n === 0 ? (s || "por confirmar") : `$${n.toLocaleString("es-CO")}`;
}

function precioNum(r) {
  const s = f(r, "Precio");
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return isNaN(n) ? null : n;
}

function norm(s) {
  return (s ?? "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Calcula la lista de páginas a mostrar (con elipsis para muchas páginas).
function pageList(current, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = [1];
  if (current > 4) pages.push("…");
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < totalPages - 3) pages.push("…");
  pages.push(totalPages);
  return pages;
}

const COLS = [
  "Código", "Categoría", "Marca", "Modelo", "Procesador",
  "Generación", "RAM", "Almacenamiento", "Estado", "Precio", "Disponibilidad",
];

// Orden de campos en el modal de detalle del producto.
const DETALLE = [
  { k: "Código", label: "Código", mono: true },
  { k: "Descripción", label: "Descripción (nombre completo)" },
  { k: "Marca", label: "Marca" },
  { k: "Modelo", label: "Modelo" },
  { k: "Procesador", label: "Procesador" },
  { k: "Generación", label: "Generación" },
  { k: "RAM", label: "RAM" },
  { k: "Almacenamiento", label: "Almacenamiento" },
  { k: "Categoría", label: "Categoría" },
  { k: "Estado", label: "Estado" },
];

function Disp({ row }) {
  const s = stockNum(row);
  return s > 0
    ? <span className="badge ok">Disponible ({s})</span>
    : <span className="badge bad">AGOTADO</span>;
}

export default function Dashboard({ password, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(false);

  // Filtros
  const [q, setQ] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [precioMin, setPrecioMin] = useState("");
  const [precioMax, setPrecioMax] = useState("");
  const [soloDisp, setSoloDisp] = useState(false);

  // Paginación
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Modal de detalle de producto
  const [detail, setDetail] = useState(null);

  // Lee directo de Baserow (sin IA, cero tokens). Recarga cuando cambia
  // refreshKey, p. ej. tras una acción de escritura (agregar/precio/stock/venta).
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch("/api/inventory", { headers: { "x-access-password": password } })
      .then((r) => r.json())
      .then((d) => {
        if (cancel) return;
        setError(d.error || "");
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setDemo(!!d.demo);
      })
      .catch((e) => !cancel && setError(String(e?.message || e)))
      .finally(() => !cancel && setLoading(false));
    return () => { cancel = true; };
  }, [password, refreshKey]);

  // Listas únicas para los selectores.
  const marcas = useMemo(() => {
    const set = new Set(rows.map((r) => f(r, "Marca")).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  // Modelos dependen de la marca elegida, para no saturar el selector.
  const modelos = useMemo(() => {
    const base = marca ? rows.filter((r) => f(r, "Marca") === marca) : rows;
    const set = new Set(base.map((r) => f(r, "Modelo")).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [rows, marca]);

  // Aplica todos los filtros (en el cliente).
  const filtered = useMemo(() => {
    const nq = norm(q);
    const min = precioMin ? Number(precioMin) : null;
    const max = precioMax ? Number(precioMax) : null;
    return rows.filter((r) => {
      if (soloDisp && stockNum(r) <= 0) return false;
      if (marca && f(r, "Marca") !== marca) return false;
      if (modelo && f(r, "Modelo") !== modelo) return false;
      if (min != null || max != null) {
        const p = precioNum(r);
        if (p == null) return false;
        if (min != null && p < min) return false;
        if (max != null && p > max) return false;
      }
      if (nq) {
        const hay = norm([
          f(r, "Código"), f(r, "Marca"), f(r, "Modelo"),
          f(r, "Procesador"), f(r, "Categoría"),
        ].join(" "));
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
  }, [rows, q, marca, modelo, precioMin, precioMax, soloDisp]);

  // Al cambiar cualquier filtro o el tamaño de página, vuelve a la página 1.
  useEffect(() => { setPage(1); }, [q, marca, modelo, precioMin, precioMax, soloDisp, pageSize]);

  // Si cambia la marca, el modelo elegido puede dejar de existir.
  useEffect(() => {
    if (modelo && !modelos.includes(modelo)) setModelo("");
  }, [modelos, modelo]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function limpiar() {
    setQ(""); setMarca(""); setModelo(""); setPrecioMin(""); setPrecioMax(""); setSoloDisp(false);
  }

  const hayFiltros = q || marca || modelo || precioMin || precioMax || soloDisp;

  return (
    <div className="dash">
      {/* Barra de filtros */}
      <div className="filters">
        <input
          className="filter-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar código, marca, modelo, procesador…"
        />
        <select className="filter-sel" value={marca} onChange={(e) => setMarca(e.target.value)}>
          <option value="">Todas las marcas</option>
          {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="filter-sel" value={modelo} onChange={(e) => setModelo(e.target.value)}>
          <option value="">Todos los modelos</option>
          {modelos.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          className="filter-num"
          type="number"
          inputMode="numeric"
          value={precioMin}
          onChange={(e) => setPrecioMin(e.target.value)}
          placeholder="Precio mín"
        />
        <input
          className="filter-num"
          type="number"
          inputMode="numeric"
          value={precioMax}
          onChange={(e) => setPrecioMax(e.target.value)}
          placeholder="Precio máx"
        />
        <label className="filter-check" title="Mostrar solo productos con stock disponible">
          <input type="checkbox" checked={soloDisp} onChange={(e) => setSoloDisp(e.target.checked)} />
          <span>Con existencias</span>
        </label>
        <span className="filter-count">{total} de {rows.length}</span>
        {hayFiltros && <button className="filter-clear" onClick={limpiar}>Limpiar</button>}
      </div>

      {loading && <div className="dash-msg">Cargando inventario…</div>}
      {error && <div className="dash-msg error">⚠️ {error}</div>}
      {demo && !loading && (
        <div className="demo-banner">Modo demo · inventario de ejemplo (conecta Baserow para datos reales)</div>
      )}

      {!loading && !error && (
        <>
          {/* Tabla (desktop/tablet, scroll horizontal interno) */}
          <div className="table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  {COLS.map((c) => <th key={c}>{c}</th>)}
                  <th className="th-ver"></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr key={f(r, "Código") + "-" + i}>
                    <td className="mono">{f(r, "Código")}</td>
                    <td>{f(r, "Categoría")}</td>
                    <td>{f(r, "Marca")}</td>
                    <td>{f(r, "Modelo")}</td>
                    <td>{f(r, "Procesador")}</td>
                    <td>{f(r, "Generación")}</td>
                    <td>{f(r, "RAM")}</td>
                    <td>{f(r, "Almacenamiento")}</td>
                    <td>{f(r, "Estado")}</td>
                    <td className="precio">{fmtPrecio(r)}</td>
                    <td><Disp row={r} /></td>
                    <td className="td-ver">
                      <button className="ver-btn" onClick={() => setDetail(r)}>Ver</button>
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={COLS.length + 1} className="empty">Sin resultados con estos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tarjetas (celular) */}
          <div className="cards">
            {pageRows.map((r, i) => (
              <div className="prod-card" key={f(r, "Código") + "-card-" + i}>
                <div className="pc-top">
                  <span className="mono pc-code">{f(r, "Código")}</span>
                  <Disp row={r} />
                </div>
                <div className="pc-title">{[f(r, "Marca"), f(r, "Modelo")].filter(Boolean).join(" ")}</div>
                <div className="pc-specs">
                  {[f(r, "Procesador"), f(r, "Generación") && `gen ${f(r, "Generación")}`, f(r, "RAM"), f(r, "Almacenamiento")]
                    .filter(Boolean).join(" · ")}
                </div>
                <div className="pc-bottom">
                  <span className="pc-cat">{f(r, "Categoría")}{f(r, "Estado") ? ` · ${f(r, "Estado")}` : ""}</span>
                  <span className="precio">{fmtPrecio(r)}</span>
                </div>
                <button className="ver-btn pc-ver" onClick={() => setDetail(r)}>Ver detalle</button>
              </div>
            ))}
            {pageRows.length === 0 && <div className="dash-msg">Sin resultados con estos filtros.</div>}
          </div>

          {/* Paginación */}
          <div className="pager">
            <div className="pager-size">
              <span>Mostrar:</span>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="pager-nav">
              <button
                className="pager-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >‹ Anterior</button>
              {pageList(safePage, totalPages).map((p, idx) =>
                p === "…"
                  ? <span key={"e" + idx} className="pager-ellipsis">…</span>
                  : <button
                      key={p}
                      className={`pager-num${p === safePage ? " active" : ""}`}
                      onClick={() => setPage(p)}
                    >{p}</button>
              )}
              <button
                className="pager-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >Siguiente ›</button>
            </div>
          </div>
        </>
      )}

      {/* Modal de detalle del producto */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-card detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">
                {[f(detail, "Marca"), f(detail, "Modelo")].filter(Boolean).join(" ") || f(detail, "Código") || "Producto"}
              </div>
              <button className="close-btn" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="modal-body">
              {f(detail, "Foto") && (
                <img className="detail-foto" src={f(detail, "Foto")} alt="" loading="lazy"
                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
              )}
              <dl className="detail-grid">
                {DETALLE.map(({ k, label, mono }) => (
                  <div className="detail-row" key={k}>
                    <dt>{label}</dt>
                    <dd className={mono ? "mono" : ""}>{f(detail, k) || "—"}</dd>
                  </div>
                ))}
                <div className="detail-row">
                  <dt>Precio</dt>
                  <dd className="precio">{fmtPrecio(detail)}</dd>
                </div>
                <div className="detail-row">
                  <dt>Disponibilidad</dt>
                  <dd><Disp row={detail} /></dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

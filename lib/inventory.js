// Inventario de ejemplo para MODO DEMO (cuando Baserow no está configurado).
const SAMPLE_INVENTORY = [
  { "Código": "PU-001", "Categoría": "Portátil usado", "Marca": "Lenovo", "Modelo": "ThinkPad T480", "Procesador": "Intel Core i5-8350U", "Generación": "8", "RAM": "16GB", "Almacenamiento": "256GB SSD", "Estado": "Usado", "Precio": 1150000, "Stock": 3, "Descripción": "Equipo corporativo, batería buena, teclado retroiluminado." },
  { "Código": "MON-007", "Categoría": "Monitores", "Marca": "Dell", "Modelo": "P2419H 24 IPS", "Procesador": "", "Generación": "", "RAM": "", "Almacenamiento": "", "Estado": "Usado", "Precio": 380000, "Stock": 4, "Descripción": "Full HD, base ajustable, HDMI y DisplayPort." },
  { "Código": "ACC-058", "Categoría": "Accesorios", "Marca": "Genérico", "Modelo": "Cargador USB-C 65W", "Procesador": "", "Generación": "", "RAM": "", "Almacenamiento": "", "Estado": "Nuevo", "Precio": 75000, "Stock": 0, "Descripción": "Carga rápida para portátiles modernos." }
];

function normalize(s) {
  return (s ?? "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function fieldToText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value.map((v) => (v && typeof v === "object" ? (v.url ?? v.value ?? "") : v)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") return value.value ?? "";
  return value;
}

export function flattenRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (["id", "order"].includes(key)) continue;
    out[key] = fieldToText(value);
  }
  return out;
}

// --- Config compartida de Baserow (lectura y escritura) ---
function baserowConfig() {
  const token = process.env.BASEROW_API_TOKEN;
  const tableId = process.env.BASEROW_TABLE_ID;
  const base = process.env.BASEROW_API_URL || "https://api.baserow.io";
  const ok = token && tableId && token !== "tu_token_de_baserow";
  return { token, tableId, base, ok };
}

// Trae las filas CRUDAS (con id de Baserow), para poder hacer PATCH luego.
async function fetchRawRows() {
  const { token, tableId, base } = baserowConfig();
  let rows = [];
  let page = 1;
  const size = 200;
  while (page <= 20) {
    const url = `${base}/api/database/rows/table/${tableId}/?user_field_names=true&size=${size}&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Token ${token}` }, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Baserow respondió ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    rows = rows.concat(data.results || []);
    if (!data.next) break;
    page++;
  }
  return rows;
}

// Busca una fila por Código (case-insensitive) y devuelve la fila cruda con id.
export async function findRawRowByCode(code) {
  const { ok } = baserowConfig();
  if (!ok) return null;
  const target = (code ?? "").toString().trim().toLowerCase();
  if (!target) return null;
  const rows = await fetchRawRows();
  return rows.find((r) => {
    const c = (r["Código"] ?? r["Codigo"] ?? "").toString().trim().toLowerCase();
    return c === target;
  }) || null;
}

// Crea una fila nueva (POST). `fields` usa nombres de columna con tildes.
export async function createRow(fields) {
  const { token, tableId, base, ok } = baserowConfig();
  if (!ok) throw new Error("Baserow no está configurado (faltan token/tabla).");
  const url = `${base}/api/database/rows/table/${tableId}/?user_field_names=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Baserow ${res.status}: ${text.slice(0, 250)}`);
  }
  return res.json();
}

// Actualiza una fila existente (PATCH) por su id de Baserow.
export async function updateRow(rowId, fields) {
  const { token, tableId, base, ok } = baserowConfig();
  if (!ok) throw new Error("Baserow no está configurado (faltan token/tabla).");
  const url = `${base}/api/database/rows/table/${tableId}/${rowId}/?user_field_names=true`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Baserow ${res.status}: ${text.slice(0, 250)}`);
  }
  return res.json();
}

export async function getInventory() {
  const token = process.env.BASEROW_API_TOKEN;
  const tableId = process.env.BASEROW_TABLE_ID;
  const base = process.env.BASEROW_API_URL || "https://api.baserow.io";

  if (!token || !tableId || token === "tu_token_de_baserow") {
    return { rows: SAMPLE_INVENTORY.map(flattenRow), demo: true };
  }

  let rows = [];
  let page = 1;
  const size = 200;
  while (page <= 20) {
    const url = `${base}/api/database/rows/table/${tableId}/?user_field_names=true&size=${size}&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Token ${token}` }, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Baserow respondió ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    rows = rows.concat(data.results || []);
    if (!data.next) break;
    page++;
  }
  return { rows: rows.map(flattenRow), demo: false };
}

// --- Sinónimos de generación: "octava", "8va", "8a" -> "8" ---
const GEN_WORDS = {
  primera: "1", segunda: "2", tercera: "3", cuarta: "4", quinta: "5",
  sexta: "6", septima: "7", octava: "8", novena: "9", decima: "10",
  onceava: "11", undecima: "11", doceava: "12", duodecima: "12", treceava: "13",
};

// Expande la consulta para que coincida con cómo están guardados los datos.
export function expandQuery(query) {
  let q = " " + normalize(query) + " ";
  for (const [word, num] of Object.entries(GEN_WORDS)) {
    if (q.includes(word)) q += ` ${num} gen `;
  }
  // "8va", "8a", "8 gen", "8va generacion" -> "8"
  q = q.replace(/(\d{1,2})\s*(va|a|ta|ma)?\s*gen(eracion)?/g, " $1 gen ");
  // "i5", "i 5", "core i5" -> "i5"
  q = q.replace(/i\s*([3579])/g, "i$1");
  return q;
}

// Decide qué filas enviar a la IA. Si el inventario es pequeño, envía todo
// (lo más confiable); si es muy grande, filtra las más relevantes.
export function selectForContext(rows, query, hardLimit = 800) {
  if (rows.length <= hardLimit) return rows;

  const q = expandQuery(query);
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return rows.slice(0, 150);

  const scored = rows.map((r) => {
    const hay = normalize(Object.values(r).join(" "));
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score++;
    return { r, score };
  });
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.r);
  return (hits.length ? hits : rows).slice(0, 150);
}

// Resumen con totales, para que la IA dé conteos exactos sin contar a mano.
export function summarize(rows) {
  const total = rows.length;
  let disponibles = 0, agotados = 0;
  const porCategoria = {};
  for (const r of rows) {
    const stock = parseInt(r["Stock"] || r["stock"] || "0", 10) || 0;
    if (stock > 0) disponibles++; else agotados++;
    const cat = r["Categoría"] || r["Categoria"] || "Sin categoría";
    porCategoria[cat] = (porCategoria[cat] || 0) + 1;
  }
  return { total, disponibles, agotados, porCategoria };
}

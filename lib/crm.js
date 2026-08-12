// Acceso a Baserow para el módulo CRM (pipeline de leads de WhatsApp).
// Dos tablas: CRM_Etapas (columnas del Kanban) y CRM_Leads (tarjetas).
// El campo "Etapa" en CRM_Leads es un Single select de Baserow: sus opciones
// deben mantenerse sincronizadas con las filas de CRM_Etapas cada vez que se
// crea, renombra o borra una etapa (ver syncStageOptions más abajo).

function normalize(s) {
  return (s ?? "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// Paleta de colores propios del CRM. El campo "Etapa" en CRM_Leads es de tipo
// TEXTO (no Single select): así la app puede crear etapas nuevas libremente sin
// tocar el esquema de Baserow (los database tokens no pueden modificar campos).
export const STAGE_COLORS = {
  Gris: "#94a3b8", Azul: "#3b82f6", Amarillo: "#eab308",
  Naranja: "#f97316", Morado: "#a855f7", Verde: "#22c55e", Rojo: "#ef4444",
};

// Opciones del Single select "Motivo perdido" en CRM_Leads (deben existir tal
// cual en Baserow; a diferencia de "Etapa", este campo SÍ es Single select
// porque es un catálogo fijo — no hace falta crear opciones nuevas al vuelo).
export const MOTIVOS_PERDIDO = [
  "Precio", "Sin respuesta", "No calificado", "Compró en otro lado", "Solo preguntaba", "Otro",
];

function crmConfig() {
  const token = process.env.BASEROW_API_TOKEN;
  const base = process.env.BASEROW_API_URL || "https://api.baserow.io";
  const stagesTableId = process.env.CRM_ETAPAS_TABLE_ID;
  const leadsTableId = process.env.CRM_LEADS_TABLE_ID;
  const ok = !!(token && stagesTableId && leadsTableId);
  return { token, base, stagesTableId, leadsTableId, ok };
}

async function baserowFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Token ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Baserow ${res.status}: ${text.slice(0, 250)}`);
  }
  return res.status === 204 ? null : res.json();
}

async function fetchAllRows(tableId, token, base) {
  let rows = [];
  let page = 1;
  while (page <= 20) {
    const url = `${base}/api/database/rows/table/${tableId}/?user_field_names=true&size=200&page=${page}`;
    const data = await baserowFetch(url, token);
    rows = rows.concat(data.results || []);
    if (!data.next) break;
    page++;
  }
  return rows;
}

// ---------------- Etapas ----------------

function mapStageRow(r) {
  const colorName = r.Color?.value || "Gris";
  return {
    id: r.id,
    nombre: r.Nombre || "",
    orden: Number(r.Orden) || 0,
    color: colorName,
    colorHex: STAGE_COLORS[colorName] || "#94a3b8",
  };
}

export async function getStages() {
  const { token, base, stagesTableId, ok } = crmConfig();
  if (!ok) return [];
  const rows = await fetchAllRows(stagesTableId, token, base);
  return rows.map(mapStageRow).sort((a, b) => a.orden - b.orden);
}

export async function createStage({ nombre, color }) {
  const { token, base, stagesTableId, ok } = crmConfig();
  if (!ok) throw new Error("CRM no está configurado (faltan IDs de tabla).");
  const nombreLimpio = (nombre ?? "").toString().trim();
  if (!nombreLimpio) throw new Error("El nombre de la etapa es obligatorio.");

  const stages = await getStages();
  if (stages.some((s) => normalize(s.nombre) === normalize(nombreLimpio))) {
    throw new Error(`Ya existe una etapa llamada "${nombreLimpio}".`);
  }
  const orden = stages.length ? Math.max(...stages.map((s) => s.orden)) + 1 : 1;

  const url = `${base}/api/database/rows/table/${stagesTableId}/?user_field_names=true`;
  await baserowFetch(url, token, {
    method: "POST",
    body: JSON.stringify({ Nombre: nombreLimpio, Orden: orden, Color: color || "Gris" }),
  });
  return getStages();
}

export async function updateStage(stageId, { nombre, color, orden }) {
  const { token, base, stagesTableId, ok } = crmConfig();
  if (!ok) throw new Error("CRM no está configurado (faltan IDs de tabla).");

  // Si se renombra la etapa, arrastra a los leads que estaban en ella
  // (el campo Etapa es texto, así que hay que actualizar cada lead).
  let nombreAnterior = null;
  if (nombre !== undefined) {
    const stages = await getStages();
    nombreAnterior = stages.find((s) => String(s.id) === String(stageId))?.nombre || null;
  }

  const patch = {};
  if (nombre !== undefined) patch.Nombre = String(nombre).trim();
  if (color !== undefined) patch.Color = color;
  if (orden !== undefined) patch.Orden = Number(orden);

  const url = `${base}/api/database/rows/table/${stagesTableId}/${stageId}/?user_field_names=true`;
  await baserowFetch(url, token, { method: "PATCH", body: JSON.stringify(patch) });

  if (nombreAnterior && normalize(nombreAnterior) !== normalize(patch.Nombre)) {
    await moveLeadsStage(nombreAnterior, patch.Nombre);
  }
  return getStages();
}

// Borra una etapa. Si tiene leads, hay que reasignarlos ANTES (moveLeadsStage)
// para que no queden en una columna que ya no existe en el tablero.
export async function deleteStage(stageId) {
  const { token, base, stagesTableId, ok } = crmConfig();
  if (!ok) throw new Error("CRM no está configurado (faltan IDs de tabla).");

  const url = `${base}/api/database/rows/table/${stagesTableId}/${stageId}/`;
  await baserowFetch(url, token, { method: "DELETE" });
  return getStages();
}

// ---------------- Leads ----------------

function mapLeadRow(r) {
  // "Etapa" es texto (string). Se tolera también el formato objeto {value}
  // por si la tabla quedara como Single select.
  const etapa = typeof r.Etapa === "object" && r.Etapa !== null ? (r.Etapa.value || "") : (r.Etapa || "");
  return {
    id: r.id,
    telefono: r.Telefono || "",
    nombre: r.Nombre || "",
    etapa,
    ultimoMensaje: r["Ultimo mensaje"] || "",
    fechaUltimoContacto: r["Fecha ultimo contacto"] || null,
    notas: r.Notas || "",
    valorEstimado: r["Valor estimado"] != null ? Number(r["Valor estimado"]) : null,
    // true = un humano tomó el control, el bot NO debe responder a este número.
    pausarBot: r["Pausar bot"] === true,
    // Nodo del árbol de menús en el que está el cliente (ej. "B-00", "B-01B").
    pasoMenu: r["Paso menu"] || "",
    // Datos de cotización en progreso (flujo C-xx).
    cotizProducto: r["Cotiz producto"] || "",
    cotizCantidad: r["Cotiz cantidad"] != null ? Number(r["Cotiz cantidad"]) : null,
    // Trazabilidad: por qué se perdió el lead (solo aplica en etapa "Perdido").
    // Tolera texto plano o {value} por si el campo fuera single_select.
    motivoPerdido: (typeof r["Motivo perdido"] === "object" && r["Motivo perdido"] !== null ? r["Motivo perdido"].value : r["Motivo perdido"]) || "",
  };
}

// Lee un lead por teléfono ya mapeado (uso público, p. ej. desde el motor de flujo).
export async function getLeadByPhone(telefono) {
  const raw = await findRawLeadByPhone(telefono);
  return raw ? mapLeadRow(raw) : null;
}

export async function getLeads() {
  const { token, base, leadsTableId, ok } = crmConfig();
  if (!ok) return [];
  const rows = await fetchAllRows(leadsTableId, token, base);
  return rows.map(mapLeadRow);
}

async function findRawLeadByPhone(telefono) {
  const { token, base, leadsTableId } = crmConfig();
  const target = (telefono ?? "").toString().trim();
  if (!target) return null;
  const rows = await fetchAllRows(leadsTableId, token, base);
  return rows.find((r) => (r.Telefono ?? "").toString().trim() === target) || null;
}

// Crea o actualiza el lead de un número al llegar un mensaje de WhatsApp.
// Si es nuevo, entra en la primera etapa del embudo (menor Orden).
export async function upsertLead({ telefono, texto, nombre }) {
  const { token, base, leadsTableId, ok } = crmConfig();
  if (!ok) throw new Error("CRM no está configurado (faltan IDs de tabla).");
  const tel = (telefono ?? "").toString().trim();
  if (!tel) throw new Error("Falta el teléfono del lead.");

  const nowIso = new Date().toISOString();
  const existing = await findRawLeadByPhone(tel);

  if (existing) {
    const patch = { "Ultimo mensaje": texto || "", "Fecha ultimo contacto": nowIso };
    if (nombre && !existing.Nombre) patch.Nombre = nombre;
    const url = `${base}/api/database/rows/table/${leadsTableId}/${existing.id}/?user_field_names=true`;
    return baserowFetch(url, token, { method: "PATCH", body: JSON.stringify(patch) }).then(mapLeadRow);
  }

  const stages = await getStages();
  const primeraEtapa = stages[0]?.nombre || "Nuevo";
  const url = `${base}/api/database/rows/table/${leadsTableId}/?user_field_names=true`;
  return baserowFetch(url, token, {
    method: "POST",
    body: JSON.stringify({
      Telefono: tel,
      Nombre: nombre || "",
      Etapa: primeraEtapa,
      "Ultimo mensaje": texto || "",
      "Fecha ultimo contacto": nowIso,
    }),
  }).then(mapLeadRow);
}

// Edita un lead (mover de etapa, notas, nombre, valor estimado).
export async function updateLead(leadId, fields) {
  const { token, base, leadsTableId, ok } = crmConfig();
  if (!ok) throw new Error("CRM no está configurado (faltan IDs de tabla).");

  const patch = {};
  if (fields.etapa !== undefined) patch.Etapa = fields.etapa;
  if (fields.nombre !== undefined) patch.Nombre = fields.nombre;
  if (fields.notas !== undefined) patch.Notas = fields.notas;
  if (fields.pausarBot !== undefined) patch["Pausar bot"] = !!fields.pausarBot;
  if (fields.pasoMenu !== undefined) patch["Paso menu"] = fields.pasoMenu;
  if (fields.cotizProducto !== undefined) patch["Cotiz producto"] = fields.cotizProducto;
  if (fields.cotizCantidad !== undefined) {
    const n = Number(fields.cotizCantidad);
    patch["Cotiz cantidad"] = isNaN(n) ? null : n;
  }
  if (fields.motivoPerdido !== undefined) patch["Motivo perdido"] = fields.motivoPerdido || null;
  if (fields.valorEstimado !== undefined) {
    const n = Number(fields.valorEstimado);
    patch["Valor estimado"] = isNaN(n) ? null : n;
  }

  const url = `${base}/api/database/rows/table/${leadsTableId}/${leadId}/?user_field_names=true`;
  return baserowFetch(url, token, { method: "PATCH", body: JSON.stringify(patch) }).then(mapLeadRow);
}

// Tras una respuesta humana manual: pausa el bot para ese número y registra
// el mensaje saliente como último mensaje. Si el lead no existe, lo crea.
export async function markHumanReply({ numero, texto }) {
  const { token, base, leadsTableId, ok } = crmConfig();
  if (!ok) throw new Error("CRM no está configurado (faltan IDs de tabla).");
  const tel = (numero ?? "").toString().trim();
  if (!tel) throw new Error("Falta el teléfono del lead.");

  const nowIso = new Date().toISOString();
  const existing = await findRawLeadByPhone(tel);
  const campos = {
    "Pausar bot": true,
    "Ultimo mensaje": texto ? `🧑 ${texto}` : "",
    "Fecha ultimo contacto": nowIso,
  };

  if (existing) {
    const url = `${base}/api/database/rows/table/${leadsTableId}/${existing.id}/?user_field_names=true`;
    return baserowFetch(url, token, { method: "PATCH", body: JSON.stringify(campos) }).then(mapLeadRow);
  }
  const stages = await getStages();
  const url = `${base}/api/database/rows/table/${leadsTableId}/?user_field_names=true`;
  return baserowFetch(url, token, {
    method: "POST",
    body: JSON.stringify({ Telefono: tel, Etapa: stages[0]?.nombre || "Nuevo", ...campos }),
  }).then(mapLeadRow);
}

// Guarda el paso del menú (y opcionalmente pausa el bot) de un lead por teléfono.
// Usado por el motor de flujo de WhatsApp (app/api/whatsapp-flow), que solo
// conoce el número, no el id interno del lead.
export async function setLeadFlowState(telefono, { pasoMenu, pausarBot, etapa } = {}) {
  const { token, base, leadsTableId, ok } = crmConfig();
  if (!ok) throw new Error("CRM no está configurado (faltan IDs de tabla).");
  const existing = await findRawLeadByPhone(telefono);
  if (!existing) return null; // el lead debería existir ya (lo crea /api/crm/upsert antes)

  const patch = {};
  if (pasoMenu !== undefined) patch["Paso menu"] = pasoMenu;
  if (pausarBot !== undefined) patch["Pausar bot"] = !!pausarBot;
  // El embudo solo AVANZA automáticamente: no retrocede a etapas anteriores.
  if (etapa !== undefined && etapa) {
    const orden = ["nuevo", "en conversacion", "cotizacion", "negociacion", "confirmar transfer", "vendido"];
    const actual = typeof existing.Etapa === "object" && existing.Etapa ? existing.Etapa.value : existing.Etapa;
    const iActual = orden.indexOf(normalize(actual || ""));
    const iNueva = orden.indexOf(normalize(etapa));
    if (iNueva > iActual) patch.Etapa = etapa;
  }
  if (Object.keys(patch).length === 0) return mapLeadRow(existing);

  const url = `${base}/api/database/rows/table/${leadsTableId}/${existing.id}/?user_field_names=true`;
  return baserowFetch(url, token, { method: "PATCH", body: JSON.stringify(patch) }).then(mapLeadRow);
}

// Mueve todos los leads de una etapa a otra (usado antes de borrar una etapa).
export async function moveLeadsStage(fromNombre, toNombre) {
  const { token, base, leadsTableId, ok } = crmConfig();
  if (!ok) throw new Error("CRM no está configurado (faltan IDs de tabla).");
  const leads = await getLeads();
  const afectados = leads.filter((l) => normalize(l.etapa) === normalize(fromNombre));
  for (const lead of afectados) {
    const url = `${base}/api/database/rows/table/${leadsTableId}/${lead.id}/?user_field_names=true`;
    await baserowFetch(url, token, { method: "PATCH", body: JSON.stringify({ Etapa: toNombre }) });
  }
  return afectados.length;
}

// Acciones de ESCRITURA sobre el inventario (agregar / precio / stock / venta).
// Protegido por ACTION_PASSWORD (clave APARTE de ACCESS_PASSWORD), enviada en
// el header x-action-password. Recibe un payload estructurado en JSON.
import { createRow, updateRow, findRawRowByCode } from "../../../lib/inventory";

export const dynamic = "force-dynamic";

// Mapea las claves del formulario a los nombres EXACTOS de columna (con tildes).
const FIELD_MAP = {
  codigo: "Código",
  categoria: "Categoría",
  marca: "Marca",
  modelo: "Modelo",
  procesador: "Procesador",
  generacion: "Generación",
  ram: "RAM",
  almacenamiento: "Almacenamiento",
  estado: "Estado",
  precio: "Precio",
  stock: "Stock",
  descripcion: "Descripción",
  foto: "Foto",
};

function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? null : n;
}

// Convierte el objeto del formulario a campos de Baserow, con Precio/Stock numéricos.
function buildFields(datos) {
  const out = {};
  for (const [k, col] of Object.entries(FIELD_MAP)) {
    if (datos[k] === undefined || datos[k] === null || datos[k] === "") continue;
    if (k === "precio" || k === "stock") {
      const n = toNumberOrNull(datos[k]);
      if (n !== null) out[col] = n;
    } else {
      out[col] = String(datos[k]).trim();
    }
  }
  return out;
}

function friendlyBaserowError(msg) {
  const m = String(msg || "");
  if (m.includes("401") || m.includes("403")) {
    return "El token de Baserow no tiene permiso de ESCRITURA en esta tabla. Revisa los permisos del token (Create/Update).";
  }
  return m;
}

export async function POST(request) {
  // Clave de acciones — independiente de la de acceso.
  const actionPassword = process.env.ACTION_PASSWORD || process.env.ACCESS_PASSWORD || "cambia-esta-clave";
  const provided = request.headers.get("x-action-password") || "";
  if (provided !== actionPassword) {
    return Response.json({ error: "Clave de acciones incorrecta." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición inválida." }, { status: 400 });
  }

  const tipo = body?.tipo;
  const datos = body?.datos || {};

  try {
    // -------- AGREGAR (POST) --------
    if (tipo === "agregar") {
      const codigo = (datos.codigo ?? "").toString().trim();
      if (!codigo) return Response.json({ error: "El Código es obligatorio." }, { status: 400 });
      const fields = buildFields(datos);
      const created = await createRow(fields);
      return Response.json({ ok: true, mensaje: `Producto ${codigo} agregado.`, row: created });
    }

    // -------- precio / stock / venta (PATCH) --------
    if (tipo === "precio" || tipo === "stock" || tipo === "venta") {
      const codigo = (datos.codigo ?? "").toString().trim();
      if (!codigo) return Response.json({ error: "El Código es obligatorio." }, { status: 400 });

      const raw = await findRawRowByCode(codigo);
      if (!raw) {
        return Response.json({ error: `El código ${codigo} no está en el inventario.` }, { status: 404 });
      }

      let patch;
      let mensaje;
      if (tipo === "precio") {
        const n = toNumberOrNull(datos.precio);
        if (n === null) return Response.json({ error: "Precio inválido." }, { status: 400 });
        patch = { Precio: n };
        mensaje = `Precio de ${codigo} actualizado a $${n.toLocaleString("es-CO")}.`;
      } else if (tipo === "stock") {
        const n = toNumberOrNull(datos.stock);
        if (n === null) return Response.json({ error: "Cantidad de stock inválida." }, { status: 400 });
        patch = { Stock: n };
        mensaje = `Stock de ${codigo} ajustado a ${n}.`;
      } else { // venta -> Stock 0, sin borrar la fila
        patch = { Stock: 0 };
        mensaje = `Venta registrada: ${codigo} queda en Stock 0 (la fila se conserva).`;
      }

      const updated = await updateRow(raw.id, patch);
      return Response.json({ ok: true, mensaje, row: updated });
    }

    return Response.json({ error: "Tipo de acción no reconocido." }, { status: 400 });
  } catch (err) {
    return Response.json({ error: "⚠️ " + friendlyBaserowError(err?.message || err) }, { status: 200 });
  }
}

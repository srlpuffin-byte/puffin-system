import { Router } from "express";
import { db } from "@workspace/db";
import { empleadosTable, jornadasTable, alertasTable, documentosTable, usuariosTable, fotografiasTable } from "@workspace/db";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { updateOrAppendToSheet } from "../services/sheets";

const router = Router();

router.get("/sync-sheet", async (req, res) => {
  const { google } = await import("googleapis");
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) return res.status(500).json({ error: "No credentials" });
  
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheetsClient = google.sheets({ version: "v4", auth });

  const empleados = await db.select().from(empleadosTable).orderBy(empleadosTable.id);

  const headers = ["Nombre", "Apellido", "DNI", "Teléfono", "Cargo", "Fecha Ingreso", "Familiar", "Tel. Familiar", "ID"];
  const rows = empleados.map(e => [
    e.nombre,
    e.apellido,
    e.dni,
    e.telefono || "",
    e.cargo || "",
    e.fecha_ingreso || "",
    e.contacto_familiar_nombre || "",
    e.contacto_familiar_telefono || "",
    e.id
  ]);

  const allData = [headers, ...rows];

  await sheetsClient.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "Empleados!A:Z" });
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "Empleados!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: allData },
  });

  return res.json({ success: true, rowsCount: rows.length });
});

router.get("/", async (req, res) => {
  const { estado, search } = req.query as { estado?: string; search?: string };

  let query = db.select().from(empleadosTable).$dynamic();

  const conditions = [];
  if (estado) conditions.push(eq(empleadosTable.estado, estado));
  if (search) conditions.push(or(
    ilike(empleadosTable.nombre, `%${search}%`),
    ilike(empleadosTable.apellido, `%${search}%`),
    ilike(empleadosTable.dni, `%${search}%`)
  ));

  if (conditions.length) query = query.where(and(...conditions));

  const empleados = await query.orderBy(empleadosTable.apellido);

  const jornadas = await db.select().from(jornadasTable).where(eq(jornadasTable.estado, "en_curso"));
  const jornadaEmpleadoIds = new Set(jornadas.map(j => j.empleado_id));

  const alertasActivas = await db.select({
    empleado_id: alertasTable.entidad_id,
    count: sql<number>`count(*)`.as("count")
  })
    .from(alertasTable)
    .where(and(eq(alertasTable.estado, "activa"), eq(alertasTable.entidad_tipo, "empleado")))
    .groupBy(alertasTable.entidad_id);

  const alertasMap = new Map(alertasActivas.map(a => [a.empleado_id, Number(a.count)]));

  const fotos = await db.select().from(fotografiasTable).where(eq(fotografiasTable.entidad_tipo, "empleado"));
  const fotosMap = new Map<number, string>();
  for (const f of fotos) {
    if (f.descripcion === "Foto de perfil" || f.descripcion?.toLowerCase().includes("perfil")) {
      fotosMap.set(f.entidad_id, f.url);
    }
  }

  return res.json(empleados.map(e => ({
    ...e,
    jornada_activa: jornadaEmpleadoIds.has(e.id),
    alertas_count: alertasMap.get(e.id) || 0,
    foto_perfil: fotosMap.get(e.id) || null,
  })));
});

router.post("/", async (req, res) => {
  const { nombre, apellido, dni, telefono, cargo, fecha_ingreso, contacto_familiar_nombre, contacto_familiar_telefono, contacto_familiar_relacion } = req.body;
  if (!nombre || !apellido || !dni) {
    return res.status(400).json({ error: "Nombre, apellido y DNI son requeridos" });
  }
  const [empleado] = await db.insert(empleadosTable).values({
    nombre, apellido, dni, telefono, cargo, fecha_ingreso, estado: "activo",
    contacto_familiar_nombre, contacto_familiar_telefono, contacto_familiar_relacion,
  }).returning();
  
  await db.insert(documentosTable).values({
    tipo: "Carnet",
    descripcion: "Carnet de operario (Falta cargar)",
    entidad_tipo: "empleado",
    entidad_id: empleado.id,
    fecha_vencimiento: "2000-01-01",
    estado_doc: "vencido"
  });
  
  import("../services/sync-sheets.js").then(({ syncAllSheets }) => {
    syncAllSheets().catch(console.error);
  });
  
  return res.status(201).json({ ...empleado, jornada_activa: false, alertas_count: 0 });
});

import { getEmpleadoIdForUser } from "../lib/auth-helpers";

router.get("/me", async (req, res) => {
  if (req.user?.rol?.toLowerCase() !== "empleado") {
    return res.status(403).json({ error: "No eres un empleado" });
  }
  const empleadoId = await getEmpleadoIdForUser(req.user.id);
  if (empleadoId === -1) {
    return res.status(404).json({ error: "Ficha de operario no encontrada" });
  }
  const [empleado] = await db.select().from(empleadosTable).where(eq(empleadosTable.id, empleadoId)).limit(1);
  if (!empleado) return res.status(404).json({ error: "Operario no encontrado" });
  return res.json({ ...empleado, jornada_activa: false, alertas_count: 0 });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [empleado] = await db.select().from(empleadosTable).where(eq(empleadosTable.id, id)).limit(1);
  if (!empleado) return res.status(404).json({ error: "Operario no encontrado" });
  return res.json({ ...empleado, jornada_activa: false, alertas_count: 0 });
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    
    // RBAC check: Empleados can only update themselves
    if (req.user?.rol?.toLowerCase() === "empleado") {
      const userEmpleadoId = await getEmpleadoIdForUser(req.user.id);
      if (userEmpleadoId !== id) {
        return res.status(403).json({ error: "No tienes permiso para modificar a otro empleado" });
      }
    }

    const [oldEmpleado] = await db.select().from(empleadosTable).where(eq(empleadosTable.id, id)).limit(1);
    if (!oldEmpleado) return res.status(404).json({ error: "Operario no encontrado" });

    const { nombre, apellido, dni, telefono, cargo, estado, fecha_ingreso, contacto_familiar_nombre, contacto_familiar_telefono, contacto_familiar_relacion } = req.body;
    
    const updateData: Record<string, any> = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (apellido !== undefined) updateData.apellido = apellido;
    if (dni !== undefined) updateData.dni = dni;
    if (telefono !== undefined) updateData.telefono = telefono || null;
    if (cargo !== undefined) updateData.cargo = cargo || null;
    if (estado !== undefined) updateData.estado = estado;
    if (fecha_ingreso !== undefined) updateData.fecha_ingreso = fecha_ingreso || null;
    if (contacto_familiar_nombre !== undefined) updateData.contacto_familiar_nombre = contacto_familiar_nombre || null;
    if (contacto_familiar_telefono !== undefined) updateData.contacto_familiar_telefono = contacto_familiar_telefono || null;
    if (contacto_familiar_relacion !== undefined) updateData.contacto_familiar_relacion = contacto_familiar_relacion || null;

    const [empleado] = await db
      .update(empleadosTable)
      .set(updateData)
      .where(eq(empleadosTable.id, id))
      .returning();
    if (!empleado) return res.status(404).json({ error: "Operario no encontrado" });

    // Sync with usuariosTable
    if ((nombre !== undefined && nombre !== oldEmpleado.nombre) || (apellido !== undefined && apellido !== oldEmpleado.apellido)) {
      await db.update(usuariosTable)
        .set({
          nombre: nombre ?? oldEmpleado.nombre,
          apellido: apellido ?? oldEmpleado.apellido
        })
        .where(
          and(
            ilike(usuariosTable.nombre, oldEmpleado.nombre),
            ilike(usuariosTable.apellido, oldEmpleado.apellido)
          )
        );
    }

    import("../services/sync-sheets.js").then(({ syncAllSheets }) => {
      syncAllSheets().catch(console.error);
    });

    return res.json({ ...empleado, jornada_activa: false, alertas_count: 0 });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al actualizar operario: " + (err?.message || "Error interno") });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(empleadosTable).where(eq(empleadosTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Operario no encontrado" });
    return res.json({ message: "Operario eliminado correctamente" });
  } catch (err) {
    return res.status(500).json({ error: "Error al eliminar operario. Puede que tenga datos asociados." });
  }
});

export default router;

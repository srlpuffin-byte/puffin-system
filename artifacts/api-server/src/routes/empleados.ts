import { Router } from "express";
import { db } from "@workspace/db";
import { empleadosTable, jornadasTable, alertasTable, documentosTable } from "@workspace/db";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { updateOrAppendToSheet } from "../services/sheets";

const router = Router();

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

  return res.json(empleados.map(e => ({
    ...e,
    jornada_activa: jornadaEmpleadoIds.has(e.id),
    alertas_count: alertasMap.get(e.id) || 0,
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
  
  // Sincronizar con Google Sheets
  await updateOrAppendToSheet("Empleados", [
    empleado.nombre,
    empleado.apellido,
    empleado.dni,
    empleado.telefono || "",
    empleado.cargo || "",
    empleado.fecha_ingreso || "",
    empleado.contacto_familiar_nombre || "",
    empleado.contacto_familiar_telefono || "",
    empleado.id // Columna I
  ], 8, empleado.id); // index 8 is column I
  
  return res.status(201).json({ ...empleado, jornada_activa: false, alertas_count: 0 });
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

    // Sincronizar con Google Sheets
    await updateOrAppendToSheet("Empleados", [
      empleado.nombre,
      empleado.apellido,
      empleado.dni,
      empleado.telefono || "",
      empleado.cargo || "",
      empleado.fecha_ingreso || "",
      empleado.contacto_familiar_nombre || "",
      empleado.contacto_familiar_telefono || "",
      empleado.id // Columna I
    ], 8, empleado.id);

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

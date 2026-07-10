import { Router } from "express";
import { db } from "@workspace/db";
import { empleadosTable, jornadasTable, alertasTable } from "@workspace/db";
import { eq, and, or, ilike, sql } from "drizzle-orm";

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
  const { nombre, apellido, dni, telefono, cargo, fecha_ingreso, contacto_familiar_nombre, contacto_familiar_telefono } = req.body;
  if (!nombre || !apellido || !dni) {
    return res.status(400).json({ error: "Nombre, apellido y DNI son requeridos" });
  }
  const [empleado] = await db.insert(empleadosTable).values({
    nombre, apellido, dni, telefono, cargo, fecha_ingreso, estado: "activo",
    contacto_familiar_nombre, contacto_familiar_telefono,
  }).returning();
  return res.status(201).json({ ...empleado, jornada_activa: false, alertas_count: 0 });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [empleado] = await db.select().from(empleadosTable).where(eq(empleadosTable.id, id)).limit(1);
  if (!empleado) return res.status(404).json({ error: "Operario no encontrado" });
  return res.json({ ...empleado, jornada_activa: false, alertas_count: 0 });
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { nombre, apellido, telefono, cargo, estado, contacto_familiar_nombre, contacto_familiar_telefono } = req.body;
  const [empleado] = await db
    .update(empleadosTable)
    .set({ nombre, apellido, telefono, cargo, estado, contacto_familiar_nombre, contacto_familiar_telefono, updatedAt: new Date() })
    .where(eq(empleadosTable.id, id))
    .returning();
  if (!empleado) return res.status(404).json({ error: "Operario no encontrado" });
  return res.json({ ...empleado, jornada_activa: false, alertas_count: 0 });
});

export default router;

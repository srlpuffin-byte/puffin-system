import { Router } from "express";
import { db } from "@workspace/db";
import { mantenimientosTable, maquinasTable, actividadTable, empleadosTable } from "@workspace/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { getEmpleadoIdForUser } from "../lib/auth-helpers";
import { sendWhatsAppMessage } from "../services/whatsapp.js";

const router = Router();

router.get("/", async (req, res) => {
  const { maquina_id, tipo } = req.query as Record<string, string>;
  const page  = Math.max(1, parseInt((req.query.page  as string) || "1"));
  const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || "50")));
  const offset = (page - 1) * limit;

  let baseQuery = db.select().from(mantenimientosTable).$dynamic();
  const conditions = [];
  if (maquina_id) conditions.push(eq(mantenimientosTable.maquina_id, parseInt(maquina_id)));
  if (tipo) conditions.push(eq(mantenimientosTable.tipo, tipo));

  // Role-Based Access Control: Empleados solo ven sus propios mantenimientos
  if (req.user?.rol?.toLowerCase() === "empleado") {
    const userEmpleadoId = await getEmpleadoIdForUser(req.user.id);
    conditions.push(eq(mantenimientosTable.empleado_id, userEmpleadoId));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  if (whereClause) baseQuery = baseQuery.where(whereClause);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mantenimientosTable)
    .where(whereClause);

  const mantenimientos = await baseQuery
    .orderBy(desc(mantenimientosTable.fecha), desc(mantenimientosTable.id))
    .limit(limit)
    .offset(offset);

  // Bulk-load empleados y máquinas con inArray — elimina N+1 (antes: 2 queries por registro)
  const maqIds = [...new Set(mantenimientos.map(m => m.maquina_id).filter((id): id is number => !!id))];
  const empIds = [...new Set(mantenimientos.map(m => m.empleado_id).filter((id): id is number => !!id))];

  const [maquinasList, empleadosList] = await Promise.all([
    maqIds.length > 0
      ? db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre })
          .from(maquinasTable).where(inArray(maquinasTable.id, maqIds))
      : [],
    empIds.length > 0
      ? db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
          .from(empleadosTable).where(inArray(empleadosTable.id, empIds))
      : [],
  ]);

  const maqMap = new Map(maquinasList.map(m => [m.id, m.nombre]));
  const empMap = new Map(empleadosList.map(e => [e.id, `${e.nombre} ${e.apellido}`]));

  const data = mantenimientos.map(m => ({
    ...m,
    maquina_nombre: m.maquina_id ? (maqMap.get(m.maquina_id) ?? "Desconocida") : "Desconocida",
    empleado_nombre: m.empleado_id ? (empMap.get(m.empleado_id) ?? null) : null,
    horas: m.horas ? Number(m.horas) : null,
  }));

  return res.json({
    data,
    meta: {
      total,
      page,
      lastPage: Math.ceil(total / limit),
    },
  });
});

router.post("/", async (req, res) => {
  try {
    const { maquina_id, empleado_id, horas, tipo, descripcion, proximo_service } = req.body;
    if (!maquina_id || !tipo) return res.status(400).json({ error: "Máquina y tipo son requeridos" });

    // If employee, always use their own empleado_id regardless of what's sent
    let finalEmpleadoId = empleado_id || null;
    if (req.user?.rol?.toLowerCase() === "empleado") {
      finalEmpleadoId = await getEmpleadoIdForUser(req.user.id);
    }

    const today = new Date().toISOString().split("T")[0];
    const [mantenimiento] = await db.insert(mantenimientosTable).values({
      maquina_id,
      empleado_id: finalEmpleadoId,
      fecha: today,
      horas: horas?.toString(),
      tipo, descripcion, proximo_service,
      estado: "realizado"
    }).returning();

    const [maq] = await db.select({ nombre: maquinasTable.nombre }).from(maquinasTable).where(eq(maquinasTable.id, maquina_id)).limit(1);
    const maquinaNombre = maq?.nombre || `ID ${maquina_id}`;

    await db.insert(actividadTable).values({
      tipo: "mantenimiento",
      descripcion: `Mantenimiento registrado: ${tipo} en la máquina ${maquinaNombre}`,
      entidad_tipo: "mantenimiento",
      entidad_id: mantenimiento.id,
    });

    const msj = `🔧 *Nuevo Mantenimiento Registrado*\nMáquina: ${maquinaNombre}\nTipo: ${tipo}\nDescripción: ${descripcion || "Sin descripción"}\nFecha: ${today}`;
    sendWhatsAppMessage("3572400877", msj).catch(e => console.error("Error mandando WA de mantenimiento", e));

    return res.status(201).json({ ...mantenimiento, maquina_nombre: "Maquinaria", horas: mantenimiento.horas ? Number(mantenimiento.horas) : null });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al registrar mantenimiento: " + (err?.message || "Error interno") });
  }
});

router.patch("/:id/estado", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const { estado } = req.body;
    if (!estado) return res.status(400).json({ error: "Estado es requerido" });

    const [mantenimiento] = await db
      .update(mantenimientosTable)
      .set({ estado })
      .where(eq(mantenimientosTable.id, id))
      .returning();

    if (!mantenimiento) return res.status(404).json({ error: "Mantenimiento no encontrado" });

    return res.json({ ...mantenimiento, horas: mantenimiento.horas ? Number(mantenimiento.horas) : null });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al actualizar estado: " + (err?.message || "Error interno") });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const { maquina_id, horas, tipo, descripcion, proximo_service } = req.body;
    
    if (!maquina_id || !tipo) return res.status(400).json({ error: "Máquina y tipo son requeridos" });

    const [mantenimiento] = await db
      .update(mantenimientosTable)
      .set({
        maquina_id,
        horas: horas?.toString(),
        tipo,
        descripcion,
        proximo_service
      })
      .where(eq(mantenimientosTable.id, id))
      .returning();

    if (!mantenimiento) return res.status(404).json({ error: "Mantenimiento no encontrado" });

    const [maquina] = await db.select({ nombre: maquinasTable.nombre }).from(maquinasTable).where(eq(maquinasTable.id, maquina_id)).limit(1);

    return res.json({ ...mantenimiento, maquina_nombre: maquina?.nombre || "Maquinaria", horas: mantenimiento.horas ? Number(mantenimiento.horas) : null });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al actualizar mantenimiento: " + (err?.message || "Error interno") });
  }
});

export default router;

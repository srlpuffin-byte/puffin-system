import { Router } from "express";
import { db } from "@workspace/db";
import { mantenimientosTable, maquinasTable, actividadTable, empleadosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getEmpleadoIdForUser } from "../lib/auth-helpers";

const router = Router();

router.get("/", async (req, res) => {
  const { maquina_id, tipo } = req.query as Record<string, string>;
  let query = db.select().from(mantenimientosTable).$dynamic();
  const conditions = [];
  if (maquina_id) conditions.push(eq(mantenimientosTable.maquina_id, parseInt(maquina_id)));
  if (tipo) conditions.push(eq(mantenimientosTable.tipo, tipo));

  // Role-Based Access Control: Empleados solo ven sus propios mantenimientos
  if (req.user?.rol?.toLowerCase() === "empleado") {
    const userEmpleadoId = await getEmpleadoIdForUser(req.user.id);
    conditions.push(eq(mantenimientosTable.empleado_id, userEmpleadoId));
  }

  if (conditions.length) query = query.where(and(...conditions));

  const mantenimientos = await query.orderBy(mantenimientosTable.fecha);
  const enriched = await Promise.all(mantenimientos.map(async m => {
    const [maquina] = await db.select({ nombre: maquinasTable.nombre })
      .from(maquinasTable).where(eq(maquinasTable.id, m.maquina_id)).limit(1);
    let empleado_nombre = null;
    if (m.empleado_id) {
      const [e] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
        .from(empleadosTable).where(eq(empleadosTable.id, m.empleado_id)).limit(1);
      if (e) empleado_nombre = `${e.nombre} ${e.apellido}`;
    }
    return {
      ...m,
      maquina_nombre: maquina?.nombre || "Desconocida",
      empleado_nombre,
      horas: m.horas ? Number(m.horas) : null,
    };
  }));
  return res.json(enriched.reverse());
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

    await db.insert(actividadTable).values({
      tipo: "mantenimiento",
      descripcion: `Mantenimiento registrado: ${tipo} en máquina ID ${maquina_id}`,
      entidad_tipo: "mantenimiento",
      entidad_id: mantenimiento.id,
    });

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

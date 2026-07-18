import { Router } from "express";
import { db } from "@workspace/db";
import { mantenimientosTable, maquinasTable, actividadTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { maquina_id, tipo } = req.query as Record<string, string>;
  let query = db.select().from(mantenimientosTable).$dynamic();
  const conditions = [];
  if (maquina_id) conditions.push(eq(mantenimientosTable.maquina_id, parseInt(maquina_id)));
  if (tipo) conditions.push(eq(mantenimientosTable.tipo, tipo));
  if (conditions.length) query = query.where(and(...conditions));

  const mantenimientos = await query.orderBy(mantenimientosTable.fecha);
  const enriched = await Promise.all(mantenimientos.map(async m => {
    const [maquina] = await db.select({ nombre: maquinasTable.nombre })
      .from(maquinasTable).where(eq(maquinasTable.id, m.maquina_id)).limit(1);
    return {
      ...m,
      maquina_nombre: maquina?.nombre || "Desconocida",
      horas: m.horas ? Number(m.horas) : null,
    };
  }));
  return res.json(enriched.reverse());
});

router.post("/", async (req, res) => {
  try {
    const { maquina_id, horas, tipo, descripcion, proximo_service } = req.body;
    if (!maquina_id || !tipo) return res.status(400).json({ error: "Máquina y tipo son requeridos" });

    const today = new Date().toISOString().split("T")[0];
    const [mantenimiento] = await db.insert(mantenimientosTable).values({
      maquina_id, fecha: today,
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

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
});

export default router;

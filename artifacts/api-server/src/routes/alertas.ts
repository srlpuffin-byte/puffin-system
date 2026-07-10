import { Router } from "express";
import { db } from "@workspace/db";
import { alertasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { prioridad, estado } = req.query as Record<string, string>;
  let query = db.select().from(alertasTable).$dynamic();
  const conditions = [];
  if (prioridad) conditions.push(eq(alertasTable.prioridad, prioridad));
  if (estado) conditions.push(eq(alertasTable.estado, estado));
  if (conditions.length) query = query.where(and(...conditions));
  const alertas = await query.orderBy(alertasTable.fecha);
  return res.json(alertas.map(a => ({
    ...a,
    fecha: a.fecha?.toISOString() || new Date().toISOString(),
  })).reverse());
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { estado } = req.body;
  const [alerta] = await db
    .update(alertasTable)
    .set({ estado, updatedAt: new Date() })
    .where(eq(alertasTable.id, id))
    .returning();
  if (!alerta) return res.status(404).json({ error: "Alerta no encontrada" });
  return res.json({ ...alerta, fecha: alerta.fecha?.toISOString() || new Date().toISOString() });
});

router.post("/", async (req, res) => {
  const { tipo, prioridad, descripcion, entidad_tipo, entidad_id, entidad_nombre } = req.body;
  if (!tipo || !descripcion) {
    return res.status(400).json({ error: "Tipo y descripción son requeridos" });
  }

  const [alerta] = await db
    .insert(alertasTable)
    .values({
      tipo,
      prioridad: prioridad || "azul",
      descripcion,
      estado: "activa",
      entidad_tipo,
      entidad_id,
      entidad_nombre,
      fecha: new Date(),
    })
    .returning();

  return res.status(201).json({
    ...alerta,
    fecha: alerta.fecha?.toISOString() || new Date().toISOString()
  });
});

export default router;

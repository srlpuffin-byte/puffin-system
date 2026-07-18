import { Router } from "express";
import { db } from "@workspace/db";
import { fotografiasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { uploadImage } from "../services/storage";

const router = Router();

router.get("/", async (req, res) => {
  const { entidad_tipo, entidad_id } = req.query as Record<string, string>;
  let query = db.select().from(fotografiasTable).$dynamic();
  
  const conditions = [];
  if (entidad_tipo) conditions.push(eq(fotografiasTable.entidad_tipo, entidad_tipo));
  if (entidad_id) conditions.push(eq(fotografiasTable.entidad_id, parseInt(entidad_id)));
  
  if (conditions.length) {
    query = query.where(and(...conditions));
  }
  
  const fotos = await query.orderBy(fotografiasTable.createdAt);
  return res.json(fotos);
});

router.post("/", async (req, res) => {
  const { entidad_tipo, entidad_id, filename, base64Data, descripcion } = req.body;

  if (!entidad_tipo || !entidad_id || !base64Data) {
    return res.status(400).json({ error: "entidad_tipo, entidad_id y base64Data son requeridos" });
  }

  try {
    const url = await uploadImage(filename || `foto_${Date.now()}.jpg`, base64Data);

    const [foto] = await db.insert(fotografiasTable).values({
      empresa_id: 1, // Por ahora harcodeado a 1, igual que en el resto del sistema
      entidad_tipo,
      entidad_id: parseInt(entidad_id),
      url,
      descripcion: descripcion || null,
    }).returning();

    return res.status(201).json(foto);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al subir la fotografía" });
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.delete(fotografiasTable).where(eq(fotografiasTable.id, parseInt(id)));
    return res.status(204).send();
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al eliminar la fotografía" });
  }
});

export default router;

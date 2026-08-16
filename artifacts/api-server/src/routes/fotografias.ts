import { Router } from "express";
import { db } from "@workspace/db";
import { fotografiasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { uploadImage } from "../services/storage";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/:id/raw", async (req, res) => {
  const { id } = req.params;
  try {
    const [foto] = await db.select().from(fotografiasTable).where(eq(fotografiasTable.id, parseInt(id))).limit(1);
    if (!foto || !foto.url) return res.status(404).send("Foto no encontrada");

    if (foto.url.startsWith("data:image/")) {
      const match = foto.url.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (match) {
        const mime = `image/${match[1]}`;
        const buffer = Buffer.from(match[2], "base64");
        res.setHeader("Content-Type", mime);
        res.setHeader("Cache-Control", "public, max-age=86400, immutable");
        return res.send(buffer);
      }
    }
    return res.redirect(foto.url);
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).send("Error al obtener la imagen");
  }
});

// Autenticación requerida para los endpoints a partir de acá (CRUD)
router.use(requireAuth);

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [foto] = await db.select().from(fotografiasTable).where(eq(fotografiasTable.id, parseInt(id))).limit(1);
    if (!foto) return res.status(404).json({ error: "Foto no encontrada" });
    return res.json(foto);
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al obtener la fotografía" });
  }
});

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

router.patch("/:id/set-main", async (req, res) => {
  const { id } = req.params;
  try {
    const foto = await db.select().from(fotografiasTable).where(eq(fotografiasTable.id, parseInt(id))).limit(1);
    if (!foto.length) return res.status(404).json({ error: "Fotografía no encontrada" });
    
    const oldest = await db.select({ date: fotografiasTable.createdAt }).from(fotografiasTable)
      .where(and(eq(fotografiasTable.entidad_tipo, foto[0].entidad_tipo), eq(fotografiasTable.entidad_id, foto[0].entidad_id)))
      .orderBy(fotografiasTable.createdAt).limit(1);
      
    let newDate = new Date();
    if (oldest.length && oldest[0].date) {
      newDate = new Date(oldest[0].date.getTime() - 10000); // 10 seconds older than the oldest
    } else {
      newDate = new Date(0);
    }
    
    await db.update(fotografiasTable).set({ createdAt: newDate }).where(eq(fotografiasTable.id, parseInt(id)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al establecer como principal" });
  }
});

export default router;

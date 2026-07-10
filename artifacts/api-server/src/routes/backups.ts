import { Router } from "express";
import { db } from "@workspace/db";
import { backupsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth";

export const backupsRouter = Router();

backupsRouter.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const lista = await db
      .select()
      .from(backupsTable)
      .orderBy(desc(backupsTable.createdAt))
      .limit(50);
    res.json(lista);
  } catch (error) {
    console.error("Error fetching backups:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

backupsRouter.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Aquí iría la lógica real de pg_dump o exportación
    // Por ahora simulamos la creación de un backup manual
    const [nuevoBackup] = await db
      .insert(backupsTable)
      .values({
        tipo: "manual",
        archivo_url: "https://ejemplo.com/storage/backup_manual_" + Date.now() + ".sql",
        tamano_bytes: 1024 * 1024 * 5, // 5MB simulado
        creado_por: req.user?.id,
        exitoso: true
      })
      .returning();

    res.status(201).json(nuevoBackup);
  } catch (error) {
    console.error("Error creating backup:", error);
    res.status(500).json({ error: "Error al crear backup" });
  }
});

import { Router } from "express";
import { db } from "@workspace/db";
import { auditoriaTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

export const auditoriaRouter = Router();

auditoriaRouter.get("/", requireAuth, async (req, res) => {
  try {
    const { entidad, accion } = req.query;
    
    let conditions = [];
    if (entidad && typeof entidad === "string") {
      conditions.push(eq(auditoriaTable.entidad, entidad));
    }
    if (accion && typeof accion === "string") {
      conditions.push(eq(auditoriaTable.accion, accion));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const historial = await db
      .select()
      .from(auditoriaTable)
      .where(whereClause)
      .orderBy(desc(auditoriaTable.createdAt))
      .limit(100);

    res.json(historial);
  } catch (error) {
    console.error("Error fetching auditoria:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

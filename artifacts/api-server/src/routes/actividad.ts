import { Router } from "express";
import { db } from "@workspace/db";
import { actividadTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const limit = parseInt((req.query.limit as string) || "50");
  const actividad = await db
    .select()
    .from(actividadTable)
    .orderBy(sql`${actividadTable.fecha} desc`)
    .limit(Math.min(limit, 100));

  return res.json(actividad.map(a => ({
    ...a,
    fecha: a.fecha?.toISOString() || new Date().toISOString(),
  })));
});

export default router;

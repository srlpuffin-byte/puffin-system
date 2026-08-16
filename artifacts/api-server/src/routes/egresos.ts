import { Router } from "express";
import { db } from "@workspace/db";
import { egresosTable } from "@workspace/db/schema";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";
import { syncAllSheets } from "../services/sync-sheets.js";

const router = Router();

router.get("/sync-sheet", async (req, res) => {
  try {
    await syncAllSheets();
    return res.json({ success: true, message: "Sync completado" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  const { categoria, centro_costos, proveedor, search, metodo_pago } = req.query as Record<string, string>;
  const page  = Math.max(1, parseInt((req.query.page  as string) || "1"));
  const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || "50")));
  const offset = (page - 1) * limit;

  let baseQuery = db.select().from(egresosTable).$dynamic();
  
  const conditions = [];
  if (categoria) conditions.push(eq(egresosTable.categoria, categoria));
  if (centro_costos) conditions.push(eq(egresosTable.centro_costos, centro_costos));
  if (proveedor) conditions.push(eq(egresosTable.proveedor, proveedor));
  if (metodo_pago) conditions.push(eq(egresosTable.metodo_pago, metodo_pago));
  
  if (search) {
    conditions.push(
      or(
        ilike(egresosTable.concepto, `%${search}%`),
        ilike(egresosTable.proveedor, `%${search}%`),
        ilike(egresosTable.centro_costos, `%${search}%`)
      )
    );
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  if (whereClause) baseQuery = baseQuery.where(whereClause);

  const [{ total, suma }] = await db
    .select({ 
      total: sql<number>`count(*)::int`,
      suma: sql<string>`coalesce(sum(${egresosTable.monto}), 0)::numeric`
    })
    .from(egresosTable)
    .where(whereClause);

  const egresos = await baseQuery
    .orderBy(desc(egresosTable.fecha), desc(egresosTable.id))
    .limit(limit)
    .offset(offset);
  
  return res.json({
    data: egresos.map(e => ({ ...e, monto: Number(e.monto) })),
    meta: {
      total,
      page,
      lastPage: Math.ceil(total / limit),
      total_suma: Number(suma) || 0,
    },
  });
});

router.post("/", async (req, res) => {
  const { fecha, categoria, concepto, proveedor, monto, metodo_pago, comprobante, centro_costos, observaciones } = req.body;
  if (!fecha || !categoria || !concepto || monto === undefined) {
    return res.status(400).json({ error: "Campos requeridos faltantes" });
  }

  const [egreso] = await db.insert(egresosTable).values({
    fecha, categoria, concepto, proveedor, monto: monto.toString(), 
    metodo_pago, comprobante: comprobante || false, 
    centro_costos, observaciones
  }).returning();

  syncAllSheets().catch(console.error);

  return res.status(201).json({ ...egreso, monto: Number(egreso.monto) });
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

  const { fecha, categoria, concepto, proveedor, monto, metodo_pago, comprobante, centro_costos, observaciones } = req.body;
  
  const updateData: Record<string, any> = {};
  if (fecha !== undefined) updateData.fecha = fecha;
  if (categoria !== undefined) updateData.categoria = categoria;
  if (concepto !== undefined) updateData.concepto = concepto;
  if (proveedor !== undefined) updateData.proveedor = proveedor;
  if (monto !== undefined) updateData.monto = monto.toString();
  if (metodo_pago !== undefined) updateData.metodo_pago = metodo_pago;
  if (comprobante !== undefined) updateData.comprobante = comprobante;
  if (centro_costos !== undefined) updateData.centro_costos = centro_costos;
  if (observaciones !== undefined) updateData.observaciones = observaciones;

  const [egreso] = await db.update(egresosTable).set(updateData).where(eq(egresosTable.id, id)).returning();
  if (!egreso) return res.status(404).json({ error: "Egreso no encontrado" });

  syncAllSheets().catch(console.error);

  return res.json({ ...egreso, monto: Number(egreso.monto) });
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

  const [deleted] = await db.delete(egresosTable).where(eq(egresosTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Egreso no encontrado" });

  syncAllSheets().catch(console.error);

  return res.json({ success: true, id });
});

export default router;

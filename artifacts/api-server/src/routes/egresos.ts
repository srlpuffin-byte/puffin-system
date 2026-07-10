import { Router } from "express";
import { db } from "@workspace/db";
import { egresosTable } from "@workspace/db/schema";
import { eq, and, or, ilike, desc } from "drizzle-orm";
import { appendToSheet } from "../services/sheets.js";

const router = Router();

router.get("/", async (req, res) => {
  const { categoria, centro_costos, proveedor, search } = req.query as Record<string, string>;
  let query = db.select().from(egresosTable).$dynamic();
  
  const conditions = [];
  if (categoria) conditions.push(eq(egresosTable.categoria, categoria));
  if (centro_costos) conditions.push(eq(egresosTable.centro_costos, centro_costos));
  if (proveedor) conditions.push(eq(egresosTable.proveedor, proveedor));
  
  if (search) {
    conditions.push(
      or(
        ilike(egresosTable.concepto, `%${search}%`),
        ilike(egresosTable.proveedor, `%${search}%`),
        ilike(egresosTable.centro_costos, `%${search}%`)
      )
    );
  }

  if (conditions.length) query = query.where(and(...conditions));

  const egresos = await query.orderBy(desc(egresosTable.fecha));
  
  // Transform numeric fields
  return res.json(egresos.map(e => ({
    ...e,
    monto: Number(e.monto)
  })));
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

  // Async append to Google Sheets
  appendToSheet("Egresos", [
    egreso.id,
    egreso.fecha,
    egreso.categoria,
    egreso.concepto,
    egreso.proveedor || "",
    Number(egreso.monto),
    egreso.metodo_pago || "",
    egreso.comprobante ? "SI" : "NO",
    egreso.centro_costos || "",
    egreso.observaciones || ""
  ]);

  return res.status(201).json({ ...egreso, monto: Number(egreso.monto) });
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { egresosTable } from "@workspace/db/schema";
import { eq, and, or, ilike, desc } from "drizzle-orm";
import { appendToSheet } from "../services/sheets.js";

const router = Router();

router.get("/sync-sheet", async (req, res) => {
  const { google } = await import("googleapis");
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) return res.status(500).json({ error: "No credentials" });
  
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheetsClient = google.sheets({ version: "v4", auth });

  const egresos = await db.select().from(egresosTable).orderBy(desc(egresosTable.fecha));

  const headers = [
    "ID", "Fecha", "Categoría", "Concepto", "Proveedor", "Monto", 
    "Método de Pago", "Comprobante", "Proyecto", "Observaciones"
  ];

  const rows = egresos.map(e => [
    e.id, e.fecha, e.categoria, e.concepto, e.proveedor || "", 
    Number(e.monto), e.metodo_pago || "", e.comprobante ? "SI" : "NO",
    e.centro_costos || "", e.observaciones || ""
  ]);

  const allData = [headers, ...rows];

  await sheetsClient.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "Egresos!A:Z" });
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "Egresos!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: allData },
  });

  return res.json({ success: true, rowsCount: rows.length });
});

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

  import("../services/sheets.js").then(({ updateOrAppendToSheet }) => {
    updateOrAppendToSheet("Egresos", [
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
    ], 0, egreso.id).catch(console.error);
  });

  return res.json({ ...egreso, monto: Number(egreso.monto) });
});

export default router;

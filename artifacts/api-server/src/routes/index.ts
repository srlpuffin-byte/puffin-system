import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import empleadosRouter from "./empleados";
import maquinasRouter from "./maquinas";
import jornadasRouter from "./jornadas";
import combustibleRouter from "./combustible";
import mantenimientosRouter from "./mantenimientos";
import documentosRouter from "./documentos";
import alertasRouter from "./alertas";
import incidentesRouter from "./incidentes";
import actividadRouter from "./actividad";
import calendarioRouter from "./calendario";
import reportesRouter from "./reportes";
import usuariosRouter from "./usuarios";
import productividadRouter from "./productividad";
import iaRouter from "./ia";
import { auditoriaRouter } from "./auditoria";
import { backupsRouter } from "./backups";
import { integrationsRouter } from "./integrations";
import fotografiasRouter from "./fotografias";
import egresosRouter from "./egresos";
import searchRouter from "./search";
import cierresRouter from "./cierres";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

import { google } from "googleapis";
import { db } from "@workspace/db";
import { egresosTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";

router.get("/sync-egresos-sheet", async (req, res) => {
  try {
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
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.use(healthRouter);
router.use("/auth", authRouter);
// Integraciones can sometimes be called by webhooks, but we should secure it if it's internal.
// For now, let's leave it without requireAuth if it acts as a webhook receiver, or with it if it's UI driven.
// Assuming it's UI driven:
router.use("/integrations", requireAuth, integrationsRouter);

import proyectosRouter from "./proyectos";

// Protected routes
router.use("/dashboard", requireAuth, dashboardRouter);
router.use("/empleados", requireAuth, empleadosRouter);
router.use("/maquinas", requireAuth, maquinasRouter);
router.use("/jornadas", requireAuth, jornadasRouter);
router.use("/combustible", requireAuth, combustibleRouter);
router.use("/mantenimientos", requireAuth, mantenimientosRouter);
router.use("/documentos", requireAuth, documentosRouter);
router.use("/alertas", requireAuth, alertasRouter);
router.use("/incidentes", requireAuth, incidentesRouter);
router.use("/actividad", requireAuth, actividadRouter);
router.use("/calendario", requireAuth, calendarioRouter);
router.use("/reportes", requireAuth, reportesRouter);
router.use("/usuarios", requireAuth, usuariosRouter);
router.use("/productividad", requireAuth, productividadRouter);
router.use("/ia", requireAuth, iaRouter);
router.use("/auditoria", requireAuth, auditoriaRouter);
router.use("/backups", requireAuth, backupsRouter);
router.use("/fotografias", requireAuth, fotografiasRouter);
router.use("/egresos", requireAuth, egresosRouter);
router.use("/search", requireAuth, searchRouter);
router.use("/cierres", requireAuth, cierresRouter);
router.use("/proyectos", requireAuth, proyectosRouter);

export default router;

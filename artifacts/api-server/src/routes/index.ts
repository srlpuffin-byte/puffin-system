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
import { adminAuditMiddleware } from "../middleware/audit";

const router: IRouter = Router();

import { google } from "googleapis";
import { db } from "@workspace/db";
import { egresosTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";

router.get("/sync-egresos-sheet", async (req, res) => {
  try {
    const { syncAllSheets } = await import("../services/sync-sheets.js");
    await syncAllSheets();
    return res.json({ success: true, message: "Sync completado" });
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
router.use("/dashboard", requireAuth, adminAuditMiddleware, dashboardRouter);
router.use("/empleados", requireAuth, adminAuditMiddleware, empleadosRouter);
router.use("/maquinas", requireAuth, adminAuditMiddleware, maquinasRouter);
router.use("/jornadas", requireAuth, adminAuditMiddleware, jornadasRouter);
router.use("/combustible", requireAuth, adminAuditMiddleware, combustibleRouter);
router.use("/mantenimientos", requireAuth, adminAuditMiddleware, mantenimientosRouter);
router.use("/documentos", requireAuth, adminAuditMiddleware, documentosRouter);
router.use("/alertas", requireAuth, adminAuditMiddleware, alertasRouter);
router.use("/incidentes", requireAuth, adminAuditMiddleware, incidentesRouter);
router.use("/actividad", requireAuth, adminAuditMiddleware, actividadRouter);
router.use("/calendario", requireAuth, adminAuditMiddleware, calendarioRouter);
router.use("/reportes", requireAuth, adminAuditMiddleware, reportesRouter);
router.use("/usuarios", requireAuth, adminAuditMiddleware, usuariosRouter);
router.use("/productividad", requireAuth, adminAuditMiddleware, productividadRouter);
router.use("/ia", requireAuth, adminAuditMiddleware, iaRouter);
router.use("/auditoria", requireAuth, adminAuditMiddleware, auditoriaRouter);
router.use("/backups", requireAuth, adminAuditMiddleware, backupsRouter);
router.use("/fotografias", requireAuth, adminAuditMiddleware, fotografiasRouter);
router.use("/egresos", requireAuth, adminAuditMiddleware, egresosRouter);
router.use("/search", requireAuth, adminAuditMiddleware, searchRouter);
router.use("/cierres", requireAuth, adminAuditMiddleware, cierresRouter);
router.use("/proyectos", requireAuth, adminAuditMiddleware, proyectosRouter);

export default router;

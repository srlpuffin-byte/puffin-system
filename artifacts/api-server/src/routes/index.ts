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
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
// Integraciones can sometimes be called by webhooks, but we should secure it if it's internal.
// For now, let's leave it without requireAuth if it acts as a webhook receiver, or with it if it's UI driven.
// Assuming it's UI driven:
router.use("/integrations", requireAuth, integrationsRouter);

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

export default router;

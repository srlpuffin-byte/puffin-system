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

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/dashboard", dashboardRouter);
router.use("/empleados", empleadosRouter);
router.use("/maquinas", maquinasRouter);
router.use("/jornadas", jornadasRouter);
router.use("/combustible", combustibleRouter);
router.use("/mantenimientos", mantenimientosRouter);
router.use("/documentos", documentosRouter);
router.use("/alertas", alertasRouter);
router.use("/incidentes", incidentesRouter);
router.use("/actividad", actividadRouter);
router.use("/calendario", calendarioRouter);
router.use("/reportes", reportesRouter);

export default router;

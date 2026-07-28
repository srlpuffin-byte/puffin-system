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

router.get("/cleanup-empleados", async (req, res) => {
  try {
    const { empleadosTable, fotografiasTable, jornadasTable, documentosTable, alertasTable } = await import("@workspace/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { syncAllSheets } = await import("../services/sync-sheets.js");

    const empList = await db.select().from(empleadosTable);
    const fotosList = await db.select().from(fotografiasTable).where(eq(fotografiasTable.entidad_tipo, "empleado"));
    
    // Agrupar por nombre y apellido
    const grupos: Record<string, typeof empList> = {};
    for (const emp of empList) {
      const key = `${(emp.nombre || "").trim().toLowerCase()}|||${(emp.apellido || "").trim().toLowerCase()}`;
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(emp);
    }

    const paraEliminar: number[] = [];
    const logs: string[] = [];

    const FAKE_DNIS = ["12345678", "23456789", "34567890", "45678901", "99999999", "00000000", "11111111", ""];

    for (const [key, emps] of Object.entries(grupos)) {
      if (emps.length > 1) {
        const scored = emps.map(emp => {
          let score = 0;
          const fotos = fotosList.filter(f => f.entidad_id === emp.id);
          
          if (fotos.length > 0) score += 1000;
          
          const dni = (emp.dni || "").trim();
          const dniEsFalso = FAKE_DNIS.includes(dni) || dni.length < 7 || /^(\d)\1+$/.test(dni);
          if (!dniEsFalso) score += 200;
          else score -= 500;

          if (emp.cargo) score += 20;
          if (emp.telefono_whatsapp) score += 20;
          if (emp.fecha_ingreso) score += 15;
          if (emp.email) score += 10;
          if (emp.contacto_emergencia_nombre) score += 10;
          
          return { emp, score, fotos: fotos.length };
        });

        scored.sort((a, b) => b.score - a.score);

        const mejor = scored[0];
        logs.push(`CONSERVAR: ID=${mejor.emp.id} | DNI=${mejor.emp.dni} | Fotos=${mejor.fotos} | Score=${mejor.score}`);

        for (let i = 1; i < scored.length; i++) {
          const otro = scored[i];
          logs.push(`ELIMINAR: ID=${otro.emp.id} | DNI=${otro.emp.dni} | Fotos=${otro.fotos} | Score=${otro.score}`);
          paraEliminar.push(otro.emp.id);
        }
      }
    }

    if (req.query.execute === "true") {
      for (const id of paraEliminar) {
        await db.delete(jornadasTable).where(eq(jornadasTable.empleado_id, id));
        await db.delete(fotografiasTable).where(and(eq(fotografiasTable.entidad_id, id), eq(fotografiasTable.entidad_tipo, "empleado")));
        await db.delete(documentosTable).where(and(eq(documentosTable.entidad_id, id), eq(documentosTable.entidad_tipo, "empleado")));
        await db.delete(alertasTable).where(and(eq(alertasTable.entidad_id, id), eq(alertasTable.entidad_tipo, "empleado")));
        await db.delete(empleadosTable).where(eq(empleadosTable.id, id));
      }
      if (paraEliminar.length > 0) {
        await syncAllSheets();
      }
      return res.json({ success: true, message: `Eliminados ${paraEliminar.length} duplicados y sincronizado con Google Sheets.`, logs });
    } else {
      return res.json({ success: true, message: `Modo simulación. Se eliminarían ${paraEliminar.length} duplicados. Para ejecutar, añade ?execute=true`, logs });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
});

router.use(healthRouter);
router.use("/auth", authRouter);
import { whatsappRouter } from "./whatsapp";
import { cronRouter } from "./cron";

router.use("/webhook/whatsapp", whatsappRouter);
router.use("/cron", cronRouter);
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

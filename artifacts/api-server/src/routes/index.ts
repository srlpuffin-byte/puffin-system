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
import alquileresRouter from "./alquileres";
import { requireAuth } from "../middleware/auth";
import { adminAuditMiddleware } from "../middleware/audit";

const router: IRouter = Router();

import { google } from "googleapis";
import { db } from "@workspace/db";
import { egresosTable } from "@workspace/db/schema";
import { desc, ilike, eq, or } from "drizzle-orm";

router.get("/sync-egresos-sheet", async (req, res) => {
  try {
    const { syncAllSheets } = await import("../services/sync-sheets.js");
    await syncAllSheets();
    return res.json({ success: true, message: "Sync completado" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/clear-history", async (req, res) => {
  try {
    const pg = await import("pg");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query("UPDATE whatsapp_sesiones SET messages = '[]'::jsonb");
    await pool.end();
    return res.json({ success: true, message: "Historial limpiado correctamente mediante raw query." });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/debug-fotos", async (req, res) => {
  try {
    const { fotografiasTable } = await import("@workspace/db/schema");
    const { desc } = await import("drizzle-orm");
    const fotosList = await db.select({
      id: fotografiasTable.id,
      entidad_tipo: fotografiasTable.entidad_tipo,
      entidad_id: fotografiasTable.entidad_id,
      descripcion: fotografiasTable.descripcion,
      createdAt: fotografiasTable.createdAt
    }).from(fotografiasTable).orderBy(desc(fotografiasTable.id)).limit(15);
    return res.json(fotosList);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/fix-comprobante-ronco", async (req, res) => {
  try {
    const result = await fixComprobanteRonco();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export async function fixComprobanteRonco() {
  const { egresosTable, fotografiasTable } = await import("@workspace/db/schema");
  const { eq, ilike, and, desc, or, inArray } = await import("drizzle-orm");

  // 1. Buscar egreso #237 (Ronco)
  const [ronco] = await db.select().from(egresosTable).where(eq(egresosTable.id, 237)).limit(1);
  if (!ronco) {
    return { success: false, error: "No se encontró el egreso #237" };
  }

  // 2. Buscar egreso Gelso
  const [gelso] = await db.select().from(egresosTable)
    .where(ilike(egresosTable.concepto, "%Gelso%"))
    .orderBy(desc(egresosTable.id))
    .limit(1);

  const desgloseTexto = "Desglose: Viaje grillo $67.400 | Cubierta 1 $26.000 | Cubierta 2 $60.000";
  let nuevaObs = ronco.observaciones || "";
  if (!nuevaObs.includes("Desglose:")) {
    nuevaObs = nuevaObs ? `${desgloseTexto} | ${nuevaObs}` : desgloseTexto;
  }

  // 3. Actualizar Ronco #237 con el desglose y marcar comprobante = true
  await db.update(egresosTable).set({
    observaciones: nuevaObs,
    comprobante: true
  }).where(eq(egresosTable.id, 237));

  let fotoMovida = false;
  let fotoIdReasignada: number | null = null;

  // Buscar si la foto está asociada a Gelso o fue la última foto creada
  if (gelso) {
    const fotosGelso = await db.select().from(fotografiasTable)
      .where(and(
        inArray(fotografiasTable.entidad_tipo, ["egreso", "egresos"]),
        eq(fotografiasTable.entidad_id, gelso.id)
      ))
      .orderBy(desc(fotografiasTable.id));
    
    if (fotosGelso.length > 0) {
      const targetFoto = fotosGelso[0];
      await db.update(fotografiasTable).set({
        entidad_tipo: "egreso",
        entidad_id: 237,
        descripcion: "Comprobante de Ronco gastos reasignado"
      }).where(eq(fotografiasTable.id, targetFoto.id));
      fotoMovida = true;
      fotoIdReasignada = targetFoto.id;
    }

    // Actualizar comprobante de Gelso
    const fotosRestantes = await db.select().from(fotografiasTable)
      .where(and(
        inArray(fotografiasTable.entidad_tipo, ["egreso", "egresos"]),
        eq(fotografiasTable.entidad_id, gelso.id)
      ));
    await db.update(egresosTable).set({
      comprobante: fotosRestantes.length > 0
    }).where(eq(egresosTable.id, gelso.id));
  }

  // Si aún no se encontró la foto pero hay fotos recientes huérfanas o en otro egreso
  if (!fotoMovida) {
    const [fotoRoncoExistente] = await db.select().from(fotografiasTable)
      .where(and(
        inArray(fotografiasTable.entidad_tipo, ["egreso", "egresos"]),
        eq(fotografiasTable.entidad_id, 237)
      ))
      .limit(1);

    if (fotoRoncoExistente) {
      fotoMovida = true;
      fotoIdReasignada = fotoRoncoExistente.id;
    } else {
      // Tomar la última foto subida en fotografiasTable de tipo egreso si fue en las últimas 24h
      const ultimasFotos = await db.select().from(fotografiasTable)
        .where(inArray(fotografiasTable.entidad_tipo, ["egreso", "egresos"]))
        .orderBy(desc(fotografiasTable.id))
        .limit(1);
      if (ultimasFotos.length > 0) {
        const uFoto = ultimasFotos[0];
        await db.update(fotografiasTable).set({
          entidad_tipo: "egreso",
          entidad_id: 237,
          descripcion: "Comprobante de Ronco gastos reasignado"
        }).where(eq(fotografiasTable.id, uFoto.id));
        fotoMovida = true;
        fotoIdReasignada = uFoto.id;
      }
    }
  }

  // Sincronizar Google Sheets
  try {
    const { syncAllSheets } = await import("../services/sync-sheets.js");
    await syncAllSheets();
  } catch (_) {}

  return {
    success: true,
    message: "Egreso #237 corregido exitosamente con desglose y comprobante.",
    ronco: { id: 237, observaciones: nuevaObs, comprobante: true },
    gelsoId: gelso?.id,
    fotoMovida,
    fotoIdReasignada
  };
}

// DEBUG TEMPORAL - REMOVER DESPUÉS
router.get("/debug-proyectos-map", async (req, res) => {
  try {
    const { proyectosTable } = await import("@workspace/db/schema");
    const proyectos = await db.select({ 
      id: proyectosTable.id, 
      lugar: proyectosTable.lugar, 
      maquinas_asignadas: proyectosTable.maquinas_asignadas 
    }).from(proyectosTable);

    const mapEntries: any[] = [];
    proyectos.forEach((p: any) => {
      if (p.maquinas_asignadas && Array.isArray(p.maquinas_asignadas)) {
        p.maquinas_asignadas.forEach((mId: any) => {
          mapEntries.push({ 
            proyectoId: p.id, 
            lugar: p.lugar, 
            maquinaIdRaw: mId, 
            maquinaIdType: typeof mId, 
            maquinaIdAsNumber: Number(mId) 
          });
        });
      }
    });

    return res.json({ 
      totalProyectos: proyectos.length,
      proyectos: proyectos.map((p: any) => ({
        id: p.id,
        lugar: p.lugar,
        maquinas_asignadas: p.maquinas_asignadas,
        type: typeof p.maquinas_asignadas,
        isArray: Array.isArray(p.maquinas_asignadas),
        length: Array.isArray(p.maquinas_asignadas) ? p.maquinas_asignadas.length : 0
      })),
      mapEntries 
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
});

router.use(healthRouter);
router.use("/auth", authRouter);
import { whatsappRouter } from "./whatsapp";
import { cronRouter } from "./cron";
import satelitalRouter from "./satelital";

router.use("/webhook/whatsapp", whatsappRouter);
router.use("/webhook/satelital", satelitalRouter);
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
router.use("/fotografias", fotografiasRouter);
router.use("/egresos", requireAuth, adminAuditMiddleware, egresosRouter);
router.use("/search", requireAuth, adminAuditMiddleware, searchRouter);
router.use("/cierres", requireAuth, adminAuditMiddleware, cierresRouter);
router.use("/alquileres", requireAuth, adminAuditMiddleware, alquileresRouter);

import whatsappChatsRouter from "./whatsapp-chats";
router.use("/whatsapp-chats", requireAuth, adminAuditMiddleware, whatsappChatsRouter);

export default router;

import express, { type Express } from "express";
import path from "path";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { deduplicatePOSTs } from "./middlewares/deduplicate";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(deduplicatePOSTs);
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Servir archivos subidos de forma estática
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
app.use("/uploads", express.static(UPLOADS_DIR));

import { db } from "@workspace/db";
import { empleadosTable, maquinasTable, proyectosTable, egresosTable, jornadasTable, combustibleTable, mantenimientosTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";
import { syncAllSheets } from "./services/sync-sheets.js";

app.get("/api/cleanup-dups", async (req, res) => {
  if (req.query.secret !== "puffin123") return res.status(403).send("No autorizado");
  try {
    let eliminados = 0;
    const stats: any = {};

    const eg = await db.select().from(egresosTable);
    const egMap = new Map();
    const egRem = [];
    for (const e of eg) {
      const key = `${e.fecha}_${e.categoria}_${e.concepto}_${e.monto}`;
      if (egMap.has(key)) egRem.push(e.id);
      else egMap.set(key, e.id);
    }
    if (egRem.length > 0) {
      await db.delete(egresosTable).where(inArray(egresosTable.id, egRem));
      stats.egresos = egRem.length; eliminados += egRem.length;
    }

    const emp = await db.select().from(empleadosTable);
    const empMap = new Map();
    const empRem = [];
    const sEmp = [...emp].sort((a, b) => Object.values(b).filter(v => !!v).length - Object.values(a).filter(v => !!v).length);
    for (const e of sEmp) {
      const key = e.dni ? e.dni : `${e.nombre.toLowerCase()}_${e.apellido.toLowerCase()}`;
      if (empMap.has(key)) empRem.push(e.id);
      else empMap.set(key, e.id);
    }
    if (empRem.length > 0) {
      await db.delete(empleadosTable).where(inArray(empleadosTable.id, empRem));
      stats.empleados = empRem.length; eliminados += empRem.length;
    }

    const p = await db.select().from(proyectosTable);
    const pMap = new Map();
    const pRem = [];
    for (const x of p) {
      const key = x.lugar.toLowerCase().trim();
      if (pMap.has(key)) pRem.push(x.id);
      else pMap.set(key, x.id);
    }
    if (pRem.length > 0) {
      await db.delete(proyectosTable).where(inArray(proyectosTable.id, pRem));
      stats.proyectos = pRem.length; eliminados += pRem.length;
    }
    
    const m = await db.select().from(maquinasTable);
    const mMap = new Map();
    const mRem = [];
    for (const x of m) {
      const key = x.nombre.toLowerCase().trim();
      if (mMap.has(key)) mRem.push(x.id);
      else mMap.set(key, x.id);
    }
    if (mRem.length > 0) {
      await db.delete(maquinasTable).where(inArray(maquinasTable.id, mRem));
      stats.maquinas = mRem.length; eliminados += mRem.length;
    }

    const j = await db.select().from(jornadasTable);
    const jMap = new Map();
    const jRem = [];
    for (const x of j) {
      const key = `${x.empleado_id}_${x.fecha}_${x.nombre_obra}`;
      if (jMap.has(key)) jRem.push(x.id);
      else jMap.set(key, x.id);
    }
    if (jRem.length > 0) {
      await db.delete(jornadasTable).where(inArray(jornadasTable.id, jRem));
      stats.jornadas = jRem.length; eliminados += jRem.length;
    }

    const c = await db.select().from(combustibleTable);
    const cMap = new Map();
    const cRem = [];
    for (const x of c) {
      const key = `${x.maquina_id}_${x.empleado_id}_${x.litros}_${x.fecha}`;
      if (cMap.has(key)) cRem.push(x.id);
      else cMap.set(key, x.id);
    }
    if (cRem.length > 0) {
      await db.delete(combustibleTable).where(inArray(combustibleTable.id, cRem));
      stats.combustible = cRem.length; eliminados += cRem.length;
    }

    const mant = await db.select().from(mantenimientosTable);
    const mantMap = new Map();
    const mantRem = [];
    for (const x of mant) {
      const key = `${x.maquina_id}_${x.tipo}_${x.fecha}`;
      if (mantMap.has(key)) mantRem.push(x.id);
      else mantMap.set(key, x.id);
    }
    if (mantRem.length > 0) {
      await db.delete(mantenimientosTable).where(inArray(mantenimientosTable.id, mantRem));
      stats.mantenimientos = mantRem.length; eliminados += mantRem.length;
    }

    if (eliminados > 0) {
      await syncAllSheets();
    }

    return res.json({ message: "Limpieza finalizada", totalEliminados: eliminados, stats });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.use("/api", router);

// Global Error Handler para asegurar respuestas JSON (Express 5 pasa los errores acá automáticamente)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Error interno del servidor",
    details: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
});

export default app;

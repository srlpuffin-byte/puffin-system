import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import * as schemas from "@workspace/db";
import { eq } from "drizzle-orm";
import { appendToSheet } from "../services/sheets.js";
import { logger } from "../lib/logger.js";

const sectionToTableMap: Record<string, any> = {
  maquinas: schemas.maquinasTable,
  empleados: schemas.empleadosTable,
  jornadas: schemas.jornadasTable,
  combustible: schemas.combustibleTable,
  mantenimientos: schemas.mantenimientosTable,
  documentos: schemas.documentosTable,
  alertas: schemas.alertasTable,
  incidentes: schemas.incidentesTable,
  actividad: schemas.actividadTable,
  usuarios: schemas.usuariosTable,
  proyectos: schemas.proyectosTable,
  fotografias: schemas.fotografiasTable,
  egresos: schemas.egresosTable,
};

function formatTimestamp(): string {
  const date = new Date();
  date.setHours(date.getHours() - 3); // Ajuste a horario Argentina (UTC-3)
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

export async function adminAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  // Solo auditar métodos que modifican estado
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  // Solo auditar si es admin (requiere que requireAuth haya poblado req.user)
  if (!req.user || req.user.rol !== "admin") {
    return next();
  }

  const urlMatch = req.originalUrl.match(/^\/api\/([a-zA-Z_-]+)(?:\/(\d+))?/);
  if (!urlMatch) {
    return next();
  }

  const section = urlMatch[1];
  const id = urlMatch[2] ? parseInt(urlMatch[2], 10) : null;
  const table = sectionToTableMap[section];

  // Si es un update o delete, buscar el registro anterior
  if (table && id && (req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE")) {
    try {
      const result = await db.select().from(table).where(eq(table.id, id)).limit(1);
      if (result.length > 0) {
        res.locals.oldRecord = result[0];
      }
    } catch (err) {
      logger.error({ err, section, id }, "Error fetching old record for audit");
    }
  }

  // Buscar el nombre del administrador para que el mensaje sea amigable
  let adminName = `Admin (ID: ${req.user.id})`;
  try {
    const userResult = await db.select().from(schemas.usuariosTable).where(eq(schemas.usuariosTable.id, req.user.id)).limit(1);
    if (userResult.length > 0) {
      adminName = `${userResult[0].nombre} ${userResult[0].apellido}`.trim();
    }
  } catch (err) {
    // ignorar y usar ID
  }

  // Interceptar la finalización de la respuesta
  res.on("finish", async () => {
    // Solo registrar si la solicitud fue exitosa
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const timestamp = formatTimestamp();
      let accion = "Modificó";
      if (req.method === "POST") accion = "Agregó";
      if (req.method === "DELETE") accion = "Eliminó";

      let detalles = "";

      if (req.method === "DELETE") {
        detalles = `Eliminó el registro ID: ${id || 'N/A'}`;
        if (res.locals.oldRecord?.nombre) detalles += ` (${res.locals.oldRecord.nombre})`;
      } else if (req.method === "POST") {
        detalles = `Payload: ${JSON.stringify(req.body)}`;
      } else if ((req.method === "PUT" || req.method === "PATCH") && res.locals.oldRecord) {
        // Comparar cambios (Diff)
        const oldRecord = res.locals.oldRecord;
        const newRecord = req.body;
        const changes: string[] = [];

        for (const key of Object.keys(newRecord)) {
          // ignorar campos que no suelen ser significativos en diffs simples o que son objetos complejos
          if (newRecord[key] !== undefined && String(oldRecord[key]) !== String(newRecord[key])) {
            changes.push(`Cambió "${key}" de "${oldRecord[key]}" a "${newRecord[key]}"`);
          }
        }

        if (changes.length > 0) {
          detalles = `ID Modificado: ${id}. ` + changes.join(" | ");
        } else {
          detalles = `ID Modificado: ${id}. Sin cambios detectables.`;
        }
      } else {
        detalles = `Método: ${req.method}, ID: ${id || 'N/A'}`;
      }

      // Limitar el tamaño de detalles por si es un payload gigante (ej. base64 fotos)
      if (detalles.length > 1000) {
        detalles = detalles.substring(0, 997) + "...";
      }

      // Enviar a Google Sheets y también guardar en auditoriaTable
      try {
        await Promise.all([
          appendToSheet("Auditoria_Admin", [timestamp, adminName, accion, section, detalles]),
          db.insert(schemas.auditoriaTable).values({
            usuario_id: req.user.id,
            accion: req.method === "DELETE" ? "ELIMINACION" : req.method === "POST" ? "CREACION" : "MODIFICACION",
            entidad: section,
            entidad_id: id,
            valor_anterior: res.locals.oldRecord || null,
            valor_nuevo: req.method !== "DELETE" ? req.body : null,
          })
        ]);
      } catch (err) {
        logger.error({ err }, "Error saving audit logs");
      }
    }
  });

  next();
}

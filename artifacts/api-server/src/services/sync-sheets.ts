import { google } from "googleapis";
import { db } from "@workspace/db";
import { maquinasTable, empleadosTable, proyectosTable, egresosTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";

async function appendMissing(sheetsClient: any, SHEET_ID: string, tabName: string, idColIndex: number, dbRecords: any[], mapRow: (record: any) => any[]) {
  try {
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A:Z`,
    });
    
    const rows = response.data.values || [];
    const existingIds = new Set(rows.map((r: any[]) => r[idColIndex] ? r[idColIndex].toString() : ""));
    
    const missing = dbRecords.filter(r => !existingIds.has(r.id.toString()));
    
    if (missing.length === 0) return;
    
    const missingData = missing.map(mapRow);
    
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: missingData }
    });
    
    logger.info(`Appended ${missing.length} missing rows to ${tabName}`);
  } catch (error: any) {
    logger.error(`Error appending missing to ${tabName}: ${error?.message}`);
  }
}

export async function syncAllSheets() {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) return;

  try {
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const sheetsClient = google.sheets({ version: "v4", auth });

    // 1. Egresos
    const egresos = await db.select().from(egresosTable).orderBy(desc(egresosTable.fecha));
    await appendMissing(sheetsClient, SHEET_ID, "Egresos", 0, egresos, e => [
      e.id, e.fecha, e.categoria, e.concepto, e.proveedor || "", Number(e.monto), e.metodo_pago || "", e.comprobante ? "SI" : "NO", e.centro_costos || "", e.observaciones || ""
    ]);

    // 2. Maquinarias
    const maquinas = await db.select().from(maquinasTable).orderBy(maquinasTable.id);
    await appendMissing(sheetsClient, SHEET_ID, "Maquinarias", 0, maquinas, m => [
      m.id, m.categoria === "inventario" ? "Inventario" : "Maquinaria", m.nombre, m.tipo, m.marca || "", m.modelo || "", m.patente || m.dominio || "", m.estado || ""
    ]);

    // 3. Empleados
    const empleados = await db.select().from(empleadosTable).orderBy(empleadosTable.id);
    // Empleados id is on column I (index 8)
    await appendMissing(sheetsClient, SHEET_ID, "Empleados", 8, empleados, e => [
      e.nombre, e.apellido, e.dni, e.telefono || "", e.cargo || "", e.fecha_ingreso || "", e.contacto_familiar_nombre || "", e.contacto_familiar_telefono || "", e.id
    ]);

    // 4. Proyectos
    const proyectos = await db.select().from(proyectosTable).orderBy(proyectosTable.id);
    await appendMissing(sheetsClient, SHEET_ID, "Proyectos", 0, proyectos, p => [
      p.id, p.lugar, p.hectareas, p.precio_hectarea, p.ganancia_estimada, Array.isArray(p.empleados_asignados) ? p.empleados_asignados.join(", ") : "", Array.isArray(p.maquinas_asignadas) ? p.maquinas_asignadas.join(", ") : "", p.estado || "activo"
    ]);

    logger.info("Automatic Google Sheets Sync (Append Missing Only) Completed.");
  } catch (error: any) {
    logger.error("Error during automatic Google Sheets sync: " + error?.message);
  }
}

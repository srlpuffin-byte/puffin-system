import { google } from "googleapis";
import { db } from "@workspace/db";
import { maquinasTable, empleadosTable, proyectosTable, egresosTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export async function syncAllSheets() {
  return; // Disabled auto-sync so it doesn't prevent manual writing in Sheets
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) return;

  try {
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const sheetsClient = google.sheets({ version: "v4", auth });

    // 1. Egresos
    const egresos = await db.select().from(egresosTable).orderBy(desc(egresosTable.fecha));
    const egresosData = [
      ["ID", "Fecha", "Categoría", "Concepto", "Proveedor", "Monto", "Método de Pago", "Comprobante", "Proyecto", "Observaciones"],
      ...egresos.map(e => [e.id, e.fecha, e.categoria, e.concepto, e.proveedor || "", Number(e.monto), e.metodo_pago || "", e.comprobante ? "SI" : "NO", e.centro_costos || "", e.observaciones || ""])
    ];
    await sheetsClient.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "Egresos!A:Z" });
    await sheetsClient.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: "Egresos!A1", valueInputOption: "USER_ENTERED", requestBody: { values: egresosData } });

    // 2. Maquinarias
    const maquinas = await db.select().from(maquinasTable).orderBy(maquinasTable.id);
    const maquinasData = [
      ["ID", "Categoría", "Nombre", "Tipo", "Marca", "Modelo", "Patente/Dominio", "Estado"],
      ...maquinas.map(m => [m.id, m.categoria === "inventario" ? "Inventario" : "Maquinaria", m.nombre, m.tipo, m.marca || "", m.modelo || "", m.patente || m.dominio || "", m.estado || ""])
    ];
    await sheetsClient.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "Maquinarias!A:Z" });
    await sheetsClient.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: "Maquinarias!A1", valueInputOption: "USER_ENTERED", requestBody: { values: maquinasData } });

    // 3. Empleados
    const empleados = await db.select().from(empleadosTable).orderBy(empleadosTable.id);
    const empleadosData = [
      ["Nombre", "Apellido", "DNI", "Teléfono", "Cargo", "Fecha Ingreso", "Familiar", "Tel. Familiar", "ID"],
      ...empleados.map(e => [e.nombre, e.apellido, e.dni, e.telefono || "", e.cargo || "", e.fecha_ingreso || "", e.contacto_familiar_nombre || "", e.contacto_familiar_telefono || "", e.id])
    ];
    await sheetsClient.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "Empleados!A:Z" });
    await sheetsClient.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: "Empleados!A1", valueInputOption: "USER_ENTERED", requestBody: { values: empleadosData } });

    // 4. Proyectos
    const proyectos = await db.select().from(proyectosTable).orderBy(proyectosTable.id);
    const proyectosData = [
      ["ID", "Lugar", "Hectáreas", "Precio x Hectárea", "Ganancia Estimada", "Empleados Asignados", "Máquinas Asignadas", "Estado"],
      ...proyectos.map(p => [p.id, p.lugar, p.hectareas, p.precio_hectarea, p.ganancia_estimada, Array.isArray(p.empleados_asignados) ? p.empleados_asignados.join(", ") : "", Array.isArray(p.maquinas_asignadas) ? p.maquinas_asignadas.join(", ") : "", p.estado || "activo"])
    ];
    await sheetsClient.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "Proyectos!A:Z" });
    await sheetsClient.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: "Proyectos!A1", valueInputOption: "USER_ENTERED", requestBody: { values: proyectosData } });

    logger.info("Automatic Google Sheets Full Sync Completed.");
  } catch (error: any) {
    logger.error("Error during automatic Google Sheets sync: " + error?.message);
  }
}

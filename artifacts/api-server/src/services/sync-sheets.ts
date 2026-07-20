import { google } from "googleapis";
import { db } from "@workspace/db";
import { maquinasTable, empleadosTable, proyectosTable, egresosTable, jornadasTable, combustibleTable, mantenimientosTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";

async function syncTableToSheet(sheetsClient: any, SHEET_ID: string, tabName: string, idColIndex: number, dbRecords: any[], mapRow: (record: any) => any[]) {
  try {
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A:Z`,
    });
    
    const rows = response.data.values || [];
    const existingIds = new Map();
    for (let i = 0; i < rows.length; i++) {
      const idVal = rows[i][idColIndex];
      if (idVal) existingIds.set(idVal.toString(), i + 1); // 1-indexed row number in Google Sheets
    }
    
    const updates: any[] = [];
    const missing: any[] = [];
    
    for (const record of dbRecords) {
      const rowData = mapRow(record);
      const idStr = record.id.toString();
      if (existingIds.has(idStr)) {
        const rowNum = existingIds.get(idStr);
        updates.push({
          range: `${tabName}!A${rowNum}`,
          values: [rowData]
        });
      } else {
        missing.push(rowData);
      }
    }
    
    if (updates.length > 0) {
      await sheetsClient.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: updates
        }
      });
      logger.info(`Updated ${updates.length} existing rows in ${tabName}`);
    }
    
    if (missing.length > 0) {
      await sheetsClient.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${tabName}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: missing }
      });
      logger.info(`Appended ${missing.length} missing rows to ${tabName}`);
    }
  } catch (error: any) {
    logger.error(`Error syncing table to ${tabName}: ${error?.message}`);
  }
}

export async function syncAllSheets() {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || !SHEET_ID) return;

  try {
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const sheetsClient = google.sheets({ version: "v4", auth });

    // 1. Egresos
    const egresos = await db.select().from(egresosTable).orderBy(desc(egresosTable.fecha));
    await syncTableToSheet(sheetsClient, SHEET_ID, "Egresos", 0, egresos, e => [
      e.id, e.fecha, e.categoria, e.concepto, e.proveedor || "", Number(e.monto), e.metodo_pago || "", e.comprobante ? "SI" : "NO", e.centro_costos || "", e.observaciones || ""
    ]);

    // 2. Maquinarias
    const maquinas = await db.select().from(maquinasTable).orderBy(maquinasTable.id);
    await syncTableToSheet(sheetsClient, SHEET_ID, "Maquinarias", 0, maquinas, m => [
      m.id, m.categoria === "inventario" ? "Inventario" : "Maquinaria", m.nombre, m.tipo, m.marca || "", m.modelo || "", m.patente || m.dominio || "", m.estado || ""
    ]);

    // 3. Empleados
    const empleados = await db.select().from(empleadosTable).orderBy(empleadosTable.id);
    // Empleados id is on column I (index 8)
    await syncTableToSheet(sheetsClient, SHEET_ID, "Empleados", 8, empleados, e => [
      e.nombre, e.apellido, e.dni, e.telefono || "", e.cargo || "", e.fecha_ingreso || "", e.contacto_familiar_nombre || "", e.contacto_familiar_telefono || "", e.id
    ]);

    // 4. Proyectos
    const proyectos = await db.select().from(proyectosTable).orderBy(proyectosTable.id);
    const empleadosList = await db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido }).from(empleadosTable);
    const maquinasList = await db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre }).from(maquinasTable);
    
    await syncTableToSheet(sheetsClient, SHEET_ID, "Proyectos", 0, proyectos, p => {
      const empNames = (Array.isArray(p.empleados_asignados) ? p.empleados_asignados : [])
        .map(id => {
          const emp = empleadosList.find(e => e.id === id);
          return emp ? `${emp.nombre} ${emp.apellido}`.trim() : `ID:${id}`;
        }).join(", ");
        
      const maqNames = (Array.isArray(p.maquinas_asignadas) ? p.maquinas_asignadas : [])
        .map(id => {
          const maq = maquinasList.find(m => m.id === id);
          return maq ? maq.nombre : `ID:${id}`;
        }).join(", ");

      return [
        p.id, 
        p.lugar, 
        p.hectareas, 
        p.precio_hectarea, 
        p.ganancia_estimada, 
        "", // F
        "", // G
        p.estado || "activo", // H
        "", // I
        empNames, // J (operarios)
        maqNames  // K (maquina)
      ];
    });

    // 5. Jornadas
    const jornadas = await db.select().from(jornadasTable).orderBy(jornadasTable.id);
    await syncTableToSheet(sheetsClient, SHEET_ID, "Jornadas", 0, jornadas, j => {
      const emp = empleadosList.find(e => e.id === j.empleado_id);
      const maq = maquinasList.find(m => m.id === j.maquina_id);
      return [
        j.id,
        emp ? `${emp.nombre} ${emp.apellido}`.trim() : `ID:${j.empleado_id}`,
        maq ? maq.nombre : `ID:${j.maquina_id}`,
        j.fecha,
        j.nombre_obra || j.ubicacion || "",
        j.tipo_trabajo || "",
        `${j.hora_inicio || ""} - ${j.hora_fin || ""}`,
        j.estado || ""
      ];
    });

    // 6. Combustible
    const combustible = await db.select().from(combustibleTable).orderBy(combustibleTable.id);
    await syncTableToSheet(sheetsClient, SHEET_ID, "Combustible", 0, combustible, c => {
      const emp = empleadosList.find(e => e.id === c.empleado_id);
      const maq = maquinasList.find(m => m.id === c.maquina_id);
      return [
        c.id,
        emp ? `${emp.nombre} ${emp.apellido}`.trim() : `ID:${c.empleado_id}`,
        maq ? maq.nombre : `ID:${c.maquina_id}`,
        c.fecha,
        c.litros,
        c.importe || "",
        c.estacion || "",
        c.kilometraje || ""
      ];
    });

    // 7. Mantenimientos
    const mantenimientos = await db.select().from(mantenimientosTable).orderBy(mantenimientosTable.id);
    await syncTableToSheet(sheetsClient, SHEET_ID, "Mantenimientos", 0, mantenimientos, m => {
      const emp = empleadosList.find(e => e.id === m.empleado_id);
      const maq = maquinasList.find(maq => maq.id === m.maquina_id);
      return [
        m.id,
        maq ? maq.nombre : `ID:${m.maquina_id}`,
        emp ? `${emp.nombre} ${emp.apellido}`.trim() : (m.empleado_id ? `ID:${m.empleado_id}` : ""),
        m.fecha,
        m.horas || "",
        m.tipo,
        m.descripcion || "",
        m.proximo_service || ""
      ];
    });

    logger.info("Automatic Google Sheets Sync (Smart Update/Append) Completed.");
  } catch (error: any) {
    logger.error("Error during automatic Google Sheets sync: " + error?.message);
  }
}

import { Router } from "express";
import { db } from "@workspace/db";
import { backupsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth";

export const backupsRouter = Router();

backupsRouter.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const lista = await db
      .select()
      .from(backupsTable)
      .orderBy(desc(backupsTable.createdAt))
      .limit(50);
    res.json(lista);
  } catch (error) {
    console.error("Error fetching backups:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

backupsRouter.get("/export", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      usuariosTable,
      empleadosTable,
      maquinasTable,
      proyectosTable,
      egresosTable,
      combustibleTable,
      jornadasTable,
      alquileresTable,
      mantenimientosTable,
      incidentesTable,
      alertasTable,
      documentosTable,
    } = await import("@workspace/db/schema");

    const [
      usuarios,
      empleados,
      maquinas,
      proyectos,
      egresos,
      combustible,
      jornadas,
      alquileres,
      mantenimientos,
      incidentes,
      alertas,
      documentos,
    ] = await Promise.all([
      db.select({ id: usuariosTable.id, usuario: usuariosTable.usuario, rol: usuariosTable.rol, bloqueado: usuariosTable.bloqueado }).from(usuariosTable),
      db.select().from(empleadosTable),
      db.select().from(maquinasTable),
      db.select().from(proyectosTable),
      db.select().from(egresosTable),
      db.select().from(combustibleTable),
      db.select().from(jornadasTable),
      db.select().from(alquileresTable),
      db.select().from(mantenimientosTable),
      db.select().from(incidentesTable),
      db.select().from(alertasTable),
      db.select().from(documentosTable),
    ]);

    const backupData = {
      version: "1.0",
      fecha_exportacion: new Date().toISOString(),
      generado_por_usuario_id: req.user?.id,
      tablas: {
        usuarios,
        empleados,
        maquinas,
        proyectos,
        egresos,
        combustible,
        jornadas,
        alquileres,
        mantenimientos,
        incidentes,
        alertas,
        documentos,
      },
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const filename = `backup_puffin_${new Date().toISOString().split("T")[0]}_${Date.now()}.json`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    return res.send(jsonStr);
  } catch (error: any) {
    console.error("Error exportando backup:", error);
    return res.status(500).json({ error: "Error al exportar base de datos: " + error.message });
  }
});

backupsRouter.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { maquinasTable, empleadosTable, egresosTable } = await import("@workspace/db/schema");
    const [maqCount, empCount, egresosCount] = await Promise.all([
      db.select().from(maquinasTable),
      db.select().from(empleadosTable),
      db.select().from(egresosTable),
    ]);

    const totalRecords = maqCount.length + empCount.length + egresosCount.length;
    const approxBytes = totalRecords * 350; // Estimación realista

    const [nuevoBackup] = await db
      .insert(backupsTable)
      .values({
        tipo: "manual",
        archivo_url: "/api/backups/export",
        tamano_bytes: approxBytes,
        creado_por: req.user?.id,
        exitoso: true,
      })
      .returning();

    return res.status(201).json(nuevoBackup);
  } catch (error: any) {
    console.error("Error creating backup:", error);
    return res.status(500).json({ error: "Error al crear backup: " + error.message });
  }
});

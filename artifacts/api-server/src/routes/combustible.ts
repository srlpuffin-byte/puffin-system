import { Router } from "express";
import { db } from "@workspace/db";
import { combustibleTable, empleadosTable, maquinasTable, actividadTable, fotografiasTable } from "@workspace/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { syncAllSheets } from "../services/sync-sheets.js";

const router = Router();

import { getEmpleadoIdForUser } from "../lib/auth-helpers";

router.get("/", async (req, res) => {
  const { maquina_id, empleado_id } = req.query as Record<string, string>;
  const page  = Math.max(1, parseInt((req.query.page  as string) || "1"));
  const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || "50")));
  const offset = (page - 1) * limit;
  
  const conditions = [];
  if (maquina_id) conditions.push(eq(combustibleTable.maquina_id, parseInt(maquina_id)));
  if (empleado_id) conditions.push(eq(combustibleTable.empleado_id, parseInt(empleado_id)));

  if (req.user?.rol?.toLowerCase() === "empleado") {
    const userEmpleadoId = await getEmpleadoIdForUser(req.user.id);
    conditions.push(eq(combustibleTable.empleado_id, userEmpleadoId));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(combustibleTable)
    .where(whereClause);

  const registros = await db.select({
    id: combustibleTable.id,
    empresa_id: combustibleTable.empresa_id,
    maquina_id: combustibleTable.maquina_id,
    empleado_id: combustibleTable.empleado_id,
    fecha: combustibleTable.fecha,
    litros: combustibleTable.litros,
    precio: combustibleTable.precio,
    importe: combustibleTable.importe,
    estacion: combustibleTable.estacion,
    ubicacion: combustibleTable.ubicacion,
    kilometraje: combustibleTable.kilometraje,
    estado: combustibleTable.estado,
    createdAt: combustibleTable.createdAt,
    empleado_nombre: sql<string>`concat(${empleadosTable.nombre}, ' ', ${empleadosTable.apellido})`,
    maquina_nombre: maquinasTable.nombre,
    foto_id: fotografiasTable.id,
  })
  .from(combustibleTable)
  .leftJoin(empleadosTable, eq(combustibleTable.empleado_id, empleadosTable.id))
  .leftJoin(maquinasTable, eq(combustibleTable.maquina_id, maquinasTable.id))
  .leftJoin(fotografiasTable, and(
    eq(fotografiasTable.entidad_id, combustibleTable.id),
    eq(fotografiasTable.entidad_tipo, "combustible")
  ))
  .where(whereClause)
  .orderBy(desc(combustibleTable.fecha), desc(combustibleTable.id))
  .limit(limit)
  .offset(offset);

  const data = registros.map(r => ({
    ...r,
    empleado_nombre: r.empleado_nombre || "Desconocido",
    maquina_nombre: r.maquina_nombre || "Desconocida",
    litros: Number(r.litros),
    precio: r.precio ? Number(r.precio) : null,
    importe: r.importe ? Number(r.importe) : null,
    kilometraje: r.kilometraje ? Number(r.kilometraje) : null,
    foto_url: r.foto_id ? `/api/fotografias/${r.foto_id}/raw` : null,
  }));

  return res.json({
    data,
    meta: {
      total,
      page,
      lastPage: Math.ceil(total / limit),
    },
  });
});

router.post("/", async (req, res) => {
  try {
    const { maquina_id, empleado_id, litros, precio, importe, estacion, kilometraje, ubicacion } = req.body;
    if (!maquina_id || !empleado_id || litros === undefined) {
      return res.status(400).json({ error: "Campos requeridos faltantes" });
    }

    const today = new Date().toISOString().split("T")[0];

    const [registro] = await db.insert(combustibleTable).values({
      maquina_id, empleado_id,
      fecha: today,
      litros: litros.toString(),
      precio: precio?.toString(),
      importe: importe?.toString(),
      estacion, ubicacion,
      kilometraje: kilometraje?.toString(),
    }).returning();

    const [maq] = await db.select({ nombre: maquinasTable.nombre }).from(maquinasTable).where(eq(maquinasTable.id, maquina_id)).limit(1);
    const maquinaNombre = maq?.nombre || `ID ${maquina_id}`;

    await db.insert(actividadTable).values({
      tipo: "combustible",
      descripcion: `Carga de combustible: ${litros}L en la máquina ${maquinaNombre}`,
      entidad_tipo: "combustible",
      entidad_id: registro.id,
    });

    // Async full sync to Google Sheets
    syncAllSheets().catch(() => {});

    return res.status(201).json({ ...registro, litros: Number(registro.litros) });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al registrar combustible: " + (err?.message || "Error interno") });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { maquina_id, empleado_id, litros, precio, importe, estacion, kilometraje, ubicacion } = req.body;
    
    // Role-Based Access Control
    if (req.user?.rol?.toLowerCase() === "empleado") {
      const userEmpleadoId = await getEmpleadoIdForUser(req.user.id);
      if (empleado_id && parseInt(empleado_id) !== userEmpleadoId) {
        return res.status(403).json({ error: "No autorizado para modificar registros de otros empleados" });
      }
    }

    const [updated] = await db.update(combustibleTable)
      .set({
        ...(maquina_id && { maquina_id: parseInt(maquina_id) }),
        ...(empleado_id && { empleado_id: parseInt(empleado_id) }),
        ...(litros !== undefined && { litros: litros.toString() }),
        ...(precio !== undefined && { precio: precio?.toString() }),
        ...(importe !== undefined && { importe: importe?.toString() }),
        ...(estacion !== undefined && { estacion }),
        ...(ubicacion !== undefined && { ubicacion }),
        ...(kilometraje !== undefined && { kilometraje: kilometraje?.toString() }),
      })
      .where(eq(combustibleTable.id, parseInt(id)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Registro no encontrado" });

    syncAllSheets().catch(() => {});

    return res.json({ ...updated, litros: Number(updated.litros) });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al actualizar registro: " + (err?.message || "Error interno") });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user?.rol?.toLowerCase() === "empleado") {
      return res.status(403).json({ error: "Los operarios no pueden eliminar registros" });
    }

    const [deleted] = await db.delete(combustibleTable).where(eq(combustibleTable.id, parseInt(id))).returning();
    if (!deleted) return res.status(404).json({ error: "Registro no encontrado" });

    syncAllSheets().catch(() => {});

    return res.json({ message: "Registro eliminado correctamente" });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al eliminar registro: " + (err?.message || "Error interno") });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { combustibleTable, empleadosTable, maquinasTable, actividadTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { appendToSheet } from "../services/sheets.js";

const router = Router();

import { getEmpleadoIdForUser } from "../lib/auth-helpers";

router.get("/", async (req, res) => {
  const { maquina_id, empleado_id } = req.query as Record<string, string>;
  let query = db.select().from(combustibleTable).$dynamic();
  const conditions = [];
  
  if (maquina_id) conditions.push(eq(combustibleTable.maquina_id, parseInt(maquina_id)));
  if (empleado_id) conditions.push(eq(combustibleTable.empleado_id, parseInt(empleado_id)));

  // Role-Based Access Control: Empleados solo ven sus propios reportes de combustible
  if (req.user?.rol?.toLowerCase() === "empleado") {
    const userEmpleadoId = await getEmpleadoIdForUser(req.user.id);
    conditions.push(eq(combustibleTable.empleado_id, userEmpleadoId));
  }

  if (conditions.length) query = query.where(and(...conditions));

  const registros = await query.orderBy(combustibleTable.fecha);
  const { fotografiasTable } = await import("@workspace/db/schema");
  const fotografias = await db.select().from(fotografiasTable).where(eq(fotografiasTable.entidad_tipo, "combustible"));

  const enriched = await Promise.all(registros.map(async r => {
    const [empleado] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
      .from(empleadosTable).where(eq(empleadosTable.id, r.empleado_id)).limit(1);
    const [maquina] = await db.select({ nombre: maquinasTable.nombre })
      .from(maquinasTable).where(eq(maquinasTable.id, r.maquina_id)).limit(1);
    const foto = fotografias.find(f => f.entidad_id === r.id);
    return {
      ...r,
      empleado_nombre: empleado ? `${empleado.nombre} ${empleado.apellido}` : "Desconocido",
      maquina_nombre: maquina?.nombre || "Desconocida",
      litros: Number(r.litros),
      precio: r.precio ? Number(r.precio) : null,
      importe: r.importe ? Number(r.importe) : null,
      kilometraje: r.kilometraje ? Number(r.kilometraje) : null,
      foto_url: foto ? foto.url : null,
    };
  }));
  return res.json(enriched.reverse());
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

    const [empleado] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido }).from(empleadosTable).where(eq(empleadosTable.id, empleado_id)).limit(1);

    // Async append to Google Sheets
    appendToSheet("Combustible", [
      today,
      new Date().toLocaleTimeString("es-AR"),
      maquinaNombre,
      `${empleado?.nombre} ${empleado?.apellido}`,
      litros,
      precio || "",
      importe || "",
      estacion || "",
      "", // I: FOTO (vacío inicialmente)
      registro.id // J: ID
    ]);

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

    return res.json({ message: "Registro eliminado correctamente" });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al eliminar registro: " + (err?.message || "Error interno") });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { incidentesTable, empleadosTable, maquinasTable, actividadTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { sendWhatsAppMessage } from "../services/whatsapp.js";

const router = Router();

import { getEmpleadoIdForUser } from "../lib/auth-helpers";

router.get("/", async (req, res) => {
  const { maquina_id, empleado_id } = req.query as Record<string, string>;
  let query = db.select().from(incidentesTable).$dynamic();
  const conditions = [];
  
  if (maquina_id) conditions.push(eq(incidentesTable.maquina_id, parseInt(maquina_id)));
  if (empleado_id) conditions.push(eq(incidentesTable.empleado_id, parseInt(empleado_id)));

  // Role-Based Access Control: Empleados solo ven sus propios incidentes
  if (req.user?.rol?.toLowerCase() === "empleado") {
    const userEmpleadoId = await getEmpleadoIdForUser(req.user.id);
    conditions.push(eq(incidentesTable.empleado_id, userEmpleadoId));
  }

  if (conditions.length) query = query.where(and(...conditions));

  const incidentes = await query.orderBy(incidentesTable.createdAt);

  // Bulk-load empleados y maquinas para evitar N+1 queries
  const empleadoIds = [...new Set(incidentes.map(i => i.empleado_id).filter((id): id is number => !!id))];
  const maquinaIds  = [...new Set(incidentes.map(i => i.maquina_id).filter((id): id is number => !!id))];

  const [empleadosList, maquinasList] = await Promise.all([
    empleadoIds.length > 0
      ? db.select({ id: empleadosTable.id, nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
          .from(empleadosTable).where(inArray(empleadosTable.id, empleadoIds))
      : [],
    maquinaIds.length > 0
      ? db.select({ id: maquinasTable.id, nombre: maquinasTable.nombre })
          .from(maquinasTable).where(inArray(maquinasTable.id, maquinaIds))
      : [],
  ]);

  const empleadosMap = new Map(empleadosList.map(e => [e.id, `${e.nombre} ${e.apellido}`]));
  const maquinasMap  = new Map(maquinasList.map(m => [m.id, m.nombre]));

  const enriched = incidentes.map(i => ({
    ...i,
    empleado_nombre: i.empleado_id ? (empleadosMap.get(i.empleado_id) ?? null) : null,
    maquina_nombre:  i.maquina_id  ? (maquinasMap.get(i.maquina_id)  ?? null) : null,
  }));

  return res.json(enriched.reverse());
});

router.post("/", async (req, res) => {
  try {
    const { empleado_id, maquina_id, tipo, descripcion } = req.body;
    if (!tipo || !descripcion) return res.status(400).json({ error: "Tipo y descripción son requeridos" });

    const today = new Date().toISOString().split("T")[0];
    const [incidente] = await db.insert(incidentesTable).values({
      empleado_id, maquina_id, tipo, descripcion, fecha: today, estado: "activo"
    }).returning();

    await db.insert(actividadTable).values({
      tipo: "incidente",
      descripcion: `Incidente registrado: ${tipo} - ${descripcion.slice(0, 50)}`,
      entidad_tipo: "incidente",
      entidad_id: incidente.id,
    });

    const msj = `⚠️ *Nuevo Incidente Reportado*\nTipo: ${tipo}\nDescripción: ${descripcion}\nFecha: ${today}`;
    sendWhatsAppMessage("3572400877", msj).catch(e => console.error("Error mandando WA de incidente", e));

    return res.status(201).json({ ...incidente, empleado_nombre: null, maquina_nombre: null });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al registrar incidente: " + (err?.message || "Error interno") });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const { estado, tipo, descripcion, empleado_id, maquina_id } = req.body;
    
    const updateData: Record<string, any> = {};
    if (estado !== undefined) updateData.estado = estado;
    if (tipo !== undefined) updateData.tipo = tipo;
    if (descripcion !== undefined) updateData.descripcion = descripcion;
    if (empleado_id !== undefined) updateData.empleado_id = empleado_id;
    if (maquina_id !== undefined) updateData.maquina_id = maquina_id;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const [incidente] = await db
      .update(incidentesTable)
      .set(updateData)
      .where(eq(incidentesTable.id, id))
      .returning();

    if (!incidente) return res.status(404).json({ error: "Incidente no encontrado" });

    if (estado) {
      await db.insert(actividadTable).values({
        tipo: "incidente",
        descripcion: `Incidente marcado como ${estado}: ${incidente.tipo}`,
        entidad_tipo: "incidente",
        entidad_id: incidente.id,
      });
    }

    return res.json(incidente);
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al actualizar incidente: " + (err?.message || "Error interno") });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    
    const [existing] = await db.select().from(incidentesTable).where(eq(incidentesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Incidente no encontrado" });

    await db.delete(incidentesTable).where(eq(incidentesTable.id, id));
    
    return res.json({ success: true });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: "Error al eliminar incidente: " + (err?.message || "Error interno") });
  }
});

export default router;

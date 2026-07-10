import { Router } from "express";
import { db } from "@workspace/db";
import { incidentesTable, empleadosTable, maquinasTable, actividadTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { maquina_id, empleado_id } = req.query as Record<string, string>;
  let query = db.select().from(incidentesTable).$dynamic();
  const conditions = [];
  if (maquina_id) conditions.push(eq(incidentesTable.maquina_id, parseInt(maquina_id)));
  if (empleado_id) conditions.push(eq(incidentesTable.empleado_id, parseInt(empleado_id)));
  if (conditions.length) query = query.where(and(...conditions));

  const incidentes = await query.orderBy(incidentesTable.createdAt);
  const enriched = await Promise.all(incidentes.map(async i => {
    let empleado_nombre = null, maquina_nombre = null;
    if (i.empleado_id) {
      const [e] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
        .from(empleadosTable).where(eq(empleadosTable.id, i.empleado_id)).limit(1);
      if (e) empleado_nombre = `${e.nombre} ${e.apellido}`;
    }
    if (i.maquina_id) {
      const [m] = await db.select({ nombre: maquinasTable.nombre })
        .from(maquinasTable).where(eq(maquinasTable.id, i.maquina_id)).limit(1);
      if (m) maquina_nombre = m.nombre;
    }
    return { ...i, empleado_nombre, maquina_nombre };
  }));
  return res.json(enriched.reverse());
});

router.post("/", async (req, res) => {
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

  return res.status(201).json({ ...incidente, empleado_nombre: null, maquina_nombre: null });
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { estado } = req.body;
  if (!estado) return res.status(400).json({ error: "Estado es requerido" });

  const [incidente] = await db
    .update(incidentesTable)
    .set({ estado, updatedAt: new Date() })
    .where(eq(incidentesTable.id, id))
    .returning();

  if (!incidente) return res.status(404).json({ error: "Incidente no encontrado" });

  await db.insert(actividadTable).values({
    tipo: "incidente",
    descripcion: `Incidente marcado como ${estado}: ${incidente.tipo}`,
    entidad_tipo: "incidente",
    entidad_id: incidente.id,
  });

  return res.json(incidente);
});

export default router;

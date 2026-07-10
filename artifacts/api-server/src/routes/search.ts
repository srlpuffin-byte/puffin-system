import { Router } from "express";
import { db } from "@workspace/db";
import { maquinasTable, empleadosTable, jornadasTable, mantenimientosTable, incidentesTable } from "@workspace/db";
import { eq, or, ilike } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { q } = req.query as { q?: string };
  if (!q) return res.json({ maquinas: [], empleados: [], jornadas: [], mantenimientos: [], incidentes: [] });

  const queryPattern = `%${q}%`;

  // 1. Jornadas (matches obra or descripcion)
  const jornadas = await db.select().from(jornadasTable)
    .where(or(
      ilike(jornadasTable.nombre_obra, queryPattern),
      ilike(jornadasTable.descripcion_trabajo, queryPattern),
      ilike(jornadasTable.ubicacion, queryPattern)
    ));

  // Extract related machines and employees from those jornadas
  const maquinaIds = new Set(jornadas.map(j => j.maquina_id));
  const empleadoIds = new Set(jornadas.map(j => j.empleado_id));

  // 2. Máquinas (matches search directly or is in the related jornadas)
  const allMaquinas = await db.select().from(maquinasTable);
  const maquinas = allMaquinas.filter(m => 
    maquinaIds.has(m.id) || 
    m.nombre.toLowerCase().includes(q.toLowerCase()) || 
    (m.codigo && m.codigo.toLowerCase().includes(q.toLowerCase()))
  );

  // 3. Empleados (matches search directly or is in related jornadas)
  const allEmpleados = await db.select().from(empleadosTable);
  const empleados = allEmpleados.filter(e => 
    empleadoIds.has(e.id) || 
    e.nombre.toLowerCase().includes(q.toLowerCase()) || 
    e.apellido.toLowerCase().includes(q.toLowerCase())
  );

  // 4. Mantenimientos (for the matched machines)
  const mantenimientos = await db.select().from(mantenimientosTable);
  const matchedMantenimientos = mantenimientos.filter(m => maquinaIds.has(m.maquina_id));

  // 5. Incidentes (for the matched machines)
  const incidentes = await db.select().from(incidentesTable);
  const matchedIncidentes = incidentes.filter(i => 
    (i.entidad_tipo === 'maquina' && maquinaIds.has(i.entidad_id!)) ||
    (i.entidad_tipo === 'empleado' && empleadoIds.has(i.entidad_id!))
  );

  return res.json({
    jornadas,
    maquinas,
    empleados,
    mantenimientos: matchedMantenimientos,
    incidentes: matchedIncidentes
  });
});

export default router;

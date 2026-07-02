import { Router } from "express";
import { db } from "@workspace/db";
import { jornadasTable, empleadosTable, maquinasTable, actividadTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

async function enrichJornada(j: typeof jornadasTable.$inferSelect) {
  const [empleado] = await db.select({ nombre: empleadosTable.nombre, apellido: empleadosTable.apellido })
    .from(empleadosTable).where(eq(empleadosTable.id, j.empleado_id)).limit(1);
  const [maquina] = await db.select({ nombre: maquinasTable.nombre })
    .from(maquinasTable).where(eq(maquinasTable.id, j.maquina_id)).limit(1);

  const hrInicio = j.horometro_inicio ? Number(j.horometro_inicio) : null;
  const hrFin = j.horometro_fin ? Number(j.horometro_fin) : null;
  const horas = hrInicio !== null && hrFin !== null ? hrFin - hrInicio : null;

  return {
    ...j,
    empleado_nombre: empleado ? `${empleado.nombre} ${empleado.apellido}` : "Desconocido",
    maquina_nombre: maquina?.nombre || "Desconocida",
    km_inicio: j.km_inicio ? Number(j.km_inicio) : null,
    km_fin: j.km_fin ? Number(j.km_fin) : null,
    horometro_inicio: hrInicio,
    horometro_fin: hrFin,
    horas_trabajadas: horas,
  };
}

router.get("/", async (req, res) => {
  const { empleado_id, maquina_id, estado } = req.query as Record<string, string>;
  let query = db.select().from(jornadasTable).$dynamic();
  const conditions = [];
  if (empleado_id) conditions.push(eq(jornadasTable.empleado_id, parseInt(empleado_id)));
  if (maquina_id) conditions.push(eq(jornadasTable.maquina_id, parseInt(maquina_id)));
  if (estado) conditions.push(eq(jornadasTable.estado, estado));
  if (conditions.length) query = query.where(and(...conditions));

  const jornadas = await query.orderBy(jornadasTable.createdAt);
  const enriched = await Promise.all(jornadas.map(enrichJornada));
  return res.json(enriched.reverse());
});

router.post("/iniciar", async (req, res) => {
  const { empleado_id, maquina_id, horometro_inicio, km_inicio, observaciones } = req.body;
  if (!empleado_id || !maquina_id || horometro_inicio === undefined) {
    return res.status(400).json({ error: "Campos requeridos faltantes" });
  }

  const today = new Date().toISOString().split("T")[0];
  const horaInicio = new Date().toTimeString().slice(0, 5);

  const [jornada] = await db.insert(jornadasTable).values({
    empleado_id, maquina_id,
    fecha: today,
    hora_inicio: horaInicio,
    horometro_inicio: horometro_inicio.toString(),
    km_inicio: km_inicio?.toString(),
    observaciones,
    estado: "en_curso"
  }).returning();

  await db.insert(actividadTable).values({
    tipo: "jornada",
    descripcion: `Jornada iniciada por operario ID ${empleado_id} en máquina ID ${maquina_id}`,
    entidad_tipo: "jornada",
    entidad_id: jornada.id,
  });

  return res.status(201).json(await enrichJornada(jornada));
});

router.post("/:id/finalizar", async (req, res) => {
  const id = parseInt(req.params.id);
  const { horometro_fin, km_fin, problemas } = req.body;
  if (horometro_fin === undefined) return res.status(400).json({ error: "Horómetro final requerido" });

  const horaFin = new Date().toTimeString().slice(0, 5);

  const [jornada] = await db
    .update(jornadasTable)
    .set({ horometro_fin: horometro_fin.toString(), km_fin: km_fin?.toString(), problemas, hora_fin: horaFin, estado: "finalizada", updatedAt: new Date() })
    .where(eq(jornadasTable.id, id))
    .returning();

  if (!jornada) return res.status(404).json({ error: "Jornada no encontrada" });

  await db.insert(actividadTable).values({
    tipo: "jornada",
    descripcion: `Jornada finalizada (ID ${id})`,
    entidad_tipo: "jornada",
    entidad_id: jornada.id,
  });

  return res.json(await enrichJornada(jornada));
});

export default router;

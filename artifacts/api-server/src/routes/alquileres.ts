import { Router } from "express";
import { db } from "@workspace/db";
import { alquileresTable, maquinasTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const iniciarAlquilerSchema = z.object({
  cliente: z.string().min(1),
  fecha_inicio: z.string(),
  horometro_inicio: z.number(),
});

const finalizarAlquilerSchema = z.object({
  fecha_fin: z.string(),
  horometro_fin: z.number(),
});

// Obtener alquileres de una máquina
router.get("/:maquinaId", async (req, res) => {
  try {
    const maquinaId = parseInt(req.params.maquinaId);
    if (isNaN(maquinaId)) return res.status(400).json({ error: "ID inválido" });

    const alquileres = await db.select()
      .from(alquileresTable)
      .where(eq(alquileresTable.maquina_id, maquinaId))
      .orderBy(desc(alquileresTable.createdAt));

    return res.json(alquileres);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error obteniendo alquileres" });
  }
});

// Iniciar nuevo alquiler
router.post("/:maquinaId", async (req, res) => {
  try {
    const maquinaId = parseInt(req.params.maquinaId);
    if (isNaN(maquinaId)) return res.status(400).json({ error: "ID inválido" });

    const data = iniciarAlquilerSchema.parse(req.body);

    const [nuevoAlquiler] = await db.insert(alquileresTable).values({
      maquina_id: maquinaId,
      cliente: data.cliente,
      fecha_inicio: data.fecha_inicio,
      horometro_inicio: data.horometro_inicio.toString(),
      estado: "en_curso",
    }).returning();

    return res.status(201).json(nuevoAlquiler);
  } catch (error: any) {
    console.error(error);
    return res.status(400).json({ error: error?.message || "Error al iniciar alquiler" });
  }
});

// Finalizar alquiler
router.put("/:maquinaId/:alquilerId/finalizar", async (req, res) => {
  try {
    const alquilerId = parseInt(req.params.alquilerId);
    if (isNaN(alquilerId)) return res.status(400).json({ error: "ID de alquiler inválido" });

    const data = finalizarAlquilerSchema.parse(req.body);

    // Obtener alquiler original para calcular horas
    const [alquiler] = await db.select().from(alquileresTable).where(eq(alquileresTable.id, alquilerId)).limit(1);
    
    if (!alquiler) {
      return res.status(404).json({ error: "Alquiler no encontrado" });
    }

    const horometroInicio = parseFloat(alquiler.horometro_inicio);
    const horasTrabajadas = data.horometro_fin - horometroInicio;

    const [alquilerActualizado] = await db.update(alquileresTable)
      .set({
        fecha_fin: data.fecha_fin,
        horometro_fin: data.horometro_fin.toString(),
        horas_trabajadas: horasTrabajadas > 0 ? horasTrabajadas.toString() : "0",
        estado: "finalizado",
      })
      .where(eq(alquileresTable.id, alquilerId))
      .returning();

    return res.json(alquilerActualizado);
  } catch (error: any) {
    console.error(error);
    return res.status(400).json({ error: error?.message || "Error al finalizar alquiler" });
  }
});

// Eliminar alquiler
router.delete("/:maquinaId/:alquilerId", async (req, res) => {
  try {
    const alquilerId = parseInt(req.params.alquilerId);
    if (isNaN(alquilerId)) return res.status(400).json({ error: "ID de alquiler inválido" });

    await db.delete(alquileresTable).where(eq(alquileresTable.id, alquilerId));

    return res.json({ success: true });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: "Error al eliminar alquiler" });
  }
});

export default router;

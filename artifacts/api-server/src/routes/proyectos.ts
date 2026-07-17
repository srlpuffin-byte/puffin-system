import { Router } from "express";
import { db } from "@workspace/db";
import { proyectosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { updateOrAppendToSheet } from "../services/sheets";

const router = Router();

// Listar todos los proyectos
router.get("/", async (req, res) => {
  try {
    const proyectos = await db.select().from(proyectosTable).orderBy(proyectosTable.createdAt);
    return res.json(proyectos);
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al obtener proyectos" });
  }
});

// Crear un nuevo proyecto
router.post("/", async (req, res) => {
  try {
    const { lugar, hectareas, precio_hectarea, empleados_asignados, maquinas_asignadas, estado } = req.body;
    
    if (!lugar || hectareas === undefined || precio_hectarea === undefined) {
      return res.status(400).json({ error: "Lugar, hectareas y precio_hectarea son obligatorios" });
    }

    const ganancia_estimada = (parseFloat(hectareas) * parseFloat(precio_hectarea)).toString();

    const [proyecto] = await db.insert(proyectosTable).values({
      lugar,
      hectareas: hectareas.toString(),
      precio_hectarea: precio_hectarea.toString(),
      ganancia_estimada,
      empleados_asignados: empleados_asignados || [],
      maquinas_asignadas: maquinas_asignadas || [],
      estado: estado || "activo",
    }).returning();

    // Sincronizar con Google Sheets
    await updateOrAppendToSheet("Proyectos", [
      proyecto.id,
      proyecto.lugar,
      proyecto.hectareas,
      proyecto.precio_hectarea,
      proyecto.ganancia_estimada,
      Array.isArray(proyecto.empleados_asignados) ? proyecto.empleados_asignados.join(", ") : "",
      Array.isArray(proyecto.maquinas_asignadas) ? proyecto.maquinas_asignadas.join(", ") : "",
      proyecto.estado,
    ], 0, proyecto.id);

    return res.status(201).json(proyecto);
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al crear proyecto" });
  }
});

// Obtener un proyecto por ID
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [proyecto] = await db.select().from(proyectosTable).where(eq(proyectosTable.id, id)).limit(1);
    if (!proyecto) return res.status(404).json({ error: "Proyecto no encontrado" });
    return res.json(proyecto);
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al obtener proyecto" });
  }
});

// Actualizar un proyecto
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const { lugar, hectareas, precio_hectarea, empleados_asignados, maquinas_asignadas, estado } = req.body;
    
    const updateData: Record<string, any> = {};
    if (lugar !== undefined) updateData.lugar = lugar;
    if (hectareas !== undefined) updateData.hectareas = hectareas.toString();
    if (precio_hectarea !== undefined) updateData.precio_hectarea = precio_hectarea.toString();
    if (empleados_asignados !== undefined) updateData.empleados_asignados = empleados_asignados;
    if (maquinas_asignadas !== undefined) updateData.maquinas_asignadas = maquinas_asignadas;
    if (estado !== undefined) updateData.estado = estado;

    // Recalcular ganancia si se actualiza alguno de los factores
    if (hectareas !== undefined || precio_hectarea !== undefined) {
      const current = await db.select({ h: proyectosTable.hectareas, p: proyectosTable.precio_hectarea }).from(proyectosTable).where(eq(proyectosTable.id, id)).limit(1);
      if (current.length > 0) {
        const h = hectareas !== undefined ? parseFloat(hectareas) : parseFloat(current[0].h);
        const p = precio_hectarea !== undefined ? parseFloat(precio_hectarea) : parseFloat(current[0].p);
        updateData.ganancia_estimada = (h * p).toString();
      }
    }

    const [proyecto] = await db.update(proyectosTable).set(updateData).where(eq(proyectosTable.id, id)).returning();
    if (!proyecto) return res.status(404).json({ error: "Proyecto no encontrado" });

    // Sincronizar con Google Sheets
    await updateOrAppendToSheet("Proyectos", [
      proyecto.id,
      proyecto.lugar,
      proyecto.hectareas,
      proyecto.precio_hectarea,
      proyecto.ganancia_estimada,
      Array.isArray(proyecto.empleados_asignados) ? proyecto.empleados_asignados.join(", ") : "",
      Array.isArray(proyecto.maquinas_asignadas) ? proyecto.maquinas_asignadas.join(", ") : "",
      proyecto.estado,
    ], 0, proyecto.id);

    return res.json(proyecto);
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al actualizar proyecto" });
  }
});

// Eliminar un proyecto
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(proyectosTable).where(eq(proyectosTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Proyecto no encontrado" });
    return res.json({ message: "Proyecto eliminado correctamente" });
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al eliminar proyecto" });
  }
});

export default router;
